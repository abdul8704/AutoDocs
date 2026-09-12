import prisma from "../prisma/prisma";

export interface LLMUsageMetrics {
    repoName: string;
    taskKey: string;
    provider: string;
    modelName: string;
    status: string;
    durationMs: number;
    tokenCost: number;
    cacheStorageCost: number;
    savedCost: number;
    promptTokens: number;
    cachedTokens: number;
    inputTokens: number;
    outputTokens: number;
    createdAt: Date;
}

export const getUsageOfRepo = async (repoId: string): Promise<LLMUsageMetrics[]> => {
    // 1. Single query to get repo's full_name and associated DocsUpdateJob IDs
    const repo = await prisma.repo.findUnique({
        where: { id: repoId },
        select: {
            full_name: true,
            jobs: {
                select: { id: true }
            }
        }
    });

    if (!repo || repo.jobs.length === 0) {
        return [];
    }

    const repoName = repo.full_name || "Unknown";
    const jobIds = repo.jobs.map(job => job.id);

    // 2. Fetch logs for those job IDs
    const logs = await prisma.lLMLog.findMany({
        where: {
            jobId: { in: jobIds }
        },
        select: {
            taskKey: true,
            provider: true,
            modelName: true,
            status: true,
            durationMs: true,
            tokenCost: true,
            cacheStorageCost: true,
            savedCost: true,
            promptTokens: true,
            cachedTokens: true,
            inputTokens: true,
            outputTokens: true,
            createdAt: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    return logs.map(log => ({
        ...log,
        repoName
    }));
};

export const getUsageByUserId = async (userId: string): Promise<LLMUsageMetrics[]> => {
    // 1. Fetch all DocsUpdateJobs for repositories belonging to this user
    const jobs = await prisma.docsUpdateJob.findMany({
        where: {
            repository: {
                user_id: userId
            }
        },
        select: {
            id: true,
            repository: {
                select: {
                    full_name: true
                }
            }
        }
    });

    if (jobs.length === 0) {
        return [];
    }

    // 2. Create O(1) Map from jobId to repoName
    const jobIdToRepoName = new Map<string, string>();
    for (const job of jobs) {
        if (job.repository?.full_name) {
            jobIdToRepoName.set(job.id, job.repository.full_name);
        }
    }

    const jobIds = Array.from(jobIdToRepoName.keys());

    // 3. Fetch all matching LLMLogs
    const logs = await prisma.lLMLog.findMany({
        where: {
            jobId: { in: jobIds }
        },
        select: {
            jobId: true,
            taskKey: true,
            provider: true,
            modelName: true,
            status: true,
            durationMs: true,
            tokenCost: true,
            cacheStorageCost: true,
            savedCost: true,
            promptTokens: true,
            cachedTokens: true,
            inputTokens: true,
            outputTokens: true,
            createdAt: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    return logs.map(log => {
        const repoName = log.jobId ? (jobIdToRepoName.get(log.jobId) || "Unknown") : "Unknown";
        return {
            taskKey: log.taskKey,
            provider: log.provider,
            modelName: log.modelName,
            status: log.status,
            durationMs: log.durationMs,
            tokenCost: log.tokenCost,
            cacheStorageCost: log.cacheStorageCost,
            savedCost: log.savedCost,
            promptTokens: log.promptTokens,
            cachedTokens: log.cachedTokens,
            inputTokens: log.inputTokens,
            outputTokens: log.outputTokens,
            createdAt: log.createdAt,
            repoName
        };
    });
};