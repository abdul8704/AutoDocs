import { Request, Response } from "express";
import * as dashboardService from "./dashboard.service";

export const getDashboardStatsController = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const data = await dashboardService.getDashboardStats(userId);
    res.status(200).json({ success: true, ...data });
};
