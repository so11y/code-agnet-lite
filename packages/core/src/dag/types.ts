import {BaseMemory} from '../agent-memory.js';
import type {TurnOperations} from '../types/operations.js';

export type TaskNodeKind = 'explore' | 'edit' | 'verify' | 'merge';

export type TaskNodeStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export type ResourceClaim = {
  reads: string[];
  writes: string[];
  commands: string[];
};

export type TaskOutput = {
  summary: string;
  operations: TurnOperations;
  facts: string[];
  visitedFiles: string[];
  searchedTerms: string[];
};

export type TaskNode = {
  id: string;
  kind: TaskNodeKind;
  goal: string;
  resources: ResourceClaim;
  dependsOn: string[];
  status: TaskNodeStatus;
  output?: TaskOutput;
  error?: string;
};

export type TaskEdge = {
  from: string;
  to: string;
};

export type TaskGraph = {
  nodes: Map<string, TaskNode>;
  edges: TaskEdge[];
  summary?: string;
};

/** DAG Orchestrator 全局记忆：BaseMemory + 各节点产出 */
export class Blackboard extends BaseMemory {
  nodeOutputs = new Map<string, TaskOutput>();

  mergeNodeOutput(nodeId: string, output: TaskOutput) {
    this.nodeOutputs.set(nodeId, output);
    this.mergeFrom({
      facts: output.facts,
      visitedFiles: output.visitedFiles,
      searchedTerms: output.searchedTerms,
      operations: output.operations
    });
  }
}

export type SerializedTaskNode = Omit<TaskNode, 'output'> & {
  output?: TaskOutput;
};

export type SerializedTaskGraph = {
  summary?: string;
  nodes: SerializedTaskNode[];
  edges: TaskEdge[];
};

export type DagSchedulerOptions = {
  maxParallel: number;
  workerMaxSteps: number;
};

export const DEFAULT_DAG_OPTIONS: DagSchedulerOptions = {
  maxParallel: 3,
  workerMaxSteps: 20
};

export function createBlackboard(): Blackboard {
  return new Blackboard();
}

export function serializeTaskGraph(graph: TaskGraph): SerializedTaskGraph {
  return {
    summary: graph.summary,
    nodes: [...graph.nodes.values()].map((node) => ({...node})),
    edges: [...graph.edges]
  };
}

export function createTaskOutput(partial: {
  summary: string;
  operations: TurnOperations;
  facts?: string[];
  visitedFiles?: string[];
  searchedTerms?: string[];
}): TaskOutput {
  return {
    summary: partial.summary,
    operations: partial.operations,
    facts: partial.facts ?? [],
    visitedFiles: partial.visitedFiles ?? [],
    searchedTerms: partial.searchedTerms ?? []
  };
}
