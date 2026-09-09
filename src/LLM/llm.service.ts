import { LLMConfigService } from './config/llm.config.service';
import { LLMFactory } from './llm.factory';
import { SUPPORTED_PROVIDERS, SupportedProviders, DocsAndPRSchema, docsAndPRSchema, diffJudgeSchema, DiffJudgeSchema, LLM_ProviderInterface, LLMRuntimeConfig, LLMTaskType, TinyRepoPayload } from "./llm.types"
import { JSON_ENFORCEMENT_PROMPT, DIFF_ENFORCEMENT_PROMPT } from "./llm.constants"
import prisma from "../prisma/prisma";
import { ScopedCacheService } from "./llm.cache.service";

export class LLMService {

  private async getProviderAndConfig(taskKey: LLMTaskType): Promise<{
    provider: LLM_ProviderInterface;
    config: LLMRuntimeConfig;
    providerName: string;
  }> {
    const result = await LLMConfigService.getTaskConfig(taskKey);

    if (!result) {
      throw new Error(`Unable to find task configuration for key: '${taskKey}'`);
    }

    if (!SUPPORTED_PROVIDERS.includes(result.providerName as SupportedProviders)) {
      throw new Error(`Unsupported provider: '${result.providerName}' configured for task '${taskKey}'`);
    }

    const provider = LLMFactory.getProvider(result.providerName as SupportedProviders);

    return { provider, config: result.config, providerName: result.providerName };
  }

  private async recordLog(
    taskKey: string,
    provider: string,
    modelName: string,
    status: "SUCCESS" | "FAILED",
    durationMs: number,
    resultSummary?: string,
    error?: string,
    jobId?: string
  ) {
    try {
      await prisma.lLMLog.create({
        data: {
          taskKey,
          provider,
          modelName,
          status,
          durationMs,
          resultSummary: resultSummary ? resultSummary.substring(0, 500) : null,
          error: error ? error.substring(0, 500) : null,
          jobId,
        },
      });
    } catch (err) {
      console.error("[LLMService] Failed to record LLMLog to DB:", err);
    }
  }

  async evaluateDiffStructured(userPrompt: string, jobId?: string): Promise<DiffJudgeSchema> {
    const { provider, config, providerName } = await this.getProviderAndConfig("judge");
    const startTime = Date.now();
    try {
      const result = await provider.generateStructured<DiffJudgeSchema>(
        userPrompt + "\n" + DIFF_ENFORCEMENT_PROMPT, 
        diffJudgeSchema, 
        config
      );
      const durationMs = Date.now() - startTime;
      await this.recordLog("judge", providerName, config.model, "SUCCESS", durationMs, `Verdict: ${result.verdict} | Reasoning: ${result.reasoning}`, undefined, jobId);
      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      await this.recordLog("judge", providerName, config.model, "FAILED", durationMs, undefined, err?.message || String(err), jobId);
      throw err;
    }
  }

  async testLLM () {
    LLMConfigService.invalidateCache("test");
    const { provider, config } = await this.getProviderAndConfig("test");
    const userPrompt = "Hello, tell me about yourself, and what u can do in detail";

    return await provider.generateText(userPrompt, config);
  }

  async getStructuredTinyRepoDocs(payload: TinyRepoPayload, jobId: string): Promise<DocsAndPRSchema> {
    const { provider, config, providerName } = await this.getProviderAndConfig("tinyRepo");
    const startTime = Date.now();
    console.log("[LLM Service] sending prompt");
    const cacheService = new ScopedCacheService();
    
    try {
      const cacheName = await cacheService.createOrGetCache({
        userId: payload.userId,
        repoId: payload.repoId,
        taskKey: "tinyRepo",
        currentCommitSha: payload.currentCommitSha,
        providerName: providerName, // Crucial for dynamic routing
        model: config.model,
        systemInstruction: config.systemInstruction + "\n" + JSON_ENFORCEMENT_PROMPT,
        promptPrefix: payload.promptPrefix
      });
      console.log("got the cache ", cacheName);
      let finalPrompt = "";

      if(cacheName){
        finalPrompt = payload.promptSuffix;
      }
      else{
        finalPrompt = payload.promptPrefix + (payload.promptSuffix != "" ? payload.promptSuffix : "");
      }

      const runTimeConfig: LLMRuntimeConfig = {
        ...config,
        systemInstruction: `${config.systemInstruction || ""}\n${JSON_ENFORCEMENT_PROMPT}`.trim(),
        cacheName: cacheName ?? undefined
      }

      const result = await provider.generateStructured<DocsAndPRSchema>(
        finalPrompt,
        docsAndPRSchema,
        runTimeConfig
      );
      
      const durationMs = Date.now() - startTime;
      
      await this.recordLog("tinyRepo", providerName, config.model, "SUCCESS", durationMs, `PR Title: ${result.prTitle}`, undefined, jobId);
      return result;
    } 
    catch (err: any) {
      const durationMs = Date.now() - startTime;
      await this.recordLog("tinyRepo", providerName, config.model, "FAILED", durationMs, undefined, err?.message || String(err), jobId);
      throw err;
    }
  }
  async checkCache(userId: string, repoId: string, taskKey: string, currentCommitSha: string) {
    const { provider, config, providerName } = await this.getProviderAndConfig(taskKey as LLMTaskType);
    const cacheService = new ScopedCacheService();

    const { exists, key } = await cacheService.checkIfCacheValid(userId, repoId, taskKey, currentCommitSha, config.model);
    return exists;
  }
}