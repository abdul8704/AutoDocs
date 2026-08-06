import Anthropic from "@anthropic-ai/sdk";
import { LlmPrompt, LlmProvider, LlmUsage } from "../llm.types";
import { llmEnv } from "../llm.env";

// Key handling lives HERE and nowhere else — validated by llm.env at startup,
// so a missing key fails loudly on boot instead of on the first LLM call.
const client = new Anthropic({ apiKey: llmEnv.ANTHROPIC_API_KEY });

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

        const response = await client.messages.create({
            model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: prompt.user }],
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