import prisma from "../prisma/prisma";
import { scopedLogger } from "../utils/logger.utils";

// ============================================================================
// Run progress — the single place that both LOGS a pipeline step and PERSISTS
// it to RepoDocState, so the terminal and the frontend never disagree.
//
// RepoDocState used to be written exactly once, at the very end of a run. It is
// now written at every step: the row is created the moment a job is queued and
// advances through the stages below, which is what the status endpoint polls.
//
// Nothing in here may throw. A failed progress write must never be the reason a
// documentation run fails, so every DB call is swallowed and logged.
// ============================================================================

export type RunStatus =
    | "IDLE"        // never run
    | "QUEUED"      // job accepted, worker has not picked it up
    | "RUNNING"
    | "COMPLETED"
    | "FAILED"
    | "SKIPPED";    // push evaluated, docs judged still accurate

export type RunTrigger = "FIRST_IMPORT" | "WEBHOOK_PUSH";

// The coarse steps the UI renders as a stepper. Many granular stages map onto
// one step — the step is the shape of the progress bar, the stage detail is the
// sentence under it.
export const RUN_STEPS = [
    "Queued",
    "Cloning",
    "Analyzing",
    "Generating docs",
    "Preparing PR",
    "Completed",
] as const;

interface StageDef {
    step: number;          // index into RUN_STEPS
    detail: string;        // default sentence; callers may override
    status: RunStatus;
}

// Ordered roughly as they execute. Push-only stages are grouped at the end.
export const STAGES = {
    // -- intake ---------------------------------------------------------------
    QUEUED: { step: 0, detail: "Import accepted — queued for processing", status: "QUEUED" },
    AWAITING_SPACE: { step: 1, detail: "Waiting for local disk space", status: "RUNNING" },
    CLONING: { step: 1, detail: "Cloning the repository", status: "RUNNING" },

    // -- L0/L1 ----------------------------------------------------------------
    CUSTOM_INSTRUCTIONS: { step: 2, detail: "Loading custom instructions", status: "RUNNING" },
    INVENTORY: { step: 2, detail: "Taking inventory of the repository", status: "RUNNING" },

    // -- L4/L5a ---------------------------------------------------------------
    INTENT_BUNDLE: { step: 2, detail: "Reading README, manifests and CI config", status: "RUNNING" },
    ROUTING: { step: 2, detail: "Choosing a documentation strategy", status: "RUNNING" },

    // -- L2/L3/L5b ------------------------------------------------------------
    GROUPING: { step: 2, detail: "Grouping source files into modules", status: "RUNNING" },
    IMPORT_GRAPH: { step: 2, detail: "Mapping imports between modules", status: "RUNNING" },
    STALENESS: { step: 2, detail: "Working out which docs are out of date", status: "RUNNING" },

    // -- L6 -------------------------------------------------------------------
    MODULE_DOCS: { step: 3, detail: "Writing module documentation", status: "RUNNING" },
    PRUNING: { step: 3, detail: "Removing docs for modules that no longer exist", status: "RUNNING" },
    VALIDATION: { step: 3, detail: "Cross-checking the docs for contradictions", status: "RUNNING" },
    ARCH_DOC: { step: 3, detail: "Writing the architecture document", status: "RUNNING" },
    TINY_DOC: { step: 3, detail: "Writing a combined project document", status: "RUNNING" },
    PERSISTING: { step: 3, detail: "Saving the generated documentation", status: "RUNNING" },

    // -- delivery -------------------------------------------------------------
    RAISING_PR: { step: 4, detail: "Opening the pull request", status: "RUNNING" },
    COMPLETED: { step: 5, detail: "Documentation is ready", status: "COMPLETED" },
    FAILED: { step: 5, detail: "The documentation run failed", status: "FAILED" },

    // -- webhook push evaluation ----------------------------------------------
    PUSH_QUEUED: { step: 0, detail: "Push received — evaluation queued", status: "QUEUED" },
    PUSH_FETCHING: { step: 1, detail: "Fetching the latest commits", status: "RUNNING" },
    PUSH_DIFFING: { step: 2, detail: "Diffing against the documented commit", status: "RUNNING" },
    PUSH_JUDGING: { step: 2, detail: "Deciding whether the docs need an update", status: "RUNNING" },
    PUSH_SKIPPED: { step: 5, detail: "Docs are still accurate — no update needed", status: "SKIPPED" },
    PUSH_ACCEPTED: { step: 2, detail: "Documentation update queued", status: "QUEUED" },
    CHECKOUT: { step: 1, detail: "Checking out the new commit", status: "RUNNING" },
} satisfies Record<string, StageDef>;

export type PipelineStage = keyof typeof STAGES;

export interface StageUpdate {
    detail?: string;              // overrides the stage's default sentence
    done?: number;                // progress counter, e.g. module docs written
    total?: number;
    status?: RunStatus;           // overrides the stage's default status
    prUrl?: string | null;
    error?: string | null;
}

const log = scopedLogger("progress");

/**
 * Marks the start of a run: creates the RepoDocState row if the repo has never
 * been documented, and clears the previous run's error/PR so the frontend shows
 * this run rather than the last one.
 */
export const beginRun = async (
    repoId: string,
    trigger: RunTrigger,
    jobId: string | null,
    stage: PipelineStage = "QUEUED",
): Promise<void> => {

    const def = STAGES[stage];

    log.info({ repo: repoId, trigger, jobId, stage }, `run started (${trigger}) — ${def.detail}`);

    await write(repoId, {
        run_status: def.status,
        run_trigger: trigger,
        run_job_id: jobId,
        stage,
        stage_label: RUN_STEPS[def.step],
        stage_index: def.step,
        stage_detail: def.detail,
        progress_done: null,
        progress_total: null,
        run_started_at: new Date(),
        run_finished_at: null,
        last_error: null,
        pr_url: null,
    });
};

/**
 * Records that the run has reached `stage`. Called at every step of the
 * pipeline — this is what makes the frontend stepper move.
 */
export const markStage = async (
    repoId: string,
    stage: PipelineStage,
    update: StageUpdate = {},
): Promise<void> => {

    const def = STAGES[stage];
    const detail = update.detail ?? def.detail;

    const progress = update.total !== undefined
        ? ` (${update.done ?? 0}/${update.total})`
        : "";

    log.info({ repo: repoId, stage, done: update.done, total: update.total },
        `${RUN_STEPS[def.step]} — ${detail}${progress}`);

    await write(repoId, {
        run_status: update.status ?? def.status,
        stage,
        stage_label: RUN_STEPS[def.step],
        stage_index: def.step,
        stage_detail: detail,
        progress_done: update.done ?? null,
        progress_total: update.total ?? null,
        ...(update.prUrl !== undefined ? { pr_url: update.prUrl } : {}),
        ...(update.error !== undefined ? { last_error: update.error } : {}),
    });
};

/**
 * Terminal state. Always called from a `finally`, so a crashed run leaves a
 * FAILED row with the reason rather than a row stuck at whatever stage it died
 * on — which would look identical to a run that is still working.
 */
export const finishRun = async (
    repoId: string,
    outcome: {
        status: Extract<RunStatus, "COMPLETED" | "FAILED" | "SKIPPED">;
        detail: string;
        prUrl?: string | null;
        error?: string | null;
        durationMs?: number;
    },
): Promise<void> => {

    const stage: PipelineStage = outcome.status === "FAILED"
        ? "FAILED"
        : outcome.status === "SKIPPED" ? "PUSH_SKIPPED" : "COMPLETED";

    const def = STAGES[stage];
    const took = outcome.durationMs !== undefined ? ` in ${outcome.durationMs}ms` : "";

    const line = `run ${outcome.status.toLowerCase()}${took} — ${outcome.detail}`;

    if (outcome.status === "FAILED") {
        log.error({ repo: repoId, error: outcome.error }, line);
    } else {
        log.info({ repo: repoId, prUrl: outcome.prUrl }, line);
    }

    await write(repoId, {
        run_status: outcome.status,
        stage,
        stage_label: RUN_STEPS[def.step],
        stage_index: def.step,
        stage_detail: outcome.detail,
        run_finished_at: new Date(),
        last_error: outcome.error ?? null,
        ...(outcome.prUrl !== undefined ? { pr_url: outcome.prUrl } : {}),
    });
};

// Upsert rather than update: on a true first import the row does not exist yet,
// and the whole point is that progress is visible before any doc is generated.
const write = async (repoId: string, data: Record<string, unknown>): Promise<void> => {

    try {
        await prisma.repoDocState.upsert({
            where: { repo_id: repoId },
            create: { repo_id: repoId, ...data } as never,
            update: data as never,
        });
    } catch (err) {
        log.warn({ repo: repoId, err }, "could not persist run progress (continuing)");
    }
};
