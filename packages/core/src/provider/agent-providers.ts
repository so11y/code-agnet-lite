import {getAgentProviderKind} from '@code-agent-lite/platform';
import {DefaultCodeAgent, type CodeAgent} from '../code-agent.js';
import type {AgentPlugin} from '../plugin/types.js';
import type {AgentSession} from '../session.js';
import {CursorCodeAgent} from './cursor-code-agent.js';
import {cursorSessionPool} from './cursor-session-pool.js';
import type {AgentProviderKind} from './types.js';

export type AgentProvider = {
  readonly kind: AgentProviderKind;
  provide(session: AgentSession): CodeAgent;
  dispose?(session: AgentSession): Promise<void>;
};

const providers: Record<AgentProviderKind, AgentProvider> = {
  openai: {
    kind: 'openai',
    provide(session) {
      return new DefaultCodeAgent(session.config, session);
    }
  },
  cursor: {
    kind: 'cursor',
    provide(session) {
      return new CursorCodeAgent(session);
    },
    dispose(session) {
      return cursorSessionPool.dispose(session);
    }
  }
};

function resolveProvider(key?: AgentProviderKind): AgentProvider {
  return providers[key ?? getAgentProviderKind()];
}

function provideAgent(session: AgentSession): CodeAgent {
  return resolveProvider(session.config.provider).provide(session);
}

async function disposeAgent(session: AgentSession, kind?: AgentProviderKind): Promise<void> {
  await resolveProvider(kind ?? session.config.provider).dispose?.(session);
}

function providerPlugin(): AgentPlugin {
  return {
    name: 'provider',
    prepareAgent: (ctx) => {
      ctx.agent = provideAgent(ctx.session);
    },
    sessionDispose: (ctx) => disposeAgent(ctx.session)
  };
}

export const agentProviders = {
  resolve: resolveProvider,
  provide: provideAgent,
  dispose: disposeAgent,
  plugin: providerPlugin
} as const;
