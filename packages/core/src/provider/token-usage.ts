import type {TokenUsage, TokenUsageSink} from '../session-types.js';
import type {LanguageModelUsage} from 'ai';

import type {TokenUsage as CursorSdkTokenUsage} from '@cursor/sdk';

export type {CursorSdkTokenUsage};

export function normalizeAiSdkUsage(usage?: LanguageModelUsage): TokenUsage | undefined {
  if (!usage) {
    return;
  }

  const prompt = usage.inputTokens ?? 0;
  const completion = usage.outputTokens ?? 0;

  return {
    prompt,
    completion,
    total: usage.totalTokens ?? prompt + completion,
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
