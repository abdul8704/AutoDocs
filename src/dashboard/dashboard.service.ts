import prisma from "../prisma/prisma";

export const getDashboardStats = async (userId: string) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [user, totalImportedRepos, totalJobsRun, activeJobsCount, openPRsCount, completedJobsCount, recentJobs, recentRepos, jobsLast7Days] = await Promise.all([
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
        prisma.docsUpdateJob.count({
            where: {
                repository: { user_id: userId },
                status: { in: ["COMPLETED", "MERGED", "PR_OPEN"] },
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
        prisma.docsUpdateJob.findMany({
            where: {
                repository: { user_id: userId },
                createdAt: { gte: sevenDaysAgo },
            },
            select: { createdAt: true },
        }),
    ]);

    // Build 7-day sparkline data array
    const sparklineMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        sparklineMap[dateStr] = 0;
    }
    jobsLast7Days.forEach((j) => {
        const dateStr = j.createdAt.toISOString().split("T")[0];
        if (sparklineMap[dateStr] !== undefined) {
            sparklineMap[dateStr]++;
        }
    });
    const sparklineData = Object.entries(sparklineMap).map(([date, count]) => ({ date, count }));

    // Build live feed event items from recent jobs
    const liveFeed = recentJobs.map((j) => ({
        id: j.id,
        type: j.status === "PR_OPEN" ? "PR_OPENED" : j.status === "COMPLETED" || j.status === "MERGED" ? "PR_MERGED" : "PUSH_EVENT",
        repoName: j.repository?.full_name || "Repository",
        commitSha: j.triggerCommit || "main",
        message: j.prLink ? `PR active: ${j.prLink}` : `Job status: ${j.status}`,
        timestamp: j.createdAt.toISOString(),
    }));

    const usedQuota = user?.usedDocsQuota || 0;
    const maxQuota = 20;
    const successRate = totalJobsRun > 0 ? Number(((completedJobsCount / totalJobsRun) * 100).toFixed(1)) : 100;

    return {
        importedReposCount: totalImportedRepos,
        totalJobsExecuted: totalJobsRun,
        activePipelinesCount: activeJobsCount,
        openPullRequestsCount: openPRsCount,
        successRatePercent: successRate,
        planType: user?.planType || "FREE",
        usedQuota,
        maxQuota,
        remainingQuota: Math.max(0, maxQuota - usedQuota),
        daysUntilReset: 12,
        sparkline7d: Object.values(sparklineMap),
        liveEvents: liveFeed,
        recentJobs,
        recentRepos,
        stats: {
            totalImportedRepos,
            totalJobsRun,
            activeJobsCount,
            openPRsCount,
            successRate,
            sparklineData,
            planType: user?.planType || "FREE",
            usedQuota,
            maxQuota,
            remainingQuota: Math.max(0, maxQuota - usedQuota),
            daysUntilReset: 12,
        },
        quota: {
            used: usedQuota,
            max: maxQuota,
            remaining: Math.max(0, maxQuota - usedQuota),
            daysUntilReset: 12,
        },
    };
};
