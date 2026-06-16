import type {ChatCompletionMessageParam} from 'openai/resources/chat/completions';

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

export type TokenUsage = {
  prompt: number;
  completion: number;
  total: number;
};

export function createTokenUsage(): TokenUsage {
  return {prompt: 0, completion: 0, total: 0};
}

export type TokenUsageSink = {
  recordTokenUsage(usage: TokenUsage): void;
};

export type LlmOptions = {
  session?: TokenUsageSink;
};

export type LlmStreamOptions = LlmOptions & {
  onDelta: (delta: string) => void;
};

export type AgentEvent =
  | {type: 'status'; status: AgentStatus; message?: string}
  | {type: 'message'; role: ChatRole; content: string}
  | {type: 'message_start'; role: ChatRole}
  | {type: 'message_delta'; delta: string}
  | {type: 'message_end'}
  | {type: 'workspace'; cwd: string}
  | {type: 'tool_start'; call: ToolCallItem}
  | {type: 'tool_end'; id: string; output?: string; error?: string}
  | {type: 'token_usage'; usage: TokenUsage};

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

export type AgentSessionOptions = {
  cwd: string;
  onEvent(event: AgentEvent): void;
  maxSteps?: number;
};

export type AgentOptions = AgentSessionOptions;

export type ReasoningMode = 'react' | 'tot';

export type AgentMessage = ChatCompletionMessageParam;
