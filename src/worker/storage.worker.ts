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
import { generateFirstTimeDocs, webhookDocGen } from "../pipeline/pipeline.orchestrator"

const TOTAL_SIZE = 5 * 1024 * 1024 * 1024; // 5gb max for storing local repo copies

export const storageWorker = new Worker<StorageJobData>(
    'repo-storage-queue',
    async (job: Job<StorageJobData>) => {
        console.log(`[StorageWorker] Processing job '${job.name}' (ID: ${job.id})`);

        if (job.name === "clone-first-time") {
            const data = job.data as FirstTimeImportJobData;
            const repoPath = constructPath(data.repoId);
            const git: SimpleGit = simpleGit(repoPath);

            while(! await checkForSpace(data.cloneUrl, TOTAL_SIZE, data.installationId)){
                console.log("All repos are occupied, waiting 1 minute...");
                await sleep(60 * 1000); // Pauses the loop execution properly for 1 minute
            }

            await git.clone(data.cloneUrl, repoPath, [
                "--depth=1",
                "--single-branch",
                "-branch=main"
            ]);

            await generateFirstTimeDocs(data.repoId, repoPath)
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