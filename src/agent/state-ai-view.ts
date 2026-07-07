import {isEqual} from 'lodash-es';
import type {InternalState, TurnOperations} from './session-types.js';

export type InjectedSnapshot = {
  facts: string[];
  hypotheses: string[];
  rejected: string[];
  confidence: number;
  visitedFiles: string[];
  searchedTerms: string[];
  turnOps: TurnOperations;
};

export type StateDelta = {
  addedFacts?: string[];
  addedRejected?: string[];
  hypotheses?: string[];
  confidence?: {from: number; to: number};
  addedVisited?: string[];
  addedSearched?: string[];
  turnOps?: TurnOperations;
};

const ROLLUP_VISITED_THRESHOLD = 10;
const ROLLUP_RECENT_COUNT = 5;
const ROLLUP_EVERY_STEPS = 5;
const EMPTY_TURN = '(无)';

export function createInjectedSnapshot(): InjectedSnapshot {
  return {
    facts: [],
    hypotheses: [],
    rejected: [],
    confidence: 0,
    visitedFiles: [],
    searchedTerms: [],
    turnOps: {writtenFiles: [], deletedFiles: [], executedCommands: []}
  };
}

export function buildInjectedSnapshot(state: InternalState, turnOps: TurnOperations): InjectedSnapshot {
  return {
    facts: [...state.facts],
    hypotheses: [...state.hypotheses],
    rejected: [...state.rejected],
    confidence: state.confidence,
    visitedFiles: [...state.visitedFiles],
    searchedTerms: [...state.searchedTerms],
    turnOps: {
      writtenFiles: [...turnOps.writtenFiles],
      deletedFiles: [...turnOps.deletedFiles],
      executedCommands: [...turnOps.executedCommands]
    }
  };
}

export function diffInjectedSnapshot(prev: InjectedSnapshot, next: InjectedSnapshot): StateDelta | null {
  const delta: StateDelta = {};

  const addedFacts = next.facts.filter((fact) => !prev.facts.includes(fact));
  if (addedFacts.length) {
    delta.addedFacts = addedFacts;
  }

  const addedRejected = next.rejected.filter((item) => !prev.rejected.includes(item));
  if (addedRejected.length) {
    delta.addedRejected = addedRejected;
  }

  if (!isEqual(prev.hypotheses, next.hypotheses)) {
    delta.hypotheses = next.hypotheses;
  }

  if (prev.confidence !== next.confidence) {
    delta.confidence = {from: prev.confidence, to: next.confidence};
  }

  const addedVisited = next.visitedFiles.filter((path) => !prev.visitedFiles.includes(path));
  if (addedVisited.length) {
    delta.addedVisited = addedVisited;
  }

  const addedSearched = next.searchedTerms.filter((term) => !prev.searchedTerms.includes(term));
  if (addedSearched.length) {
    delta.addedSearched = addedSearched;
  }

  if (!isEqual(prev.turnOps, next.turnOps)) {
    delta.turnOps = next.turnOps;
  }

  const hasDelta = Boolean(
    delta.addedFacts?.length ||
      delta.addedRejected?.length ||
      delta.hypotheses ||
      delta.confidence ||
      delta.addedVisited?.length ||
      delta.addedSearched?.length ||
      delta.turnOps
  );

  return hasDelta ? delta : null;
}

function formatTurnList(label: string, items: string[]): string {
  return `# ${label}: ${items.length ? items.join(', ') : EMPTY_TURN}`;
}

export function formatStateDelta(step: number, delta: StateDelta, internal: InternalState): string {
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

  if (delta.turnOps) {
    lines.push(formatTurnList('written this turn', delta.turnOps.writtenFiles));
    lines.push(formatTurnList('deleted this turn', delta.turnOps.deletedFiles));
    lines.push(formatTurnList('commands this turn', delta.turnOps.executedCommands));
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
