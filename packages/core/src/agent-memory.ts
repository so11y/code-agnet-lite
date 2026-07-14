import {compact, union} from 'lodash-es';
import {createEmptyTurnOperations, type TurnOperations} from './types/operations.js';

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
  operations: TurnOperations = createEmptyTurnOperations();

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
      this.operations.writtenFiles = union(
        this.operations.writtenFiles,
        source.operations.writtenFiles
      );
      this.operations.deletedFiles = union(
        this.operations.deletedFiles,
        source.operations.deletedFiles
      );
      this.operations.executedCommands = union(
        this.operations.executedCommands,
        source.operations.executedCommands
      );
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
