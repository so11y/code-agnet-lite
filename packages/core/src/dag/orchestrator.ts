import type {AgentSession} from '../session.js';
import {joinSections} from '@code-agent-lite/shared';
import {DagScheduler} from './dag-scheduler.js';
import {llmPlanDag, llmReplanSubgraph} from './dag-planner.js';
import {TaskGraph} from './task-graph.js';
import {
  Blackboard,
  TASK_NODE_STATUS,
  type TaskNode
} from './dag-model.js';

const MAX_SUBGRAPH_REPLANS = 1;

class DagOrchestrator {
  private readonly blackboard = new Blackboard();
  private graph!: TaskGraph;
  private replanAttempts = 0;

  constructor(
    private readonly session: AgentSession,
    private readonly input: string
  ) {}

  async run(): Promise<boolean> {
    try {
      this.graph = await llmPlanDag(this.input, this.session);
      await new DagScheduler(this.graph, {
        session: this.session,
        blackboard: this.blackboard,
        userInput: this.input,
        tryRecoverFailures: (failed) => this.recover(failed)
      }).run();
      return this.finish();
    } finally {
      this.session.ledger.mergeMemory(this.blackboard);
    }
  }

  private async recover(failed: TaskNode[]): Promise<boolean> {
    if (this.replanAttempts >= MAX_SUBGRAPH_REPLANS) {
      return false;
    }

    this.session.throwIfAborted();
    const replanSet = this.graph.replanSet(failed.map((node) => node.id));
    const doneSummaries = Object.fromEntries(
      this.graph
        .externalDoneNodeIds(replanSet)
        .map((id) => [id, this.blackboard.nodeOutputs.get(id)?.summary ?? ''])
    );

    this.session.events.say('system', `DAG 恢复：重规划节点 ${[...replanSet].join('、')}`);
    const plan = await llmReplanSubgraph(this.input, this.session, {
      replanSet: [...replanSet],
      failedNodes: failed.map((node) => ({
        id: node.id,
        error: node.error,
        partialOperations: this.blackboard.nodeOutputs.get(node.id)?.operations
      })),
      doneSummaries,
      originalGraphSummary: this.graph.summary
    });

    this.graph.replaceSubgraph(plan);
    this.replanAttempts += 1;
    return true;
  }

  private finish(): boolean {
    const mergeNode = this.graph.mergeNode();
    if (mergeNode?.status === TASK_NODE_STATUS.DONE && mergeNode.output?.summary) {
      this.session.events.status('done', '完成');
      return true;
    }

    this.graph.pendingNodes().forEach((node) => node.skip());

    this.session.events.emit({type: 'dag_snapshot', graph: this.graph.serialize()});
    const failed = this.graph.failedNodes();
    const skipped = this.graph.skippedNodes();

    if (failed.length > 0 || skipped.length > 0) {
      this.session.events.status('error', 'DAG 未完整完成');
      this.session.events.say(
        'system',
        joinSections(
          failed.length > 0
            ? `失败节点：${failed.map((node) => `${node.id}（${node.error ?? '未知'}）`).join('；')}`
            : '',
          skipped.length > 0 ? `跳过节点：${skipped.map((node) => node.id).join('、')}` : ''
        )
      );
      return false;
    }

    this.session.events.status('error', 'DAG 未完成 merge 节点');
    return false;
  }
}

export function runDagTurn(session: AgentSession, input: string): Promise<boolean> {
  return new DagOrchestrator(session, input).run();
}
