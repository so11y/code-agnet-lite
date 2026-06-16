import {z} from 'zod';
import {
  extractAssistantText,
  formatSessionTranscript,
  parseAssistantJson
} from '../utils/openai-message.js';
import {formatError, formatList} from '../utils/text-format.js';
import {callPlainLlm} from './llm.js';
import {REVIEW_TOT_PROMPT, ROOT_TOT_PROMPT} from './prompt.js';
import type {AgentRunResult, ReActAgent} from './react-agent.js';
import type {AgentSession} from './session.js';

type TotPlannerRequest =
  | {stage: 'root'; context: TotPlannerContext}
  | {stage: 'review'; context: TotPlannerContext; result?: AgentRunResult; error?: unknown};

export type TotPlannerResult = {
  shouldRetry: boolean;
};

export type TotPlannerContext = {
  round: number;
  maxRounds: number;
  rootPlanned: boolean;
  shouldRetry: boolean;
  exhausted: boolean;
  lastResult?: TotPlannerResult;
};

export function createTotPlannerContext(maxRounds = 3): TotPlannerContext {
  return {
    round: 0,
    maxRounds,
    rootPlanned: false,
    shouldRetry: false,
    exhausted: false
  };
}

export function registerTotPlanner(
  agent: Pick<ReActAgent, 'on'>,
  session: AgentSession,
  context: TotPlannerContext
) {
  if (!context.rootPlanned) {
    agent.on('before', async () => {
      await runTotPlanner(session, {stage: 'root', context});
    });
  }

  agent.on('after', async ({result, error}) => {
    await runTotPlanner(session, {stage: 'review', context, result, error});
  });
}

const totPlanSchema = z.object({
  summary: z.string(),
  chosenPlan: z.string(),
  steps: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  verification: z.array(z.string()).default([])
});

const totReviewSchema = z.object({
  directionCorrect: z.boolean(),
  summary: z.string(),
  rootHypothesis: z.string().default(''),
  experimentResult: z.string().default(''),
  revisedHypothesis: z.string().default(''),
  evidence: z.array(z.string()).default([]),
  nextSteps: z.array(z.string()).default([]),
  verification: z.array(z.string()).default([])
});

type TotPlan = z.infer<typeof totPlanSchema>;
type TotReview = z.infer<typeof totReviewSchema>;

function formatPlan(title: string, plan: TotPlan): string {
  return [
    title,
    '说明：这是供 ReAct 验证的 ToT 假设，并非已验证事实。',
    `摘要：${plan.summary}`,
    `选定方向：${plan.chosenPlan}`,
    formatList('步骤：', plan.steps),
    formatList('风险与假设：', plan.risks),
    formatList('验证项：', plan.verification)
  ]
    .filter(Boolean)
    .join('\n\n');
}

function formatReview(review: TotReview, runFailed: boolean): string {
  const needsCorrection = runFailed || !review.directionCorrect;

  return [
    'ToT 运行结束复盘：假设 -> 实验 -> 修正假设',
    `根方向：${needsCorrection ? '需要修正' : '基本正确'}`,
    `摘要：${review.summary}`,
    review.rootHypothesis ? `假设：${review.rootHypothesis}` : '',
    review.experimentResult ? `实验：${review.experimentResult}` : '',
    needsCorrection && review.revisedHypothesis
      ? `修正假设：${review.revisedHypothesis}`
      : '',
    formatList('证据：', review.evidence),
    needsCorrection ? formatList('下一步：', review.nextSteps) : '',
    needsCorrection ? formatList('验证项：', review.verification) : ''
  ]
    .filter(Boolean)
    .join('\n\n');
}

function formatRunOutcome(request: Extract<TotPlannerRequest, {stage: 'review'}>): string {
  const error = formatError(request.error);

  return [
    `完成：${request.result?.completed ?? false}`,
    `步数：${request.result?.steps ?? 0}`,
    `原因：${request.result?.reason ?? 'error'}`,
    error ? `错误：${error}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

function didRunFail(request: Extract<TotPlannerRequest, {stage: 'review'}>) {
  return Boolean(request.error) || request.result?.completed === false;
}

async function createPlan(session: AgentSession, title: string, extraContext = '') {
  const response = await callPlainLlm([
    {role: 'system', content: ROOT_TOT_PROMPT},
    {
      role: 'user',
      content: [
        '请为当前会话生成 ToT 规划假设。',
        extraContext,
        formatSessionTranscript(session.messages)
      ]
        .filter(Boolean)
        .join('\n\n')
    }
  ]);

  const text = extractAssistantText(response);

  try {
    session.addSystemNote(formatPlan(title, parseAssistantJson(response, totPlanSchema)));
  } catch {
    session.addSystemNote(
      `${title}\n\n解析失败；以下原始输出仅供 ReAct 验证参考。\n\n${text}`
    );
  }
}

async function reviewPlan(
  session: AgentSession,
  request: Extract<TotPlannerRequest, {stage: 'review'}>
) {
  const runFailed = didRunFail(request);
  const canRetry = request.context.round < request.context.maxRounds;
  const response = await callPlainLlm([
    {role: 'system', content: REVIEW_TOT_PROMPT},
    {
      role: 'user',
      content: [
        '请对照运行记录，复盘初始/根 ToT 方向是否正确。',
        '运行结果：',
        formatRunOutcome(request),
        '会话记录：',
        formatSessionTranscript(session.messages)
      ].join('\n\n')
    }
  ]);

  const text = extractAssistantText(response);

  try {
    const review = parseAssistantJson(response, totReviewSchema);
    const shouldRetry = runFailed || !review.directionCorrect;

    session.addSystemNote(formatReview(review, runFailed));

    if (shouldRetry && canRetry) {
      session.status('thinking', 'ToT 修正假设');
      await createPlan(
        session,
        'ToT 实验后修正假设：',
        '先前的根假设被判定不正确或不充分。请为下一轮 ReAct 生成修正后的 ToT 假设。'
      );
    } else if (shouldRetry) {
      session.addSystemNote(`ToT 已达到 ${request.context.maxRounds} 轮修正上限。`);
    }

    return {shouldRetry};
  } catch {
    session.addSystemNote(`ToT 运行结束复盘解析失败。原始输出：\n\n${text}`);
    return {shouldRetry: runFailed};
  }
}

export async function runTotPlanner(
  session: AgentSession,
  request: TotPlannerRequest
): Promise<TotPlannerResult> {
  switch (request.stage) {
    case 'root':
      request.context.rootPlanned = true;
      request.context.shouldRetry = false;
      request.context.exhausted = false;
      session.status('thinking', 'ToT 探索规划');
      await createPlan(session, 'ToT 根假设：');
      return {shouldRetry: false};
    case 'review':
      session.status('thinking', 'ToT 方向复盘');
      request.context.shouldRetry = false;
      request.context.exhausted = false;

      const result = await reviewPlan(session, request);
      const canRetry = request.context.round < request.context.maxRounds;

      request.context.lastResult = result;
      request.context.shouldRetry = result.shouldRetry && canRetry;
      request.context.exhausted = result.shouldRetry && !canRetry;

      return result;
  }
}
