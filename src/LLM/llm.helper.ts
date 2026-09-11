import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import prisma from "../prisma/prisma";

/**
 * Converts a Zod schema to standard JSON Schema supported natively by Gemini.
 */
export function zodToGeminiSchema(zodSchema: z.ZodTypeAny) {
  const jsonSchema = zodToJsonSchema(zodSchema as any, {
    target: 'openApi3', // Strips $schema references and unwraps root definitions
    $refStrategy: 'none',
  });

  // Recursively clean unsupported keywords like additionalProperties for Gemini API
  const cleanSchema = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(cleanSchema);
    const copy: any = {};
    for (const key of Object.keys(obj)) {
      if (key === 'additionalProperties') continue;
      copy[key] = cleanSchema(obj[key]);
    }
    return copy;
  };

  return cleanSchema(jsonSchema);
}

export interface CostCalculationResult {
  tokenCost: number;       // total generation cost (uncached input + cache read + output)
  cacheWriteCost: number;  // cost spent writing to cache
  savedCost: number;       // cost saved by reading from cache instead of uncached input
  inputCost: number;       // cost for uncached input tokens
  cacheReadCost: number;   // cost for cached input tokens read
  outputCost: number;      // cost for output tokens
  inputTokens: number;     // uncached prompt tokens (promptTokens - cachedTokens)
}

export async function calculateCost(
  modelName: string, 
  promptTokens: number, 
  cachedTokens: number, 
  outputTokens: number,
  cacheWriteTokens: number = 0
): Promise<CostCalculationResult> {
  
  const modelCost = await prisma.modelRoster.findFirst({
    where: { modelName: modelName }
  });
  if (!modelCost) {
    throw new Error(`Model ${modelName} not found in roster`);
  }

  const inputRate = modelCost.inputPrice; 
  const cacheReadRate = modelCost.cacheRead; 
  const cacheWriteRate = modelCost.cacheWrite; 
  const outputRate = modelCost.outputPrice; 

  const inputTokens = Math.max(0, promptTokens - cachedTokens);

  const inputCost = (inputTokens / 1_000_000) * inputRate;
  const cacheReadCost = (cachedTokens / 1_000_000) * cacheReadRate;
  const cacheWriteCost = (cacheWriteTokens / 1_000_000) * cacheWriteRate;
  const outputCost = (outputTokens / 1_000_000) * outputRate;

  const tokenCost = inputCost + cacheReadCost + outputCost;
  // Saved cost = difference between what cached tokens would have cost at uncached rate vs cache read rate
  const savedCost = Math.max(0, (cachedTokens / 1_000_000) * (inputRate - cacheReadRate));

  return {
    tokenCost,
    cacheWriteCost,
    savedCost,
    inputCost,
    cacheReadCost,
    outputCost,
    inputTokens
  };
}

export async function calculateGeminiCost(
  modelName: string, 
  promptTokens: number, 
  cachedTokens: number, 
  outputTokens: number
): Promise<number> {
  const result = await calculateCost(modelName, promptTokens, cachedTokens, outputTokens);
  return result.tokenCost;
}