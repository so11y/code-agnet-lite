import type {AgentSession} from '../session.js';
import {runMergeNode, runVerifyNode} from './dag-nodes.js';
import {createResourceContext, Semaphore, type ReleaseHandle, type ResourceContext} from './resource-context.js';
import {
  DEFAULT_DAG_OPTIONS,
  serializeTaskGraph,
  type Blackboard,
  type DagSchedulerOptions,
  type TaskGraph,
  type TaskNode,
  type TaskOutput
} from './types.js';
import {runWorkerNode} from './worker.js';

export type DagRunContext = {
  session: AgentSession;
  blackboard: Blackboard;
  userInput: string;
  options?: Partial<DagSchedulerOptions>;
};

type NodeResult = {nodeId: string; output?: TaskOutput; error?: string};

type NodeDeps = {
  graph: TaskGraph;
  results: Map<string, Promise<NodeResult>>;
  resourceCtx: ResourceContext;
  semaphore: Semaphore;
  context: DagRunContext;
  workerMaxSteps: number;
};

function emitSnapshot(session: AgentSession, graph: TaskGraph) {
  session.options.onEvent({
    type: 'dag_snapshot',
    graph: serializeTaskGraph(graph)
  });
}

export async function runDag(graph: TaskGraph, context: DagRunContext): Promise<void> {
  const options = {...DEFAULT_DAG_OPTIONS, ...context.options};
  const resourceCtx = createResourceContext();
  const semaphore = new Semaphore(options.maxParallel);
  const results = new Map<string, Promise<NodeResult>>();

  emitSnapshot(context.session, graph);

  for (const node of graph.nodes.values()) {
    results.set(
      node.id,
      runNode(node, {
        graph,
        results,
        resourceCtx,
        semaphore,
        context,
        workerMaxSteps: options.workerMaxSteps
      })
    );
  }

  await Promise.all([...results.values()]);
}

async function runNode(node: TaskNode, deps: NodeDeps): Promise<NodeResult> {
  try {
    const predResults = await Promise.all(
      node.dependsOn.map((id) => deps.results.get(id)!)
    );

    const failed = predResults.find((result) => result.error);
    if (failed) {
      node.status = 'skipped';
      node.error = '上游节点失败，已跳过';
      emitSnapshot(deps.context.session, deps.graph);
      return {nodeId: node.id, error: node.error};
    }

    await deps.semaphore.acquire();

    try {
      const releases = await acquireNodeResources(node, deps.resourceCtx);

      try {
        node.status = 'running';
        deps.context.session.options.onEvent({
          type: 'task_start',
          nodeId: node.id,
          kind: node.kind
        });
        emitSnapshot(deps.context.session, deps.graph);

        const output = await executeNode(
          node,
          deps.context,
          deps.resourceCtx,
          deps.workerMaxSteps
        );

        node.status = 'done';
        node.output = output;
        deps.context.blackboard.mergeNodeOutput(node.id, output);
        deps.context.session.options.onEvent({
          type: 'task_end',
          nodeId: node.id,
          output
        });
        emitSnapshot(deps.context.session, deps.graph);

        return {nodeId: node.id, output};
      } finally {
        releases.forEach((release) => release());
      }
    } finally {
      deps.semaphore.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    node.status = 'failed';
    node.error = message;
    deps.context.session.options.onEvent({
      type: 'task_end',
      nodeId: node.id,
      error: message
    });
    emitSnapshot(deps.context.session, deps.graph);
    return {nodeId: node.id, error: message};
  }
}

async function acquireNodeResources(
  node: TaskNode,
  ctx: ResourceContext
): Promise<ReleaseHandle[]> {
  const releases: ReleaseHandle[] = [];
  const holder = node.id;

  for (const filePath of node.resources.reads) {
    releases.push(await ctx.acquireRead(filePath, holder));
  }

  for (const filePath of node.resources.writes) {
    releases.push(await ctx.acquireWrite(filePath, holder));
  }

  if (node.resources.commands.length > 0) {
    releases.push(await ctx.acquireCommand(holder));
  }

  return releases;
}

async function executeNode(
  node: TaskNode,
  context: DagRunContext,
  resourceCtx: ResourceContext,
  workerMaxSteps: number
): Promise<TaskOutput> {
  switch (node.kind) {
    case 'explore':
    case 'edit':
      return runWorkerNode(
        node,
        context.blackboard,
        context.session,
        resourceCtx,
        workerMaxSteps
      );
    case 'verify':
      return runVerifyNode(node, context.session.cwd);
    case 'merge':
      return runMergeNode(node, context.blackboard, context.session, context.userInput);
    default:
      throw new Error(`未知节点类型：${String(node.kind)}`);
  }
}
