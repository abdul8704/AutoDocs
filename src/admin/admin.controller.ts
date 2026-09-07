import { Request, Response } from "express";
import * as adminService from "./admin.service";
import { JobStatus } from "../pipeline/pipeline.types";

export const getAllUsersAdminController = async (req: Request, res: Response) => {
    const { page, limit, search } = req.query;
    const data = await adminService.getAllUsersAdmin({
        page: page ? parseInt(String(page), 10) : undefined,
        limit: limit ? parseInt(String(limit), 10) : undefined,
        search: typeof search === "string" ? search : undefined,
    });
    res.status(200).json({ success: true, ...data });
};

export const getUserDetailsAdminController = async (req: Request, res: Response) => {
    const userId = req.params.userId as string;
    const user = await adminService.getUserDetailsAdmin(userId);
    res.status(200).json({ success: true, user });
};

export const updateUserPlanAdminController = async (req: Request, res: Response) => {
    const userId = req.params.userId as string;
    const { planType, usedDocsQuota } = req.body;
    const user = await adminService.updateUserPlanAdmin(userId, {
        planType,
        usedDocsQuota: usedDocsQuota !== undefined ? Number(usedDocsQuota) : undefined,
    });
    res.status(200).json({ success: true, user });
};

export const getAllReposAdminController = async (req: Request, res: Response) => {
    const { page, limit, search } = req.query;
    const data = await adminService.getAllReposAdmin({
        page: page ? parseInt(String(page), 10) : undefined,
        limit: limit ? parseInt(String(limit), 10) : undefined,
        search: typeof search === "string" ? search : undefined,
    });
    res.status(200).json({ success: true, ...data });
};

export const getAllJobsAdminController = async (req: Request, res: Response) => {
    const { page, limit, status, repoId, userId } = req.query;
    const data = await adminService.getAllJobsAdmin({
        page: page ? parseInt(String(page), 10) : undefined,
        limit: limit ? parseInt(String(limit), 10) : undefined,
        status: typeof status === "string" ? (status as JobStatus) : undefined,
        repoId: typeof repoId === "string" ? repoId : undefined,
        userId: typeof userId === "string" ? userId : undefined,
    });
    res.status(200).json({ success: true, ...data });
};

export const getLLMLogsAdminController = async (req: Request, res: Response) => {
    const { page, limit, status, taskKey } = req.query;
    const data = await adminService.getLLMLogsAdmin({
        page: page ? parseInt(String(page), 10) : undefined,
        limit: limit ? parseInt(String(limit), 10) : undefined,
        status: typeof status === "string" ? status : undefined,
        taskKey: typeof taskKey === "string" ? taskKey : undefined,
    });
    res.status(200).json({ success: true, ...data });
};

export const getLLMStatsAdminController = async (_req: Request, res: Response) => {
    const stats = await adminService.getLLMStatsAdmin();
    res.status(200).json({ success: true, stats });
};

export const getAdminMasterStatsController = async (_req: Request, res: Response) => {
    const data = await adminService.getAdminMasterStats();
    res.status(200).json({ success: true, ...data });
};
