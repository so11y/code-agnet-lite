import {getAgentProviderKind} from '@code-agent-lite/platform';
import {DefaultCodeAgent, type CodeAgent} from '../code-agent.js';
import type {AgentPlugin} from '../plugin/types.js';
import type {AgentSession} from '../session.js';
import {CursorCodeAgent} from './cursor-code-agent.js';
import {getCursorSessionPool} from './cursor-session-pool.js';
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
      return new CursorCodeAgent(session.config, session);
    },
    dispose(session) {
      return getCursorSessionPool().dispose(session);
    }
  }
};

export class AgentProviderRegistry {
  readonly defaultKind: AgentProviderKind = 'openai';

  resolve(key?: AgentProviderKind): AgentProvider {
    const kind = key ?? getAgentProviderKind() ?? this.defaultKind;
    const provider = providers[kind];

    if (!provider) {
      throw new Error(`Unknown provider: ${kind}`);
    }

    return provider;
  }

  provide(session: AgentSession): CodeAgent {
    return this.resolve(session.config.provider).provide(session);
  }

  async dispose(session: AgentSession, kind?: AgentProviderKind): Promise<void> {
    await this.resolve(kind ?? session.config.provider).dispose?.(session);
  }

  plugin(): AgentPlugin {
    return {
      name: 'provider',
      prepareAgent: (ctx) => {
        ctx.agent = this.provide(ctx.session);
      },
      sessionDispose: (ctx) => {
        return this.dispose(ctx.session);
      }
    };
  }
}

export const agentProviders = new AgentProviderRegistry();
