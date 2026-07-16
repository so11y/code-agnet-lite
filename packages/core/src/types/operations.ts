import {union} from 'lodash-es';
import {z} from 'zod';

const TURN_OPERATION_KEYS = ['writtenFiles', 'deletedFiles', 'executedCommands'] as const;
export type TurnOperationKey = (typeof TURN_OPERATION_KEYS)[number];
export type TurnOperationsSource = Partial<Record<TurnOperationKey, string[]>>;

export class TurnOperations {
  writtenFiles: string[] = [];
  deletedFiles: string[] = [];
  executedCommands: string[] = [];

  constructor(source: TurnOperationsSource = {}) {
    this.merge(source);
  }

  add(key: TurnOperationKey, value: string): void {
    this[key] = union(this[key], [value]);
  }

  merge(source: TurnOperationsSource): void {
    for (const key of TURN_OPERATION_KEYS) {
      const values = source[key];
      if (values?.length) {
        this[key] = union(this[key], values);
      }
    }
  }

  clear(): void {
    for (const key of TURN_OPERATION_KEYS) {
      this[key] = [];
    }
  }

  clone(): TurnOperations {
    return new TurnOperations(this);
  }

  get size(): number {
    return this.writtenFiles.length + this.deletedFiles.length + this.executedCommands.length;
  }

  get hasFileChanges(): boolean {
    return this.writtenFiles.length > 0 || this.deletedFiles.length > 0;
  }

  get hasSideEffects(): boolean {
    return this.size > 0;
  }

  get isEmpty(): boolean {
    return this.size === 0;
  }
}

export type TurnRecord = {
  userInput: string;
  operations: TurnOperations;
  assistantText: string;
};

export const verifyGateSchema = z.object({
  shouldVerify: z.boolean(),
  reason: z.string()
});

export type VerifyGate = z.infer<typeof verifyGateSchema>;

export enum VerificationOutcome {
  NotRequired = 'not_required',
  Passed = 'passed',
  Skipped = 'skipped',
  Failed = 'failed'
}

export type TurnVerification = TurnRecord & {
  gate: VerifyGate;
};
