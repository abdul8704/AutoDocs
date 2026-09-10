import { LLMRuntimeConfig, CacheLookupParams } from "./llm.types";
import { GoogleGenAI } from "@google/genai";
import prisma from "../prisma/prisma";
import { env } from "../config/env";

export class ScopedCacheService {
    private geminiAi: GoogleGenAI;
    private DEFAULT_CACHE_TTL_SECONDS = 60 * 60; // 1 hour cache
    constructor() {
        if (!env.GEMINI_API_KEY)
            throw new Error("Google gemini key not found");
        this.geminiAi = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }

    async createOrGetCache(params: CacheLookupParams) {
        if (params.taskKey === 'judge') {
            return null;
        }

        // OpenAI and Anthropic handle caching natively within their generation payloads.
        if (params.providerName === 'openai' || params.providerName === 'anthropic') {
            return null;
        }

        const existingCache = await prisma.lLMCache.findUnique({
            where: {
                userId_repoId_taskKey: {
                    userId: params.userId,
                    repoId: params.repoId,
                    taskKey: params.taskKey
                }
            }
        });

        const { exists, key } = await this.checkIfCacheValid(params.userId, params.repoId, params.taskKey, params.currentCommitSha, params.model );

        if(exists)
            return key;
        else if(existingCache){
            await this.safeDeleteCache(existingCache.cacheName);
            await prisma.lLMCache.delete({ where: { id: existingCache.id } });
        }
        
        const ttlSeconds = params.ttlSeconds ?? this.DEFAULT_CACHE_TTL_SECONDS;
        const displayName = `${params.taskKey}-${params.repoId}-${params.currentCommitSha.slice(0, 8)}`;

        if (params.providerName === "gemini") {
            const geminiCache = await this.geminiAi.caches.create({
                model: params.model,
                config: {
                    displayName,
                    systemInstruction: params.systemInstruction,
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: params.promptPrefix }
                            ]
                        }
                    ],
                    ttl: `${String(ttlSeconds)}s`
                }
            });

            if (!geminiCache.name) {
                throw new Error("Failed to create Gemini cache: missing cache name in response");
            }

            const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

            await prisma.lLMCache.create({
                data: {
                    cacheName: geminiCache.name,
                    userId: params.userId,
                    repoId: params.repoId,
                    taskKey: params.taskKey,
                    commitSha: params.currentCommitSha,
                    model: params.model,
                    expiresAt: expiresAt,
                }
            });
            return geminiCache.name;
        }
        else
            throw new Error("No cache found for this provider");
    }
    async evictCache(userId: string, repoId: string, taskKey: string): Promise<void> {
        const record = await prisma.lLMCache.findUnique({
            where: { userId_repoId_taskKey: { userId, repoId, taskKey } },
        });

        if (record) {
            await this.safeDeleteCache(record.cacheName);
            await prisma.lLMCache.delete({ where: { id: record.id } });
        }
    }

    private async safeDeleteCache(cacheName: string) {
        try { await this.geminiAi.caches.delete({ name: cacheName }); } catch { }
    }

    async checkIfCacheValid(userId: string, repoId: string, taskKey: string, currentCommitSha: string, model: string) {
        const now = new Date();

        const existingCache = await prisma.lLMCache.findUnique({
            where: {
                userId_repoId_taskKey: {
                    userId: userId,
                    repoId: repoId,
                    taskKey: taskKey
                }
            }
        });

        if (
            existingCache &&
            existingCache.expiresAt > now &&
            existingCache.commitSha === currentCommitSha &&
            existingCache.model === model
        ) {
            return {exists: true, key: existingCache.cacheName};
        }

        return { exists: false, key: null };
    }   
}