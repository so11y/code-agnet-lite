import {z} from 'zod';

export type TurnOperations = {
  writtenFiles: string[];
  deletedFiles: string[];
  executedCommands: string[];
};

export function createEmptyTurnOperations(): TurnOperations {
  return {writtenFiles: [], deletedFiles: [], executedCommands: []};
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

export type TurnVerification = TurnRecord & {
  gate: VerifyGate;
};
