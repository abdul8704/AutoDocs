import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import { DocUpdateJobData } from "../queue/types.queue";
import simpleGit from "simple-git";
import prisma from "../prisma/prisma";
import { getRepoFiles } from "../pipeline/stages/L1.inventory";
import { generateDocsTinyRepo } from "../pipeline/stages/L4.tinyDocs";
import { LLMService } from "../LLM/llm.service";
import { DocsAndPRSchema } from "../LLM/llm.types";
import { writeFilesAndCommit, openPR, getDefaultBranch } from "../github/github.service";
import { updateJobStatus } from "../pipeline/pipeline.helper";
import { BillingService } from "../billing/billing.service";

export const docGenWorker = new Worker<DocUpdateJobData>(
    "doc-generation-queue",
    async (job: Job<DocUpdateJobData>) => {
        console.log(`[DocGenWorker] Processing job '${job.name}' (ID: ${job.id}) for repo ${job.data.repoId}`);
        const data = job.data;
        const jobId = data.docJobId;
        const llmService = new LLMService();

        try {
            await updateJobStatus(jobId, "GENERATING");

            const git = simpleGit(data.repoPath);
            const { codeFiles, intentFiles, docFiles, others } = await getRepoFiles(git, data.repoPath);

            console.log("[DocGenWorker] Preprocessing done, generating docs via LLM...");

            const generatedDocs: DocsAndPRSchema = await generateDocsTinyRepo(
                jobId,
                codeFiles,
                intentFiles,
                docFiles,
                others,
                data.repoPath,
                llmService,
                data.userId,
                data.repoId,
                data.currentCommitSha,
                data.promptSuffix
            );

            console.log("[DocGenWorker] Writing generated docs to repository...");

            await writeFilesAndCommit(
                "auto-Docs",
                data.repoPath,
                [{ path: "ARCHITECTURE.md", content: generatedDocs.documentation }],
                generatedDocs.commitMessage,
                data.cloneUrl
            );

            const parsedUrl = new URL(data.cloneUrl);
            const parts = parsedUrl.pathname.split("/");
            const repoOwner = parts[1];
            const repoName = parts[2].replace(".git", "");
            const targetBranch = (await getDefaultBranch(data.repoPath).catch(() => "")) || data.defaultBranch || "main";

            console.log("[DocGenWorker] Opening GitHub Pull Request...");

            const { prNumber, prLink } = await openPR(
                repoOwner,
                repoName,
                generatedDocs.prTitle,
                generatedDocs.prBody,
                "auto-Docs",
                targetBranch,
                data.installationId,
                data.repoId
            );

            if (!data.isFirstTime) {
                // Deduct usage credit for webhook doc updates
                await BillingService.deductCredit(
                    data.userId,
                    10,
                    jobId,
                    `Docs update generation for commit ${data.currentCommitSha}`
                );
            }

            await prisma.docsUpdateJob.update({
                where: { id: jobId },
                data: {
                    status: "PR_OPEN",
                    branchName: "auto-Docs",
                    pullRequestId: prNumber,
                    prLink,
                },
            });

            await prisma.repo.update({
                where: { id: data.repoId },
                data: { last_processed_commit: data.currentCommitSha }
            }).catch((dbErr) => console.error("[DocGenWorker] Failed to update repo last_processed_commit:", dbErr));

            console.log(`[DocGenWorker] Job ${job.id} completed successfully! PR Link: ${prLink}`);
            return prLink;
        } catch (err: unknown) {
            console.error(`[DocGenWorker] Job '${job.name}' (ID: ${job.id}) failed:`, err);

            await prisma.docsUpdateJob.update({
                where: { id: jobId },
                data: {
                    status: "FAILED",
                    errorLog: err instanceof Error ? err.message : String(err),
                },
            }).catch((dbErr) => console.error("[DocGenWorker] Failed to update job status to FAILED:", dbErr));

            throw err; // Re-throw to allow BullMQ to record failure in Redis
        }
    },
    {
        connection: redisConnection,
        concurrency: 3, // Manage token quota and rate limits
    }
);

docGenWorker.on("completed", (job) => {
    console.log(`[DocGenWorker] Job ${job.id} completed successfully!`);
});

docGenWorker.on("failed", (job, err) => {
    console.error(`[DocGenWorker] Job ${job?.id} failed:`, err);
});

docGenWorker.on("error", (err) => {
    console.error("[DocGenWorker] Worker error:", err);
});
