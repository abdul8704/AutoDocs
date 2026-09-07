import prisma from "../prisma/prisma";
import { HttpError } from "../utils/httpError.utils";
import { constructPath } from "../utils/pathHelper.utils";
import { getAuthenticatedRepoUrl } from "../github/github.app.service";
import { publishFirstTimeImport } from "../queue/publishers";
import fs from "fs/promises";
import path from "path";

export const getRepoDetails = async (userId: string, repoId: string) => {
    const repo = await prisma.repo.findFirst({
        where: {
            id: repoId,
            user_id: userId,
        },
        include: {
            jobs: {
                orderBy: { createdAt: "desc" },
                take: 10,
            },
        },
    });

    if (!repo) {
        throw new HttpError(404, "Repository not found");
    }

    const totalJobs = repo.jobs.length;
    const completedJobs = repo.jobs.filter((j) => j.status === "COMPLETED" || j.status === "PR_OPEN").length;
    const failedJobs = repo.jobs.filter((j) => j.status === "FAILED").length;

    const latestJob = repo.jobs[0] || null;

    return {
        repo,
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

    await publishFirstTimeImport({
        repoId: repo.id,
        userId,
        githubUrl: authenticatedCloneUrl,
        installationId: repo.installation_id,
        docJobId: docJob.id,
        defaultBranch: "main",
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
    } catch (err) {
        return {
            exists: false,
            filename: "ARCHITECTURE.md",
            content: null,
            message: "No generated ARCHITECTURE.md file found yet. Trigger doc generation to create it.",
        };
    }
};
