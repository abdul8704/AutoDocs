import { Request, Response } from "express";
import * as jobsService from "./jobs.service";
import { JobStatus } from "../pipeline/pipeline.types";

export const getJobsController = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { repoId, status, page, limit, offset } = req.query;

    const result = await jobsService.getJobsForUser(userId, {
        repoId: typeof repoId === "string" ? repoId : undefined,
        status: typeof status === "string" ? (status as JobStatus) : undefined,
        page: page ? parseInt(String(page), 10) : undefined,
        limit: limit ? parseInt(String(limit), 10) : undefined,
        offset: offset !== undefined ? parseInt(String(offset), 10) : undefined,
    });

    res.status(200).json({ success: true, ...result });
};

export const getJobsByUserIdController = async (req: Request, res: Response) => {
    const targetUserId = typeof req.params.userId === "string" ? req.params.userId : req.user!.id;
    const { repoId, status, page, limit, offset } = req.query;

    const result = await jobsService.getJobsForUser(targetUserId, {
        repoId: typeof repoId === "string" ? repoId : undefined,
        status: typeof status === "string" ? (status as JobStatus) : undefined,
        page: page ? parseInt(String(page), 10) : undefined,
        limit: limit ? parseInt(String(limit), 10) : undefined,
        offset: offset !== undefined ? parseInt(String(offset), 10) : undefined,
    });

    res.status(200).json({ success: true, ...result });
};

export const getJobByIdController = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const jobId = req.params.jobId as string;

    const job = await jobsService.getJobById(userId, jobId);
    res.status(200).json({ success: true, job });
};

export const retryJobController = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const jobId = req.params.jobId as string;

    const job = await jobsService.retryJob(userId, jobId);
    res.status(200).json({ success: true, message: "Job re-queued successfully", job });
};

export const streamJobsTelemetryController = async (req: Request, res: Response) => {
    const userId = req.user?.id;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write(`data: ${JSON.stringify({ type: "CONNECTED", timestamp: new Date().toISOString() })}\n\n`);

    const interval = setInterval(async () => {
        try {
            if (userId) {
                const latestJobs = await jobsService.getJobsForUser(userId, { limit: 5 });
                res.write(`data: ${JSON.stringify({ type: "TELEMETRY_UPDATE", jobs: latestJobs.jobs, timestamp: new Date().toISOString() })}\n\n`);
            }
        } catch {
            // connection dropped
        }
    }, 5000);

    req.on("close", () => {
        clearInterval(interval);
        res.end();
    });
};

export const getJobsStatsController = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const stats = await jobsService.getJobsStats(userId);
    res.status(200).json({ success: true, stats });
};

