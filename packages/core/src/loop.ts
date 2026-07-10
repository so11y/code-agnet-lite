import {isAbortError} from '@code-agent-lite/shared';
import type {AgentSession} from './session.js';

/** 统一在此处理 turn 取消；provider 层不再 catch abort。 */
export async function runAgentTurn(
  session: AgentSession,
  input: string,
  cwd?: string
): Promise<void> {
  const targetCwd = cwd ?? session.cwd;

  try {
    await session.runPluginTurn(input, targetCwd);
  } catch (error) {
    if (isAbortError(error)) {
      session.events.status('cancelled', '任务已终止');
      return;
    }

    throw error;
  }
}
