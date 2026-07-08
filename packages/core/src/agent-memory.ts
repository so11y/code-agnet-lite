import {compact, union} from 'lodash-es';

export type MemoryOperations = {
  writtenFiles: string[];
  deletedFiles: string[];
  executedCommands: string[];
};

export type MemoryMergeSource = {
  facts?: string[];
  visitedFiles?: string[];
  searchedTerms?: string[];
  operations?: MemoryOperations;
};

/** 通用程序侧记忆：文件访问、操作记录、facts */
export class BaseMemory {
  facts: string[] = [];
  visitedFiles: string[] = [];
  searchedTerms: string[] = [];
  writtenFiles: string[] = [];
  deletedFiles: string[] = [];
  executedCommands: string[] = [];

  addFacts(items: string[]) {
    this.facts = union(this.facts, compact(items));
  }

  protected appendUnique(target: string[], items: string[]) {
    for (const item of items) {
      if (!target.includes(item)) {
        target.push(item);
      }
    }
  }

  mergeLists(source: Pick<MemoryMergeSource, 'facts' | 'visitedFiles' | 'searchedTerms'>) {
    if (source.facts?.length) {
      this.addFacts(source.facts);
    }

    if (source.visitedFiles?.length) {
      this.appendUnique(this.visitedFiles, source.visitedFiles);
    }

    if (source.searchedTerms?.length) {
      this.appendUnique(this.searchedTerms, source.searchedTerms);
    }
  }

  mergeOperations(operations: MemoryOperations) {
    this.appendUnique(this.writtenFiles, operations.writtenFiles);
    this.appendUnique(this.deletedFiles, operations.deletedFiles);
    this.appendUnique(this.executedCommands, operations.executedCommands);
  }

  mergeFrom(source: MemoryMergeSource) {
    this.mergeLists(source);

    if (source.operations) {
      this.mergeOperations(source.operations);
    }
  }
}

/** 单 Agent 推理记忆：在 BaseMemory 上增加 hypotheses / confidence 等 */
export class AgentMemory extends BaseMemory {
  hypotheses: string[] = [];
  rejected: string[] = [];
  noProgress = 0;
  confidence = 0;
}

export function createAgentMemory(): AgentMemory {
  return new AgentMemory();
}
