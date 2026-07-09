import type {TokenUsage, TokenUsageSink} from '../session-types.js';

export type OpenAiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

import type {TokenUsage as CursorSdkTokenUsage} from '@cursor/sdk';

export type {CursorSdkTokenUsage};

export function normalizeOpenAiUsage(usage?: OpenAiUsage): TokenUsage | undefined {
  if (!usage) {
    return;
  }

  const prompt = usage.prompt_tokens ?? 0;
  const completion = usage.completion_tokens ?? 0;

  return {
    prompt,
    completion,
    total: usage.total_tokens ?? prompt + completion,
    contextUsed: prompt
  };
}

export function normalizeCursorUsage(usage: CursorSdkTokenUsage): TokenUsage {
  const prompt = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;

  return {
    prompt,
    completion: usage.outputTokens,
    total: usage.totalTokens,
    contextUsed: prompt
  };
}

export function recordTokenUsage(sink: TokenUsageSink | undefined, usage: TokenUsage | undefined) {
  if (usage) {
    sink?.recordTokenUsage(usage);
  }
}
