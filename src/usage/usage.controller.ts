import { Request, Response } from "express";
import { getUsageOfRepo, getUsageByUserId } from "./usage.service";

export const getUsageOfRepoHandler = async (req: Request, res: Response) => {
    const repoId = req.params.repoId as string;
    const usage = await getUsageOfRepo(repoId);
    return res.status(200).json({ success: true, data: usage });
};

export const getUsageByUserHandler = async (req: Request, res: Response) => {
    const userId = req.params.userId as string;
    const usage = await getUsageByUserId(userId);
    return res.status(200).json({ success: true, data: usage });
};
