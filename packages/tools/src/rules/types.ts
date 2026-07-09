export const RULES_DIR = '.agent/rules';

export type AgentRule = {
  id: string;
  description: string;
  globs: string[];
  alwaysApply: boolean;
  body: string;
  path: string;
};
