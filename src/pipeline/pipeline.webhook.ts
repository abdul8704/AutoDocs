import fs from "node:fs";
import simpleGit, { SimpleGit } from "simple-git";

import prisma from "../prisma/prisma";
import { generate } from "../LLM/index";
import { JudgeResult } from "./pipeline.types";
import { JUDGE_SCHEMA } from "./stages/L6.prompts";
import { buildJudgePrompt } from "./stages/L6.promptBuilder";
import { isRelevantPath } from "./stages/L1.inventory";
import { generateFirstTimeDocs, DocGenResult } from "./pipeline.orchestrator";

// ============================================================================
// Webhook pipeline — the "should we regenerate?" layer in front of the engine.
//
// Core invariant: the local clone's HEAD is pinned to the SHA the current docs
// were generated from (Repo.last_processed_commit is the durable copy; the
// clone is just its cache). Evaluations FETCH but never CHECKOUT, so the diff
// HEAD..FETCH_HEAD is automatically CUMULATIVE across judged-and-skipped
// pushes. Only applyDocUpdate ever advances HEAD — together with a successful
// engine run.
// ============================================================================

const MAX_JUDGE_SKIPS = 3;        // consecutive skips before we force a regen
const MAX_JUDGED_LINES = 400;     // cumulative +/- lines above which we skip the judge
const MAX_DIFF_CHARS = 400_000;   // hard cap on diff text handed to the judge
const MAX_JUDGE_DOCS = 12;        // most-affected docs included in the judge prompt

export type PushEvaluation =
    | { action: "SKIPPED_IRRELEVANT"; afterSha: string; changedPaths: string[]; detail: string }
    | { action: "SKIPPED_BY_JUDGE"; afterSha: string; changedPaths: string[]; reason: string; skipCount: number }
    | { action: "NEEDS_UPDATE"; afterSha: string; changedPaths: string[]; reason: string };

export interface DocUpdateOutcome {
    result: DocGenResult;
    newSha: string;
}

// ----------------------------------------------------------------------------
// Clone restore — the local copy is disposable; the DB pointer is not.
// ----------------------------------------------------------------------------

const ensureLocalClone = async (
    repoPath: string,
    authedCloneUrl: string,
    docsSha: string | null,
): Promise<{ pointerValid: boolean }> => {

    if (fs.existsSync(`${repoPath}/.git`)) {
        return { pointerValid: true };
    }

    await simpleGit().clone(authedCloneUrl, repoPath, ["--depth=1", "--single-branch"]);

    if (!docsSha) {
        // No docs pointer (first import never completed?) — nothing to pin to.
        return { pointerValid: false };
    }

    const git = simpleGit(repoPath);

    try {
        // Shallow clones don't contain history — fetch the documented SHA
        // explicitly, then pin HEAD to it.
        await git.fetch(["origin", docsSha, "--depth=1"]);
        await git.checkout(docsSha);
        return { pointerValid: true };
    } catch {
        // SHA unreachable (force-pushed away / GC'd). Pointer is lost — the
        // caller regenerates unconditionally, which self-heals the state.
        return { pointerValid: false };
    }
};

// ----------------------------------------------------------------------------
// Diff helpers
// ----------------------------------------------------------------------------

const parseNameStatus = (raw: string): string[] => {

    const paths: string[] = [];

    for (const line of raw.split("\n")) {

        if (!line.trim()) {
            continue;
        }

        // "M\tpath" | "A\tpath" | "D\tpath" | "R100\told\tnew" -> take the last field
        const fields = line.split("\t");
        paths.push(fields[fields.length - 1]);
    }

    return [...new Set(paths)];
};

const countChangedLines = (diffText: string): number => {

    let count = 0;

    for (const line of diffText.split("\n")) {

        if ((line.startsWith("+") && !line.startsWith("+++")) ||
            (line.startsWith("-") && !line.startsWith("---"))) {
            count++;
        }
    }

    return count;
};

// The judge only needs the docs the diff touches. Module ids ARE directory
// paths, so changed paths map to modules by longest-prefix match — no stored
// file lists required.
const loadAffectedDocs = async (
    githubRepoId: string,
    changedPaths: string[],
): Promise<Map<string, string>> => {

    const rows = await prisma.moduleDoc.findMany({
        where: { repo_id: githubRepoId },
        select: { module_id: true, markdown: true },
    });

    const affected = new Map<string, string>();

    for (const changed of changedPaths) {

        let best: { module_id: string; markdown: string } | null = null;

        for (const row of rows) {

            const isPrefix = changed === row.module_id || changed.startsWith(row.module_id + "/");

            if (isPrefix && (!best || row.module_id.length > best.module_id.length)) {
                best = row;
            }
        }

        if (best) {
            affected.set(best.module_id, best.markdown);
        }

        if (affected.size >= MAX_JUDGE_DOCS) {
            break;
        }
    }

    // TINY-route repos have no module docs — judge against the combined doc.
    if (affected.size === 0) {

        const state = await prisma.repoDocState.findUnique({
            where: { repo_id: githubRepoId },
            select: { arch_doc: true },
        });

        if (state?.arch_doc) {
            affected.set("(combined project doc)", state.arch_doc);
        }
    }

    return affected;
};

// ----------------------------------------------------------------------------
// Stage 1: evaluatePush — fetch, cumulative diff, cap check, judge.
// Touches NOTHING on a skip (no checkout, no pointer moves) so the next
// evaluation's diff keeps accumulating.
// ----------------------------------------------------------------------------

export const evaluatePush = async (
    githubRepoId: string,
    repoPath: string,
    authedCloneUrl: string,
    defaultBranch: string,
): Promise<PushEvaluation> => {

    const repo = await prisma.repo.findUnique({
        where: { github_repo_id: githubRepoId },
        select: { last_processed_commit: true },
    });

    const docsSha = repo?.last_processed_commit ?? null;
    const { pointerValid } = await ensureLocalClone(repoPath, authedCloneUrl, docsSha);

    const git: SimpleGit = simpleGit(repoPath);

    await git.fetch(["origin", defaultBranch, "--depth=1"]);
    const afterSha = (await git.revparse(["FETCH_HEAD"])).trim();

    if (!pointerValid) {
        return {
            action: "NEEDS_UPDATE",
            afterSha,
            changedPaths: [],
            reason: "docs pointer missing or unreachable — regenerating to re-establish state",
        };
    }

    const headSha = (await git.revparse(["HEAD"])).trim();

    if (headSha === afterSha) {
        return {
            action: "SKIPPED_IRRELEVANT",
            afterSha,
            changedPaths: [],
            detail: "remote head equals the documented state — nothing new",
        };
    }

    // Cumulative tree-diff: documented state vs newest remote code.
    const nameStatus = await git.raw(["diff", "--name-status", "HEAD", "FETCH_HEAD"]);
    const changedPaths = parseNameStatus(nameStatus).filter(isRelevantPath);

    if (changedPaths.length === 0) {
        return {
            action: "SKIPPED_IRRELEVANT",
            afterSha,
            changedPaths: [],
            detail: "all changed paths are irrelevant to docs (lockfiles, assets, excluded dirs)",
        };
    }

    const state = await prisma.repoDocState.findUnique({
        where: { repo_id: githubRepoId },
        select: { judge_skip_count: true },
    });

    const skipCount = state?.judge_skip_count ?? 0;

    const diffText = (await git.raw(
        ["diff", "HEAD", "FETCH_HEAD", "--", ...changedPaths],
    )).slice(0, MAX_DIFF_CHARS);

    const changedLines = countChangedLines(diffText);

    // Cap check BEFORE spending judge tokens: when a regen is likely anyway,
    // judging first just means paying for both.
    if (skipCount >= MAX_JUDGE_SKIPS) {
        return {
            action: "NEEDS_UPDATE",
            afterSha,
            changedPaths,
            reason: `judge skipped ${skipCount} consecutive pushes — cap reached, regenerating`,
        };
    }

    if (changedLines > MAX_JUDGED_LINES) {
        return {
            action: "NEEDS_UPDATE",
            afterSha,
            changedPaths,
            reason: `cumulative diff is ${changedLines} lines (> ${MAX_JUDGED_LINES}) — too large to judge`,
        };
    }

    // The judge: current docs + cumulative diff -> { needsUpdate, reason }.
    const affectedDocs = await loadAffectedDocs(githubRepoId, changedPaths);

    const { data: verdict } = await generate<JudgeResult>(
        "updateJudge",
        buildJudgePrompt(diffText, affectedDocs),
        JUDGE_SCHEMA,
    );

    if (!verdict.needsUpdate) {

        // Record the skip; touch nothing else. HEAD stays at the documented
        // state, so the next webhook diffs cumulatively.
        await prisma.repoDocState.update({
            where: { repo_id: githubRepoId },
            data: { judge_skip_count: { increment: 1 } },
        }).catch(() => { /* no doc state yet -> nothing to increment */ });

        return {
            action: "SKIPPED_BY_JUDGE",
            afterSha,
            changedPaths,
            reason: verdict.reason,
            skipCount: skipCount + 1,
        };
    }

    return { action: "NEEDS_UPDATE", afterSha, changedPaths, reason: verdict.reason };
};

// ----------------------------------------------------------------------------
// Stage 2: applyDocUpdate — advance the pointer, run the SAME engine.
// Hash staleness inside the engine ensures only genuinely changed modules
// cost LLM calls.
// ----------------------------------------------------------------------------

export const applyDocUpdate = async (
    githubRepoId: string,
    repoPath: string,
    defaultBranch: string,
): Promise<DocUpdateOutcome> => {

    const git: SimpleGit = simpleGit(repoPath);

    // Re-fetch: time may have passed since evaluation (queue latency), and
    // taking the newest head here just means fewer runs later.
    await git.fetch(["origin", defaultBranch, "--depth=1"]);
    await git.checkout("FETCH_HEAD");

    const result = await generateFirstTimeDocs(githubRepoId, repoPath);

    const newSha = (await git.revparse(["HEAD"])).trim();

    // The engine already persisted the docs pointer (it is the only writer of
    // last_processed_commit). Here we only reset the judge's skip counter.
    await prisma.repoDocState.updateMany({
        where: { repo_id: githubRepoId },
        data: { judge_skip_count: 0 },
    });

    return { result, newSha };
};
