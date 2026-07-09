export type VerifyResult = {
  command: string;
  exitCode: number;
  output: string;
};

export type FixLoopAction = 'fix' | 'replan' | 'give-up';

export const MAX_FIX_ROUNDS = 3;
export const MAX_REPLAN_ATTEMPTS = 1;

export function decideFixLoopAction(state: {
  fixRound: number;
  replans: number;
  maxFixRounds: number;
  maxReplans: number;
}): FixLoopAction {
  if (state.fixRound < state.maxFixRounds) {
    return 'fix';
  }

  if (state.replans < state.maxReplans) {
    return 'replan';
  }

  return 'give-up';
}
