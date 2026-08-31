import { addNewModel, getAllModels, deleteModel, updateModel } from "./models.service";
import { Request, Response } from "express";

export const getAllModelController = async (req: Request, res: Response) => {
    const models = await getAllModels();
    return res.status(200).json({ models });
}

export const addNewModelController = async (req: Request, res: Response) => {
    const { modelName, provider, contextWindow } = req.body;
    const model = await addNewModel(modelName, provider, contextWindow);
    return res.status(200).json({ model });
}

export const deleteModelController = async (req: Request, res: Response) => {
    const { modelId } = req.body;
    const model = await deleteModel(modelId);
    return res.status(200).json({ model });
}

export const updateModelController = async (req: Request, res: Response) => {
    const { id, modelName, provider, contextWindow } = req.body;
    await updateModel(id, modelName, provider, contextWindow);
    return res.status(200).json({ message: "Model updated successfully" });
}