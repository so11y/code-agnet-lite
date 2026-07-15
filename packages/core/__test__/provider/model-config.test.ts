import {afterEach, describe, expect, it} from 'vitest';
import {getOpenAiModel, isThinkingEnabled} from '@code-agent-lite/platform';

const originalModel = process.env.OPENAI_MODEL;
const originalThinking = process.env.ENABLE_THINKING;

function restoreEnv(name: 'OPENAI_MODEL' | 'ENABLE_THINKING', value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  restoreEnv('OPENAI_MODEL', originalModel);
  restoreEnv('ENABLE_THINKING', originalThinking);
});

describe('OpenAI model configuration', () => {
  it('requires an explicit model', () => {
    delete process.env.OPENAI_MODEL;
    expect(() => getOpenAiModel()).toThrow('Missing OPENAI_MODEL');
  });

  it('returns the trimmed configured model', () => {
    process.env.OPENAI_MODEL = '  gateway-model  ';
    expect(getOpenAiModel()).toBe('gateway-model');
  });
});

describe('thinking configuration', () => {
  it('is disabled by default', () => {
    delete process.env.ENABLE_THINKING;
    expect(isThinkingEnabled()).toBe(false);
  });

  it.each(['true', 'TRUE', '1'])('is enabled explicitly with %s', (value) => {
    process.env.ENABLE_THINKING = value;
    expect(isThinkingEnabled()).toBe(true);
  });

  it.each(['false', '0', 'yes'])('stays disabled for %s', (value) => {
    process.env.ENABLE_THINKING = value;
    expect(isThinkingEnabled()).toBe(false);
  });
});
