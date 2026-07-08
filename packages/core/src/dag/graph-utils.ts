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

/** 上游 failed/skipped 时，将仍 pending 的下游标为 skipped，避免假死锁 */
export function skipNodesWithBlockedPredecessors(graph: TaskGraph) {
  let changed = true;

  while (changed) {
    changed = false;

    for (const node of graph.nodes.values()) {
      if (node.status !== 'pending') {
        continue;
      }

      const blocked = getPredecessors(graph, node.id).some((id) => {
        const status = graph.nodes.get(id)?.status;
        return status === 'failed' || status === 'skipped';
      });

      if (blocked) {
        node.status = 'skipped';
        node.error = '上游节点未完成（失败或已跳过）';
        changed = true;
      }
    }
  }
}

export function findReadyNodes(graph: TaskGraph): TaskNode[] {
  return [...graph.nodes.values()].filter(
    (node) => node.status === 'pending' && allPredecessorsDone(graph, node)
  );
}

export function hasIncompleteNodes(graph: TaskGraph): boolean {
  return [...graph.nodes.values()].some(
    (node) => node.status === 'pending' || node.status === 'running'
  );
}

export function skipDownstream(graph: TaskGraph, failedNodeId: string) {
  const queue = getSuccessors(graph, failedNodeId);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = graph.nodes.get(nodeId);

    if (!node || node.status !== 'pending') {
      continue;
    }

    node.status = 'skipped';
    node.error = `上游节点 ${failedNodeId} 失败`;
    queue.push(...getSuccessors(graph, nodeId));
  }
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
