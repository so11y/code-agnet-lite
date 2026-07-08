import type {SerializedTaskGraph, TaskNodeKind, TaskNodeStatus} from '@code-agent-lite/core';

export type PlanTodoItem = {
  id: string;
  kind: TaskNodeKind;
  goal: string;
  status: TaskNodeStatus;
  error?: string;
};

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
  return items.filter((item) => item.status === 'done' || item.status === 'skipped').length;
}

export function sortPlanItemsByGraph(items: PlanTodoItem[], edges: SerializedTaskGraph['edges']): PlanTodoItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const item of items) {
    indegree.set(item.id, 0);
    outgoing.set(item.id, []);
  }

  for (const edge of edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) {
      continue;
    }

    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort();

  const ordered: PlanTodoItem[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
    }

    for (const next of outgoing.get(id) ?? []) {
      const degree = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, degree);
      if (degree === 0) {
        queue.push(next);
        queue.sort();
      }
    }
  }

  if (ordered.length < items.length) {
    const seen = new Set(ordered.map((item) => item.id));
    return [...ordered, ...items.filter((item) => !seen.has(item.id))];
  }

  return ordered;
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

export function updatePlanItem(
  plan: PlanTodoState,
  nodeId: string,
  patch: Partial<Pick<PlanTodoItem, 'status' | 'error'>>
): PlanTodoState {
  const exists = plan.items.some((item) => item.id === nodeId);
  if (!exists) {
    return plan;
  }

  return {
    ...plan,
    items: plan.items.map((item) => (item.id === nodeId ? {...item, ...patch} : item))
  };
}
