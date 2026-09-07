import prisma from "../prisma/prisma";
import { HttpError } from "../utils/httpError.utils";
import { JobStatus } from "../pipeline/pipeline.types";
import { publishFirstTimeImport } from "../queue/publishers";
import { getAuthenticatedRepoUrl } from "../github/github.app.service";

export interface GetJobsQuery {
    repoId?: string;
    status?: JobStatus;
    page?: number;
    limit?: number;
}

export const getJobsForUser = async (userId: string, query: GetJobsQuery) => {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const whereCondition: any = {
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
        },
    });

    if (!job) {
        throw new HttpError(404, "Job not found");
    }

    return job;
};

export const retryJob = async (userId: string, jobId: string) => {
    // Verifies job existence and ownership for the logged in user (throws 404 if invalid)
    await getJobById(userId, jobId);

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
    const authenticatedCloneUrl = await getAuthenticatedRepoUrl(repo.clone_url, repo.installation_id);

    await publishFirstTimeImport({
        repoId: repo.id,
        userId,
        githubUrl: authenticatedCloneUrl,
        installationId: repo.installation_id,
        docJobId: updatedJob.id,
        defaultBranch: "main",
    });

    return updatedJob;
};
