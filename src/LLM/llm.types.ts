import { z } from "zod";

export interface LLMRuntimeConfig {
    model: string;
    systemInstruction: string;
    temperature: number;
    maxOutputTokens?: number;
    cacheName?: string
}
export interface LLMResponse<T> {
    data: T,
    usage: {
        promptTokens: number;
        cachedTokens: number;
        outputTokens: number;
        totalTokens: number;
    }
}
export interface CacheLookupParams {
  userId: string;
  repoId: string;
  taskKey: string;
  currentCommitSha: string;
  providerName: string;
  model: string;
  systemInstruction: string;
  promptPrefix: string;
  ttlSeconds?: number;
}

export interface TinyRepoPayload {
  userId: string;
  repoId: string;
  taskKey: string;
  currentCommitSha: string;
  promptPrefix: string; // initial prompt consisting of packed codebase, sent during first time doc gen
  promptSuffix: string; // codebase changed files, sent during webhook doc regen call, this is null during first time doc gen call
  // NOTE: promptSuffix must be explicitly set to empty string during first time doc gen call
}

export interface LLM_ProviderInterface {
    // the main method used to send prompts to llm, for human understable purpose
    generateText(prompt: string, options?: LLMRuntimeConfig): Promise<LLMResponse<string>>;

    // for structured output, T here signifies whatever json schema we need the response in
    generateStructured<T>(
        prompt: string,
        schema: z.ZodSchema<T>,
        options?: LLMRuntimeConfig
    ): Promise<LLMResponse<T>>;
}

export const docsAndPRSchema = z.object({
    prTitle: z.string(),
    prBody: z.string(),
    commitMessage: z.string(),
    documentation: z.string(),
    inputToken: z.number().optional().default(0),
    outputToken: z.number().optional().default(0),
    cachedToken: z.number().optional().default(0),
    cacheWriteTokens: z.number().optional().default(0),
    totalToken: z.number().optional().default(0),
})

export const diffJudgeSchema = z.object({
    verdict: z.boolean(),
    reasoning: z.string(),
    inputToken: z.number().optional().default(0),
    outputToken: z.number().optional().default(0),
    cachedToken: z.number().optional().default(0),
    cacheWriteTokens: z.number().optional().default(0),
    totalToken: z.number().optional().default(0),
});

export type DocsAndPRSchema = z.infer<typeof docsAndPRSchema>;
export type DiffJudgeSchema = z.infer<typeof diffJudgeSchema>;

export const SUPPORTED_PROVIDERS = ['gemini', 'openai', 'anthropic'] as const;

export type SupportedProviders = typeof SUPPORTED_PROVIDERS[number];
export type LLMTaskType = 'tinyRepo' | 'judge' | 'docsGenerator' | 'moduleSummary' | 'test';