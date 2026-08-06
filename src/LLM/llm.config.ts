import { LlmRole } from "./llm.types";

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

    concurrency: 4,          // parallel calls for fan-out roles (moduleDoc)
    maxRetries: 1,           // OUR retries, on top of the SDK's built-in 429/5xx retries
};