export const REASONING_MODES = ['react', 'tot', 'dag'] as const;

export type ReasoningMode = (typeof REASONING_MODES)[number];
