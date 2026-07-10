import {compact, union} from 'lodash-es';
import type {TurnOperations} from './types/operations.js';

export type MemoryMergeSource = {
  facts?: string[];
  visitedFiles?: string[];
  searchedTerms?: string[];
  operations?: TurnOperations;
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

  mergeLists(source: Pick<MemoryMergeSource, 'facts' | 'visitedFiles' | 'searchedTerms'>) {
    if (source.facts?.length) {
      this.addFacts(source.facts);
    }

    if (source.visitedFiles?.length) {
      this.visitedFiles = union(this.visitedFiles, source.visitedFiles);
    }

    if (source.searchedTerms?.length) {
      this.searchedTerms = union(this.searchedTerms, source.searchedTerms);
    }
  }

  mergeOperations(operations: TurnOperations) {
    this.writtenFiles = union(this.writtenFiles, operations.writtenFiles);
    this.deletedFiles = union(this.deletedFiles, operations.deletedFiles);
    this.executedCommands = union(this.executedCommands, operations.executedCommands);
  }

  mergeFrom(source: MemoryMergeSource) {
    this.mergeLists(source);

    if (source.operations) {
      this.mergeOperations(source.operations);
    }
  }
}

/** 单 Agent session 状态：在 BaseMemory 上增加 hypotheses / confidence 等 */
export class SessionState extends BaseMemory {
  hypotheses: string[] = [];
  rejected: string[] = [];
  noProgress = 0;
  confidence = 0;
}
