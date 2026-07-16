import {difference, isEqual} from 'lodash-es';
import type {SessionState} from './agent-memory.js';
import {TurnOperations} from './types/operations.js';

export type InjectedSnapshot = Pick<
  SessionState,
  'facts' | 'hypotheses' | 'rejected' | 'confidence' | 'visitedFiles' | 'searchedTerms'
> & {
  operations: SessionState['operations'];
};

export type StateDelta = {
  addedFacts?: string[];
  addedRejected?: string[];
  hypotheses?: string[];
  confidence?: {from: number; to: number};
  addedVisited?: string[];
  addedSearched?: string[];
  addedWritten?: string[];
  addedDeleted?: string[];
  addedCommands?: string[];
};

const ROLLUP_VISITED_THRESHOLD = 10;
const ROLLUP_RECENT_COUNT = 5;
const ROLLUP_EVERY_STEPS = 5;

export function createInjectedSnapshot(): InjectedSnapshot {
  return {
    facts: [],
    hypotheses: [],
    rejected: [],
    confidence: 0,
    visitedFiles: [],
    searchedTerms: [],
    operations: new TurnOperations()
  };
}

export function buildInjectedSnapshot(state: SessionState): InjectedSnapshot {
  return {
    facts: [...state.facts],
    hypotheses: [...state.hypotheses],
    rejected: [...state.rejected],
    confidence: state.confidence,
    visitedFiles: [...state.visitedFiles],
    searchedTerms: [...state.searchedTerms],
    operations: state.operations.clone()
  };
}

function diffTurnList(prev: string[], next: string[]): string[] | undefined {
  const added = difference(next, prev);
  return added.length ? added : undefined;
}

export function diffInjectedSnapshot(prev: InjectedSnapshot, next: InjectedSnapshot): StateDelta | null {
  const delta: StateDelta = {};

  const addedFacts = difference(next.facts, prev.facts);
  if (addedFacts.length) {
    delta.addedFacts = addedFacts;
  }

  const addedRejected = difference(next.rejected, prev.rejected);
  if (addedRejected.length) {
    delta.addedRejected = addedRejected;
  }

  if (!isEqual(prev.hypotheses, next.hypotheses)) {
    delta.hypotheses = next.hypotheses;
  }

  if (prev.confidence !== next.confidence) {
    delta.confidence = {from: prev.confidence, to: next.confidence};
  }

  const addedVisited = diffTurnList(prev.visitedFiles, next.visitedFiles);
  if (addedVisited) {
    delta.addedVisited = addedVisited;
  }

  const addedSearched = diffTurnList(prev.searchedTerms, next.searchedTerms);
  if (addedSearched) {
    delta.addedSearched = addedSearched;
  }

  const addedWritten = diffTurnList(prev.operations.writtenFiles, next.operations.writtenFiles);
  if (addedWritten) {
    delta.addedWritten = addedWritten;
  }

  const addedDeleted = diffTurnList(prev.operations.deletedFiles, next.operations.deletedFiles);
  if (addedDeleted) {
    delta.addedDeleted = addedDeleted;
  }

  const addedCommands = diffTurnList(
    prev.operations.executedCommands,
    next.operations.executedCommands
  );
  if (addedCommands) {
    delta.addedCommands = addedCommands;
  }

  const hasDelta = Boolean(
    delta.addedFacts?.length ||
      delta.addedRejected?.length ||
      delta.hypotheses ||
      delta.confidence ||
      delta.addedVisited?.length ||
      delta.addedSearched?.length ||
      delta.addedWritten?.length ||
      delta.addedDeleted?.length ||
      delta.addedCommands?.length
  );

  return hasDelta ? delta : null;
}

export function formatStateDelta(step: number, delta: StateDelta, internal: SessionState): string {
  const lines = [`[stateΔ step=${step}]`];

  for (const fact of delta.addedFacts ?? []) {
    lines.push(`+ fact: ${fact}`);
  }

  for (const item of delta.addedRejected ?? []) {
    lines.push(`+ rejected: ${item}`);
  }

  if (delta.hypotheses) {
    if (delta.hypotheses.length) {
      lines.push('= hypotheses:');
      for (const hypothesis of delta.hypotheses) {
        lines.push(`  - ${hypothesis}`);
      }
    } else {
      lines.push('= hypotheses: (空)');
    }
  }

  if (delta.confidence) {
    lines.push(`~ confidence: ${delta.confidence.from.toFixed(2)} → ${delta.confidence.to.toFixed(2)}`);
  }

  for (const path of delta.addedVisited ?? []) {
    lines.push(`+ 已访问: ${path}`);
  }

  for (const term of delta.addedSearched ?? []) {
    lines.push(`+ 已搜索: ${term}`);
  }

  for (const path of delta.addedWritten ?? []) {
    lines.push(`+ written this turn: ${path}`);
  }

  for (const path of delta.addedDeleted ?? []) {
    lines.push(`+ deleted this turn: ${path}`);
  }

  for (const command of delta.addedCommands ?? []) {
    lines.push(`+ command this turn: ${command}`);
  }

  const totalVisited = internal.visitedFiles.length;
  if (totalVisited >= ROLLUP_VISITED_THRESHOLD && step % ROLLUP_EVERY_STEPS === 0) {
    const recent = internal.visitedFiles.slice(-ROLLUP_RECENT_COUNT);
    lines.push(`# 已访问共 ${totalVisited} 个，最近:`);
    for (const path of recent) {
      lines.push(`  - ${path}`);
    }
  }

  return lines.join('\n');
}
