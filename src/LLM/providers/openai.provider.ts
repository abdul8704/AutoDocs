import { createHash } from "node:crypto";
import OpenAI from "openai";
import { LlmPrompt, LlmProvider, LlmUsage } from "../llm.types";
import { llmEnv } from "../llm.env";

// Key handling lives HERE and nowhere else. Built on first use rather than at
// import, so running the dummy provider needs no OpenAI key at all.
let client: OpenAI | undefined;

function getClient(): OpenAI {

    if (!llmEnv.OPENAI_API_KEY) {
        throw new Error(
            "OPENAI_API_KEY is required to use the openai provider " +
            "(set it, or switch ACTIVE_PROVIDER back to \"dummy\" in llm.config.ts)",
        );
    }

    client ??= new OpenAI({ apiKey: llmEnv.OPENAI_API_KEY });

    return client;
}

// GPT counts reasoning tokens against max_output_tokens, which Anthropic does
// not. Pinning effort to "none" keeps a role's maxTokens a budget for visible
// output on both providers, so the same number stays correct after a swap.
const REASONING_EFFORT = llmEnv.OPENAI_REASONING_EFFORT ?? "none";

/**
 * Cache reads need requests to land on the same machine, and on gpt-5.6+ a key
 * is what enables exact-prefix matching at a breakpoint. Hashing the cached
 * text gives a key that is identical for every call sharing that prefix and
 * different for every prefix, without the provider knowing which role called.
 */
function cacheKeyFor(cachedText: string): string {
    return "autodocs:" + createHash("sha256").update(cachedText).digest("hex").slice(0, 16);
}

export const openaiProvider: LlmProvider = {

    async generate(
        model: string,
        maxTokens: number,
        prompt: LlmPrompt,
        schema?: Record<string, unknown>,
    ): Promise<{ text: string; usage: LlmUsage }> {

        // Translate neutral SystemBlock -> OpenAI's explicit breakpoint syntax.
        // These ride as input_text blocks rather than `instructions`, because a
        // breakpoint can only be attached to a content block.
        const systemContent = prompt.system.map(block => ({
            type: "input_text" as const,
            text: block.text,
            ...(block.cache ? { prompt_cache_breakpoint: { mode: "explicit" as const } } : {}),
        }));

        const cachedText = prompt.system
            .filter(block => block.cache)
            .map(block => block.text)
            .join("");

        // With no stable prefix to name there is nothing to write, and asking
        // for explicit-only caching would just disable the implicit breakpoint.
        const caching = cachedText
            ? {
                prompt_cache_key: cacheKeyFor(cachedText),
                prompt_cache_options: { mode: "explicit" as const },
            }
            : {};

        const response = await getClient().responses.create({
            model,
            max_output_tokens: maxTokens,
            reasoning: { effort: REASONING_EFFORT },
            input: [
                { role: "developer", content: systemContent },
                { role: "user", content: [{ type: "input_text", text: prompt.user }] },
            ],
            // Callers hand over plain JSON Schema; the "text.format" envelope is
            // OpenAI's wire syntax, so it gets added HERE and only here. Every
            // caller schema is already strict-compatible (additionalProperties
            // false, all properties required).
            ...(schema
                ? { text: { format: { type: "json_schema" as const, name: "result", strict: true, schema } } }
                : {}),
            ...caching,
        });

        if (response.incomplete_details?.reason === "max_output_tokens") {
            throw new Error("output truncated: hit max_output_tokens");
        }

        const refusal = response.output
            .flatMap(item => (item.type === "message" ? item.content : []))
            .find(part => part.type === "refusal");

        if (refusal) {
            throw new Error(`model refused: ${refusal.refusal}`);
        }

        const text = response.output_text;

        if (!text) {
            throw new Error(
                `no text in response (status=${response.status}` +
                `${response.incomplete_details ? `, reason=${response.incomplete_details.reason}` : ""})`,
            );
        }

        // OpenAI counts cache reads and writes inside input_tokens; Anthropic
        // reports them alongside. Subtracting keeps inputTokens meaning "tokens
        // billed at the full rate" on both, so the logs stay comparable.
        const cacheReadTokens = response.usage?.input_tokens_details.cached_tokens ?? 0;
        const cacheWriteTokens = response.usage?.input_tokens_details.cache_write_tokens ?? 0;

        return {
            text,
            usage: {
                inputTokens: Math.max(0, (response.usage?.input_tokens ?? 0) - cacheReadTokens - cacheWriteTokens),
                outputTokens: response.usage?.output_tokens ?? 0,
                cacheReadTokens,
                cacheWriteTokens,
            },
        };
    },
};
