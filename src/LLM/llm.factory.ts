import { SupportedProviders, LLM_ProviderInterface } from './llm.types';
import { GeminiProvider } from './providers/gemini.provider';

export class LLMFactory {
  // A cache of initialized SDK clients
  private static providerRegistry: Map<SupportedProviders, LLM_ProviderInterface> = new Map();

  static getProvider(providerKey: SupportedProviders): LLM_ProviderInterface {
    if (this.providerRegistry.has(providerKey)) {
      return this.providerRegistry.get(providerKey)!;
    }

    let providerInstance: LLM_ProviderInterface;
    switch (providerKey) {
      case 'gemini':
        providerInstance = new GeminiProvider();
        break;
      default:
        throw new Error(`Unsupported provider: ${providerKey}`);
    }

    this.providerRegistry.set(providerKey, providerInstance);
    return providerInstance;
  }
}