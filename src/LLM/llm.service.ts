import { LLMConfigService } from './config/llm.config.service';
import { LLMFactory } from './llm.factory';
import { SUPPORTED_PROVIDERS, SupportedProviders } from "./llm.types"

export class LLMService {

  async evaluateDiff(gitDiff: string) {
    const result = await LLMConfigService.getTaskConfig('judge');

    if (!result)
      throw new Error("Unable to get task config");

    if (!SUPPORTED_PROVIDERS.includes(result.providerName as SupportedProviders))
      throw new Error("Invalid provider name");

    const provider = LLMFactory.getProvider(result.providerName as SupportedProviders);

    const userPrompt = `Evaluate the following git diff:\n\n${gitDiff}`;

    return await provider.generateText(userPrompt, result.config);
  }
  async testLLM () {
    LLMConfigService.invalidateCache("test");
    const result = await LLMConfigService.getTaskConfig("test");
    console.log("config for test -> ", result);

    if(!result )
        throw new Error("Unable to get task config");
    
    if (!SUPPORTED_PROVIDERS.includes(result.providerName as SupportedProviders))
        throw new Error("Invalid provider name");

    const provider = LLMFactory.getProvider(result.providerName as SupportedProviders);

    const userPrompt = "Hello, tell me about yourself, and what u can do in detail";

    return await provider.generateText(userPrompt, result.config);
  }
}