import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import type { StorageJobData } from "../queue/types.queue"
import { CleanupJobData, DeepClonePushJobData, FirstTimeImportJobData } from "../queue/types.queue"
import { constructPath } from "../utils/pathHelper.utils"
import { checkIfRepoExists } from "../github/github.service";
import { rm } from "fs/promises"
import prisma from "../prisma/prisma";
import simpleGit, { SimpleGit } from "simple-git"
import { checkForSpace } from "./codebase.service";
import { DocGenResult, generateFirstTimeDocs, webhookDocGen } from "../pipeline/pipeline.orchestrator"
import { raisePR } from "../github/github.app.service";
import { recordDocRun, buildRunMessage, resolveRunStatus } from "../notification/notification.service";

const TOTAL_SIZE = 5 * 1024 * 1024 * 1024; // 5gb max for storing local repo copies

export const storageWorker = new Worker<StorageJobData>(
    'repo-storage-queue',
    async (job: Job<StorageJobData>) => {
        console.log(`[StorageWorker] Processing job '${job.name}' (ID: ${job.id})`);

        if (job.name === "clone-first-time") {
            const data = job.data as FirstTimeImportJobData;
            const repoPath = constructPath(data.repoId);
            const git: SimpleGit = simpleGit(repoPath);

            // Everything the notification row needs, tracked as we go so the
            // `finally` block can describe a partial run as accurately as a
            // completed one.
            const startedAt = Date.now();
            const warnings: string[] = [];
            let stageReached = "start";
            let result: DocGenResult | null = null;
            let prUrl: string | null = null;
            let failure: unknown = null;

            try {
                stageReached = "await-space";
                let waitedForSpace = false;

                while(! await checkForSpace(data.cloneUrl, TOTAL_SIZE, data.installationId)){
                    console.log("All repos are occupied, waiting 1 minute...");
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
                await git.clone(data.cloneUrl, repoPath, [
                    "--depth=1",
                    "--single-branch",
                ]);

                stageReached = "generate-docs";
                result = await generateFirstTimeDocs(data.repoId, repoPath);

                warnings.push(...result.warnings);

                if (result.route === "NORMAL" && result.moduleDocCount === 0) {
                    warnings.push("no module docs were produced");
                }

                console.log(
                    `[StorageWorker] docs generated for ${data.repoId}: ` +
                    `route=${result.route}, moduleDocs=${result.moduleDocCount}, ` +
                    `archDoc=1, ownerReport=${result.ownerReport ? "yes" : "none"}`,
                );

                stageReached = "raise-pr";
                prUrl = await raisePR(data.repoId, "main", "doc-update", result);

                stageReached = "done";
                console.log(`PR raised: ${prUrl}`);

                return result;
            }
            catch (err) {
                failure = err;
                throw err;                  // BullMQ still gets to retry this job
            }
            finally {
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
            const data = job.data as DeepClonePushJobData;
            const path = constructPath(data.repoId);

            const git: SimpleGit = simpleGit(path);
            await git.clone(data.cloneUrl, path);

            await webhookDocGen(data.repoId, path)
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
            }
            else if (data.action === "DELETE_USER") {
                const repos = await prisma.repo.findMany({
                    where: {
                        user_id: data.userId
                    },
                    select: {
                        github_repo_id: true
                    }
                });

                repos.forEach(async (repoId) => {
                    const path = constructPath(repoId.github_repo_id);

                    if (await checkIfRepoExists(path)) {
                        await rm(path, {
                            recursive: true,
                            force: true,
                        });
                    }
                })

                console.log(`${data.userId}'s all local repos are deleted`);
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

storageWorker.on('failed', (job, err) => {
    console.error(`[StorageWorker] Job ${job?.id} (${job?.name}) failed:`, err);
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));