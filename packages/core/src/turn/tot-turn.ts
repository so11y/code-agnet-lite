import {isEmpty} from 'lodash-es';
import type {Review} from '../planner-schemas.js';
import {llmPlan, llmReplan, updateStateFromRun} from '../planner.js';
import type {CodeAgent} from '../code-agent.js';
import type {AgentRunResult} from '../react-agent.js';
import type {AgentSession} from '../session.js';

export const MAX_TOT_RETRIES = 3;
export const TOT_CONFIDENCE_TARGET = 0.9;

export type TotTurnResult = {
  run: AgentRunResult;
  review?: Review;
  directionCorrect: boolean;
  confidence: number;
};

export function shouldContinueTot(result: TotTurnResult): boolean {
  return !(
    result.run.completed &&
    result.directionCorrect &&
    result.confidence >= TOT_CONFIDENCE_TARGET
  );
}

/** 单次 ToT：规划（若无假设）→ ReAct → 复盘 */
export async function runTotTurn(session: AgentSession, agent: CodeAgent): Promise<TotTurnResult> {
  session.throwIfAborted();

  if (isEmpty(session.ledger.state.hypotheses)) {
    await llmPlan(session);
  }

  const progressBefore = session.ledger.snapshotProgress();

  let run: AgentRunResult;
  try {
    run = await agent.run();
  } catch (error) {
    await updateStateFromRun(
      session,
      {completed: false, steps: 0, reason: 'max_steps'},
      error,
      progressBefore
    );
    throw error;
  }

  const review = await updateStateFromRun(session, run, undefined, progressBefore);

  return {
    run,
    review,
    directionCorrect: review?.directionCorrect ?? false,
    confidence: session.ledger.state.confidence
  };
}

/**
 * 外层 ToT 循环：方向错 / 未完成 / 置信度不足时再次 runTotTurn。
 * llmReplan 在连续无进展或假设被清空时由外部触发。
 */
export async function runTotTurnWithRetries(
  session: AgentSession,
  agent: CodeAgent,
  maxRetries = MAX_TOT_RETRIES
): Promise<TotTurnResult> {
  let last: TotTurnResult | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    session.throwIfAborted();

    if (attempt > 1) {
      if (session.ledger.state.noProgress >= 2) {
        await llmReplan(session);
        session.ledger.state.noProgress = 0;
      } else if (isEmpty(session.ledger.state.hypotheses)) {
        await llmPlan(session);
      }
    }

    last = await runTotTurn(session, agent);

    if (!shouldContinueTot(last)) {
      return last;
    }
  }

  session.events.say(
    'system',
    `ToT 已达最大轮数（${maxRetries}），方向或置信度仍未达标，按当前结论继续。`
  );

  return last!;
}
