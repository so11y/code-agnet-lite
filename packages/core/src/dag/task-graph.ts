import {requireCjs} from '@code-agent-lite/shared';
import type {Graph} from '@dagrejs/graphlib';
import type {DagSubgraphPlan, DagTask} from './dag-schemas.js';
import {
  TASK_NODE_STATUS,
  TaskNode,
  type SerializedTaskGraph,
  type TaskEdge
} from './dag-model.js';

const {Graph: GraphConstructor, alg} = requireCjs<typeof import('@dagrejs/graphlib')>(
  '@dagrejs/graphlib',
  import.meta.url
);

function createGraphFromEdges(
  nodeIds: Iterable<string>,
  edges: TaskEdge[]
): Graph {
  const graph = new GraphConstructor({directed: true});

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

export function topologicalSortIds(
  ids: string[],
  edges: TaskEdge[]
): string[] {
  return alg.topsort(createGraphFromEdges(ids, edges));
}

export class TaskGraph {
  constructor(
    readonly nodes: Map<string, TaskNode>,
    readonly edges: TaskEdge[],
    readonly summary?: string
  ) {}

  static fromPlan(tasks: DagTask[], summary?: string): TaskGraph {
    if (new Set(tasks.map((task) => task.id)).size !== tasks.length) {
      throw new Error('DAG 规划包含重复节点 id');
    }

    const nodes = new Map(tasks.map((task) => [task.id, TaskGraph.createNode(task)]));
    const graph = new TaskGraph(
      nodes,
      tasks.flatMap((task) => task.dependsOn.map((from) => ({from, to: task.id}))),
      summary
    );
    graph.validate('DAG 规划');
    return graph;
  }

  readyNodes(): TaskNode[] {
    return [...this.nodes.values()].filter(
      (node) =>
        node.status === TASK_NODE_STATUS.PENDING &&
        node.dependsOn.every((id) => this.nodes.get(id)?.status === TASK_NODE_STATUS.DONE)
    );
  }

  failedNodes(): TaskNode[] {
    return [...this.nodes.values()].filter((node) => node.status === TASK_NODE_STATUS.FAILED);
  }

  pendingNodes(): TaskNode[] {
    return [...this.nodes.values()].filter((node) => node.status === TASK_NODE_STATUS.PENDING);
  }

  skippedNodes(): TaskNode[] {
    return [...this.nodes.values()].filter((node) => node.status === TASK_NODE_STATUS.SKIPPED);
  }

  mergeNode(): TaskNode | undefined {
    return [...this.nodes.values()].find((node) => node.kind === 'merge');
  }

  replanSet(failedNodeIds: string[]): Set<string> {
    const affected = new Set<string>();
    const queue = [...failedNodeIds];
    const successors = new Map<string, string[]>();

    for (const edge of this.edges) {
      const ids = successors.get(edge.from) ?? [];
      ids.push(edge.to);
      successors.set(edge.from, ids);
    }

    while (queue.length) {
      const id = queue.shift()!;
      const node = this.nodes.get(id);
      if (!node || node.status === TASK_NODE_STATUS.DONE || affected.has(id)) {
        continue;
      }

      affected.add(id);
      queue.push(...(successors.get(id) ?? []));
    }

    return affected;
  }

  externalDoneNodeIds(affected: Set<string>): string[] {
    const external = new Set<string>();

    for (const id of affected) {
      for (const predecessorId of this.nodes.get(id)?.dependsOn ?? []) {
        if (
          !affected.has(predecessorId) &&
          this.nodes.get(predecessorId)?.status === TASK_NODE_STATUS.DONE
        ) {
          external.add(predecessorId);
        }
      }
    }

    return [...external];
  }

  private cycle(): string[] | undefined {
    const graph = createGraphFromEdges(this.nodes.keys(), this.edges);
    if (alg.isAcyclic(graph)) {
      return undefined;
    }

    const cycle = alg.findCycles(graph)[0];
    return cycle?.length ? [...cycle, cycle[0]] : undefined;
  }

  replaceSubgraph(plan: DagSubgraphPlan): void {
    const nodes = new Map(this.nodes);
    for (const task of plan.tasks) {
      nodes.set(task.id, TaskGraph.createNode(task));
    }

    const edges = [...nodes.values()].flatMap((node) =>
      node.dependsOn.map((from) => ({from, to: node.id}))
    );
    const candidate = new TaskGraph(nodes, edges, this.summary);
    candidate.validate('DAG 子图重规划');

    this.nodes.clear();
    nodes.forEach((node, id) => this.nodes.set(id, node));
    this.edges.splice(0, this.edges.length, ...edges);
  }

  serialize(): SerializedTaskGraph {
    return {
      summary: this.summary,
      nodes: [...this.nodes.values()].map(({id, kind, goal, dependsOn, status, error}) => ({
        id,
        kind,
        goal,
        dependsOn,
        status,
        error
      })),
      edges: [...this.edges]
    };
  }

  private static createNode(task: DagTask): TaskNode {
    return new TaskNode({
      id: task.id,
      kind: task.kind,
      goal: task.goal,
      dependsOn: task.dependsOn
    });
  }

  private validate(label: string): void {
    for (const node of this.nodes.values()) {
      const unknown = node.dependsOn.find((id) => !this.nodes.has(id));
      if (unknown) {
        throw new Error(`${label}任务 ${node.id} 依赖未知节点：${unknown}`);
      }
    }

    const mergeCount = [...this.nodes.values()].filter((node) => node.kind === 'merge').length;
    if (mergeCount !== 1) {
      throw new Error(`${label}必须包含恰好 1 个 merge 节点，当前为 ${mergeCount}`);
    }

    const cycle = this.cycle();
    if (cycle) {
      throw new Error(`${label}存在环：${cycle.join(' → ')}`);
    }
  }
}
