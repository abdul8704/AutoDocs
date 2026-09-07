import { Job, Worker } from "bullmq";
import { redisConnection } from "../config/redis";
import { PushClassifyJobData } from "../queue/types.queue";
import prisma from "../prisma/prisma";
import { constructPath } from "../utils/pathHelper.utils";
import { checkIfRepoExists, cloneNewRepo, fetchLocalChanges } from "../github/github.service";
import { handleWebhooks } from "../pipeline/pipeline.orchestrator";
import { rm } from "fs";
import { updateJobStatus } from "../pipeline/pipeline.helper";
import { getAuthenticatedRepoUrl } from "../github/github.app.service";

export const webhookWorker = new Worker<PushClassifyJobData>(
    'push-classify-queue',
    async (job: Job<PushClassifyJobData>) => {
        console.log("Webhook worker job started for repository: ", job.data.repoId);

        const repoData = await prisma.repo.findUnique({
            where: {
                id: job.data.repoId
            }
        })

        if (!repoData) {
            throw new Error("Repo not found");
        }

        const repoPath = constructPath(job.data.repoId);
        const jobId = job.data.docJobId;
        const authenticatedCloneUrl =  await getAuthenticatedRepoUrl(repoData.clone_url, repoData.installation_id);

        try {
            if (await checkIfRepoExists(repoPath)) {
                console.log("[WebhookWorker] Repo already exists");
                await fetchLocalChanges(job.data.repoId, job.data.ref);
            }
            else {
                await updateJobStatus(jobId, "CLONING");
                
                console.log("[Push-Classify-Worker] About to clone repo")
                await cloneNewRepo(authenticatedCloneUrl, repoPath, "deep");
                console.log("[Push-Classify-Worker] Repo cloned successfully");
            }

            await updateJobStatus(jobId, "SCANING");

            const before = repoData.last_processed_commit ?? job.data.beforeSha;

            const { regenerated, prLink } = await handleWebhooks(jobId, repoPath, before, job.data.afterSha, job.data.ref, job.data.installationId, authenticatedCloneUrl);

            if(!regenerated) {
                return;
            }

            console.log("[Webhook worker] docs regenerated successfully, check out at ", prLink);

        }
        catch (err) {
            console.error(`[Push-Classify-Worker] Job (ID: ${job.data.docJobId}) failed:`, err);
            await prisma.docsUpdateJob.update({
                where: { id: jobId },
                data: {
                    status: "FAILED",
                    errorLog: err instanceof Error ? err.message : String(err)
                }
            }).catch(dbErr => console.error("[Push-Classify-Worker] Failed to update docsUpdateJob status to FAILED in DB:", dbErr));

            throw err; // Re-throw so BullMQ registers the job failure in Redis
        }
    },
    {
        connection: redisConnection
    }
)

webhookWorker.on('completed', (job) => {
    console.log(`[WebhookWorker] Job ${job.id} completed successfully!`);
});

webhookWorker.on('failed', (job, err) => {
    console.error(`[WebhookWorker] Job ${job?.id} failed:`, err);
});