export type TurnOperations = {
  writtenFiles: string[];
  deletedFiles: string[];
  executedCommands: string[];
};

export function createEmptyTurnOperations(): TurnOperations {
  return {writtenFiles: [], deletedFiles: [], executedCommands: []};
}

export type TurnContext = {
  userInput: string;
  operations: TurnOperations;
  assistantText: string;
};

export type VerifyGate = {
  shouldVerify: boolean;
  reason: string;
};

export type TurnReview = TurnContext & {
  gate: VerifyGate;
};
