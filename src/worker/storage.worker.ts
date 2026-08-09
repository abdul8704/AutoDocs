import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import type { StorageJobData } from "../queue/types.queue"
import { CleanupJobData, DeepClonePushJobData, FirstTimeImportJobData } from "../queue/types.queue"
import { constructPath } from "../utils/pathHelper.utils"
import { checkIfRepoExists } from "../github/github.service";
import { mkdir, rm } from "fs/promises"
import path from "path"
import simpleGit, { SimpleGit } from "simple-git"
import { checkForSpace } from "./codebase.service";
import { DocGenResult, generateFirstTimeDocs } from "../pipeline/pipeline.orchestrator"
import { markStage, finishRun } from "../pipeline/pipeline.progress";
import { raisePR } from "../github/github.app.service";
import { recordDocRun, buildRunMessage, resolveRunStatus } from "../notification/notification.service";
import { scopedLogger } from "../utils/logger.utils";

const TOTAL_SIZE = 5 * 1024 * 1024 * 1024; // 5gb max for storing local repo copies

export const storageWorker = new Worker<StorageJobData>(
    'repo-storage-queue',
    async (job: Job<StorageJobData>) => {

        const log = scopedLogger("storage", { job: job.id });

        log.info({ jobName: job.name, attempt: job.attemptsMade + 1 }, `picked up job '${job.name}'`);

        if (job.name === "clone-first-time") {
            const data = job.data as FirstTimeImportJobData;
            const repoPath = constructPath(data.repoId);

            const runLog = scopedLogger("storage", { job: job.id, repo: data.repoId });

            // Everything the notification row needs, tracked as we go so the
            // `finally` block can describe a partial run as accurately as a
            // completed one.
            const startedAt = Date.now();
            const warnings: string[] = [];
            let stageReached = "start";
            let result: DocGenResult | null = null;
            let prUrl: string | null = null;
            let failure: unknown = null;

            runLog.info(
                { repoFullName: data.repoFullName, defaultBranch: data.defaultBranch, repoPath },
                `first-time import start: ${data.repoFullName}`,
            );

            try {
                stageReached = "await-space";
                let waitedForSpace = false;

                while(! await checkForSpace(data.cloneUrl, TOTAL_SIZE, data.installationId)){
                    if (!waitedForSpace) {
                        await markStage(data.repoId, "AWAITING_SPACE");
                    }
                    runLog.warn("local disk is full — waiting 1 minute before retrying");
                    waitedForSpace = true;
                    await sleep(60 * 1000); // Pauses the loop execution properly for 1 minute
                }

                if (waitedForSpace) {
                    warnings.push("waited on local disk space before cloning");
                }

                // --depth=1 + --single-branch clones the DEFAULT branch shallowly.
                // (was "-branch=main": invalid flag — single dash — and pinning
                // "main" breaks repos whose default branch is "master".)
                stageReached = "clone";
                await markStage(data.repoId, "CLONING", {
                    detail: `Cloning ${data.repoFullName}`,
                });

                const cloneStartedAt = Date.now();

                // simple-git needs an existing cwd, and `git clone` refuses a
                // non-empty destination — so run from the parent and clear any
                // half-written tree left by a previous attempt.
                const clonesRoot = path.dirname(repoPath);
                await mkdir(clonesRoot, { recursive: true });
                await rm(repoPath, { recursive: true, force: true });

                const git: SimpleGit = simpleGit(clonesRoot);

                await git.clone(data.cloneUrl, repoPath, [
                    "--depth=1",
                    "--single-branch",
                ]);

                runLog.info({ ms: Date.now() - cloneStartedAt }, "clone complete");

                stageReached = "generate-docs";
                result = await generateFirstTimeDocs(data.repoId, repoPath);

                warnings.push(...result.warnings);

                if (result.route === "NORMAL" && result.moduleDocCount === 0) {
                    warnings.push("no module docs were produced");
                }

                runLog.info(
                    {
                        route: result.route,
                        moduleDocs: result.moduleDocCount,
                        ownerReport: Boolean(result.ownerReport),
                        stats: result.stats,
                    },
                    `docs generated: route=${result.route}, ${result.moduleDocCount} module docs + 1 architecture doc`,
                );

                stageReached = "raise-pr";
                await markStage(data.repoId, "RAISING_PR");

                prUrl = await raisePR(data.repoId, data.defaultBranch, "autodocs/update", result);

                stageReached = "done";
                runLog.info({ prUrl }, `pull request ready: ${prUrl}`);

                return result;
            }
            catch (err) {
                failure = err;
                runLog.error({ err, stageReached }, `first-time import failed at '${stageReached}'`);
                throw err;                  // BullMQ still gets to retry this job
            }
            finally {
                // Terminal progress state BEFORE the notification write, so the
                // frontend stops showing a spinner even if that write fails.
                await finishRun(data.repoId, {
                    status: failure ? "FAILED" : "COMPLETED",
                    detail: buildRunMessage(result, prUrl, warnings, failure),
                    prUrl,
                    error: failure
                        ? (failure instanceof Error ? failure.message : String(failure))
                        : null,
                    durationMs: Date.now() - startedAt,
                });

                // One row per attempt, success or not. attemptsMade is in the log
                // so retries read as a history rather than duplicates.
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
                        warnings,
                        route: result?.route ?? null,
                        moduleDocCount: result?.moduleDocCount ?? null,
                        stats: result?.stats ?? null,
                        ownerReport: result?.ownerReport ?? null,
                        error: failure instanceof Error
                            ? {
                                name: failure.name,
                                message: failure.message,
                                stack: failure.stack?.slice(0, 4000) ?? null,
                            }
                            : failure
                                ? { name: "UnknownError", message: String(failure), stack: null }
                                : null,
                    },
                });
            }
        }
        else if (job.name === "clone-deep-push") {
            // LEGACY: push handling moved to the classify/docgen workers
            // (docs.worker.ts) — they own clone restore via evaluatePush, so a
            // blind re-clone here would clobber the pinned docs pointer.
            const data = job.data as DeepClonePushJobData;
            log.warn(
                { repo: data.repoId },
                "'clone-deep-push' is deprecated; push handling now lives on push-classify-queue",
            );
        }
        else if (job.name === "cleanup-repo") {
            const data = job.data as CleanupJobData;
            if (data.action === "DELETE_REPO") {
                if (!data.path) {
                    data.path = constructPath(data.repoId);
                }
                await rm(data.path, {
                    recursive: true,
                    force: true,
                });

                log.info({ repo: data.repoId, path: data.path }, "local clone deleted");
            }
            else if (data.action === "DELETE_USER") {
                // The Repo rows are already gone by the time this runs, so the ids
                // come from the job payload rather than a lookup.
                for (const repoId of data.repoIds) {
                    if (await checkIfRepoExists(repoId)) {
                        await rm(constructPath(repoId), {
                            recursive: true,
                            force: true,
                        });
                    }
                }

                log.info({ userId: data.userId, repos: data.repoIds.length },
                    `deleted all local clones for user ${data.userId}`);
            }

        }
        else {
            throw new Error(`[StorageWorker] Unhandled job type: ${job.name}`);
        }

        return;
    },
    {
        connection: redisConnection,
        concurrency: 2, // Low concurrency to protect disk I/O and network bandwidth
    }
)

const workerLog = scopedLogger("storage");

storageWorker.on("failed", (job, err) => {
    workerLog.error({ job: job?.id, jobName: job?.name, attempt: job?.attemptsMade, err },
        `job ${job?.id} (${job?.name}) failed`);
});

storageWorker.on("completed", (job) => {
    workerLog.info({ job: job.id, jobName: job.name }, `job ${job.id} (${job.name}) completed`);
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));