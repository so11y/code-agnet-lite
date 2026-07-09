import {Graph, alg} from '@dagrejs/graphlib';
import type {TaskGraph, TaskNode} from './types.js';

function createGraphFromEdges(
  nodeIds: Iterable<string>,
  edges: Array<{from: string; to: string}>
): Graph {
  const graph = new Graph({directed: true});

  for (const id of nodeIds) {
    graph.setNode(id);
  }

  for (const edge of edges) {
    if (graph.hasNode(edge.from) && graph.hasNode(edge.to)) {
      graph.setEdge(edge.from, edge.to);
    }
  }

  return graph;
}

function createGraphFromTaskGraph(taskGraph: TaskGraph): Graph {
  return createGraphFromEdges(taskGraph.nodes.keys(), taskGraph.edges);
}

export function getPredecessors(graph: TaskGraph, nodeId: string): string[] {
  const libGraph = createGraphFromTaskGraph(graph);
  return libGraph.predecessors(nodeId) ?? [];
}

export function getSuccessors(graph: TaskGraph, nodeId: string): string[] {
  const libGraph = createGraphFromTaskGraph(graph);
  return libGraph.successors(nodeId) ?? [];
}

export function detectCycle(graph: TaskGraph): string[] | undefined {
  const libGraph = createGraphFromTaskGraph(graph);

  if (alg.isAcyclic(libGraph)) {
    return undefined;
  }

  const cycles = alg.findCycles(libGraph);
  const cycle = cycles[0];
  if (!cycle?.length) {
    return undefined;
  }

  return [...cycle, cycle[0]];
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
  return alg.topsort(createGraphFromEdges(ids, edges));
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
  const libGraph = new Graph({directed: true});
  const nodes = new Map<string, TaskNode>();
  const edges: TaskGraph['edges'] = [];

  for (const task of tasks) {
    libGraph.setNode(task.id);
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
  }

  for (const task of tasks) {
    for (const from of task.dependsOn) {
      libGraph.setEdge(from, task.id);
      edges.push({from, to: task.id});
    }
  }

  return {nodes, edges};
}
