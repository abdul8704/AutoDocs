import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

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