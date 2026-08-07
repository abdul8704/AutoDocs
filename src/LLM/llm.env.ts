import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

// Env owned by the LLM module alone. The rest of the app never reads these —
// callers go through generate(role, prompt) and stay provider-agnostic.
const llmEnvSchema = z.object({

    // Optional while the dummy provider is active (see llm.config.ts). The
    // anthropic provider demands it on its first call instead of at boot.
    ANTHROPIC_API_KEY: z.string().min(1).optional(),

    // Optional operational overrides — defaults live in llm.config.ts.
    LLM_CONCURRENCY: z.coerce.number().int().min(1).max(16).optional(),
    LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(3).optional(),
});

export const llmEnv = llmEnvSchema.parse(process.env);
