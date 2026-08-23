import prisma from "../../prisma/prisma";
import { SupportedProviders, LLMRuntimeConfig } from "../llm.types";

export interface TaskConfig extends LLMRuntimeConfig {
  provider: SupportedProviders;
  model: string;
}

export const getLLMtaskConfig = async (taskKey: string) => {
  let dbConfig = await prisma.lLMTaskConfig.findUnique({
    where: { taskKey }
  });

  if (!dbConfig) {
    throw new Error(`Configuration for task '${taskKey}' not found in database.`);
  }

  const config: TaskConfig = {
    provider: dbConfig.provider as SupportedProviders,
    model: dbConfig.model,
    temperature: dbConfig.temperature,
    systemInstruction: dbConfig.systemInstruction || undefined,
  }

  return config;
}

export const updateTaskConfig = async (taskKey: string, updates: Partial<TaskConfig>): Promise<void> => {
  await prisma.lLMTaskConfig.upsert({
    where: { taskKey },
    update: updates,
    create: {
      taskKey,
      provider: updates.provider || 'gemini',
      model: updates.model || 'gemini-2.5-flash',
      temperature: updates.temperature ?? 0.2,
      systemInstruction: updates.systemInstruction,
    }
  });
}