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

export async function calculateGeminiCost(
  modelName: string, 
  promptTokens: number, 
  cachedTokens: number, 
  outputTokens: number
): Promise<number> {
  
  const modelCost = await prisma.modelRoster.findFirst({
    where: { modelName: modelName }
  });
  if (!modelCost) {
    throw new Error(`Model ${modelName} not found in roster`);
  }
  let inputRate = modelCost.inputPrice; 
  let cachedRate = modelCost.cachedPrice; 
  let outputRate = modelCost.outputPrice; 

  const inputCost = (promptTokens / 1_000_000) * inputRate;
  const cachedCost = (cachedTokens / 1_000_000) * cachedRate;
  const outputCost = (outputTokens / 1_000_000) * outputRate;

  return inputCost + cachedCost + outputCost;
}