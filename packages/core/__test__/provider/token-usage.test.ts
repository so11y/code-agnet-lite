import {describe, expect, it} from 'vitest';
import {normalizeAiSdkUsage, normalizeCursorUsage} from '../../src/provider/token-usage.js';

describe('normalizeAiSdkUsage', () => {
  it('maps prompt and completion tokens', () => {
    expect(
      normalizeAiSdkUsage({
        inputTokens: 80,
        outputTokens: 20,
        totalTokens: 100,
        inputTokenDetails: {
          noCacheTokens: 80,
          cacheReadTokens: 0,
          cacheWriteTokens: 0
        },
        outputTokenDetails: {
          textTokens: 20,
          reasoningTokens: 0
        }
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
