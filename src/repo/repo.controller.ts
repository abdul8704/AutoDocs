import { Request, Response } from "express";
import * as repoService from "./repo.service";

export const getRepoDetailsController = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const repoId = req.params.repoId as string;

    const data = await repoService.getRepoDetails(userId, repoId);
    res.status(200).json({ success: true, ...data });
};

export const triggerDocGenController = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const repoId = req.params.repoId as string;

    const data = await repoService.triggerDocGenForRepo(userId, repoId);
    res.status(202).json({ success: true, ...data });
};

export const getRepoGeneratedDocsController = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const repoId = req.params.repoId as string;

    const data = await repoService.getRepoGeneratedDocs(userId, repoId);
    res.status(200).json({ success: true, ...data });
};
