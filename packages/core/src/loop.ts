import {isAbortError} from '@code-agent-lite/shared';
import {defaultPlugins, PluginDriver} from './plugin/index.js';
import type {AgentSession} from './session.js';

/** 统一在此处理 turn 取消；provider 层不再 catch abort。 */
export async function runAgentTurn(
  session: AgentSession,
  input: string,
  cwd?: string
): Promise<void> {
  const targetCwd = cwd ?? session.cwd;
  const plugins = session.options.plugins ?? defaultPlugins();

  try {
    await new PluginDriver(plugins).run(input, targetCwd, session);
  } catch (error) {
    if (isAbortError(error)) {
      session.events.status('cancelled', '任务已终止');
      return;
    }

    throw error;
  }
}
