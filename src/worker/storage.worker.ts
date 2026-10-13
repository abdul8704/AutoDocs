import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import type { StorageJobData } from "../queue/types.queue"
import { CleanupJobData, FirstTimeImportJobData } from "../queue/types.queue"
import { constructPath } from "../utils/pathHelper.utils"
import { checkIfRepoExists, pullChanges } from "../github/github.service";
import { cloneNewRepo } from "../github/github.service";
import { generateFirstTimeDocs } from "../pipeline/pipeline.orchestrator"
import { rm } from "fs/promises"
import prisma from "../prisma/prisma";
import { updateJobStatus } from "../pipeline/pipeline.helper";
import { cloneWithinBudget, forgetRepo, touchRepo, withRepoPinned } from "../storage/diskQuota.service";

export const storageWorker = new Worker<StorageJobData>(
    'repo-storage-queue',
    async (job: Job<StorageJobData>) => {
        console.log(`[StorageWorker] Processing job '${job.name}' (ID: ${job.id})`);
        console.log("job started")
        if (job.name === "clone-first-time") {
            const repoData = job.data as FirstTimeImportJobData;
            const repoPath = constructPath(repoData.repoId);
            const jobId = repoData.docJobId;
            
            try {
                // Pinned so a concurrent clone can't evict this repo mid-job.
                await withRepoPinned(repoData.repoId, async () => {
                    let headSha: string;
                    if (await checkIfRepoExists(repoPath)) {
                        console.log("[StorageWorker] Repo already exists");
                        headSha = await pullChanges(repoPath);
                        await touchRepo(repoData.repoId);
                    }
                    else{
                        await updateJobStatus(jobId, "CLONING");
                        console.log("[StorageWorker] About to clone repo")

                        headSha = await cloneWithinBudget(repoData.repoId, () => cloneNewRepo(repoData.githubUrl, repoPath));
                        console.log("[StorageWorker] Repo cloned successfully");
                    }

                    await updateJobStatus(jobId, "SCANING")

                    const statusMsg: string = await generateFirstTimeDocs(repoData.userId, repoData.repoId, headSha, repoPath, jobId, repoData.githubUrl, repoData.installationId, repoData.defaultBranch);
                    console.log("[StorageWorker]", statusMsg);
                });
            } catch (err: unknown) {
                console.error(`[StorageWorker] Job '${job.name}' (ID: ${job.id}) failed:`, err);
                await prisma.docsUpdateJob.update({
                    where: { id: jobId },
                    data: {
                        status: "FAILED",
                        errorLog: err instanceof Error ? err.message : String(err)
                    }
                }).catch(dbErr => console.error("[StorageWorker] Failed to update docsUpdateJob status to FAILED in DB:", dbErr));

                throw err; // Re-throw so BullMQ registers the job failure in Redis
            }
        }
        else if (job.name === "clone-deep-push") {
            console.log("[StorageWorker] Processing clone-deep-push job");
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
                await forgetRepo(data.repoId);
                console.log("deletion done")
            }
            else if (data.action === "DELETE_USER") {
                const repos = await prisma.repo.findMany({
                    where: {
                        user_id: data.userId
                    },
                    select: {
                        id: true
                    }
                });

                // Clone dirs are named by Repo.id (not github_repo_id), and each rm is awaited.
                for (const repo of repos) {
                    const path = constructPath(repo.id);

                    if (await checkIfRepoExists(path)) {
                        await rm(path, {
                            recursive: true,
                            force: true,
                        });
                    }
                }
                await forgetRepo(...repos.map((r) => r.id));

                console.log(`${data.userId}'s all local repos are deleted`);
            }

        }
        else {
            throw new Error(`[StorageWorker] Unhandled job type: ${job.name}`);
        }
    },
    {
        connection: redisConnection,
        concurrency: 2, // Low concurrency to protect disk I/O and network bandwidth
    }
)

storageWorker.on('completed', (job) => {
    console.log(`[StorageWorker] Job ${job.id} (${job.name}) completed successfully!`);
});

storageWorker.on('failed', (job, err) => {
    console.error(`[StorageWorker] Job ${job?.id} (${job?.name}) failed:`, err);
});