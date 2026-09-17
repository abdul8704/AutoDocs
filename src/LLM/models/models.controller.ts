import { addNewModel, getAllModels, getModelById, deleteModel, updateModel } from "./models.service";
import { Request, Response } from "express";

export const getAllModelController = async (req: Request, res: Response) => {
  const models = await getAllModels();
  return res.status(200).json({ models });
};

export const getModelByIdController = async (req: Request, res: Response) => {
  const modelId = typeof req.params.modelId === 'string' ? req.params.modelId : (Array.isArray(req.params.modelId) ? req.params.modelId[0] : '');
  if (!modelId) {
    return res.status(400).json({ message: "Missing modelId" });
  }
  const model = await getModelById(modelId);
  if (!model) {
    return res.status(404).json({ message: "Model not found" });
  }
  return res.status(200).json({ model });
};

export const addNewModelController = async (req: Request, res: Response) => {
  const {
    modelName,
    provider,
    contextWindow,
    inputCost,
    inputPrice,
    outputCost,
    outputPrice,
    cacheRead,
    cacheWrite,
    cachedPrice,
    cacheStorageCostPerHour,
    storageCostPerHour,
  } = req.body;
  const inpCost = inputCost !== undefined ? inputCost : (inputPrice || 0);
  const outCost = outputCost !== undefined ? outputCost : (outputPrice || 0);
  const readPrice = cacheRead !== undefined ? cacheRead : (cachedPrice || 0);
  const writePrice = cacheWrite !== undefined ? cacheWrite : 0;
  const storageCost = cacheStorageCostPerHour !== undefined ? cacheStorageCostPerHour : (storageCostPerHour || 0);

  const model = await addNewModel(
    modelName,
    provider,
    Number(contextWindow),
    Number(inpCost),
    Number(outCost),
    Number(readPrice),
    Number(writePrice),
    Number(storageCost)
  );
  return res.status(200).json({ success: true, model });
};

export const deleteModelController = async (req: Request, res: Response) => {
  const paramId = typeof req.params.modelId === 'string' ? req.params.modelId : (Array.isArray(req.params.modelId) ? req.params.modelId[0] : undefined);
  const modelId = paramId || req.body?.modelId || req.body?.id;
  if (!modelId) {
    return res.status(400).json({ message: "Missing modelId" });
  }
  const model = await deleteModel(modelId);
  return res.status(200).json({ success: true, model });
};

export const updateModelController = async (req: Request, res: Response) => {
  const paramId = typeof req.params.modelId === 'string' ? req.params.modelId : (Array.isArray(req.params.modelId) ? req.params.modelId[0] : undefined);
  const id = paramId || req.body?.id || req.body?.modelId;
  if (!id) {
    return res.status(400).json({ message: "Missing model id" });
  }

  const {
    modelName,
    provider,
    contextWindow,
    inputCost,
    inputPrice,
    outputCost,
    outputPrice,
    cacheRead,
    cachedPrice,
    cacheWrite,
    cacheStorageCostPerHour,
    storageCostPerHour,
  } = req.body;

  const inpCost = inputCost !== undefined ? inputCost : inputPrice;
  const outCost = outputCost !== undefined ? outputCost : outputPrice;
  const readPrice = cacheRead !== undefined ? cacheRead : cachedPrice;
  const storageCost = cacheStorageCostPerHour !== undefined ? cacheStorageCostPerHour : storageCostPerHour;

  const updatedModel = await updateModel(
    id,
    modelName,
    provider,
    contextWindow ? Number(contextWindow) : undefined,
    inpCost !== undefined ? Number(inpCost) : undefined,
    outCost !== undefined ? Number(outCost) : undefined,
    readPrice !== undefined ? Number(readPrice) : undefined,
    cacheWrite !== undefined ? Number(cacheWrite) : undefined,
    storageCost !== undefined ? Number(storageCost) : undefined
  );

  return res.status(200).json({
    success: true,
    message: "Model roster entry updated successfully",
    model: updatedModel,
  });
};