import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import prisma from "../prisma/prisma";

/**
 * Converts a Zod schema to standard JSON Schema supported natively by Gemini.
 */
export function zodToGeminiSchema(zodSchema: z.ZodTypeAny) {
  const jsonSchema = zodToJsonSchema(zodSchema as unknown as Parameters<typeof zodToJsonSchema>[0], {
    target: 'openApi3', // Strips $schema references and unwraps root definitions
    $refStrategy: 'none',
  });

  // Recursively clean unsupported keywords like additionalProperties for Gemini API
  const cleanSchema = (obj: unknown): unknown => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(cleanSchema);
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (key === 'additionalProperties') continue;
      copy[key] = cleanSchema((obj as Record<string, unknown>)[key]);
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

export interface CostEstimateParams {
  modelName: string;
  estimatedPromptTokens: number;
  isCached?: boolean;
  cacheWriteTokens?: number;
  estimatedOutputTokens?: number;
}

export interface CostEstimateResult {
  estimatedProviderUsdCost: number;
  estimatedCredits: number;
  uncachedInputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  estimatedOutputTokens: number;
}

export async function estimateTaskCostAndCredits(params: CostEstimateParams): Promise<CostEstimateResult> {
  const {
    modelName,
    estimatedPromptTokens,
    isCached = false,
    cacheWriteTokens = 0,
    estimatedOutputTokens = 4000,
  } = params;

  const cachedTokens = isCached ? estimatedPromptTokens : 0;

  const costResult = await calculateCost(
    modelName,
    estimatedPromptTokens,
    cachedTokens,
    estimatedOutputTokens,
    isCached ? 0 : cacheWriteTokens
  );

  const totalProviderCostUsd = costResult.tokenCost + costResult.cacheWriteCost;
  const { BillingService } = require('../billing/billing.service');
  const estimatedCredits = BillingService.providerCostToCredits(totalProviderCostUsd);

  return {
    estimatedProviderUsdCost: totalProviderCostUsd,
    estimatedCredits,
    uncachedInputTokens: costResult.inputTokens,
    cachedInputTokens: cachedTokens,
    cacheWriteTokens: isCached ? 0 : cacheWriteTokens,
    estimatedOutputTokens,
  };
}

export async function getEstimatedOutputTokens(taskKey: string): Promise<number> {
  try {
    const avgLog = await prisma.lLMLog.aggregate({
      where: { taskKey, status: "SUCCESS" },
      _avg: { outputTokens: true }
    });

    if (avgLog._avg.outputTokens && avgLog._avg.outputTokens > 0) {
      // Add 20% safety buffer over average historical output
      return Math.ceil(avgLog._avg.outputTokens * 1.2);
    }
  } catch (err) {
    console.warn("[getEstimatedOutputTokens] Failed to query LLMLog aggregate, falling back to static defaults:", err);
  }

  // Static fallback defaults based on task response schema
  switch (taskKey) {
    case 'judge':
      return 400;   // Structured verdict JSON ({ verdict: boolean, reasoning: string })
    case 'tinyRepo':
    case 'docsGenerator':
      return 3500;  // Full ARCHITECTURE.md + PR payload
    default:
      return 2000;
  }
}