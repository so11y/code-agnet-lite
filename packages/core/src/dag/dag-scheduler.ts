import type {AgentSession} from '../session.js';
import {formatError} from '@code-agent-lite/shared';
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

export class DagScheduler {
  private readonly options: DagSchedulerOptions;
  private readonly resourceCtx: ResourceContext;
  private readonly semaphore: Semaphore;
  private readonly results = new Map<string, Promise<NodeResult>>();

  constructor(
    private readonly graph: TaskGraph,
    private readonly context: DagRunContext
  ) {
    this.options = {...DEFAULT_DAG_OPTIONS, ...context.options};
    this.resourceCtx = createResourceContext();
    this.semaphore = new Semaphore(this.options.maxParallel);
  }

  async run(): Promise<void> {
    this.emitSnapshot();

    for (const node of this.graph.nodes.values()) {
      this.results.set(node.id, this.runNode(node));
    }

    await Promise.all([...this.results.values()]);
  }

  private emitSnapshot() {
    this.context.session.options.onEvent({
      type: 'dag_snapshot',
      graph: serializeTaskGraph(this.graph)
    });
  }

  private async runNode(node: TaskNode): Promise<NodeResult> {
    try {
      const predResults = await Promise.all(
        node.dependsOn.map((id) => this.results.get(id)!)
      );

      const failed = predResults.find((result) => result.error);
      if (failed) {
        node.status = 'skipped';
        node.error = '上游节点失败，已跳过';
        this.emitSnapshot();
        return {nodeId: node.id, error: node.error};
      }

      const [, releaseSemaphore] = await this.semaphore.acquire();

      try {
        const releases = await this.acquireNodeResources(node);

        try {
          node.status = 'running';
          this.context.session.options.onEvent({
            type: 'task_start',
            nodeId: node.id,
            kind: node.kind
          });
          this.emitSnapshot();

          const output = await this.executeNode(node);

          node.status = 'done';
          node.output = output;
          this.context.blackboard.mergeNodeOutput(node.id, output);
          this.context.session.options.onEvent({
            type: 'task_end',
            nodeId: node.id,
            output
          });
          this.emitSnapshot();

          return {nodeId: node.id, output};
        } finally {
          releases.forEach((release) => release());
        }
      } finally {
        releaseSemaphore();
      }
    } catch (error) {
      const message = formatError(error);
      node.status = 'failed';
      node.error = message;
      this.context.session.options.onEvent({
        type: 'task_end',
        nodeId: node.id,
        error: message
      });
      this.emitSnapshot();
      return {nodeId: node.id, error: message};
    }
  }

  private async acquireNodeResources(node: TaskNode): Promise<ReleaseHandle[]> {
    const releases: ReleaseHandle[] = [];
    const holder = node.id;

    for (const filePath of node.resources.reads) {
      releases.push(await this.resourceCtx.acquireRead(filePath, holder));
    }

    for (const filePath of node.resources.writes) {
      releases.push(await this.resourceCtx.acquireWrite(filePath, holder));
    }

    if (node.resources.commands.length > 0) {
      releases.push(await this.resourceCtx.acquireCommand(holder));
    }

    return releases;
  }

  private async executeNode(node: TaskNode): Promise<TaskOutput> {
    switch (node.kind) {
      case 'explore':
      case 'edit':
        return runWorkerNode(
          node,
          this.context.blackboard,
          this.context.session,
          this.resourceCtx,
          this.options.workerMaxSteps
        );
      case 'verify':
        return runVerifyNode(node, this.context.session.cwd);
      case 'merge':
        return runMergeNode(
          node,
          this.context.blackboard,
          this.context.session,
          this.context.userInput
        );
      default:
        throw new Error(`未知节点类型：${String(node.kind)}`);
    }
  }
}

export async function runDag(graph: TaskGraph, context: DagRunContext): Promise<void> {
  await new DagScheduler(graph, context).run();
}
