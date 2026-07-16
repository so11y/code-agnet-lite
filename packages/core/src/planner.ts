import {formatSessionTranscript} from './openai-message.js';
import {formatError, formatList, joinSections} from '@code-agent-lite/shared';
import {type Plan, type PlanReview, planSchema, reviewSchema} from './planner-schemas.js';
import {buildPlanPrompt, REVIEW_TOT_PROMPT} from './prompt.js';
import {AgentRunReason, type AgentRunResult} from './react-agent.js';
import type {AgentSession} from './session.js';
import {AgentStatus} from './session-types.js';
import {callStructuredLlmWithHandler} from './structured-llm-caller.js';

function formatPlan(title: string, plan: Plan): string {
  return joinSections(
    title,
    '说明：这是供 ReAct 验证的假设，并非已验证事实。',
    `摘要：${plan.summary}`,
    formatList('当前假设：', plan.hypotheses),
    formatList('风险与假设：', plan.risks),
    formatList('验证项：', plan.verification)
  );
}

function formatReview(review: PlanReview, runFailed: boolean): string {
  const needsCorrection = runFailed || !review.directionCorrect;

  return joinSections(
    '运行复盘：假设 -> 实验 -> 修正假设',
    `方向：${needsCorrection ? '需要修正' : '基本正确'}`,
    `摘要：${review.summary}`,
    formatList('已知事实：', review.facts),
    needsCorrection ? formatList('已拒绝方向：', review.rejected) : '',
    needsCorrection ? formatList('当前假设：', review.hypotheses) : '',
    needsCorrection ? formatList('验证项：', review.verification) : ''
  );
}

function formatStateContext(session: AgentSession) {
  const state = session.ledger.state;

  return joinSections(
    state.rejected.length ? `已拒绝方向：\n${state.rejected.join('\n')}` : '',
    state.facts.length ? `已知事实：\n${state.facts.join('\n')}` : '',
    `连续无进展：${state.noProgress}`
  );
}

async function requestPlan(
  session: AgentSession,
  mode: 'root' | 'replan',
  title: string,
  extraContext = ''
) {
  const plan = await callStructuredLlmWithHandler({
    messages: [
      {role: 'system', content: buildPlanPrompt(mode)},
      {
        role: 'user',
        content: joinSections(
          extraContext,
          formatStateContext(session),
          formatSessionTranscript(session.buildLlmMessages())
        )
      }
    ],
    schema: planSchema,
    llmOptions: session.llmOptions(),
    onParseError(text) {
      session.conversation.addTurnNote(
        `${title}\n\n解析失败；以下原始输出仅供 ReAct 验证参考。\n\n${text}`,
        {emit: false}
      );
      return undefined;
    }
  });

  if (!plan) {
    return undefined;
  }

  session.ledger.applyHypotheses(plan.hypotheses);
  session.conversation.addTurnNote(formatPlan(title, plan), {emit: false});
  return plan;
}

export async function llmPlan(session: AgentSession) {
  session.events.status(AgentStatus.Thinking, '规划');
  await requestPlan(session, 'root', '当前假设：');
}

export async function llmReplan(session: AgentSession) {
  session.ledger.beginReplan();

  await requestPlan(
    session,
    'replan',
    '换思路后的假设：',
    '先前方向进展不足，请给出与已拒绝方向明显不同的新假设。'
  );
}

function formatRunOutcome(result: AgentRunResult, error?: unknown) {
  const errorText = formatError(error);
  return joinSections(
    `结束原因：${result.reason}`,
    `步数：${result.steps}`,
    errorText ? `错误：${errorText}` : ''
  );
}

function didRunFail(result: AgentRunResult, error?: unknown) {
  return Boolean(error) || result.reason !== AgentRunReason.FinalAnswer;
}

export async function updateStateFromRun(
  session: AgentSession,
  result: AgentRunResult,
  error?: unknown,
  progressBefore = session.ledger.snapshotProgress()
) {
  session.events.status(AgentStatus.Thinking, '复盘');
  const runFailed = didRunFail(result, error);
  const review = await callStructuredLlmWithHandler({
    messages: [
      {role: 'system', content: REVIEW_TOT_PROMPT},
      {
        role: 'user',
        content: joinSections(
          '请对照运行记录，复盘当前假设是否正确。',
          '运行结果：',
          formatRunOutcome(result, error),
          '会话记录：',
          formatSessionTranscript(session.buildLlmMessages())
        )
      }
    ],
    schema: reviewSchema,
    llmOptions: session.llmOptions(),
    onParseError(text) {
      session.conversation.addTurnNote(`运行复盘解析失败。原始输出：\n\n${text}`, {
        emit: false
      });
      return undefined;
    }
  });

  if (!review) {
    session.ledger.noteProgress(progressBefore);
    return undefined;
  }

  session.conversation.addTurnNote(formatReview(review, runFailed), {emit: false});
  session.ledger.applyReview(review, runFailed);
  session.ledger.noteProgress(progressBefore);
  return review;
}
