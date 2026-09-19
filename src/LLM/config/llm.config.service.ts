import prisma from "../../prisma/prisma";
import { LLMRuntimeConfig, LLMTaskType } from "../llm.types";
import { TINY_REPO_PROMPT, DIFF_JUDGE_PROMPT } from "../llm.constants";

export class LLMConfigService {
  private static cache = new Map<LLMTaskType, { providerName: string, config: LLMRuntimeConfig }>();

  static async ensureLLMConfigsExist() {
    try {
      let defaultModel = await prisma.modelRoster.findFirst({
        where: { modelName: 'gemini-3.6-flash', provider: 'gemini' }
      });
      if (!defaultModel) {
        defaultModel = await prisma.modelRoster.create({
          data: {
            modelName: 'gemini-3.6-flash',
            provider: 'gemini',
            contextWindow: 1050000,
            inputPrice: 1.35,
            outputPrice: 6.75,
            cacheRead: 0.075,
            cacheWrite: 0.75,
            cacheStorageCostPerHour: 0.5,
          }
        });
      }

      let tinyRepoPrompt = await prisma.prompt.findFirst({
        where: { prompt_key: 'tiny-repo' }
      });
      if (!tinyRepoPrompt) {
        tinyRepoPrompt = await prisma.prompt.create({
          data: {
            promptTitle: 'Tiny Repo',
            prompt_key: 'tiny-repo',
            version: 'v1.0',
            content: TINY_REPO_PROMPT,
          }
        });
      }

      let judgePrompt = await prisma.prompt.findFirst({
        where: { prompt_key: 'diff-judge' }
      });
      if (!judgePrompt) {
        judgePrompt = await prisma.prompt.create({
          data: {
            promptTitle: 'Diff Judge',
            prompt_key: 'diff-judge',
            version: 'v1.0',
            content: DIFF_JUDGE_PROMPT,
          }
        });
      }

      const tasks: Array<{
        taskKey: LLMTaskType;
        promptId: string;
        temp: number;
        maxOutputTokens?: number;
      }> = [
        { taskKey: 'tinyRepo', promptId: tinyRepoPrompt.id, temp: 0.2, maxOutputTokens: 14096 },
        { taskKey: 'judge', promptId: judgePrompt.id, temp: 0.2, maxOutputTokens: 4096 },
        { taskKey: 'docsGenerator', promptId: tinyRepoPrompt.id, temp: 0.3, maxOutputTokens: 14096 },
      ];

      for (const t of tasks) {
        const existing = await prisma.lLMTaskConfig.findUnique({ where: { taskKey: t.taskKey } });
        if (!existing) {
          await prisma.lLMTaskConfig.create({
            data: {
              taskKey: t.taskKey,
              modelRosterId: defaultModel.id,
              promptId: t.promptId,
              temperature: t.temp,
              maxOutputTokens: t.maxOutputTokens,
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