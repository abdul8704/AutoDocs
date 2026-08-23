import { GoogleGenAI, Type, Schema as GeminiSchema } from "@google/genai";
import { z } from "zod";
import { BaseLLMProvider } from "./base.provider";
import { LLMRuntimeConfig } from "../llm.types";
import { zodToGeminiSchema } from "../llm.helper";
import { env } from "../../config/env"

export class GeminiProvider extends BaseLLMProvider {
    private ai: GoogleGenAI;

    constructor() {
        super();
        this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }

    override async generateText(
        prompt: string,
        config: LLMRuntimeConfig,
    ): Promise<string> {
        const response = await this.ai.models.generateContent({
            model: config.model!,
            contents: prompt,
            config: {
                temperature: config.temperature!,
                systemInstruction: config.systemInstruction!,
            }
        });

        return response.text || "";
    }

    async generateStructured<T>(
        prompt: string,
        schema: z.ZodSchema<T>,
        config: LLMRuntimeConfig
    ): Promise<T> {

        // 1. Convert Zod -> Gemini Schema format
        const geminiFormatSchema = zodToGeminiSchema(schema);

        // 2. Call the API
        const response = await this.ai.models.generateContent({
            model: config.model!,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: geminiFormatSchema,
                temperature: config.temperature!,
                systemInstruction: config.systemInstruction!,
            },
        });

        const rawOutput = response.text;
        if (!rawOutput)
            throw new Error("Gemini returned an empty structured response.");

        // 3. Use the base class to parse and validate the raw text back into the Zod generic T
        return this.parseJsonResponse<T>(rawOutput, schema);
    }
}