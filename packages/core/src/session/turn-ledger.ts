import {pickField} from '@code-agent-lite/shared';
import {compact, union} from 'lodash-es';
import {SessionState} from '../agent-memory.js';
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
  readonly state: SessionState = SessionState.create();
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

    this.turnOps[turnTrack.turnKey] = union(this.turnOps[turnTrack.turnKey], [value]);
  }

  mergeTurnOperations(operations: TurnOperations) {
    this.turnOps.writtenFiles = union(this.turnOps.writtenFiles, operations.writtenFiles);
    this.turnOps.deletedFiles = union(this.turnOps.deletedFiles, operations.deletedFiles);
    this.turnOps.executedCommands = union(this.turnOps.executedCommands, operations.executedCommands);
  }

  refreshOperations(): TurnOperations {
    return {
      writtenFiles: [...this.turnOps.writtenFiles],
      deletedFiles: [...this.turnOps.deletedFiles],
      executedCommands: [...this.turnOps.executedCommands]
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
