import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import type { StorageJobData } from "../queue/types.queue"
import { CleanupJobData, DeepClonePushJobData, FirstTimeImportJobData } from "../queue/types.queue"
import { constructPath } from "../utils/pathHelper.utils"
import { checkIfRepoExists } from "../github/github.service";
import { cloneNewRepo } from "../github/github.service";
import { generateFirstTimeDocs } from "../pipeline/pipeline.orchestrator"
import { rm } from "fs/promises"
import prisma from "../prisma/prisma";
import { DocsAndPRSchema } from "../LLM/llm.types";

export const storageWorker = new Worker<StorageJobData>(
    'repo-storage-queue',
    async (job: Job<StorageJobData>) => {
        console.log(`[StorageWorker] Processing job '${job.name}' (ID: ${job.id})`);
        console.log("job started")
        if (job.name === "clone-first-time") {
            const repoData = job.data as FirstTimeImportJobData;
            const repoPath = constructPath(repoData.repoId);

            if (await checkIfRepoExists(repoPath)) {
                console.log("[StorageWorker] Repo already exists");
                return;
            }
            // TODO: check for space
            
            const jobId = repoData.docJobId;

            await prisma.docsUpdateJob.update({
                where: {
                    id: jobId
                },
                data: {
                    status: "CLONING"
                }
            });
            console.log("[StorageWorker] About to clone repo")
            await cloneNewRepo(repoData, repoPath);
            console.log("[StorageWorker] Repo cloned successfully");
            
            await prisma.docsUpdateJob.update({
                where: {
                    id: jobId
                },
                data: {
                    status: "SCANING"
                }
            });

            const prLink: string = await generateFirstTimeDocs(repoData.repoId, repoPath, jobId, repoData.githubUrl, repoData.installationId);
            console.log("[StorageWorker] First time docs generated successfully, check PR at", prLink);
        }
        else if (job.name === "clone-deep-push") {

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
                console.log("deletion done")
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

                repos.forEach(async (repoId: { github_repo_id: string; }) => {
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