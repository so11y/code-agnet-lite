import {supportsToolLoop, type CodeAgent} from '../code-agent.js';
import {runDagTurn} from '../dag/orchestrator.js';
import type {AgentSession} from '../session.js';
import type {ReasoningMode} from '../session-types.js';
import {runTotTurnWithRetries} from './tot-turn.js';

function requireCompleted(result: {completed: boolean; steps: number}): void {
  if (!result.completed) {
    throw new Error(`Agent 未在 ${result.steps} 步内完成任务`);
  }
}

export type ExecuteReasoningModeOptions = {
  agent?: CodeAgent;
  input?: string;
  meta?: Map<string, unknown>;
};

/** modePlugin.execute 与 verify fix attempt 共用的 mode 执行入口。 */
export async function executeReasoningMode(
  session: AgentSession,
  mode: ReasoningMode,
  options: ExecuteReasoningModeOptions = {}
): Promise<void> {
  if (mode === 'dag') {
    if (!options.input) {
      return;
    }

    const succeeded = await runDagTurn(session, options.input);
    options.meta?.set('dagSucceeded', succeeded);
    return;
  }

  const agent = options.agent;
  if (!agent) {
    return;
  }

  if (mode === 'react') {
    requireCompleted(await agent.run());
    return;
  }

  if (mode === 'tot') {
    if (supportsToolLoop(agent)) {
      const result = await runTotTurnWithRetries(session, agent);
      requireCompleted(result.run);
      return;
    }

    session.events.say('system', 'TOT 模式需要 OpenAI ReAct，当前 provider 已降级为 react。');
    requireCompleted(await agent.run());
  }
}
