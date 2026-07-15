import type {AgentTool} from './types.js';
import {z} from 'zod';

export const PROTECTED_DIR_NAMES = ['.git', 'node_modules'] as const;

export const DEFAULT_IGNORE_GLOBS = [
  ...PROTECTED_DIR_NAMES.map((name) => `${name}/**`),
  'dist/**',
  'build/**',
  'out/**',
  'coverage/**'
] as const;

export const RG_IGNORE_GLOBS = DEFAULT_IGNORE_GLOBS.map((glob) => `!${glob}`);

export function createTool<TSchema extends z.ZodObject>(config: {
  name: string;
  description: string;
  schema: TSchema;
  execute: AgentTool<TSchema>['execute'];
}): AgentTool<TSchema> {
  return config;
}
