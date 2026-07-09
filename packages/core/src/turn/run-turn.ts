import type {AgentSession} from '../session.js';
import {TurnOrchestrator} from './turn-orchestrator.js';

export async function runProviderTurn(session: AgentSession, input: string, cwd: string): Promise<void> {
  await new TurnOrchestrator(session).run(input, cwd);
}
