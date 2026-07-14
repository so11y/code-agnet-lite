import type {AgentSession} from '../session.js';
import {Semaphore} from 'async-mutex';
import {runMergeNode} from './merge-node.js';
import {VerifyCoordinator} from '../verify/verify-coordinator.js';
import {
  type Blackboard,
  type TaskNode,
  type TaskOutput
} from './dag-model.js';
import {TaskGraph} from './task-graph.js';
import {DagWorker} from './worker.js';

type DagSchedulerOptions = {
  maxParallel: number;
  workerMaxSteps: number;
};

const DEFAULT_DAG_OPTIONS: DagSchedulerOptions = {
  maxParallel: 3,
  workerMaxSteps: 20
};

type DagRunContext = {
  session: AgentSession;
  blackboard: Blackboard;
  userInput: string;
  options?: Partial<DagSchedulerOptions>;
  tryRecoverFailures?: (failedNodes: TaskNode[]) => Promise<boolean>;
};

export class DagScheduler {
  private readonly options: DagSchedulerOptions;
  private readonly semaphore: Semaphore;

  constructor(
    private readonly graph: TaskGraph,
    private readonly context: DagRunContext
  ) {
    this.options = {...DEFAULT_DAG_OPTIONS, ...context.options};
    this.semaphore = new Semaphore(this.options.maxParallel);
  }

  async run(): Promise<void> {
    this.context.session.events.status('thinking', 'DAG 执行');
    this.emitSnapshot();

    while (true) {
      this.context.session.throwIfAborted();

      const ready = this.graph.readyNodes();

      if (ready.length) {
        await Promise.all(ready.map((node) => this.runNode(node)));
        continue;
      }

      const failed = this.graph.failedNodes();
      if (failed.length && (await this.context.tryRecoverFailures?.(failed))) {
        this.emitSnapshot();
        continue;
      }

      return;
    }
  }

  private emitSnapshot() {
    this.context.session.events.emit({
      type: 'dag_snapshot',
      graph: this.graph.serialize()
    });
  }

  private async runNode(node: TaskNode): Promise<void> {
    try {
      await this.semaphore.runExclusive(async () => {
        const output = await node.run(async () => {
          this.context.session.events.emit({
            type: 'task_start',
            nodeId: node.id,
            kind: node.kind
          });
          this.emitSnapshot();
          return this.executeNode(node);
        });

        this.context.blackboard.mergeNodeOutput(node.id, output);
        this.context.session.events.emit({
          type: 'task_end',
          nodeId: node.id,
          output
        });
        this.emitSnapshot();
      });
    } catch (error) {
      const message = node.error ?? node.fail(error);
      this.context.session.events.emit({
        type: 'task_end',
        nodeId: node.id,
        error: message
      });
      this.emitSnapshot();
    }
  }

  private async executeNode(node: TaskNode): Promise<TaskOutput> {
    switch (node.kind) {
      case 'explore':
      case 'edit':
        return new DagWorker(
          node,
          this.context.blackboard,
          this.context.session,
          this.options.workerMaxSteps
        ).run();
      case 'verify':
        return new VerifyCoordinator(this.context.session.cwd).runNodeVerify(node);
      case 'merge':
        return runMergeNode(
          this.context.blackboard,
          this.context.session,
          this.context.userInput
        );
      default:
        throw new Error(`未知节点类型：${String(node.kind)}`);
    }
  }
}
