import type {SerializedTaskGraph, TaskNodeKind} from '@code-agent-lite/core';
import {TASK_NODE_STATUS, topologicalSortIds} from '@code-agent-lite/core';

export type PlanTodoItem = Pick<
  SerializedTaskGraph['nodes'][number],
  'id' | 'kind' | 'goal' | 'status' | 'error'
>;

export type PlanTodoState = {
  summary?: string;
  items: PlanTodoItem[];
};

const KIND_LABEL: Record<TaskNodeKind, string> = {
  explore: '探索',
  edit: '编辑',
  verify: '验证',
  merge: '汇总'
};

export function kindLabel(kind: TaskNodeKind): string {
  return KIND_LABEL[kind];
}

export function countFinished(items: PlanTodoItem[]): number {
  return items.filter(
    (item) =>
      item.status === TASK_NODE_STATUS.DONE || item.status === TASK_NODE_STATUS.SKIPPED
  ).length;
}

export function sortPlanItemsByGraph(items: PlanTodoItem[], edges: SerializedTaskGraph['edges']): PlanTodoItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const orderedIds = topologicalSortIds(items.map((item) => item.id), edges);

  return orderedIds
    .map((id) => byId.get(id))
    .filter((item): item is PlanTodoItem => item !== undefined);
}

export function planFromGraph(graph: SerializedTaskGraph): PlanTodoState {
  const items = graph.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    goal: node.goal,
    status: node.status,
    error: node.error
  }));

  return {
    summary: graph.summary,
    items: sortPlanItemsByGraph(items, graph.edges)
  };
}
