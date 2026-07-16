import {pickField} from '@code-agent-lite/shared';
import {clamp, compact, union} from 'lodash-es';
import {SessionState, type MemoryMergeSource} from '../agent-memory.js';
import type {PlanReview} from '../planner-schemas.js';
import {TurnOperations, type TurnOperationKey, type TurnRecord} from '../session-types.js';

type SessionListKey = 'visitedFiles' | 'searchedTerms';
type SessionToolTrack = {
  stateKey: SessionListKey;
  fields: string[];
};

type TurnToolTrack = {
  fields: string[];
  turnKey: TurnOperationKey;
};

const SESSION_TOOL_TRACKS: Record<string, SessionToolTrack> = {
  readfile: {stateKey: 'visitedFiles', fields: ['path', 'filePath', 'file_path']},
  read: {stateKey: 'visitedFiles', fields: ['path', 'filePath', 'file_path']},
  grep: {stateKey: 'searchedTerms', fields: ['pattern', 'query']},
  search: {stateKey: 'searchedTerms', fields: ['pattern', 'query']}
};

const TURN_TOOL_TRACKS: Record<string, TurnToolTrack> = {
  writefile: {fields: ['path', 'filePath', 'file_path'], turnKey: 'writtenFiles'},
  write: {fields: ['path', 'filePath', 'file_path'], turnKey: 'writtenFiles'},
  editfile: {fields: ['path', 'filePath', 'file_path'], turnKey: 'writtenFiles'},
  edit: {fields: ['path', 'filePath', 'file_path'], turnKey: 'writtenFiles'},
  applypatch: {fields: ['path', 'filePath', 'file_path'], turnKey: 'writtenFiles'},
  deletefile: {fields: ['path', 'filePath', 'file_path'], turnKey: 'deletedFiles'},
  delete: {fields: ['path', 'filePath', 'file_path'], turnKey: 'deletedFiles'},
  runcmd: {fields: ['command', 'cmd'], turnKey: 'executedCommands'},
  shell: {fields: ['command', 'cmd'], turnKey: 'executedCommands'},
  terminal: {fields: ['command', 'cmd'], turnKey: 'executedCommands'}
};

function trackedValue(input: unknown, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = pickField(input, field);
    if (value) {
      return value;
    }
  }

  return undefined;
}

export class TurnLedger {
  readonly state: SessionState = new SessionState();
  private turnUserInput = '';

  resetWorkspace() {
    Object.assign(this.state, new SessionState());
    this.turnUserInput = '';
  }

  beginTurn(userInput: string) {
    this.turnUserInput = userInput;
    this.state.operations.clear();
    this.state.hypotheses = [];
    this.state.rejected = [];
    this.state.confidence = 0;
    this.state.noProgress = 0;
  }

  applyHypotheses(hypotheses: string[]) {
    this.state.hypotheses = compact(hypotheses);
  }

  rejectHypotheses(hypotheses: string[]) {
    this.state.rejected = union(this.state.rejected, compact(hypotheses));
  }

  beginReplan() {
    this.rejectHypotheses(this.state.hypotheses);
    this.applyHypotheses([]);
    this.state.confidence = clamp(this.state.confidence - 0.15, 0, 1);
  }

  applyReview(review: PlanReview, runFailed: boolean) {
    this.addFacts(review.facts);
    this.state.confidence = review.confidence;

    if (!runFailed && review.directionCorrect) {
      return;
    }

    this.rejectHypotheses(review.rejected);
    if (review.hypotheses.length) {
      this.applyHypotheses(review.hypotheses);
    }
  }

  addFacts(facts: string[]) {
    this.state.facts = union(this.state.facts, compact(facts));
  }

  recordToolCall(name: string, input: unknown) {
    const normalizedName = name.toLowerCase().replace(/[^a-z]/g, '');
    const sessionTrack = SESSION_TOOL_TRACKS[normalizedName];
    if (sessionTrack) {
      const value = trackedValue(input, sessionTrack.fields);
      if (value) {
        this.state[sessionTrack.stateKey] = union(this.state[sessionTrack.stateKey], [value]);
      }
      return;
    }

    const turnTrack = TURN_TOOL_TRACKS[normalizedName];
    if (!turnTrack) {
      return;
    }

    const value = trackedValue(input, turnTrack.fields) ?? `[${name}]`;

    this.state.operations.add(turnTrack.turnKey, value);
  }

  mergeTurnOperations(operations: TurnOperations) {
    this.state.operations.merge(operations);
  }

  mergeMemory(memory: MemoryMergeSource) {
    this.state.mergeFrom(memory);
  }

  snapshotOperations(): TurnOperations {
    return this.state.operations.clone();
  }

  snapshot(): MemoryMergeSource {
    return {
      facts: [...this.state.facts],
      visitedFiles: [...this.state.visitedFiles],
      searchedTerms: [...this.state.searchedTerms],
      operations: this.snapshotOperations()
    };
  }

  collectTurnRecord(assistantText: string): TurnRecord {
    return {
      userInput: this.turnUserInput,
      operations: this.snapshotOperations(),
      assistantText
    };
  }

  snapshotProgress(): number {
    const {operations} = this.state;
    return (
      this.state.facts.length +
      this.state.visitedFiles.length +
      this.state.searchedTerms.length +
      operations.size
    );
  }

  noteProgress(before: number) {
    this.state.noProgress =
      this.snapshotProgress() > before ? 0 : this.state.noProgress + 1;
  }

  resetNoProgress() {
    this.state.noProgress = 0;
  }
}
