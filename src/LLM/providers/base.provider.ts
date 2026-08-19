import { LLM_ProviderInterface, LLMGenerateOptions } from "../llm.types";
import { z } from "zod";

export abstract class BaseLLMProvider implements LLM_ProviderInterface {
    // Leaving these abstract forces child classes to implement them
    abstract generateText(prompt: string, options?: LLMGenerateOptions): Promise<string>;
    abstract generateStructured<T> (prompt: string, schema: z.ZodSchema<T>, options?: LLMGenerateOptions): Promise<T>;

    protected parseJsonResponse<T> (rawJson: string, schema: z.ZodSchema<T>): T {
        try{
            const parsed = JSON.parse(rawJson);
            return schema.parse(parsed);
        } catch (error) {
            if (error instanceof z.ZodError) {
                throw new Error(`Invalid JSON schema: ${error.issues.map((issue) => issue.message).join(", ")}`);
            }
            throw new Error(`Failed to parse JSON response from LLM: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
}