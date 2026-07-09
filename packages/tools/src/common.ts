import type {AgentTool} from './types.js';
import {zodToJsonSchema} from 'zod-to-json-schema';
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

type JsonSchemaObject = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
};

function zodObjectToJsonSchema(schema: z.AnyZodObject): JsonSchemaObject {
  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    target: 'openApi3'
  }) as Record<string, unknown>;

  const {properties, required} = jsonSchema;

  return {
    type: 'object',
    properties: (properties as Record<string, unknown>) ?? {},
    required: required as string[] | undefined,
    additionalProperties: false
  };
}

export function createTool<TSchema extends z.AnyZodObject>(config: {
  name: string;
  description: string;
  schema: TSchema;
  execute: AgentTool<TSchema>['execute'];
}): AgentTool<TSchema> {
  return {
    ...config,
    openaiTool: {
      type: 'function',
      function: {
        name: config.name,
        description: config.description,
        parameters: zodObjectToJsonSchema(config.schema)
      }
    }
  };
}
