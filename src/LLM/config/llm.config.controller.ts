import { Request, Response } from 'express';
import { updateTaskConfig, getAllConfigs, createTaskConfig, deleteTaskConfig, LLMConfigService } from './llm.config.service';
import { LLMTaskType } from "../llm.types";

export const updateLLMConfig = async (req: Request, res: Response) => {
    const { taskKey, modelId, promptId, temperature, maxOutputTokens } = req.body;
    if (!taskKey || !modelId || !promptId || temperature === undefined || maxOutputTokens === undefined) {
        return res.status(400).json({ message: "Bad Request. Missing required fields" });
    }

    const updated = await updateTaskConfig(taskKey, modelId, promptId, Number(temperature), Number(maxOutputTokens));
    LLMConfigService.invalidateCache(taskKey);
    return res.status(200).json({ success: true, updated });
};

export const getLLMConfig = async (req: Request, res: Response) => {
    const { taskKey } = req.params as { taskKey: LLMTaskType };

    if (typeof taskKey !== "string") {
        return res.status(400).json({ message: "Bad Request. taskKey should be string" });
    }

    const config = await LLMConfigService.getTaskConfig(taskKey);
    return res.status(200).json({ success: true, config });
};

export const createTaskConfigController = async (req: Request, res: Response) => {
    const {
        taskKey,
        modelId,
        promptId,
        temperature,
        maxOutputTokens
    } = req.body;

    if (!taskKey || !modelId || !promptId || temperature === undefined || maxOutputTokens === undefined) {
        return res.status(400).json({ message: "Bad Request. Missing required fields" });
    }

    const created = await createTaskConfig(taskKey, modelId, promptId, Number(temperature), Number(maxOutputTokens));
    LLMConfigService.invalidateCache(taskKey);
    return res.status(200).json({ success: true, created });
};

export const deleteTaskConfigController = async (req: Request, res: Response) => {
    const { taskKey } = req.params as { taskKey: LLMTaskType };
    if (!taskKey) {
        return res.status(400).json({ message: "Bad Request. Missing required fields" });
    }

    const deleted = await deleteTaskConfig(taskKey);
    LLMConfigService.invalidateCache(taskKey);
    return res.status(200).json({ success: true, deleted });
};

export const getAllConfigsController = async (req: Request, res: Response) => {
    const configs = await getAllConfigs();
    return res.status(200).json({ success: true, configs });
};