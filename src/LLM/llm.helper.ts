import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Converts a Zod schema to standard JSON Schema supported natively by Gemini.
 */
export function zodToGeminiSchema(zodSchema: z.ZodTypeAny) {
  return zodToJsonSchema(zodSchema as any, {
    target: 'openApi3', // Strips $schema references and unwraps root definitions
    $refStrategy: 'none',
  });
}