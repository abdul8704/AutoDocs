import { env } from '../../config/env';

export type LLMProviderType = 'gemini' | 'openai' | 'anthropic';
export type LLMTaskType = 'tinyRepo' | 'judge' | 'docsGenerator' | 'moduleSummary';

export interface TaskLLMConfig {
  provider: LLMProviderType;
  model: string;
  temperature: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  thresholdBytes?: number; // Task-specific metadata (e.g. for repo size)
}

export const LLM_CONFIG = {
  // Global defaults
  defaultProvider: (env.DEFAULT_LLM_PROVIDER as LLMProviderType) || 'gemini',

  // Specific Task Configurations
  tasks: {
    /**
     * 1. Tiny Repo: Needs high context window and speed.
     */
    tinyRepo: {
      provider: (env.TINY_REPO_PROVIDER as LLMProviderType) || 'gemini',
      model: env.TINY_REPO_MODEL || 'gemini-3.6-flash',
      temperature: 0.2,
      thresholdBytes: 2 * 1024 * 1024, // 2MB raw text threshold
      systemInstruction: 'You are a repository analyzer specializing in small-scale codebases.',
    },

    /**
     * 2. Judge (Webhook Diff Classifier): Fast, cheap, deterministic classification.
     */
    judge: {
      provider: (env.JUDGE_PROVIDER as LLMProviderType) || 'gemini',
      model: env.JUDGE_MODEL || 'gemini-3.6-flash',
      temperature: 0.0, // 0.0 for deterministic boolean/enum decisions
      systemInstruction: 'You are a strict code evaluator analyzing git diffs for doc relevance.',
    },

    /**
     * 3. Docs Generator: High reasoning capacity for comprehensive documentation.
     */
    docsGenerator: {
      provider: (env.DOCS_GENERATOR_PROVIDER as LLMProviderType) || 'gemini',
      model: env.DOCS_GENERATOR_MODEL || 'gemini-2.5-pro',
      temperature: 0.3,
      systemInstruction: 'You are a technical writer generating accurate, structured developer docs.',
    },
  },
} as const;