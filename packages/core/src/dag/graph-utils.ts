import type {ResourceClaim, TaskGraph, TaskNode} from './types.js';

export function getPredecessors(graph: TaskGraph, nodeId: string): string[] {
  return graph.edges.filter((edge) => edge.to === nodeId).map((edge) => edge.from);
}

export function getSuccessors(graph: TaskGraph, nodeId: string): string[] {
  return graph.edges.filter((edge) => edge.from === nodeId).map((edge) => edge.to);
}

export function hasPath(graph: TaskGraph, from: string, to: string): boolean {
  if (from === to) {
    return true;
  }

  const queue = [from];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) {
      continue;
    }

    seen.add(current);

    for (const next of getSuccessors(graph, current)) {
      if (next === to) {
        return true;
      }

      queue.push(next);
    }
  }

  return false;
}

export function detectCycle(graph: TaskGraph): string[] | undefined {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (nodeId: string): string[] | undefined => {
    if (visited.has(nodeId)) {
      return;
    }

    if (visiting.has(nodeId)) {
      const cycleStart = stack.indexOf(nodeId);
      return cycleStart === -1 ? [nodeId] : stack.slice(cycleStart).concat(nodeId);
    }

    visiting.add(nodeId);
    stack.push(nodeId);

    for (const next of getSuccessors(graph, nodeId)) {
      const cycle = visit(next);
      if (cycle) {
        return cycle;
      }
    }

    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const nodeId of graph.nodes.keys()) {
    const cycle = visit(nodeId);
    if (cycle) {
      return cycle;
    }
  }
}

export function allPredecessorsDone(graph: TaskGraph, node: TaskNode): boolean {
  return getPredecessors(graph, node.id).every((id) => {
    const predecessor = graph.nodes.get(id);
    return predecessor?.status === 'done';
  });
}

export function topologicalSortIds(
  ids: string[],
  edges: Array<{from: string; to: string}>
): string[] {
  const idSet = new Set(ids);
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const id of ids) {
    indegree.set(id, 0);
    outgoing.set(id, []);
  }

  for (const edge of edges) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to)) {
      continue;
    }

    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort();

  const ordered: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);

    for (const next of outgoing.get(id) ?? []) {
      const degree = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, degree);
      if (degree === 0) {
        queue.push(next);
        queue.sort();
      }
    }
  }

  if (ordered.length < ids.length) {
    const seen = new Set(ordered);
    return [...ordered, ...ids.filter((id) => !seen.has(id))];
  }

  return ordered;
}

export function buildGraphFromPlan(tasks: Array<{
  id: string;
  kind: TaskNode['kind'];
  goal: string;
  dependsOn: string[];
  reads: string[];
  writes: string[];
  commands?: string[];
}>): TaskGraph {
  const nodes = new Map<string, TaskNode>();
  const edges: TaskGraph['edges'] = [];

  for (const task of tasks) {
    nodes.set(task.id, {
      id: task.id,
      kind: task.kind,
      goal: task.goal,
      resources: {
        reads: task.reads,
        writes: task.writes,
        commands: task.commands ?? []
      },
      dependsOn: task.dependsOn,
      status: 'pending'
    });

    for (const from of task.dependsOn) {
      edges.push({from, to: task.id});
    }
  }

  return {nodes, edges};
}

export function validateParallelResourceClaims(
  graph: TaskGraph,
  conflict: (left: ResourceClaim, right: ResourceClaim) => boolean
) {
  const nodes = [...graph.nodes.values()];

  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const left = nodes[leftIndex];
      const right = nodes[rightIndex];

      if (hasPath(graph, left.id, right.id) || hasPath(graph, right.id, left.id)) {
        continue;
      }

      if (conflict(left.resources, right.resources)) {
        throw new Error(`并行节点 ${left.id} 与 ${right.id} 存在资源冲突`);
      }
    }
  }
}
