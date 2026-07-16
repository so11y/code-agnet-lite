import {DAG_PLAN_PROMPT, DAG_SUBGRAPH_REPLAN_PROMPT} from '../prompt.js';
import type {AgentSession} from '../session.js';
import {AgentStatus} from '../session-types.js';
import {callStructuredLlmOrThrow} from '../structured-llm-caller.js';
import type {TurnOperations} from '../types/operations.js';
import {formatTurnContext} from '../turn-context.js';
import {TaskGraph} from './task-graph.js';
import {
  dagPlanSchema,
  dagSubgraphPlanSchema,
  type DagSubgraphPlan
} from './dag-schemas.js';

type SubgraphReplanContext = {
  replanSet: string[];
  failedNodes: Array<{
    id: string;
    error?: string;
    partialOperations?: TurnOperations;
  }>;
  doneSummaries: Record<string, string>;
  originalGraphSummary?: string;
};

export async function llmPlanDag(session: AgentSession): Promise<TaskGraph> {
  session.events.status(AgentStatus.Thinking, 'DAG 规划');

  const plan = await callStructuredLlmOrThrow({
    messages: [
      {
        role: 'system',
        content: [DAG_PLAN_PROMPT, ...session.skills.loadedPromptNotes()].join('\n\n')
      },
      {
        role: 'user',
        content: formatTurnContext(session)
      }
    ],
    schema: dagPlanSchema,
    llmOptions: session.llmOptions()
  });

  return TaskGraph.fromPlan(plan.tasks, plan.summary);
}

export async function llmReplanSubgraph(
  session: AgentSession,
  context: SubgraphReplanContext
): Promise<DagSubgraphPlan> {
  session.events.status(AgentStatus.Thinking, 'DAG 链级重规划');

  const plan = await callStructuredLlmOrThrow({
    messages: [
      {
        role: 'system',
        content: [DAG_SUBGRAPH_REPLAN_PROMPT, ...session.skills.loadedPromptNotes()].join('\n\n')
      },
      {
        role: 'user',
        content: [
          formatTurnContext(session),
          `[原 DAG 摘要]\n${context.originalGraphSummary ?? '无'}`,
          `[失败节点]\n${JSON.stringify(context.failedNodes, null, 2)}`,
          `[受影响节点 ID]\n${context.replanSet.join('\n')}`,
          `[已完成外部上游输出]\n${JSON.stringify(context.doneSummaries, null, 2)}`
        ].join('\n\n')
      }
    ],
    schema: dagSubgraphPlanSchema,
    llmOptions: session.llmOptions()
  });

  validateSubgraphPlan(plan, context);
  return plan;
}

function validateSubgraphPlan(plan: DagSubgraphPlan, context: SubgraphReplanContext) {
  const expected = new Set(context.replanSet);
  const actual = new Set(plan.tasks.map((task) => task.id));

  if (actual.size !== plan.tasks.length) {
    throw new Error('DAG 子图重规划包含重复节点 id');
  }

  if (actual.size !== expected.size || [...expected].some((id) => !actual.has(id))) {
    throw new Error('DAG 子图重规划必须恰好覆盖全部受影响节点，并保持节点 id 不变');
  }

  const allowedDependencies = new Set([...expected, ...Object.keys(context.doneSummaries)]);
  for (const task of plan.tasks) {
    for (const dependency of task.dependsOn) {
      if (!allowedDependencies.has(dependency)) {
        throw new Error(`DAG 子图任务 ${task.id} 依赖了未允许的节点：${dependency}`);
      }
    }
  }
}
