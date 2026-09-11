import { addNewModel, getAllModels, deleteModel, updateModel } from "./models.service";
import { Request, Response } from "express";

export const getAllModelController = async (req: Request, res: Response) => {
    const models = await getAllModels();
    return res.status(200).json({ models });
}

export const addNewModelController = async (req: Request, res: Response) => {
    const { modelName, provider, contextWindow, inputCost, outputCost, cacheRead, cacheWrite, cachedPrice } = req.body;
    const readPrice = cacheRead !== undefined ? cacheRead : (cachedPrice || 0);
    const writePrice = cacheWrite !== undefined ? cacheWrite : 0;
    const model = await addNewModel(modelName, provider, contextWindow, inputCost, outputCost, readPrice, writePrice);
    return res.status(200).json({ model });
}

export const deleteModelController = async (req: Request, res: Response) => {
    const { modelId } = req.body;
    const model = await deleteModel(modelId);
    return res.status(200).json({ model });
}

export const updateModelController = async (req: Request, res: Response) => {
    const { id, modelName, provider, contextWindow, inputCost, outputCost, cacheRead, cacheWrite } = req.body;
    await updateModel(id, modelName, provider, contextWindow, inputCost, outputCost, cacheRead, cacheWrite);
    return res.status(200).json({ message: "Model updated successfully" });
}