import type {ChatCompletionMessageParam, ChatCompletionTool} from 'openai/resources/chat/completions';
import {z} from 'zod';

export type AgentStatus = 'idle' | 'thinking' | 'running_tool' | 'done' | 'error';

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export type ChatItem = {
  role: ChatRole;
  content: string;
  streaming?: boolean;
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
  | {type: 'message_start'; role: ChatRole}
  | {type: 'message_delta'; delta: string}
  | {type: 'message_end'}
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

export type AgentState = {
  facts: string[];
  hypotheses: string[];
  rejected: string[];
  visitedFiles: string[];
  searchedTerms: string[];
  noProgress: number;
  confidence: number;
};

export function createAgentState(): AgentState {
  return {
    facts: [],
    hypotheses: [],
    rejected: [],
    visitedFiles: [],
    searchedTerms: [],
    noProgress: 0,
    confidence: 0
  };
}

export type AgentOptions = {
  cwd: string;
  input: string;
  onEvent(event: AgentEvent): void;
  maxSteps?: number;
};

export type AgentMessage = ChatCompletionMessageParam;
