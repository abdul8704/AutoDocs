import { LlmRole } from "./llm.types";
import { llmEnv } from "./llm.env";

export interface RoleConfig {
    provider: "anthropic";
    model: string;
    maxTokens: number;
}

export const LLM_CONFIG: {
    roles: Record<LlmRole, RoleConfig>;
    concurrency: number;
    maxRetries: number;
} = {

    roles: {
        // Cheap-and-many: one call per module.
        moduleDoc:  { provider: "anthropic", model: "claude-sonnet-5", maxTokens: 4_096 },

        // One-per-run, correctness-critical: best model.
        tinyDoc:    { provider: "anthropic", model: "claude-opus-5",   maxTokens: 16_000 },
        validation: { provider: "anthropic", model: "claude-opus-5",   maxTokens: 8_192 },
        archDoc:    { provider: "anthropic", model: "claude-opus-5",   maxTokens: 16_000 },
    },

    // Env can override the operational knobs; models stay in this file only.
    concurrency: llmEnv.LLM_CONCURRENCY ?? 4,
    maxRetries: llmEnv.LLM_MAX_RETRIES ?? 1,
};