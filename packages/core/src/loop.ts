import {isAbortError} from '@code-agent-lite/shared';
import type {AgentSession} from './session.js';
import {AgentStatus} from './session-types.js';
import type {TurnExecution} from './turn/execute-mode.js';

/** 统一在此处理 turn 取消；provider 层不再 catch abort。 */
export async function runAgentTurn(
  session: AgentSession,
  input: string,
  cwd?: string
): Promise<TurnExecution | undefined> {
  const targetCwd = cwd ?? session.cwd;

  try {
    return await session.runPluginTurn(input, targetCwd);
  } catch (error) {
    if (isAbortError(error)) {
      session.events.status(AgentStatus.Cancelled, '任务已终止');
      return undefined;
    }

    throw error;
  }
}
