import type {AgentAi} from './agent-ai.js';
import type {AgentSession} from '../session.js';
import {runAgentProviderTurn} from './provider-turn.js';
import {getCursorSessionPool} from './cursor-session-pool.js';

export class CursorAgentProvider implements AgentAi {
  readonly kind = 'cursor' as const;

  async runTurn(session: AgentSession, input: string, cwd: string): Promise<void> {
    await runAgentProviderTurn(session, input, cwd);
  }

  async disposeSession(session: AgentSession): Promise<void> {
    await getCursorSessionPool().dispose(session);
  }
}
