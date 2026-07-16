import {BaseMemory, type MemoryMergeSource} from '../agent-memory.js';
import {formatError} from '@code-agent-lite/shared';
import type {VerificationOutcome} from '../session-types.js';

export const TASK_NODE_KINDS = ['explore', 'edit', 'verify', 'merge'] as const;
export type TaskNodeKind = (typeof TASK_NODE_KINDS)[number];

export const TASK_NODE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
  SKIPPED: 'skipped'
} as const;

export type TaskNodeStatus = typeof TASK_NODE_STATUS[keyof typeof TASK_NODE_STATUS];

export class TaskOutput extends BaseMemory {
  summary: string;
  verification?: VerificationOutcome;

  constructor(
    source: MemoryMergeSource & {summary?: string; verification?: VerificationOutcome} = {}
  ) {
    super();
    this.summary = source.summary ?? '';
    this.verification = source.verification;
    this.mergeFrom(source);
  }
}

type TaskNodeInit = {
  id: string;
  kind: TaskNodeKind;
  goal: string;
  dependsOn: string[];
};

export class TaskNode {
  readonly id: string;
  readonly kind: TaskNodeKind;
  readonly goal: string;
  readonly dependsOn: string[];
  status: TaskNodeStatus;
  output?: TaskOutput;
  error?: string;

  constructor(init: TaskNodeInit) {
    this.id = init.id;
    this.kind = init.kind;
    this.goal = init.goal;
    this.dependsOn = [...new Set(init.dependsOn)];
    this.status = TASK_NODE_STATUS.PENDING;
  }

  async run(execute: () => Promise<TaskOutput>): Promise<TaskOutput> {
    this.status = TASK_NODE_STATUS.RUNNING;
    this.output = undefined;
    this.error = undefined;

    try {
      const output = await execute();
      this.status = TASK_NODE_STATUS.DONE;
      this.output = output;
      return output;
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  fail(error: unknown): string {
    const message = formatError(error);
    this.status = TASK_NODE_STATUS.FAILED;
    this.error = message;
    return message;
  }

  skip(message = '上游节点失败，已跳过') {
    this.status = TASK_NODE_STATUS.SKIPPED;
    this.error = message;
  }
}

export type TaskEdge = {
  from: string;
  to: string;
};

type TaskNodeSnapshot = Pick<
  TaskNode,
  'id' | 'kind' | 'goal' | 'dependsOn' | 'status' | 'error'
>;

/** DAG Orchestrator 全局记忆：BaseMemory + 各节点产出 */
export class Blackboard extends BaseMemory {
  readonly nodeOutputs = new Map<string, TaskOutput>();

  mergeNodeOutput(nodeId: string, output: TaskOutput) {
    this.nodeOutputs.set(nodeId, output);
    this.mergeFrom(output);
  }
}

export type SerializedTaskGraph = {
  summary?: string;
  nodes: TaskNodeSnapshot[];
  edges: TaskEdge[];
};
