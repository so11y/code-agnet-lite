import type {ChatCompletionMessageParam, ChatCompletionTool} from 'openai/resources/chat/completions';
import {z} from 'zod';

export type AgentStatus = 'idle' | 'thinking' | 'running_tool' | 'done' | 'error';

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export type ChatItem = {
  role: ChatRole;
  content: string;
};

export type ToolCallItem = {
  id: string;
  name: string;
  input: unknown;
  output?: string;
  error?: string;
};

export type AgentEvent =
  | {type: 'status'; status: AgentStatus; message?: string}
  | {type: 'message'; role: ChatRole; content: string}
  | {type: 'workspace'; cwd: string}
  | {type: 'tool_start'; call: ToolCallItem}
  | {type: 'tool_end'; id: string; output?: string; error?: string};

export type AgentTool<TSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: TSchema;
  openaiTool: ChatCompletionTool;
  execute(input: z.infer<TSchema>, context: ToolContext): Promise<string>;
};

export type ToolContext = {
  cwd: string;
  setCwd(cwd: string): void;
};

export type AgentOptions = {
  cwd: string;
  input: string;
  onEvent(event: AgentEvent): void;
  maxSteps?: number;
};

export type AgentMessage = ChatCompletionMessageParam;
