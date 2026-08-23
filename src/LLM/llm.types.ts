import { z } from "zod";

export interface LLMRuntimeConfig {
    temperature?: number;
    systemInstruction?: string;
    model?: string;
}

export interface LLM_ProviderInterface {
    // the main method used to send prompts to llm, for human understable purpose
    generateText(prompt: string, options?: LLMRuntimeConfig): Promise<string>;

    // for structured output, T here signifies whatever json schema we need the response in
    generateStructured<T>(
        prompt: string,
        schema: z.ZodSchema<T>,
        options?: LLMRuntimeConfig
    ): Promise<T>;
}

export type SupportedProviders = 'gemini' | 'openai' | 'anthropic';