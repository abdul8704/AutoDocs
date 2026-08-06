import { Module, ModuleEdge, IntentBundle } from "../pipeline.types";
import { MODULE_SYSTEM, ARCH_SYSTEM, VALIDATION_SYSTEM } from "./L6.prompts";
import { BuiltPrompt, IncompleteFeature, ValidationFinding, ValidationPatch } from "../pipeline.types";
import { TINY_SYSTEM } from "./L6.prompts";
import { FileRecord } from "../pipeline.types";

const MODULE_TOKEN_BUDGET_CHARS = 150_000 * 4;
const TINY_BUDGET_CHARS = 150_000 * 4;

export function buildTinyPrompt(
    codeFiles: FileRecord[],
    otherFiles: FileRecord[],
    intent: IntentBundle,
    readFile: (path: string) => string,
): BuiltPrompt {

    // Code first (the model reads top-down; source matters most), then the
    // non-code files. Within each group, path order — deterministic bytes.
    const ordered = [
        ...[...codeFiles].sort((a, b) => a.path.localeCompare(b.path)),
        ...[...otherFiles].sort((a, b) => a.path.localeCompare(b.path)),
    ];

    let budget = TINY_BUDGET_CHARS;
    const blocks: string[] = [];

    for (const file of ordered) {

        let text: string;

        try {
            text = readFile(file.path);
        } catch {
            continue;
        }

        // isTinyRepo already guaranteed we fit; this guard is belt-and-braces
        // for the boundary case where estimates were off.
        if (budget - text.length < 0) {
            text = text.slice(0, 2_000) + "\n... [truncated]";
        }

        budget -= text.length;
        blocks.push(`===== ${file.path} =====\n${text}`);
    }

    const user = [
        `# Project context\n${intent.bundle}`,
        `# Full repository source`,
        blocks.join("\n\n"),
    ].join("\n\n");

    return {
        system: [{ text: TINY_SYSTEM }],
        user,
    };
}
// ============================================================================
// 1. Module prompt
// ============================================================================

export function buildModulePrompt(
    module: Module,
    readFile: (path: string) => string,
    edges: ModuleEdge[],
    intent: IntentBundle,
    importCounts: Map<string, number>,
): BuiltPrompt {

    const ranked = [...module.files].sort((a, b) => {

        const ca = importCounts.get(a.path) ?? 0;
        const cb = importCounts.get(b.path) ?? 0;

        if (ca !== cb) {
            return cb - ca;
        }

        return a.path.localeCompare(b.path);
    });

    let budget = MODULE_TOKEN_BUDGET_CHARS;
    const blocks: string[] = [];

    for (const file of ranked) {

        let text: string;

        try {
            text = readFile(file.path);
        } catch {
            continue;
        }

        if (budget - text.length < 0) {
            text = text.slice(0, 2_000) + "\n... [truncated]";
        }

        budget -= text.length;
        blocks.push(`===== ${file.path} =====\n${text}`);
    }

    const importsFrom = edges.filter(e => e.from === module.id).map(e => e.to);
    const importedBy = edges.filter(e => e.to === module.id).map(e => e.from);

    const user = [
        `# Module: ${module.displayName}  (path: ${module.id})`,
        `# Measured edges (from import statements — ground truth)`,
        `imports from: ${JSON.stringify(importsFrom)}`,
        `imported by:  ${JSON.stringify(importedBy)}`,
        `# Source files (most-imported first)`,
        blocks.join("\n\n"),
    ].join("\n\n");

    return {
        system: [
            {
                // cache: true -> the Anthropic adapter turns this into
                // cache_control. Byte-identical across all module calls of a
                // run, so call #1 writes the prefix cache and the rest read it.
                text: MODULE_SYSTEM + "\n\n# Project context\n" + intent.bundle,
                cache: true,
            },
        ],
        user,
    };
}

// ============================================================================
// 2. Arch prompt (call AFTER validation patches are applied)
// ============================================================================

export function buildArchPrompt(
    moduleDocs: Map<string, string>,
    edges: ModuleEdge[],
    entryPoints: string[],
    intent: IntentBundle,
    fileTree: string,
): BuiltPrompt {

    const docsBlock = [...moduleDocs.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, md]) => `<<module: ${id}>>\n${md}`)
        .join("\n\n---\n\n");

    const user = [
        `# Project context\n${intent.bundle}`,
        `# File tree (3 levels)\n${fileTree}`,
        `# Measured module edges\n${JSON.stringify(edges)}`,
        `# Entry points\n${JSON.stringify(entryPoints)}`,
        `# Module documentation\n${docsBlock}`,
    ].join("\n\n");

    return {
        system: [{ text: ARCH_SYSTEM }],
        user,
    };
}

// ============================================================================
// 3. Validation prompt
// ============================================================================

export function buildValidationPrompt(
    moduleDocs: Map<string, string>,
    modules: Module[],
    edges: ModuleEdge[],
): BuiltPrompt {

    const ownership = modules
        .map(m => `${m.id}: ${m.files.map(f => f.path).join(", ")}`)
        .join("\n");

    const docsBlock = [...moduleDocs.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, md]) => `<<module: ${id}>>\n${md}`)
        .join("\n\n---\n\n");

    const user = [
        `# File ownership (which module physically owns which files)\n${ownership}`,
        `# Measured module edges\n${JSON.stringify(edges)}`,
        `# All module docs\n${docsBlock}`,
    ].join("\n\n");

    return {
        system: [{ text: VALIDATION_SYSTEM }],
        user,
    };
}

// ============================================================================
// 4. Applying validation patches — pure string surgery
// ============================================================================

export function applyPatch(doc: string, patch: ValidationPatch): string {

    const heading = `## ${patch.section}`;
    const start = doc.indexOf(heading);

    if (start === -1) {
        return doc;                        // section missing -> skip, never corrupt
    }

    const bodyStart = start + heading.length;
    const nextHeading = doc.indexOf("\n## ", bodyStart);
    const end = nextHeading === -1 ? doc.length : nextHeading;

    if (patch.operation === "append") {
        return doc.slice(0, end).trimEnd() + "\n\n" + patch.newMarkdown + "\n" + doc.slice(end);
    }

    return doc.slice(0, bodyStart) + "\n\n" + patch.newMarkdown + "\n" + doc.slice(end);
}

// ============================================================================
// 5. The owner report — the run's SECOND output. Pure code, no LLM.
// ============================================================================

export function buildOwnerReport(
    incompleteByModule: Map<string, IncompleteFeature[]>,
    flaggedFindings: ValidationFinding[],        // findings that came back with patches: []
): string | null {

    const lines: string[] = [];

    const totalIncomplete = [...incompleteByModule.values()]
        .reduce((sum, list) => sum + list.length, 0);

    if (totalIncomplete > 0) {

        lines.push(`## Unfinished work we found (excluded from the docs)`);
        lines.push(``);

        for (const [moduleId, features] of [...incompleteByModule.entries()].sort()) {

            if (features.length === 0) {
                continue;
            }

            lines.push(`**${moduleId}**`);

            for (const f of features) {
                lines.push(`- **${f.feature}** (${f.status}): ${f.detail} — ${f.evidence}`);
            }

            lines.push(``);
        }

        lines.push(`These were left out of the documentation so it only describes ` +
                   `behavior that actually works. They'll be documented automatically ` +
                   `once the implementation lands.`);
    }

    if (flaggedFindings.length > 0) {

        lines.push(``);
        lines.push(`## Possible documentation inconsistencies (not auto-fixed)`);
        lines.push(``);

        for (const f of flaggedFindings) {
            lines.push(`- **${f.type}** across ${f.modules.join(", ")}: ${f.explanation}`);
        }
    }

    if (lines.length === 0) {
        return null;                        // nothing to tell the owner — send no message
    }

    return lines.join("\n");
}