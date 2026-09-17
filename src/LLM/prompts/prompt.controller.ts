import { Request, Response } from "express";
import {
    getAllprompts,
    getTaskPrompt,
    addPrompt,
    deletePrompt,
    updatePrompt
} from "./prompt.service";

export const getAllpromtsController = async (req: Request, res: Response) => {
    const prompts = await getAllprompts();
    return res.status(200).json(prompts);
};

export const getTaskPromptController = async (req: Request, res: Response) => {
    const { promptKey } = req.params;
    if (!promptKey || typeof promptKey !== "string" || !promptKey.trim()) {
        return res.status(400).json({ error: "Missing required parameter: 'promptKey'" });
    }
    const prompts = await getTaskPrompt(promptKey);
    return res.status(200).json(prompts);
};

export const addPromptController = async (req: Request, res: Response) => {
    const { promptKey, version, content, promptTitle, title } = req.body || {};

    if (!promptKey || !version || !content) {
        return res.status(400).json({
            error: "Missing required fields: 'promptKey', 'version', and 'content' are required in request body"
        });
    }

    const prompts = await addPrompt(promptKey, version, content, promptTitle || title);
    return res.status(200).json(prompts);
};

export const deletePromptController = async (req: Request, res: Response) => {
    const promptId = req.params.promptId || req.body?.promptId;

    if (!promptId || typeof promptId !== "string" || !promptId.trim()) {
        return res.status(400).json({ error: "Missing required parameter: 'promptId'" });
    }

    const prompts = await deletePrompt(promptId);
    return res.status(200).json(prompts);
};

export const updatePromptController = async (req: Request, res: Response) => {
    const promptId = req.params.promptId || req.body?.promptId;
    const { version, content, promptTitle, title } = req.body || {};

    if (!promptId || !version || !content) {
        return res.status(400).json({
            error: "Missing required fields: 'promptId', 'version', and 'content' are required"
        });
    }

    const prompts = await updatePrompt(promptId, version, content, promptTitle || title);
    return res.status(200).json(prompts);
};


