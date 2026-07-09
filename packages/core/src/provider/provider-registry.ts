import {getAgentProviderKind} from '@code-agent-lite/platform';
import type {AgentSession} from '../session.js';
import type {AgentAi} from './agent-ai.js';
import {CursorAgentProvider} from './cursor-agent-provider.js';
import {OpenAiAgentProvider} from './openai-agent-provider.js';
import type {AgentProviderKind, LlmProvider} from './types.js';
import {OpenAiLlmProvider} from './openai-provider.js';

export class ProviderRegistry {
  private openAiAgent?: OpenAiAgentProvider;
  private cursorAgent?: CursorAgentProvider;
  private llmProvider?: LlmProvider;

  resolveKind(override?: AgentProviderKind): AgentProviderKind {
    return override ?? getAgentProviderKind();
  }

  getAgentAi(kind?: AgentProviderKind): AgentAi {
    const resolved = this.resolveKind(kind);

    if (resolved === 'cursor') {
      this.cursorAgent ??= new CursorAgentProvider();
      return this.cursorAgent;
    }

    this.openAiAgent ??= new OpenAiAgentProvider();
    return this.openAiAgent;
  }

  getLlmProvider(): LlmProvider {
    this.llmProvider ??= new OpenAiLlmProvider();
    return this.llmProvider;
  }

  async disposeSession(session: AgentSession, kind?: AgentProviderKind): Promise<void> {
    await this.getAgentAi(kind ?? session.options.provider).disposeSession?.(session);
  }

  resetForTests(): void {
    this.openAiAgent = undefined;
    this.cursorAgent = undefined;
    this.llmProvider = undefined;
  }
}

const defaultRegistry = new ProviderRegistry();

export function resolveAgentProviderKind(override?: AgentProviderKind): AgentProviderKind {
  return defaultRegistry.resolveKind(override);
}

export function getAgentAi(kind?: AgentProviderKind): AgentAi {
  return defaultRegistry.getAgentAi(kind);
}

export function getLlmProvider(): LlmProvider {
  return defaultRegistry.getLlmProvider();
}

export async function disposeAgentSession(
  session: AgentSession,
  kind?: AgentProviderKind
): Promise<void> {
  await defaultRegistry.disposeSession(session, kind);
}

export function resetProvidersForTests(): void {
  defaultRegistry.resetForTests();
}
