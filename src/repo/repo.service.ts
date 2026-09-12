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

    const latestJobRaw = repo.jobs[0] || null;
    let latestJob = null;
    if (latestJobRaw) {
        const stepperState = {
            webhookRecv: { status: "COMPLETED", durationMs: 240 },
            checkout: { status: latestJobRaw.status !== "PENDING" ? "COMPLETED" : "IN_PROGRESS", durationMs: 1200 },
            astDiff: { status: ["SCANING", "GENERATING", "PR_OPEN", "COMPLETED", "MERGED"].includes(latestJobRaw.status) ? "COMPLETED" : "PENDING" },
            llmGen: { status: ["GENERATING", "PR_OPEN", "COMPLETED", "MERGED"].includes(latestJobRaw.status) ? "COMPLETED" : "PENDING", durationMs: 4800 },
            prOpen: { status: ["PR_OPEN", "COMPLETED", "MERGED"].includes(latestJobRaw.status) ? "COMPLETED" : "PENDING", prLink: latestJobRaw.prLink },
        };
        latestJob = {
            ...latestJobRaw,
            stepperState,
        };
    }

    return {
        repo: {
            ...repo,
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
    } catch {
        return {
            exists: false,
            filename: "ARCHITECTURE.md",
            content: null,
            message: "No generated ARCHITECTURE.md file found yet. Trigger doc generation to create it.",
        };
    }
};
