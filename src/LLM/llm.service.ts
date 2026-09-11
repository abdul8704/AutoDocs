import { LLMConfigService } from './config/llm.config.service';
import { LLMFactory } from './llm.factory';
import { SUPPORTED_PROVIDERS, SupportedProviders, DocsAndPRSchema, docsAndPRSchema, diffJudgeSchema, DiffJudgeSchema, LLM_ProviderInterface, LLMRuntimeConfig, LLMTaskType, TinyRepoPayload } from "./llm.types"
import { JSON_ENFORCEMENT_PROMPT, DIFF_ENFORCEMENT_PROMPT } from "./llm.constants"
import prisma from "../prisma/prisma";
import { ScopedCacheService } from "./llm.cache.service";
import { calculateCost } from './llm.helper';
import { BillingService } from '../billing/billing.service';

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
    userId: string,
    taskKey: string,
    provider: string,
    modelName: string,
    status: "SUCCESS" | "FAILED",
    durationMs: number,
    jobId: string,
    resultSummary?: string,
    error?: string,
    usage?: { promptTokens: number; cachedTokens: number; outputTokens: number; cacheWriteTokens?: number; storageCostUsd?: number }
  ) {

    let generationCostUsd = 0;
    let storageCacheCostUsd = 0;
    let savedCostUsd = 0;
    let inputTokensCount = 0;

    if (usage) {
      // Calculate compute, cache write, and saved costs using calculateCost
      const costResult = await calculateCost(
        modelName, 
        usage.promptTokens, 
        usage.cachedTokens, 
        usage.outputTokens,
        usage.cacheWriteTokens || 0
      );

      generationCostUsd = costResult.tokenCost;
      storageCacheCostUsd = costResult.cacheWriteCost || usage.storageCostUsd || 0;
      savedCostUsd = costResult.savedCost;
      inputTokensCount = costResult.inputTokens;
      
      const totalProviderCostUsd = generationCostUsd + storageCacheCostUsd;
      const creditAmount = BillingService.providerCostToCredits(totalProviderCostUsd);
      console.log("deducting credits ", creditAmount, " for user ", userId, " for task ", taskKey);
      
      try {
        await BillingService.deductCredit(userId, creditAmount, jobId, "Deducted for " + taskKey + " on " + new Date().toISOString());
      } catch (billingErr) {
        console.error("[LLMService] Failed to deduct credits:", billingErr);
      }
    }

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
          tokenCost: generationCostUsd,
          cacheStorageCost: storageCacheCostUsd,
          savedCost: savedCostUsd,
          promptTokens: usage?.promptTokens || 0,
          cachedTokens: usage?.cachedTokens || 0,
          inputTokens: inputTokensCount,
          outputTokens: usage?.outputTokens || 0,
        },
      });
    } catch (err) {
      console.error("[LLMService] Failed to record LLMLog to DB:", err);
    }
  }

  async evaluateDiffStructured(userId: string, userPrompt: string, jobId: string): Promise<DiffJudgeSchema> {
    const { provider, config, providerName } = await this.getProviderAndConfig("judge");
    const startTime = Date.now();
    
    try {
      const { data: result, usage } = await provider.generateStructured<DiffJudgeSchema>(
        userPrompt + "\n" + DIFF_ENFORCEMENT_PROMPT, 
        diffJudgeSchema, 
        config
      );

      const durationMs = Date.now() - startTime;
      
      const combinedUsage = usage ? {
        ...usage,
        cacheWriteTokens: 0      // we dont write cache for diff judge
      } : undefined;

      await this.recordLog(userId, "judge", providerName, config.model, "SUCCESS", durationMs, jobId, `Verdict: ${result.verdict} | Reasoning: ${result.reasoning}`, undefined, combinedUsage);
      
      console.log("diff eval done, that costs ", usage);

      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      await this.recordLog(userId, "judge", providerName, config.model, "FAILED", durationMs, jobId, undefined, err?.message || String(err));
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
      const { cacheName, cacheWriteTokens } = await cacheService.createOrGetCache({
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

      const { data: result, usage } = await provider.generateStructured<DocsAndPRSchema>(
        finalPrompt,
        docsAndPRSchema,
        runTimeConfig
      );
      
      const combinedUsage = usage ? {
        ...usage,
        cacheWriteTokens: cacheWriteTokens || 0
      } : undefined;

      console.log("doc gen done, that costs ", combinedUsage);
      const durationMs = Date.now() - startTime;
      
      await this.recordLog(payload.userId, "tinyRepo", providerName, config.model, "SUCCESS", durationMs, jobId, `PR Title: ${result.prTitle}`, undefined, combinedUsage);
      
      const res: DocsAndPRSchema = {
        ...result,
        inputToken: combinedUsage?.promptTokens || 0,
        outputToken: combinedUsage?.outputTokens || 0,
        cachedToken: combinedUsage?.cachedTokens || 0,
        cacheWriteTokens: combinedUsage?.cacheWriteTokens || 0,
        totalToken: combinedUsage?.totalTokens || 0
      }
      return res;
    } 
    catch (err: any) {
      const durationMs = Date.now() - startTime;
      await this.recordLog(payload.userId, "tinyRepo", providerName, config.model, "FAILED", durationMs, jobId, undefined, err?.message || String(err));
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