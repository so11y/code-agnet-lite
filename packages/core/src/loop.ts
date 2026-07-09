import {isAbortError} from '@code-agent-lite/shared';
import {getAgentAi} from './provider/provider-registry.js';
import type {AgentSession} from './session.js';

/** 统一在此处理 turn 取消；provider 层不再 catch abort。 */
export async function runAgentTurn(
  session: AgentSession,
  input: string,
  cwd?: string
): Promise<void> {
  const targetCwd = cwd ?? session.cwd;

  try {
    await getAgentAi(session.options.provider).runTurn(session, input, targetCwd);
  } catch (error) {
    if (isAbortError(error)) {
      session.status('cancelled', '任务已终止');
      return;
    }

    throw error;
  }
}
