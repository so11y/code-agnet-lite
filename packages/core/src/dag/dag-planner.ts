import {parseAssistantJson} from '../openai-message.js';
import {callPlainLlm} from '../llm.js';
import {formatSchemaForPrompt} from '../planner-schemas.js';
import {DAG_PLAN_PROMPT} from '../prompt.js';
import type {AgentSession} from '../session.js';
import {buildGraphFromPlan, detectCycle, validateParallelResourceClaims} from './graph-utils.js';
import {claimsConflict} from './resource-manager.js';
import {dagPlanSchema, type DagPlan} from './dag-schemas.js';
import type {TaskGraph} from './types.js';

const DAG_JSON_SCHEMA = formatSchemaForPrompt(dagPlanSchema);

export async function llmPlanDag(input: string, session: AgentSession): Promise<TaskGraph> {
  session.status('thinking', 'DAG 规划');

  const response = await callPlainLlm(
    [
      {role: 'system', content: `${DAG_PLAN_PROMPT}\n\n只返回 JSON，并符合以下 JSON Schema：\n${DAG_JSON_SCHEMA}`},
      {
        role: 'user',
        content: [`当前工作区：${session.cwd}`, `用户请求：\n${input}`].join('\n\n')
      }
    ],
    session.llmOptions()
  );

  const plan = parseAssistantJson(response, dagPlanSchema);
  validateDagPlan(plan);

  const graph = buildGraphFromPlan(
    plan.tasks.map((task) => ({
      id: task.id,
      kind: task.kind,
      goal: task.goal,
      dependsOn: task.dependsOn,
      reads: task.reads,
      writes: task.writes,
      commands: task.commands
    }))
  );

  graph.summary = plan.summary;

  const cycle = detectCycle(graph);
  if (cycle) {
    throw new Error(`DAG 规划存在环：${cycle.join(' → ')}`);
  }

  validateParallelResourceClaims(graph, claimsConflict);

  return graph;
}

function validateDagPlan(plan: DagPlan) {
  const ids = new Set(plan.tasks.map((task) => task.id));

  for (const task of plan.tasks) {
    for (const dep of task.dependsOn) {
      if (!ids.has(dep)) {
        throw new Error(`DAG 任务 ${task.id} 依赖未知节点：${dep}`);
      }
    }
  }

  const mergeCount = plan.tasks.filter((task) => task.kind === 'merge').length;
  if (mergeCount !== 1) {
    throw new Error(`DAG 必须包含恰好 1 个 merge 节点，当前为 ${mergeCount}`);
  }
}
