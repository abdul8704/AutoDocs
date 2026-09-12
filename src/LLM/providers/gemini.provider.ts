import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { BaseLLMProvider } from "./base.provider";
import { LLMResponse, LLMRuntimeConfig } from "../llm.types";
import { zodToGeminiSchema } from "../llm.helper";
import { env } from "../../config/env";

export class GeminiProvider extends BaseLLMProvider {
    private ai: GoogleGenAI;

    constructor() {
        super();
        this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }

    override async generateText(
        prompt: string,
        config: LLMRuntimeConfig,
    ): Promise<LLMResponse<string>> {
        const response = await this.ai.models.generateContent({
            model: config.model!,
            contents: prompt,
            config: {
                temperature: config.temperature!,
                systemInstruction: config.systemInstruction!,
                maxOutputTokens: config.maxOutputTokens || 16384,
                cachedContent: config.cacheName ? config.cacheName: undefined,
            }
        });

        const usage = {
            promptTokens : response.usageMetadata?.promptTokenCount || 0,
            cachedTokens: response.usageMetadata?.cachedContentTokenCount || 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata?.totalTokenCount || 0,
        }

        return {
            data: response.text || "",
            usage
        }
    }

    async generateStructured<T>(
        prompt: string,
        schema: z.ZodSchema<T>,
        config: LLMRuntimeConfig
    ): Promise<LLMResponse<T>> {

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
                systemInstruction: config.cacheName ? undefined : config.systemInstruction,
                maxOutputTokens: config.maxOutputTokens || 16384,
                cachedContent: config.cacheName ? config.cacheName: undefined,
            },
        });

        const rawOutput = response.text;
        if (!rawOutput)
            throw new Error("Gemini returned an empty structured response.");

        const usage = {
            promptTokens : response.usageMetadata?.promptTokenCount || 0,
            cachedTokens: response.usageMetadata?.cachedContentTokenCount || 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata?.totalTokenCount || 0,
        }

        const parsedData = this.parseJsonResponse<T>(rawOutput, schema);
        
        return {
            data: parsedData,
            usage: usage
        }
    }
}