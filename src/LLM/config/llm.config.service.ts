import prisma from "../../prisma/prisma";
import { LLMRuntimeConfig, LLMTaskType } from "../llm.types";

export class LLMConfigService {
  private static cache = new Map<LLMTaskType, { providerName: string, config: LLMRuntimeConfig }>();

  static async ensureLLMConfigsExist() {
    try {
      let defaultModel = await prisma.modelRoster.findFirst({
        where: { modelName: 'gemini-2.5-flash', provider: 'gemini' }
      });
      if (!defaultModel) {
        defaultModel = await prisma.modelRoster.create({
          data: {
            modelName: 'gemini-2.5-flash',
            provider: 'gemini',
            contextWindow: 1048576,
            inputPrice: 0.075,
            outputPrice: 0.30,
          }
        });
      }

      let defaultPrompt = await prisma.prompt.findFirst({
        where: { prompt_key: 'sys.tinyRepo' }
      });
      if (!defaultPrompt) {
        defaultPrompt = await prisma.prompt.create({
          data: {
            prompt_key: 'sys.tinyRepo',
            version: 'v1.0',
            content: 'You are AutoDocs AI, a senior software architect. Given the codebase diff tree and file list, generate concise, production-grade ARCHITECTURE.md documentation.',
          }
        });
      }

      const tasks: Array<{ taskKey: LLMTaskType; temp: number }> = [
        { taskKey: 'tinyRepo', temp: 0.2 },
        { taskKey: 'judge', temp: 0.0 },
        { taskKey: 'docsGenerator', temp: 0.3 },
      ];

      for (const t of tasks) {
        const existing = await prisma.lLMTaskConfig.findUnique({ where: { taskKey: t.taskKey } });
        if (!existing) {
          await prisma.lLMTaskConfig.create({
            data: {
              taskKey: t.taskKey,
              modelRosterId: defaultModel.id,
              promptId: defaultPrompt.id,
              temperature: t.temp,
              maxOutputTokens: 4096,
            }
          });
        }
      }
    } catch (err) {
      console.error("[LLMConfigService] ensureLLMConfigsExist failed:", err);
    }
  }

  static async getTaskConfig(taskKey: LLMTaskType) {
    if (this.cache.has(taskKey))
      return this.cache.get(taskKey)

    let taskConfig = await prisma.lLMTaskConfig.findUnique({
      where: {
        taskKey
      },
      include: {
        model: true,
        prompt: true
      }
    });

    if (!taskConfig) {
      await this.ensureLLMConfigsExist();
      taskConfig = await prisma.lLMTaskConfig.findUnique({
        where: {
          taskKey
        },
        include: {
          model: true,
          prompt: true
        }
      });
    }

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
  let configs = await prisma.lLMTaskConfig.findMany({
    include: {
      model: true,
      prompt: true,
    }
  });
  if (configs.length === 0) {
    await LLMConfigService.ensureLLMConfigsExist();
    configs = await prisma.lLMTaskConfig.findMany({
      include: {
        model: true,
        prompt: true,
      }
    });
  }
  return configs;
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
  return await prisma.lLMTaskConfig.upsert({
    where: {
      taskKey
    },
    update: {
      modelRosterId: modelId,
      promptId,
      temperature,
      maxOutputTokens
    },
    create: {
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