import { LlmRole } from "./llm.types";
import { llmEnv } from "./llm.env";

export type ProviderName = "anthropic" | "dummy";

// THE SWAP POINT: flip to "anthropic" once there is an API subscription.
// Everything below keeps its real model + token budget either way, so the
// switch changes who answers, never what is asked.
const ACTIVE_PROVIDER: ProviderName = "dummy";

export interface RoleConfig {
    provider: ProviderName;
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
        moduleDoc:  { provider: ACTIVE_PROVIDER, model: "claude-sonnet-5", maxTokens: 4_096 },

        // Cheapest-and-fastest: one yes/no verdict per debounced push.
        updateJudge: { provider: ACTIVE_PROVIDER, model: "claude-haiku-4-5", maxTokens: 1_024 },

        // One-per-run, correctness-critical: best model.
        tinyDoc:    { provider: ACTIVE_PROVIDER, model: "claude-opus-5",   maxTokens: 16_000 },
        validation: { provider: ACTIVE_PROVIDER, model: "claude-opus-5",   maxTokens: 8_192 },
        archDoc:    { provider: ACTIVE_PROVIDER, model: "claude-opus-5",   maxTokens: 16_000 },
    },

    // Env can override the operational knobs; models stay in this file only.
    concurrency: llmEnv.LLM_CONCURRENCY ?? 4,
    maxRetries: llmEnv.LLM_MAX_RETRIES ?? 1,
};