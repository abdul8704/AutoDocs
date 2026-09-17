import prisma from "../../prisma/prisma";
import { HttpError } from "../../utils/httpError.utils";

export const addNewModel = async (
  modelName: string,
  provider: string,
  contextWindow: number,
  inputCost: number,
  outputCost: number,
  cacheRead: number,
  cacheWrite: number,
  cacheStorageCostPerHour: number = 0
) => {
  const model = await prisma.modelRoster.create({
    data: {
      modelName,
      provider,
      contextWindow,
      inputPrice: inputCost,
      outputPrice: outputCost,
      cacheRead,
      cacheWrite,
      cacheStorageCostPerHour,
    },
  });
  return model;
};

export const getAllModels = async () => {
  const models = await prisma.modelRoster.findMany();
  return models;
};

export const getModelById = async (id: string) => {
  const model = await prisma.modelRoster.findUnique({
    where: { id },
  });
  return model;
};

export const deleteModel = async (id: string) => {
  const associatedConfigs = await prisma.lLMTaskConfig.findMany({
    where: { modelRosterId: id },
    select: { taskKey: true },
  });

  if (associatedConfigs.length > 0) {
    const taskKeys = associatedConfigs.map((c) => c.taskKey).join(", ");
    throw new HttpError(
      400,
      `Cannot delete model because it is associated with active task config(s): ${taskKeys}. Rebind or remove these task configs first.`
    );
  }

  const model = await prisma.modelRoster.delete({
    where: { id },
  });
  return model;
};

export const updateModel = async (
  id: string,
  modelName?: string,
  provider?: string,
  contextWindow?: number,
  inputCost?: number,
  outputCost?: number,
  cacheRead?: number,
  cacheWrite?: number,
  cacheStorageCostPerHour?: number
) => {
  const updatedModel = await prisma.modelRoster.update({
    where: { id },
    data: {
      ...(modelName !== undefined && { modelName }),
      ...(provider !== undefined && { provider }),
      ...(contextWindow !== undefined && { contextWindow }),
      ...(inputCost !== undefined && { inputPrice: inputCost }),
      ...(outputCost !== undefined && { outputPrice: outputCost }),
      ...(cacheRead !== undefined && { cacheRead }),
      ...(cacheWrite !== undefined && { cacheWrite }),
      ...(cacheStorageCostPerHour !== undefined && { cacheStorageCostPerHour }),
    },
  });
  return updatedModel;
};
