import {
  buildInjectedSnapshot,
  createInjectedSnapshot,
  diffInjectedSnapshot,
  formatStateDelta
} from './state-ai-view.js';
import type {InternalState, TurnOperations} from './session-types.js';

export class StateDeltaProjector {
  private lastInjected = createInjectedSnapshot();
  private deltaStep = 0;

  flush(state: InternalState, turnOps: TurnOperations, addNote: (content: string) => void): void {
    const next = buildInjectedSnapshot(state, turnOps);
    const delta = diffInjectedSnapshot(this.lastInjected, next);

    if (!delta) {
      return;
    }

    this.deltaStep += 1;
    addNote(formatStateDelta(this.deltaStep, delta, state));
    this.lastInjected = next;
  }
}
