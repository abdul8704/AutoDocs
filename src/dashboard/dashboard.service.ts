import prisma from "../prisma/prisma";

export const getDashboardStats = async (userId: string) => {
    const [user, totalImportedRepos, totalJobsRun, activeJobsCount, openPRsCount, recentJobs, recentRepos] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: { planType: true, usedDocsQuota: true },
        }),
        prisma.repo.count({
            where: { user_id: userId },
        }),
        prisma.docsUpdateJob.count({
            where: { repository: { user_id: userId } },
        }),
        prisma.docsUpdateJob.count({
            where: {
                repository: { user_id: userId },
                status: { in: ["PENDING", "CLONING", "SCANING", "GENERATING", "WAITING_LLM_JUDGE"] },
            },
        }),
        prisma.docsUpdateJob.count({
            where: {
                repository: { user_id: userId },
                status: "PR_OPEN",
            },
        }),
        prisma.docsUpdateJob.findMany({
            where: { repository: { user_id: userId } },
            include: {
                repository: {
                    select: {
                        id: true,
                        full_name: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            take: 5,
        }),
        prisma.repo.findMany({
            where: { user_id: userId },
            orderBy: { created_at: "desc" },
            take: 5,
        }),
    ]);

    return {
        stats: {
            totalImportedRepos,
            totalJobsRun,
            activeJobsCount,
            openPRsCount,
            planType: user?.planType || "FREE",
            usedQuota: user?.usedDocsQuota || 0,
            maxQuota: 20,
        },
        recentJobs,
        recentRepos,
    };
};
