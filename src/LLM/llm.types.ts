// Neutral types — nothing Anthropic-specific may appear in this file.

export type LlmRole = "tinyDoc" | "moduleDoc" | "validation" | "archDoc";

export interface SystemBlock {
    text: string;
    cache?: boolean;         // "this prefix is stable — cache it if the provider can"
}

export interface LlmPrompt {
    system: SystemBlock[];
    user: string;
}

export interface LlmUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
}

export interface LlmResult<T> {
    data: T;                 // parsed JSON when a schema was given, else the raw string
    usage: LlmUsage;
}

// What a provider adapter must implement.
export interface LlmProvider {
    generate(
        model: string,
        maxTokens: number,
        prompt: LlmPrompt,
        schema?: Record<string, unknown>,
    ): Promise<{ text: string; usage: LlmUsage }>;
}