import type {ChatCompletionTool} from 'openai/resources/chat/completions';
import {z} from 'zod';

import type {ToolResult} from '@code-agent-lite/shared';

export type AgentTool<TSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: TSchema;
  openaiTool: ChatCompletionTool;
  execute(input: z.infer<TSchema>, context: ToolContext): Promise<ToolResult>;
};

export type ToolContext = {
  cwd: string;
  setCwd(cwd: string): void | Promise<void>;
  signal?: AbortSignal;
};
