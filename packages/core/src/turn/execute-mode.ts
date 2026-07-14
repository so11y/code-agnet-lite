import {supportsToolLoop, type CodeAgent} from '../code-agent.js';
import {runDagTurn} from '../dag/orchestrator.js';
import type {AgentSession} from '../session.js';
import type {ReasoningMode} from '../session-types.js';
import {runTotTurnWithRetries} from './tot-turn.js';

function requireFinalAnswer(result: {reason: string; steps: number}): void {
  if (result.reason !== 'final_answer') {
    throw new Error(`Agent 未在 ${result.steps} 步内完成任务`);
  }
}

export type ExecuteReasoningModeOptions = {
  agent?: CodeAgent;
  input?: string;
};

export type TurnExecution = {
  mode: ReasoningMode;
  succeeded: boolean;
};

/** modePlugin.execute 与 verify fix attempt 共用的 mode 执行入口。 */
export async function executeReasoningMode(
  session: AgentSession,
  mode: ReasoningMode,
  options: ExecuteReasoningModeOptions = {}
): Promise<TurnExecution> {
  if (mode === 'dag') {
    if (!options.input) {
      throw new Error('DAG 模式缺少用户输入');
    }

    const succeeded = await runDagTurn(session, options.input);
    return {mode, succeeded};
  }

  const agent = options.agent;
  if (!agent) {
    throw new Error(`${mode} 模式缺少可执行 Agent`);
  }

  if (mode === 'react') {
    requireFinalAnswer(await agent.run());
    return {mode, succeeded: true};
  }

  if (mode === 'tot') {
    if (supportsToolLoop(agent)) {
      const result = await runTotTurnWithRetries(session, agent);
      requireFinalAnswer(result.run);
      return {mode, succeeded: true};
    }

    session.events.say('system', 'TOT 模式需要 OpenAI ReAct，当前 provider 已降级为 react。');
    requireFinalAnswer(await agent.run());
    return {mode, succeeded: true};
  }

  throw new Error(`未知推理模式：${String(mode)}`);
}
