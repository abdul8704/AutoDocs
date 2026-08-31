import { LLMConfigService } from './config/llm.config.service';
import { LLMFactory } from './llm.factory';
import { SUPPORTED_PROVIDERS, SupportedProviders, DocsAndPRSchema, docsAndPRSchema, LLM_ProviderInterface, LLMRuntimeConfig, LLMTaskType } from "./llm.types"
import { JSON_ENFORCEMENT_PROMPT } from "./llm.constants"

export class LLMService {

  private async getProviderAndConfig(taskKey: LLMTaskType): Promise<{
    provider: LLM_ProviderInterface;
    config: LLMRuntimeConfig;
  }> {
    const result = await LLMConfigService.getTaskConfig(taskKey);

    if (!result) {
      throw new Error(`Unable to find task configuration for key: '${taskKey}'`);
    }

    if (!SUPPORTED_PROVIDERS.includes(result.providerName as SupportedProviders)) {
      throw new Error(`Unsupported provider: '${result.providerName}' configured for task '${taskKey}'`);
    }

    const provider = LLMFactory.getProvider(result.providerName as SupportedProviders);

    return { provider, config: result.config };
  }

  async evaluateDiff(gitDiff: string) {
    const { provider, config } = await this.getProviderAndConfig("judge");
    const userPrompt = `Evaluate the following git diff:\n\n${gitDiff}`;

    return await provider.generateText(userPrompt, config);
  }

  async testLLM () {
    LLMConfigService.invalidateCache("test");
    const { provider, config } = await this.getProviderAndConfig("test");
    const userPrompt = "Hello, tell me about yourself, and what u can do in detail";

    return await provider.generateText(userPrompt, config);
  }
  async getTinyRepoDocs(prompt: string) {
    const { provider, config } = await this.getProviderAndConfig("tinyRepo")

    return await provider.generateText(prompt, config);
  }

  async getStructuredTinyRepoDocs(prompt: string) {
    const { provider, config } = await this.getProviderAndConfig("tinyRepo");

    return await provider.generateStructured<DocsAndPRSchema>(
      prompt + "\n" + JSON_ENFORCEMENT_PROMPT,
      docsAndPRSchema,
      config
    );
  }
}