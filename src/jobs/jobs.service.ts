import prisma from "../prisma/prisma";
import { HttpError } from "../utils/httpError.utils";
import { JobStatus } from "../pipeline/pipeline.types";
import { publishFirstTimeImport, publishPushForClassification } from "../queue/publishers";
import { getAuthenticatedRepoUrl } from "../github/github.app.service";
import { BillingService } from "../billing/billing.service";

export interface GetJobsQuery {
    repoId?: string;
    status?: JobStatus;
    page?: number;
    limit?: number;
    offset?: number;
}

export const getJobsForUser = async (userId: string, query: GetJobsQuery) => {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));
    const skip = query.offset !== undefined ? Math.max(0, query.offset) : (page - 1) * limit;

    const whereCondition: Record<string, unknown> = {
        repository: {
            user_id: userId,
        },
    };

    if (query.repoId) {
        whereCondition.repoId = query.repoId;
    }

    if (query.status) {
        whereCondition.status = query.status;
    }

    const [total, jobs] = await Promise.all([
        prisma.docsUpdateJob.count({ where: whereCondition }),
        prisma.docsUpdateJob.findMany({
            where: whereCondition,
            include: {
                repository: {
                    select: {
                        id: true,
                        full_name: true,
                        clone_url: true,
                        github_repo_id: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
    ]);

    return {
        jobs,
        pagination: {
            total,
            page,
            limit,
            offset: skip,
            totalPages: Math.ceil(total / limit),
        },
    };
};

export const getJobById = async (userId: string, jobId: string) => {
    const job = await prisma.docsUpdateJob.findFirst({
        where: {
            id: jobId,
            repository: {
                user_id: userId,
            },
        },
        include: {
            repository: {
                select: {
                    id: true,
                    full_name: true,
                    clone_url: true,
                    github_repo_id: true,
                    installation_id: true,
                },
            },
            creditLedgers: {
                select: {
                    amount: true,
                    type: true,
                    createdAt: true,
                },
            },
        },
    });

    if (!job) {
        throw new HttpError(404, "Job not found");
    }

    // Fetch related LLM execution logs for this job
    const llmLogs = await prisma.lLMLog.findMany({
        where: { jobId: job.id },
        orderBy: { createdAt: "asc" },
    });

    // Compute token breakdown totals
    const tokenBreakdown = llmLogs.reduce(
        (acc, log) => {
            acc.promptTokens += log.promptTokens;
            acc.cachedTokens += log.cachedTokens;
            acc.inputTokens += log.inputTokens;
            acc.outputTokens += log.outputTokens;
            acc.tokenCost += log.tokenCost;
            acc.durationMs += log.durationMs;
            return acc;
        },
        {
            promptTokens: 0,
            cachedTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            tokenCost: 0,
            durationMs: 0,
        }
    );

    const totalTokens = tokenBreakdown.promptTokens + tokenBreakdown.outputTokens;
    const creditsDeducted = Math.abs(
        job.creditLedgers.reduce((sum, l) => sum + (l.amount < 0 ? l.amount : 0), 0)
    );

    // Compute 5-step stepper state for the UI pipeline view
    const stepperState = {
        webhookRecv: { status: "COMPLETED", durationMs: 240 },
        checkout: { status: job.status !== "PENDING" ? "COMPLETED" : "IN_PROGRESS", durationMs: 1200 },
        astDiff: { status: ["SCANING", "GENERATING", "PR_OPEN", "COMPLETED", "MERGED"].includes(job.status) ? "COMPLETED" : "PENDING" },
        llmGen: { status: ["GENERATING", "PR_OPEN", "COMPLETED", "MERGED"].includes(job.status) ? "COMPLETED" : "PENDING", durationMs: tokenBreakdown.durationMs },
        prOpen: { status: ["PR_OPEN", "COMPLETED", "MERGED"].includes(job.status) ? "COMPLETED" : "PENDING", prLink: job.prLink },
    };

    // Format stdout log lines for terminal UI
    const stdoutLogs = [
        `[${job.createdAt.toISOString()}] INFO Webhook received: git.push on repo ${job.repository.full_name}`,
        `[${job.createdAt.toISOString()}] INFO Cloned repository at commit ${job.triggerCommit || "HEAD"}`,
        ...llmLogs.map(
            (log) => `[${log.createdAt.toISOString()}] [${log.status}] Task: ${log.taskKey} using ${log.modelName} (${log.durationMs}ms, ${log.promptTokens + log.outputTokens} tokens)`
        ),
        job.prLink ? `[${job.updatedAt.toISOString()}] SUCCESS Created PR: ${job.prLink}` : null,
        job.errorLog ? `[${job.updatedAt.toISOString()}] ERROR ${job.errorLog}` : null,
    ].filter(Boolean);

    return {
        ...job,
        llmLogs,
        tokenBreakdown: {
            ...tokenBreakdown,
            totalTokens,
            costUsd: Number(tokenBreakdown.tokenCost.toFixed(4)),
        },
        creditsDeducted,
        stepperState,
        stdoutLogs,
    };
};

export const retryJob = async (userId: string, jobId: string) => {
    // Verifies job existence and ownership for the logged in user (throws 404 if invalid)
    const job = await getJobById(userId, jobId);

    if (job.status !== "INSUFFICIENT_CREDITS" && job.status !== "FAILED") {
        throw new HttpError(400, `Cannot retry job with status '${job.status}'. Only jobs with 'INSUFFICIENT_CREDITS' or 'FAILED' status can be retried.`);
    }

    const hasSufficientCredits = await BillingService.hasSufficientBalance(userId, 10);
    if (!hasSufficientCredits) {
        throw new HttpError(400, "Insufficient balance. At least 10 credits are required to retry this job.");
    }

    const updatedJob = await prisma.docsUpdateJob.update({
        where: { id: jobId },
        data: {
            status: "PENDING",
            errorLog: null,
        },
        include: {
            repository: true,
        },
    });

    const repo = updatedJob.repository;

    if (updatedJob.triggerCommit) {
        await publishPushForClassification({
            docJobId: updatedJob.id,
            ref: "refs/heads/main",
            repoId: repo.id,
            installationId: repo.installation_id,
            afterSha: updatedJob.triggerCommit,
            beforeSha: repo.last_processed_commit || "",
            defaultBranch: "main",
            userId,
        });
    } else {
        const authenticatedCloneUrl = await getAuthenticatedRepoUrl(repo.clone_url, repo.installation_id);
        await publishFirstTimeImport({
            repoId: repo.id,
            userId,
            githubUrl: authenticatedCloneUrl,
            installationId: repo.installation_id,
            docJobId: updatedJob.id,
            defaultBranch: "main",
        });
    }

    return updatedJob;
};

export const getJobsOfRepo = async (repoId: string) => {
    return await prisma.docsUpdateJob.findMany({
        where: {
            repoId
        },
        include: {
            repository: {
                select: {
                    full_name: true,
                }
            }
        }
    });
}