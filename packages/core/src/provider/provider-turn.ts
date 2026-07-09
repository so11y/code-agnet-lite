import type {AgentSession} from '../session.js';
import {runProviderTurn} from '../turn/run-turn.js';

export async function runAgentProviderTurn(
  session: AgentSession,
  input: string,
  cwd: string
): Promise<void> {
  await runProviderTurn(session, input, cwd);
}
