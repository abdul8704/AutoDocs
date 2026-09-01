import prisma from "../../prisma/prisma";
import { SupportedProviders, LLMRuntimeConfig, LLMTaskType } from "../llm.types";

export class LLMConfigService {
  private static cache = new Map<LLMTaskType, { providerName: string, config: LLMRuntimeConfig }>();

  static async getTaskConfig(taskKey: LLMTaskType) {
    if (this.cache.has(taskKey))
      return this.cache.get(taskKey)

    const taskConfig = await prisma.lLMTaskConfig.findUnique({
      where: {
        taskKey
      },
      include: {
        model: true,
        prompt: true
      }
    });
    if (!taskConfig) {
      throw new Error(`Unable to find taskConfig for ${taskKey}`);
    }

    const result = {
      providerName: taskConfig.model.provider,
      config: {
        model: taskConfig.model.modelName,
        systemInstruction: taskConfig.prompt.content,
        temperature: taskConfig.temperature,
        maxOutputTokens: taskConfig.maxOutputTokens || undefined
      }
    };

    this.cache.set(taskKey, result);
    return result;
  }

  static invalidateCache(taskKey: LLMTaskType) {
    this.cache.delete(taskKey);
  }
}

export const getAllConfigs = async () => {
  return await prisma.lLMTaskConfig.findMany({});
}

export const updateTaskConfig = async (
  taskKey: LLMTaskType,
  modelId: string,
  promptId: string,
  temperature: number,
  maxOutputTokens: number
) => {

  return await prisma.lLMTaskConfig.update({
    where: {
      taskKey
    },
    data: {
      modelRosterId: modelId,
      promptId,
      temperature,
      maxOutputTokens
    }
  });
}

export const createTaskConfig = async (
  taskKey: LLMTaskType,
  modelId: string,
  promptId: string,
  temperature: number,
  maxOutputTokens: number
) => {

  return await prisma.lLMTaskConfig.create({
    data: {
      taskKey,
      modelRosterId: modelId,
      promptId,
      temperature,
      maxOutputTokens
    }
  });
}

export const deleteTaskConfig = async (taskKey: LLMTaskType) => {
  return await prisma.lLMTaskConfig.delete({
    where: {
      taskKey
    }
  });
}