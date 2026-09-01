import { LLM_ProviderInterface, LLMRuntimeConfig } from "../llm.types";
import { z } from "zod";

export abstract class BaseLLMProvider implements LLM_ProviderInterface {
    // Leaving these abstract forces child classes to implement them
    abstract generateText(prompt: string, options?: LLMRuntimeConfig): Promise<string>;
    abstract generateStructured<T>(prompt: string, schema: z.ZodSchema<T>, options?: LLMRuntimeConfig): Promise<T>;

    protected parseJsonResponse<T>(rawJson: string, schema: z.ZodSchema<T>): T {
        
        let cleaned = rawJson.trim();
        // Remove markdown code fences if present (e.g. ```json ... ```)
        if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        }

        // Extract starting bracket/brace if surrounded by fluff
        const firstBrace = cleaned.search(/[\{\[]/);
        if (firstBrace !== -1) {
            const lastBrace = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
            if (lastBrace > firstBrace) {
                cleaned = cleaned.slice(firstBrace, lastBrace + 1);
            } else {
                cleaned = cleaned.slice(firstBrace);
            }
        }

        let parsed: any;
        try {
            parsed = JSON.parse(cleaned);
        } catch (initialError) {
            // Attempt to repair truncated JSON (e.g. unterminated string or missing closing braces)
            try {
                const repaired = this.repairTruncatedJson(cleaned);
                console.log("[parseJsonResponse] Successfully repaired truncated JSON response.");
                parsed = JSON.parse(repaired);
            } catch (repairError) {
                throw new Error(`Failed to parse JSON response from LLM: ${initialError instanceof Error ? initialError.message : "Unknown error"}`);
            }
        }

        try {
            return schema.parse(parsed);
        } catch (error) {
            if (error instanceof z.ZodError) {
                const issueDetails = error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
                throw new Error(`Invalid JSON schema validation: ${issueDetails}`);
            }
            throw error;
        }
    }

    private repairTruncatedJson(jsonStr: string): string {
        let repaired = jsonStr.trim();

        // 1. Check if inside an unclosed string
        let inString = false;
        let isEscaped = false;
        for (let i = 0; i < repaired.length; i++) {
            const char = repaired[i];
            if (char === '\\' && !isEscaped) {
                isEscaped = true;
            } else {
                if (char === '"' && !isEscaped) {
                    inString = !inString;
                }
                isEscaped = false;
            }
        }

        if (inString) {
            if (repaired.endsWith('\\')) {
                repaired = repaired.slice(0, -1);
            }
            repaired += '"';
        }

        // 2. Balance unclosed brackets and braces
        const stack: string[] = [];
        inString = false;
        isEscaped = false;
        for (let i = 0; i < repaired.length; i++) {
            const char = repaired[i];
            if (char === '\\' && !isEscaped) {
                isEscaped = true;
            } else {
                if (char === '"' && !isEscaped) {
                    inString = !inString;
                } else if (!inString) {
                    if (char === '{' || char === '[') {
                        stack.push(char);
                    } else if (char === '}') {
                        if (stack.length > 0 && stack[stack.length - 1] === '{') stack.pop();
                    } else if (char === ']') {
                        if (stack.length > 0 && stack[stack.length - 1] === '[') stack.pop();
                    }
                }
                isEscaped = false;
            }
        }

        while (stack.length > 0) {
            const open = stack.pop();
            if (open === '{') repaired += '}';
            else if (open === '[') repaired += ']';
        }

        return repaired;
    }
}