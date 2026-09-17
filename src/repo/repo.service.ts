import prisma from "../prisma/prisma";
import { HttpError } from "../utils/httpError.utils";
import { constructPath } from "../utils/pathHelper.utils";
import { getAuthenticatedRepoUrl } from "../github/github.app.service";
import { publishFirstTimeImport } from "../queue/publishers";
import { getDefaultBranch } from "../github/github.service";
import fs from "fs/promises";
import path from "path";

export const getRepoDetails = async (userId: string, repoId: string) => {
    const repo = await prisma.repo.findFirst({
        where: {
            user_id: userId,
            OR: [
                { id: repoId },
                { github_repo_id: repoId },
            ],
        },
        include: {
            jobs: {
                orderBy: { createdAt: "desc" },
                take: 50,
                include: {
                    creditLedgers: true,
                },
            },
        },
    });

    if (!repo) {
        throw new HttpError(404, "Repository not found");
    }

    const enrichedJobs = repo.jobs.map((j) => {
        const creditsDeducted = Math.abs(
            j.creditLedgers.reduce((sum, l) => sum + (l.amount < 0 ? l.amount : 0), 0)
        );
        const isFirstTime = !j.triggerCommit || j.triggerCommit === "";
        const isDropped = j.status === "DROPPED" || j.status === "LLM_JUDGE_REJECTED";
        const isFailed = j.status === "FAILED";

        return {
            ...j,
            creditsUsed: isFailed ? null : isDropped ? 0 : creditsDeducted > 0 ? creditsDeducted : 10,
            isFailed,
            isFirstTime,
            judgeReasoning: isDropped ? j.errorLog : null,
        };
    });

    const totalJobs = enrichedJobs.length;
    const completedJobs = enrichedJobs.filter(
        (j) => j.status === "COMPLETED" || j.status === "PR_OPEN" || j.status === "MERGED"
    ).length;
    const failedJobs = enrichedJobs.filter((j) => j.status === "FAILED").length;

    const latestJobRaw = enrichedJobs[0] || null;
    let latestJob = null;
    if (latestJobRaw) {
        latestJob = {
            ...latestJobRaw,
            isFirstTime: latestJobRaw.isFirstTime,
            judgeReasoning: latestJobRaw.judgeReasoning,
        };
    }

    return {
        repo: {
            ...repo,
            jobs: enrichedJobs,
            default_branch: "main",
            sync_status: repo.last_processed_commit ? "Synchronized" : "Pending",
        },
        latestJob,
        stats: {
            totalJobs,
            completedJobs,
            failedJobs,
        },
    };
};

export const triggerDocGenForRepo = async (userId: string, repoId: string) => {
    const repo = await prisma.repo.findFirst({
        where: {
            id: repoId,
            user_id: userId,
        },
    });

    if (!repo) {
        throw new HttpError(404, "Repository not found");
    }

    const docJob = await prisma.docsUpdateJob.create({
        data: {
            repoId: repo.id,
            status: "PENDING",
        },
    });

    await prisma.user.update({
        where: { id: userId },
        data: { usedDocsQuota: { increment: 1 } },
    });

    const authenticatedCloneUrl = await getAuthenticatedRepoUrl(repo.clone_url, repo.installation_id);
    const repoPath = constructPath(repo.id);
    const defaultBranchName = (await getDefaultBranch(repoPath).catch(() => "main")) || "main";

    await publishFirstTimeImport({
        repoId: repo.id,
        userId,
        githubUrl: authenticatedCloneUrl,
        installationId: repo.installation_id,
        docJobId: docJob.id,
        defaultBranch: defaultBranchName,
    });

    return {
        jobId: docJob.id,
        message: "Documentation generation job queued successfully",
    };
};

export const getRepoGeneratedDocs = async (userId: string, repoId: string) => {
    const repo = await prisma.repo.findFirst({
        where: {
            id: repoId,
            user_id: userId,
        },
    });

    if (!repo) {
        throw new HttpError(404, "Repository not found");
    }

    const repoPath = constructPath(repo.id);
    const docFilePath = path.join(repoPath, "ARCHITECTURE.md");

    try {
        const content = await fs.readFile(docFilePath, "utf-8");
        return {
            exists: true,
            filename: "ARCHITECTURE.md",
            content,
        };
    } catch {
        return {
            exists: false,
            filename: "ARCHITECTURE.md",
            content: null,
            message: "No generated ARCHITECTURE.md file found yet. Trigger doc generation to create it.",
        };
    }
};
