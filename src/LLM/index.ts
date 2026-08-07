import { LLM_CONFIG, ProviderName } from "./llm.config";
import { LlmPrompt, LlmResult, LlmRole, LlmProvider } from "./llm.types";
import { anthropicProvider } from "./providers/anthropic.provider";
import { dummyProvider } from "./providers/dummy.provider";

const PROVIDERS: Record<ProviderName, LlmProvider> = {
    anthropic: anthropicProvider,
    dummy: dummyProvider,
};

/**
 * The one function the pipeline calls. Callers know their ROLE and their
 * PROMPT — never which model or provider serves it.
 */
export async function generate<T = string>(
    role: LlmRole,
    prompt: LlmPrompt,
    schema?: Record<string, unknown>,
): Promise<LlmResult<T>> {

    const config = LLM_CONFIG.roles[role];
    const provider = PROVIDERS[config.provider];

    let lastError: unknown;

    for (let attempt = 0; attempt <= LLM_CONFIG.maxRetries; attempt++) {

        try {

            const { text, usage } = await provider.generate(
                config.model, config.maxTokens, prompt, schema,
            );

            const data = schema ? (JSON.parse(text) as T) : (text as unknown as T);

            return { data, usage };

        } catch (error) {
            lastError = error;       // truncation / JSON parse / provider error -> retry once
        }
    }

    throw new Error(`llm(${role}) failed after retries: ${String(lastError)}`);
}

export function llmConcurrency(): number {
    return LLM_CONFIG.concurrency;
}

export type { LlmPrompt, LlmRole, LlmResult } from "./llm.types";