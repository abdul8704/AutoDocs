import { LlmRole } from "./llm.types";
import { llmEnv } from "./llm.env";

export type ProviderName = "anthropic" | "openai" | "dummy";

// THE SWAP POINT: flip to "anthropic" or "openai" once there is an API
// subscription. Every role below names its equivalent model on each provider
// and keeps one token budget, so the switch changes who answers — never what is
// asked, or how much it is allowed to say.
const ACTIVE_PROVIDER: ProviderName = "dummy";

export interface RoleConfig {
    models: Record<ProviderName, string>;
    maxTokens: number;
}

export const LLM_CONFIG: {
    provider: ProviderName;
    roles: Record<LlmRole, RoleConfig>;
    concurrency: number;
    maxRetries: number;
} = {

    provider: ACTIVE_PROVIDER,

    roles: {
        // Cheap-and-many: one call per module.
        moduleDoc: {
            models: { anthropic: "claude-sonnet-5", openai: "gpt-5.6-terra", dummy: "dummy" },
            maxTokens: 4_096,
        },

        // Cheapest-and-fastest: one yes/no verdict per debounced push.
        updateJudge: {
            models: { anthropic: "claude-haiku-4-5", openai: "gpt-5.6-luna", dummy: "dummy" },
            maxTokens: 1_024,
        },

        // One-per-run, correctness-critical: best model.
        tinyDoc: {
            models: { anthropic: "claude-opus-5", openai: "gpt-5.6-sol", dummy: "dummy" },
            maxTokens: 16_000,
        },
        validation: {
            models: { anthropic: "claude-opus-5", openai: "gpt-5.6-sol", dummy: "dummy" },
            maxTokens: 8_192,
        },
        archDoc: {
            models: { anthropic: "claude-opus-5", openai: "gpt-5.6-sol", dummy: "dummy" },
            maxTokens: 16_000,
        },
    },

    // Env can override the operational knobs; models stay in this file only.
    concurrency: llmEnv.LLM_CONCURRENCY ?? 4,
    maxRetries: llmEnv.LLM_MAX_RETRIES ?? 1,
};