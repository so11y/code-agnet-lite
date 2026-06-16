import type {AgentTool} from '../agent/types.js';
import {z} from 'zod';

type JsonSchemaObject = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
};

function zodObjectToJsonSchema(schema: z.AnyZodObject): JsonSchemaObject {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const field = value as z.ZodTypeAny;
    const isOptional = field.isOptional();
    const unwrapped = isOptional && field instanceof z.ZodOptional ? field.unwrap() : field;

    properties[key] = zodFieldToJsonSchema(unwrapped);

    if (!isOptional) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false
  };
}

function zodFieldToJsonSchema(field: z.ZodTypeAny): unknown {
  if (field instanceof z.ZodString) {
    return {type: 'string', description: field.description};
  }

  if (field instanceof z.ZodNumber) {
    return {type: 'number', description: field.description};
  }

  if (field instanceof z.ZodBoolean) {
    return {type: 'boolean', description: field.description};
  }

  if (field instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodFieldToJsonSchema(field.element),
      description: field.description
    };
  }

  return {type: 'string', description: field.description};
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
