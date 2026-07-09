import {describe, expect, it} from 'vitest';
import {normalizeCursorUsage, normalizeOpenAiUsage} from '../../src/provider/token-usage.js';

describe('normalizeOpenAiUsage', () => {
  it('maps prompt and completion tokens', () => {
    expect(
      normalizeOpenAiUsage({
        prompt_tokens: 80,
        completion_tokens: 20,
        total_tokens: 100
      })
    ).toEqual({
      prompt: 80,
      completion: 20,
      total: 100,
      contextUsed: 80
    });
  });
});

describe('normalizeCursorUsage', () => {
  it('includes cache tokens in prompt and contextUsed', () => {
    expect(
      normalizeCursorUsage({
        inputTokens: 50,
        outputTokens: 10,
        cacheReadTokens: 5,
        cacheWriteTokens: 3,
        totalTokens: 68
      })
    ).toEqual({
      prompt: 58,
      completion: 10,
      total: 68,
      contextUsed: 58
    });
  });
});
