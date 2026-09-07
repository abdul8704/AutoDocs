import { z } from "zod";

export interface LLMRuntimeConfig {
    model: string;
    systemInstruction: string;
    temperature: number;
    maxOutputTokens?: number;
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

export const docsAndPRSchema = z.object({
    prTitle: z.string(),
    prBody: z.string(),
    commitMessage: z.string(),
    documentation: z.string()
})

export const diffJudgeSchema = z.object({
    verdict: z.boolean(),
    reasoning: z.string()
});

export type DocsAndPRSchema = z.infer<typeof docsAndPRSchema>;
export type DiffJudgeSchema = z.infer<typeof diffJudgeSchema>;

export const SUPPORTED_PROVIDERS = ['gemini', 'openai', 'anthropic'] as const;

export type SupportedProviders = typeof SUPPORTED_PROVIDERS[number];
export type LLMTaskType = 'tinyRepo' | 'judge' | 'docsGenerator' | 'moduleSummary' | 'test';