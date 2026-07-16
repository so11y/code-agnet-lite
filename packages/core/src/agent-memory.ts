import {compact, union} from 'lodash-es';
import {TurnOperations, type TurnOperationsSource} from './types/operations.js';

export type MemoryMergeSource = {
  facts?: string[];
  visitedFiles?: string[];
  searchedTerms?: string[];
  operations?: TurnOperationsSource;
};

/** 通用程序侧记忆：文件访问、操作记录、facts */
export class BaseMemory {
  facts: string[] = [];
  visitedFiles: string[] = [];
  searchedTerms: string[] = [];
  operations = new TurnOperations();

  mergeFrom(source: MemoryMergeSource) {
    if (source.facts?.length) {
      this.facts = union(this.facts, compact(source.facts));
    }

    if (source.visitedFiles?.length) {
      this.visitedFiles = union(this.visitedFiles, source.visitedFiles);
    }

    if (source.searchedTerms?.length) {
      this.searchedTerms = union(this.searchedTerms, source.searchedTerms);
    }

    if (source.operations) {
      this.operations.merge(source.operations);
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
