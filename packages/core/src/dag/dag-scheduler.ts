import type {AgentSession} from '../session.js';
import {findReadyNodes, hasIncompleteNodes, skipDownstream, skipNodesWithBlockedPredecessors} from './graph-utils.js';
import {ResourceManager} from './resource-manager.js';
import {runMergeNode, runVerifyNode} from './dag-nodes.js';
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

type RunningTask = {
  nodeId: string;
  promise: Promise<{nodeId: string; output?: TaskOutput; error?: string}>;
};

function emitSnapshot(session: AgentSession, graph: TaskGraph) {
  session.options.onEvent({
    type: 'dag_snapshot',
    graph: serializeTaskGraph(graph)
  });
}

export async function runDag(graph: TaskGraph, context: DagRunContext): Promise<void> {
  const options = {...DEFAULT_DAG_OPTIONS, ...context.options};
  const resourceManager = new ResourceManager();
  const running = new Map<string, RunningTask>();

  emitSnapshot(context.session, graph);

  while (hasIncompleteNodes(graph) || running.size > 0) {
    skipNodesWithBlockedPredecessors(graph);
    const ready = findReadyNodes(graph);

    for (const node of ready) {
      if (running.size >= options.maxParallel) {
        break;
      }

      if (!resourceManager.tryAcquire(node)) {
        continue;
      }

      node.status = 'running';
      context.session.options.onEvent({type: 'task_start', nodeId: node.id, kind: node.kind});

      const promise = executeNode(node, context, resourceManager, options.workerMaxSteps).then((result) => {
        resourceManager.release(node.id);
        return result;
      });

      running.set(node.id, {nodeId: node.id, promise});
    }

    if (running.size === 0) {
      if (!hasIncompleteNodes(graph)) {
        break;
      }

      if (ready.length === 0) {
        throw new Error('DAG 调度死锁：存在 pending 节点但依赖未满足');
      }

      const blocked = ready.map((node) => node.id).join('、');
      throw new Error(
        `DAG 调度阻塞：就绪节点（${blocked}）无法获取资源锁，请检查并行节点的 reads/writes 声明`
      );
    }

    const result = await Promise.race([...running.values()].map((task) => task.promise));
    running.delete(result.nodeId);

    const node = graph.nodes.get(result.nodeId);
    if (!node) {
      continue;
    }

    if (result.error) {
      node.status = 'failed';
      node.error = result.error;
      context.session.options.onEvent({
        type: 'task_end',
        nodeId: node.id,
        error: result.error
      });
      skipDownstream(graph, node.id);
      emitSnapshot(context.session, graph);
      continue;
    }

    node.status = 'done';
    node.output = result.output;
    if (result.output) {
      context.blackboard.mergeNodeOutput(node.id, result.output);
    }

    context.session.options.onEvent({
      type: 'task_end',
      nodeId: node.id,
      output: result.output
    });
    emitSnapshot(context.session, graph);
  }
}

async function executeNode(
  node: TaskNode,
  context: DagRunContext,
  resourceManager: ResourceManager,
  workerMaxSteps: number
): Promise<{nodeId: string; output?: TaskOutput; error?: string}> {
  try {
    let output: TaskOutput;

    switch (node.kind) {
      case 'explore':
      case 'edit':
        output = await runWorkerNode(
          node,
          context.blackboard,
          context.session,
          resourceManager,
          workerMaxSteps
        );
        break;
      case 'verify':
        output = await runVerifyNode(node, context.session.cwd);
        break;
      case 'merge':
        output = await runMergeNode(node, context.blackboard, context.session, context.userInput);
        break;
      default:
        throw new Error(`未知节点类型：${String(node.kind)}`);
    }

    return {nodeId: node.id, output};
  } catch (error) {
    return {
      nodeId: node.id,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
