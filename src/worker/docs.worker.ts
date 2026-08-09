import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import prisma from "../prisma/prisma";

import { PushClassifyJobData, DocUpdateJobData } from "../queue/types.queue";
import { publishDocUpdate } from "../queue/publishers";
import { constructPath } from "../utils/pathHelper.utils";
import { getAuthenticatedRepoUrl, raisePR } from "../github/github.app.service";

import { evaluatePush, applyDocUpdate, PushEvaluation } from "../pipeline/pipeline.webhook";
import { DocGenResult } from "../pipeline/pipeline.orchestrator";
import { beginRun, markStage, finishRun } from "../pipeline/pipeline.progress";
import {
    recordPushEvaluation, recordDocRun, buildRunMessage, resolveRunStatus,
} from "../notification/notification.service";
import { scopedLogger, truncate } from "../utils/logger.utils";

const DOCS_BRANCH = "autodocs/update";

const evalDetail = (evaluation: PushEvaluation): string => {

    switch (evaluation.action) {
        case "SKIPPED_IRRELEVANT":
            return evaluation.detail;
        case "SKIPPED_BY_JUDGE":
            return evaluation.reason;
        case "NEEDS_UPDATE":
            return evaluation.reason;
    }
};

// ============================================================================
// Worker 1 — push evaluation ("push-classify-queue", debounced upstream).
//
// Fetch + cumulative diff + judge. NEVER advances the docs pointer; on
// NEEDS_UPDATE it hands off to the doc-generation queue. A notification row is
// written for EVERY outcome, including failures.
// ============================================================================

export const classifyWorker = new Worker<PushClassifyJobData>(
    "push-classify-queue",
    async (job: Job<PushClassifyJobData>) => {

        const data = job.data;
        const repoPath = constructPath(data.repoId);
        const startedAt = Date.now();

        const log = scopedLogger("classify", { job: job.id, repo: data.repoId });

        log.info(
            { repoFullName: data.repoFullName, beforeSha: data.beforeSha, afterSha: data.afterSha },
            `debounce elapsed — evaluating push on ${data.repoFullName}`,
        );

        let evaluation: PushEvaluation | null = null;
        let failure: unknown = null;

        try {
            const repo = await prisma.repo.findUnique({
                where: { github_repo_id: data.repoId },
                select: { clone_url: true },
            });

            if (!repo) {
                throw new Error(`repo ${data.repoId} is not in the DB`);
            }

            // Fresh token every time — installation tokens expire in ~1h, and
            // this job may run 10+ minutes (debounce) after the webhook.
            const authedUrl = await getAuthenticatedRepoUrl(repo.clone_url, data.installationId);

            evaluation = await evaluatePush(data.repoId, repoPath, authedUrl, data.defaultBranch);

            log.info(
                { action: evaluation.action, afterSha: evaluation.afterSha },
                `${data.repoFullName}: ${evaluation.action} — ${truncate(evalDetail(evaluation))}`,
            );

            if (evaluation.action === "NEEDS_UPDATE") {

                await publishDocUpdate({
                    repoId: data.repoId,
                    repoFullName: data.repoFullName,
                    affectedDocs: evaluation.changedPaths,
                    beforeSha: data.beforeSha,
                    afterSha: evaluation.afterSha,
                    userId: data.userId,
                    installationId: data.installationId,
                    defaultBranch: data.defaultBranch,
                });

                log.info({ afterSha: evaluation.afterSha }, "handed off to doc-generation-queue");

                await markStage(data.repoId, "PUSH_ACCEPTED", {
                    detail: `Documentation update queued — ${truncate(evaluation.reason, 120)}`,
                });
            }

            return evaluation;
        }
        catch (err) {
            failure = err;
            log.error({ err }, "push evaluation failed");
            throw err;                       // BullMQ retries per queue policy
        }
        finally {
            // A skip is terminal for this run: no docgen job follows, so the
            // frontend needs to be told the pipeline stopped here and why.
            if (failure) {
                await finishRun(data.repoId, {
                    status: "FAILED",
                    detail: "Push evaluation failed",
                    error: failure instanceof Error ? failure.message : String(failure),
                    durationMs: Date.now() - startedAt,
                });
            }
            else if (evaluation && evaluation.action !== "NEEDS_UPDATE") {
                await finishRun(data.repoId, {
                    status: "SKIPPED",
                    detail: evalDetail(evaluation),
                    durationMs: Date.now() - startedAt,
                });
            }

            await recordPushEvaluation({
                repoId: data.repoId,
                action: failure ? "ERROR" : evaluation!.action,
                detail: failure
                    ? (failure instanceof Error ? failure.message : String(failure))
                    : evalDetail(evaluation!),
                logs: {
                    jobId: job.id,
                    attemptsMade: job.attemptsMade,
                    durationMs: Date.now() - startedAt,
                    beforeSha: data.beforeSha,
                    afterSha: evaluation?.afterSha ?? data.afterSha,
                    changedPaths: evaluation?.changedPaths ?? [],
                    skipCount: evaluation?.action === "SKIPPED_BY_JUDGE" ? evaluation.skipCount : null,
                },
            });
        }
    },
    { connection: redisConnection, concurrency: 10 },
);

// ============================================================================
// Worker 2 — doc regeneration ("doc-generation-queue").
//
// Advances the pointer + runs the engine (hash staleness keeps it cheap),
// then raises the PR using the LLM-generated commit/PR metadata. One
// notification row per attempt, success or not.
// ============================================================================

export const docGenWorker = new Worker<DocUpdateJobData>(
    "doc-generation-queue",
    async (job: Job<DocUpdateJobData>) => {

        const data = job.data;
        const repoPath = constructPath(data.repoId);
        const startedAt = Date.now();

        const log = scopedLogger("docgen", { job: job.id, repo: data.repoId });

        log.info(
            {
                repoFullName: data.repoFullName,
                afterSha: data.afterSha,
                changedPaths: data.affectedDocs.length,
            },
            `doc update start: ${data.repoFullName} (${data.affectedDocs.length} changed paths)`,
        );

        const warnings: string[] = [];
        let result: DocGenResult | null = null;
        let prUrl: string | null = null;
        let failure: unknown = null;
        let stageReached = "start";

        // A fresh run: this clears the classify phase's PR/error so the frontend
        // shows THIS regeneration rather than whatever happened last time.
        await beginRun(data.repoId, "WEBHOOK_PUSH", job.id ?? null, "CHECKOUT");

        try {
            stageReached = "apply-update";
            const outcome = await applyDocUpdate(data.repoId, repoPath, data.defaultBranch);
            result = outcome.result;
            warnings.push(...result.warnings);

            log.info(
                { route: result.route, moduleDocs: result.moduleDocCount, stats: result.stats },
                `docs regenerated: ${result.stats.modulesRegenerated} module(s) rebuilt, ` +
                `${result.stats.modulesFromCache} reused from cache`,
            );

            stageReached = "raise-pr";
            await markStage(data.repoId, "RAISING_PR");

            prUrl = await raisePR(data.repoId, data.defaultBranch, DOCS_BRANCH, result);

            stageReached = "done";
            log.info({ prUrl, newSha: outcome.newSha }, `pull request ready: ${prUrl}`);

            return { prUrl, newSha: outcome.newSha };
        }
        catch (err) {
            failure = err;
            log.error({ err, stageReached }, `doc update failed at '${stageReached}'`);
            throw err;
        }
        finally {
            await finishRun(data.repoId, {
                status: failure ? "FAILED" : "COMPLETED",
                detail: buildRunMessage(result, prUrl, warnings, failure),
                prUrl,
                error: failure
                    ? (failure instanceof Error ? failure.message : String(failure))
                    : null,
                durationMs: Date.now() - startedAt,
            });

            await recordDocRun({
                repoId: data.repoId,
                status: resolveRunStatus(prUrl, warnings, failure),
                message: buildRunMessage(result, prUrl, warnings, failure),
                prUrl,
                logs: {
                    jobId: job.id,
                    attemptsMade: job.attemptsMade,
                    durationMs: Date.now() - startedAt,
                    stageReached,
                    trigger: "webhook-push",
                    beforeSha: data.beforeSha,
                    afterSha: data.afterSha,
                    changedPaths: data.affectedDocs,
                    warnings,
                    route: result?.route ?? null,
                    moduleDocCount: result?.moduleDocCount ?? null,
                    stats: result?.stats ?? null,
                    ownerReport: result?.ownerReport ?? null,
                    error: failure instanceof Error
                        ? { name: failure.name, message: failure.message, stack: failure.stack?.slice(0, 4000) ?? null }
                        : failure ? { name: "UnknownError", message: String(failure), stack: null } : null,
                },
            });
        }
    },
    { connection: redisConnection, concurrency: 3 },
);

// Queue-level outcomes. A job that fails all its attempts only shows up here,
// so without these a retried-then-abandoned run leaves no final line.
const classifyLog = scopedLogger("classify");
const docGenLog = scopedLogger("docgen");

classifyWorker.on("failed", (job, err) => {
    classifyLog.error({ job: job?.id, attempt: job?.attemptsMade, err }, `classify job ${job?.id} failed`);
});

docGenWorker.on("failed", (job, err) => {
    docGenLog.error({ job: job?.id, attempt: job?.attemptsMade, err }, `docgen job ${job?.id} failed`);
});
