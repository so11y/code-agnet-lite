import {pickField} from '@code-agent-lite/shared';
import {compact, union} from 'lodash-es';
import type {InternalState, TurnContext, TurnOperations} from '../session-types.js';
import {createInternalState} from '../session-types.js';
import {createEmptyTurnOperations} from '../types/operations.js';
type StateListKey = 'visitedFiles' | 'searchedTerms' | 'writtenFiles' | 'deletedFiles' | 'executedCommands';

type ToolTrack = {
  stateKey: StateListKey;
  field: string;
  turnKey?: keyof TurnOperations;
};

const TOOL_TRACKS: Record<string, ToolTrack> = {
  read_file: {stateKey: 'visitedFiles', field: 'path'},
  grep: {stateKey: 'searchedTerms', field: 'pattern'},
  write_file: {stateKey: 'writtenFiles', field: 'path', turnKey: 'writtenFiles'},
  delete_file: {stateKey: 'deletedFiles', field: 'path', turnKey: 'deletedFiles'},
  run_cmd: {stateKey: 'executedCommands', field: 'command', turnKey: 'executedCommands'}
};

export class TurnLedger {
  readonly state: InternalState = createInternalState();
  private turnUserInput = '';
  private turnOps: TurnOperations = createEmptyTurnOperations();

  beginTurn(userInput: string) {
    this.turnUserInput = userInput;
    this.turnOps = createEmptyTurnOperations();
  }

  applyHypotheses(hypotheses: string[]) {
    this.state.hypotheses = compact(hypotheses);
  }

  rejectHypotheses(hypotheses: string[]) {
    this.state.rejected = union(this.state.rejected, compact(hypotheses));
  }

  addFacts(facts: string[]) {
    this.state.facts = union(this.state.facts, compact(facts));
  }

  recordToolCall(name: string, input: unknown) {
    const track = TOOL_TRACKS[name];
    if (!track) {
      return;
    }

    const value = pickField(input, track.field);
    if (!value) {
      return;
    }

    this.state[track.stateKey] = union(this.state[track.stateKey], [value]);

    if (track.turnKey) {
      this.turnOps[track.turnKey] = union(this.turnOps[track.turnKey], [value]);
    }
  }

  refreshOperations(): TurnOperations {
    return {
      writtenFiles: [...this.turnOps.writtenFiles],
      deletedFiles: [...this.turnOps.deletedFiles],
      executedCommands: [...this.turnOps.executedCommands]
    };
  }

  collectTurnContext(assistantText: string): TurnContext {
    return {
      userInput: this.turnUserInput,
      operations: this.refreshOperations(),
      assistantText
    };
  }

  snapshotProgress() {
    return {
      facts: this.state.facts.length,
      visitedFiles: this.state.visitedFiles.length,
      searchedTerms: this.state.searchedTerms.length
    };
  }

  noteProgress(before: ReturnType<TurnLedger['snapshotProgress']>) {
    const after = this.snapshotProgress();
    const progressed =
      after.facts > before.facts ||
      after.visitedFiles > before.visitedFiles ||
      after.searchedTerms > before.searchedTerms;

    if (progressed) {
      this.state.noProgress = 0;
      return;
    }

    this.state.noProgress += 1;
  }
}
