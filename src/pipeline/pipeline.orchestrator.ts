import fs from "node:fs";
import nodePath from "node:path";
import simpleGit from "simple-git";

import prisma from "../prisma/prisma";
import { generate, llmConcurrency } from "../LLM/index";

import {
    FileRecord, IntentBundle, Module, ModuleDocResult, ValidationFinding, IncompleteFeature,
} from "./pipeline.types";
import { PROMPT_VERSION } from "./pipeline.version";
import {
    mapWithConcurrency, buildFileTree, guessEntryPoints,
} from "./pipeline.helper";

import { getRepoFiles } from "./stages/L1.inventory";
import { groupModules, buildFileToModuleIndex } from "./stages/L2.prefixCompressor";
import { buildModuleEdges } from "./stages/L3.dynamicGrouper";
import { buildIntentBundle } from "./stages/L4.intentBundle";
import { isTinyRepo, computeStaleness } from "./stages/L5.router";
import {
    buildModulePrompt, buildArchPrompt, buildValidationPrompt, buildTinyPrompt,
    buildOwnerReport,
} from "./stages/L6.promptBuilder";
import { MODULE_DOC_SCHEMA, VALIDATION_SCHEMA, COMBINED_DOC_SCHEMA } from "./stages/L6.prompts";
import { applyValidationFindings } from "./stages/L6.applyEdits";

// ============================================================================
// The worker-facing result: how many md files were produced, plus the content.
// ============================================================================

export interface DocGenResult {
    route: "TINY" | "NORMAL";
    moduleDocCount: number;
    moduleDocs: Record<string, string>;   // moduleId -> markdown
    archDoc: string;                       // always exactly one arch doc
    ownerReport: string | null;            // second output: message to the repo owner
    stats: {
        modulesTotal: number;
        modulesRegenerated: number;
        modulesFromCache: number;
        modulesDeleted: number;
        resolutionRate: number | null;
        promptVersion: string;
    };
}

// ============================================================================
// generateFirstTimeDocs — the full first-import pipeline, L1 -> L6.
//
// This is ALSO safe to re-run at any time: staleness is computed against
// module_docs rows, so an interrupted import resumes where it stopped, and a
// second invocation on an unchanged repo skips every module call (see L5).
// ============================================================================

export const generateFirstTimeDocs = async (
    repoId: string,
    repoPath: string,
): Promise<DocGenResult> => {

    // ---- L0/L1: inventory --------------------------------------------------
    const git = simpleGit(repoPath);

    const { codeFiles, intentFiles, others } = await getRepoFiles(git, repoPath);

    // Cached reader: L3 reads every code file, L6 reads many again — one disk
    // hit per file. Repo-relative path in, source text out.
    const cache = new Map<string, string>();

    const readFile = (relPath: string): string => {

        if (!cache.has(relPath)) {
            cache.set(relPath, fs.readFileSync(nodePath.join(repoPath, relPath), "utf8"));
        }

        return cache.get(relPath)!;
    };

    // ---- L4: intent bundle (needed on BOTH routes) ---------------------------
    const intent = buildIntentBundle(intentFiles, readFile);

    // ---- L5a: size decision — before any grouping/graph work ------------------
    if (isTinyRepo([...codeFiles, ...others])) {
        return await runTinyPath(repoId, codeFiles, others, intent, readFile);
    }

    // ---- L2/L3: deterministic layer -------------------------------------------
    const modules: Module[] = groupModules(codeFiles, others, { promptVersion: PROMPT_VERSION });
    const fileToModule = buildFileToModuleIndex(modules);

    const { edges, resolutionRate, fileImportCounts } =
        buildModuleEdges(codeFiles, readFile, fileToModule);

    // ---- L5b: staleness — empty table on a true first run => all stale --------
    const storedRows = await prisma.moduleDoc.findMany({
        where: { repo_id: repoId },
        select: { module_id: true, input_hash: true },
    });

    const storedHashes = new Map(storedRows.map(r => [r.module_id, r.input_hash]));

    const { staleModules, cachedModuleIds, deletedModuleIds } =
        computeStaleness(modules, storedHashes);

    // ---- L6a: module docs (fan-out, cache-warm-first, per-call persist) -------
    const moduleDocs = new Map<string, string>();
    const incompleteByModule = new Map<string, IncompleteFeature[]>();

    const generateOne = async (module: Module): Promise<void> => {

        const prompt = buildModulePrompt(module, readFile, edges, intent, fileImportCounts);

        const { data } = await generate<ModuleDocResult>("moduleDoc", prompt, MODULE_DOC_SCHEMA);

        moduleDocs.set(module.id, data.markdown);
        incompleteByModule.set(module.id, data.incomplete);

        // Persist IMMEDIATELY, not at the end of the run: if the process dies
        // at module 31/40, the next invocation finds 31 matching hashes and
        // only pays for the remaining 9. This upsert IS the crash-resume.
        await prisma.moduleDoc.upsert({
            where: { repo_id_module_id: { repo_id: repoId, module_id: module.id } },
            create: {
                repo_id: repoId,
                module_id: module.id,
                display_name: module.displayName,
                input_hash: module.inputHash,
                markdown: data.markdown,
                incomplete: JSON.parse(JSON.stringify(data.incomplete)),
            },
            update: {
                display_name: module.displayName,
                input_hash: module.inputHash,
                markdown: data.markdown,
                incomplete: JSON.parse(JSON.stringify(data.incomplete)),
            },
        });
    };

    if (staleModules.length > 0) {

        // First call alone: it WRITES the shared prompt-prefix cache;
        // the concurrent rest then READ it at ~10% input price.
        await generateOne(staleModules[0]);

        await mapWithConcurrency(staleModules.slice(1), llmConcurrency(), generateOne);
    }

    // Cached modules (crash-resume / re-run): load stored docs so validation
    // and the arch call always see the COMPLETE doc set.
    if (cachedModuleIds.length > 0) {

        const cachedRows = await prisma.moduleDoc.findMany({
            where: { repo_id: repoId, module_id: { in: cachedModuleIds } },
        });

        for (const row of cachedRows) {
            moduleDocs.set(row.module_id, row.markdown);
            incompleteByModule.set(row.module_id, row.incomplete as unknown as IncompleteFeature[]);
        }
    }

    // Docs whose module no longer exists (split/merge/deleted dirs).
    if (deletedModuleIds.length > 0) {

        await prisma.moduleDoc.deleteMany({
            where: { repo_id: repoId, module_id: { in: deletedModuleIds } },
        });
    }

    // ---- L6b: cross-doc validation -> apply patches -----------------------------
    const validationPrompt = buildValidationPrompt(moduleDocs, modules, edges);

    const { data: validation } = await generate<{ findings: ValidationFinding[] }>(
        "validation", validationPrompt, VALIDATION_SCHEMA,
    );

    const { updatedDocs, appliedPatches, flaggedFindings } =
        applyValidationFindings(moduleDocs, validation.findings);

    // Patched docs must be re-persisted (the per-call upsert stored pre-patch).
    if (appliedPatches.length > 0) {

        const patchedIds = new Set(appliedPatches.map(p => p.moduleId));

        for (const moduleId of patchedIds) {

            await prisma.moduleDoc.update({
                where: { repo_id_module_id: { repo_id: repoId, module_id: moduleId } },
                data: { markdown: updatedDocs.get(moduleId)! },
            });
        }
    }

    // ---- L6c: architecture doc over the CORRECTED docs ---------------------------
    const archPrompt = buildArchPrompt(
        updatedDocs,
        edges,
        guessEntryPoints(codeFiles),
        intent,
        buildFileTree([...codeFiles, ...others]),
    );

    const { data: archDoc } = await generate<string>("archDoc", archPrompt);

    // ---- Output 2: owner report ----------------------------------------------------
    const ownerReport = buildOwnerReport(incompleteByModule, flaggedFindings);

    // ---- Persist run-level state ------------------------------------------------------
    await prisma.repoDocState.upsert({
        where: { repo_id: repoId },
        create: {
            repo_id: repoId,
            arch_doc: archDoc,
            owner_report: ownerReport,
            intent_hash: intent.intentHash,
            prompt_version: PROMPT_VERSION,
            resolution_rate: resolutionRate,
            route_kind: "NORMAL",
        },
        update: {
            arch_doc: archDoc,
            owner_report: ownerReport,
            intent_hash: intent.intentHash,
            prompt_version: PROMPT_VERSION,
            resolution_rate: resolutionRate,
            route_kind: "NORMAL",
        },
    });

    return {
        route: "NORMAL",
        moduleDocCount: updatedDocs.size,
        moduleDocs: Object.fromEntries(updatedDocs),
        archDoc,
        ownerReport,
        stats: {
            modulesTotal: modules.length,
            modulesRegenerated: staleModules.length,
            modulesFromCache: cachedModuleIds.length,
            modulesDeleted: deletedModuleIds.length,
            resolutionRate,
            promptVersion: PROMPT_VERSION,
        },
    };
};

// ============================================================================
// TINY route: whole repo -> one call -> one combined doc stored as arch_doc.
// ============================================================================

const runTinyPath = async (
    repoId: string,
    codeFiles: FileRecord[],
    others: FileRecord[],
    intent: IntentBundle,
    readFile: (path: string) => string,
): Promise<DocGenResult> => {

    const prompt = buildTinyPrompt(codeFiles, others, intent, readFile);

    const { data } = await generate<ModuleDocResult>("tinyDoc", prompt, COMBINED_DOC_SCHEMA);

    const ownerReport = buildOwnerReport(
        new Map([["(repo)", data.incomplete]]), [],
    );

    await prisma.repoDocState.upsert({
        where: { repo_id: repoId },
        create: {
            repo_id: repoId,
            arch_doc: data.markdown,
            owner_report: ownerReport,
            intent_hash: intent.intentHash,
            prompt_version: PROMPT_VERSION,
            resolution_rate: null,
            route_kind: "TINY",
        },
        update: {
            arch_doc: data.markdown,
            owner_report: ownerReport,
            intent_hash: intent.intentHash,
            prompt_version: PROMPT_VERSION,
            resolution_rate: null,
            route_kind: "TINY",
        },
    });

    return {
        route: "TINY",
        moduleDocCount: 0,
        moduleDocs: {},
        archDoc: data.markdown,
        ownerReport,
        stats: {
            modulesTotal: 0,
            modulesRegenerated: 0,
            modulesFromCache: 0,
            modulesDeleted: 0,
            resolutionRate: null,
            promptVersion: PROMPT_VERSION,
        },
    };
};

// ============================================================================
// Webhook path — next build step. The engine above is already re-runnable
// (staleness is hash-driven), so this will be: checkout new SHA -> run the
// same flow -> only changed modules regenerate.
// ============================================================================

export const webhookDocGen = async (repoId: string, path: string): Promise<void> => {
    // TODO: debounce merge + git diff (for logging/early-exit), then reuse
    // the same engine: await generateFirstTimeDocs(repoId, path)
    void repoId;
    void path;
};
