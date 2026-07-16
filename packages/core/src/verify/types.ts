export type VerifyResult = {
  command: string;
  exitCode: number;
  output: string;
};

export enum FixLoopAction {
  Fix = 'fix',
  Replan = 'replan',
  GiveUp = 'give-up'
}

export const MAX_FIX_ROUNDS = 3;
export const MAX_REPLAN_ATTEMPTS = 1;

export function decideFixLoopAction(state: {
  fixRound: number;
  replans: number;
  maxFixRounds: number;
  maxReplans: number;
}): FixLoopAction {
  if (state.fixRound < state.maxFixRounds) {
    return FixLoopAction.Fix;
  }

  if (state.replans < state.maxReplans) {
    return FixLoopAction.Replan;
  }

  return FixLoopAction.GiveUp;
}
