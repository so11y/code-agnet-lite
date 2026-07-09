import {formatSchemaForPrompt} from '../planner-schemas.js';
import {DAG_PLAN_PROMPT, formatTurnUserMessage} from '../prompt.js';
import type {AgentSession} from '../session.js';
import {StructuredLlmCaller} from '../structured-llm-caller.js';
import {buildGraphFromPlan, detectCycle, validateParallelResourceClaims} from './graph-utils.js';
import {claimsConflict} from './resource-context.js';
import {dagPlanSchema, type DagPlan} from './dag-schemas.js';
import type {TaskGraph} from './types.js';

const DAG_JSON_SCHEMA = formatSchemaForPrompt(dagPlanSchema);

export async function llmPlanDag(input: string, session: AgentSession): Promise<TaskGraph> {
  session.events.status('thinking', 'DAG 规划');

  const plan = await StructuredLlmCaller.callOrThrow({
    messages: [
      {role: 'system', content: `${DAG_PLAN_PROMPT}\n\n只返回 JSON，并符合以下 JSON Schema：\n${DAG_JSON_SCHEMA}`},
      {
        role: 'user',
        content: formatTurnUserMessage(session.cwd, input)
      }
    ],
    schema: dagPlanSchema,
    llmOptions: session.llmOptions()
  });

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
