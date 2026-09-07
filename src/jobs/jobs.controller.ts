import { Request, Response } from "express";
import * as jobsService from "./jobs.service";
import { JobStatus } from "../pipeline/pipeline.types";

export const getJobsController = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { repoId, status, page, limit } = req.query;

    const result = await jobsService.getJobsForUser(userId, {
        repoId: typeof repoId === "string" ? repoId : undefined,
        status: typeof status === "string" ? (status as JobStatus) : undefined,
        page: page ? parseInt(String(page), 10) : undefined,
        limit: limit ? parseInt(String(limit), 10) : undefined,
    });

    res.status(200).json({ success: true, ...result });
};

export const getJobByIdController = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const jobId = req.params.jobId as string;

    const job = await jobsService.getJobById(userId, jobId);
    res.status(200).json({ success: true, job });
};

export const retryJobController = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const jobId = req.params.jobId as string;

    const job = await jobsService.retryJob(userId, jobId);
    res.status(200).json({ success: true, message: "Job re-queued successfully", job });
};
