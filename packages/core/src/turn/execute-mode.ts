import {supportsToolLoop, type CodeAgent} from '../code-agent.js';
import {runDagTurn} from '../dag/orchestrator.js';
import {AgentRunReason, type AgentRunResult} from '../react-agent.js';
import type {AgentSession} from '../session.js';
import type {ReasoningMode, VerificationOutcome} from '../session-types.js';
import {runTotTurnWithRetries, shouldContinueTot} from './tot-turn.js';

export type ExecuteReasoningModeOptions = {
  agent?: CodeAgent;
  input?: string;
};

export type TurnExecution = {
  mode: ReasoningMode;
  succeeded: boolean;
  reason?: string;
  error?: unknown;
  verification?: VerificationOutcome;
};

function toTurnExecution(mode: ReasoningMode, result: AgentRunResult): TurnExecution {
  const {reason} = result;
  return {
    mode,
    succeeded: reason === AgentRunReason.FinalAnswer,
    reason
  };
}

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

    const result = await runDagTurn(session, options.input);
    return {mode, ...result};
  }

  const agent = options.agent;
  if (!agent) {
    throw new Error(`${mode} 模式缺少可执行 Agent`);
  }

  if (mode === 'tot') {
    if (supportsToolLoop(agent)) {
      const result = await runTotTurnWithRetries(session, agent);
      if (result.run.reason !== AgentRunReason.FinalAnswer) {
        return toTurnExecution(mode, result.run);
      }

      return {
        mode,
        succeeded: true,
        reason: shouldContinueTot(result) ? 'best_effort' : 'review_complete'
      };
    }

    session.events.say('system', 'TOT 模式需要 OpenAI ReAct，当前 provider 已降级为 react。');
  } else if (mode !== 'react') {
    throw new Error(`未知推理模式：${String(mode)}`);
  }

  return toTurnExecution(mode, await agent.run());
}
