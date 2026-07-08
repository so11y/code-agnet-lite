import {getAgentProviderKind} from '@code-agent-lite/platform';
import type {AgentProviderKind, LlmProvider} from './types.js';
import {OpenAiLlmProvider} from './openai-provider.js';

let llmProvider: LlmProvider | undefined;

export function resolveAgentProviderKind(override?: AgentProviderKind): AgentProviderKind {
  return override ?? getAgentProviderKind();
}

export function getLlmProvider(): LlmProvider {
  const kind = resolveAgentProviderKind();

  if (kind === 'cursor') {
    throw new Error('Cursor provider 不支持本地 LlmProvider；请使用 runCursorAgentTurn。');
  }

  if (!llmProvider) {
    llmProvider = new OpenAiLlmProvider();
  }

  return llmProvider;
}

export function resetProvidersForTests() {
  llmProvider = undefined;
}
