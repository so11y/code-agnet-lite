import {
  buildInjectedSnapshot,
  createInjectedSnapshot,
  diffInjectedSnapshot,
  formatStateDelta,
  type InjectedSnapshot
} from './state-ai-view.js';
import type {SessionState} from './agent-memory.js';
import type {TurnOperations} from './session-types.js';
import {createEmptyTurnOperations} from './types/operations.js';

export type StateDeltaProjectorState = {
  lastInjected: InjectedSnapshot;
  deltaStep: number;
};

export function createStateDeltaProjectorState(): StateDeltaProjectorState {
  return {
    lastInjected: createInjectedSnapshot(),
    deltaStep: 0
  };
}

export function resetTurnOperationsProjection(projector: StateDeltaProjectorState): void {
  projector.lastInjected = {
    ...projector.lastInjected,
    turnOps: createEmptyTurnOperations()
  };
}

export function flushStateDelta(
  projector: StateDeltaProjectorState,
  state: SessionState,
  turnOps: TurnOperations,
  addNote: (content: string) => void
): void {
  const next = buildInjectedSnapshot(state, turnOps);
  const delta = diffInjectedSnapshot(projector.lastInjected, next);

  if (!delta) {
    return;
  }

  projector.deltaStep += 1;
  addNote(formatStateDelta(projector.deltaStep, delta, state));
  projector.lastInjected = next;
}
