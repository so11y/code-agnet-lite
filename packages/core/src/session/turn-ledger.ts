import {pickField} from '@code-agent-lite/shared';
import {compact, union} from 'lodash-es';
import {SessionState, type MemoryMergeSource} from '../agent-memory.js';
import type {TurnOperations, TurnSummary} from '../session-types.js';
import {createEmptyTurnOperations} from '../types/operations.js';

type SessionListKey = 'visitedFiles' | 'searchedTerms';
type TurnListKey = keyof TurnOperations;

type SessionToolTrack = {
  stateKey: SessionListKey;
  field: string;
};

type TurnToolTrack = {
  field: string;
  turnKey: TurnListKey;
};

const SESSION_TOOL_TRACKS: Record<string, SessionToolTrack> = {
  read_file: {stateKey: 'visitedFiles', field: 'path'},
  grep: {stateKey: 'searchedTerms', field: 'pattern'}
};

const TURN_TOOL_TRACKS: Record<string, TurnToolTrack> = {
  write_file: {field: 'path', turnKey: 'writtenFiles'},
  delete_file: {field: 'path', turnKey: 'deletedFiles'},
  run_cmd: {field: 'command', turnKey: 'executedCommands'}
};

export class TurnLedger {
  readonly state: SessionState = new SessionState();
  private turnUserInput = '';

  beginTurn(userInput: string) {
    this.turnUserInput = userInput;
    this.state.operations = createEmptyTurnOperations();
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
    const sessionTrack = SESSION_TOOL_TRACKS[name];
    if (sessionTrack) {
      const value = pickField(input, sessionTrack.field);
      if (value) {
        this.state[sessionTrack.stateKey] = union(this.state[sessionTrack.stateKey], [value]);
      }
      return;
    }

    const turnTrack = TURN_TOOL_TRACKS[name];
    if (!turnTrack) {
      return;
    }

    const value = pickField(input, turnTrack.field);
    if (!value) {
      return;
    }

    this.state.operations[turnTrack.turnKey] = union(
      this.state.operations[turnTrack.turnKey],
      [value]
    );
  }

  mergeTurnOperations(operations: TurnOperations) {
    this.state.mergeFrom({operations});
  }

  refreshOperations(): TurnOperations {
    return {
      writtenFiles: [...this.state.operations.writtenFiles],
      deletedFiles: [...this.state.operations.deletedFiles],
      executedCommands: [...this.state.operations.executedCommands]
    };
  }

  snapshot(): MemoryMergeSource {
    return {
      facts: [...this.state.facts],
      visitedFiles: [...this.state.visitedFiles],
      searchedTerms: [...this.state.searchedTerms],
      operations: this.refreshOperations()
    };
  }

  collectTurnSummary(assistantText: string): TurnSummary {
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
