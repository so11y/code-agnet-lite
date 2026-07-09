import type {AgentAi} from './agent-ai.js';
import type {AgentSession} from '../session.js';
import {runAgentProviderTurn} from './provider-turn.js';

export class OpenAiAgentProvider implements AgentAi {
  readonly kind = 'openai' as const;

  async runTurn(session: AgentSession, input: string, cwd: string): Promise<void> {
    await runAgentProviderTurn(session, input, cwd);
  }
}
