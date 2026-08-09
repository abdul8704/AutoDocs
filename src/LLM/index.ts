import { LLM_CONFIG, ProviderName } from "./llm.config";
import { LlmPrompt, LlmResult, LlmRole, LlmProvider } from "./llm.types";
import { anthropicProvider } from "./providers/anthropic.provider";
import { openaiProvider } from "./providers/openai.provider";
import { dummyProvider } from "./providers/dummy.provider";
import { scopedLogger, startTimer } from "../utils/logger.utils";

const PROVIDERS: Record<ProviderName, LlmProvider> = {
    anthropic: anthropicProvider,
    openai: openaiProvider,
    dummy: dummyProvider,
};

const log = scopedLogger("llm");

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
    const provider = PROVIDERS[LLM_CONFIG.provider];
    const model = config.models[LLM_CONFIG.provider];

    let lastError: unknown;

    for (let attempt = 0; attempt <= LLM_CONFIG.maxRetries; attempt++) {

        const elapsed = startTimer();

        try {

            const { text, usage } = await provider.generate(
                model, config.maxTokens, prompt, schema,
            );

            const data = schema ? (JSON.parse(text) as T) : (text as unknown as T);

            log.info(
                {
                    role,
                    model,
                    provider: LLM_CONFIG.provider,
                    attempt: attempt + 1,
                    ms: elapsed(),
                    ...usage,
                },
                `${role}: ${usage.inputTokens} in / ${usage.outputTokens} out tokens in ${elapsed()}ms`,
            );

            return { data, usage };

        } catch (error) {
            lastError = error;       // truncation / JSON parse / provider error -> retry once

            // Without this line a retried call is invisible: the run just looks
            // slow, and a call that eventually succeeds hides the flakiness.
            log.warn(
                { role, model, attempt: attempt + 1, ms: elapsed(), err: error },
                `${role} attempt ${attempt + 1}/${LLM_CONFIG.maxRetries + 1} failed`,
            );
        }
    }

    log.error({ role, model }, `${role} failed after ${LLM_CONFIG.maxRetries + 1} attempts`);

    throw new Error(`llm(${role}) failed after retries: ${String(lastError)}`);
}

export function llmConcurrency(): number {
    return LLM_CONFIG.concurrency;
}

export type { LlmPrompt, LlmRole, LlmResult } from "./llm.types";