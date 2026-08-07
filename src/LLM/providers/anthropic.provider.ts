import Anthropic from "@anthropic-ai/sdk";
import { LlmPrompt, LlmProvider, LlmUsage } from "../llm.types";
import { llmEnv } from "../llm.env";

// Key handling lives HERE and nowhere else. Built on first use rather than at
// import, so running the dummy provider needs no Anthropic key at all.
let client: Anthropic | undefined;

function getClient(): Anthropic {

    if (!llmEnv.ANTHROPIC_API_KEY) {
        throw new Error(
            "ANTHROPIC_API_KEY is required to use the anthropic provider " +
            "(set it, or switch ACTIVE_PROVIDER back to \"dummy\" in llm.config.ts)",
        );
    }

    client ??= new Anthropic({ apiKey: llmEnv.ANTHROPIC_API_KEY });

    return client;
}

export const anthropicProvider: LlmProvider = {

    async generate(
        model: string,
        maxTokens: number,
        prompt: LlmPrompt,
        schema?: Record<string, unknown>,
    ): Promise<{ text: string; usage: LlmUsage }> {

        // Translate neutral SystemBlock -> Anthropic's cache_control syntax.
        const system = prompt.system.map(block => ({
            type: "text" as const,
            text: block.text,
            ...(block.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
        }));

        const response = await getClient().messages.create({
            model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: prompt.user }],
            // Callers hand over plain JSON Schema; the "json_schema" envelope is
            // Anthropic's wire syntax, so it gets added HERE and only here.
            ...(schema ? { output_config: { format: { type: "json_schema" as const, schema } } } : {}),
        });

        const textBlock = response.content.find(
            (b): b is Anthropic.TextBlock => b.type === "text"
        );

        if (!textBlock) {
            throw new Error(`no text in response (stop_reason=${response.stop_reason})`);
        }

        if (response.stop_reason === "max_tokens") {
            throw new Error("output truncated: hit max_tokens");
        }

        return {
            text: textBlock.text,
            usage: {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
                cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
            },
        };
    },
};