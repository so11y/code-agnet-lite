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

/** 程序侧详细账本，供调度、冲突检测、verify 等使用 */
export type InternalState = {
  facts: string[];
  hypotheses: string[];
  rejected: string[];
  visitedFiles: string[];
  searchedTerms: string[];
  writtenFiles: string[];
  deletedFiles: string[];
  executedCommands: string[];
  noProgress: number;
  confidence: number;
};

/** @deprecated 使用 InternalState */
export type AgentState = InternalState;

export function createInternalState(): InternalState {
  return {
    facts: [],
    hypotheses: [],
    rejected: [],
    visitedFiles: [],
    searchedTerms: [],
    writtenFiles: [],
    deletedFiles: [],
    executedCommands: [],
    noProgress: 0,
    confidence: 0
  };
}

export function createAgentState(): InternalState {
  return createInternalState();
}

export type TurnOperations = {
  writtenFiles: string[];
  deletedFiles: string[];
  executedCommands: string[];
};

export type TurnContext = {
  userInput: string;
  operations: TurnOperations;
  assistantText: string;
};

export type VerifyGate = {
  shouldVerify: boolean;
  reason: string;
};

export type TurnReview = TurnContext & {
  gate: VerifyGate;
};

export type AgentSessionOptions = {
  cwd: string;
  onEvent(event: AgentEvent): void;
  maxSteps?: number;
};

export type AgentOptions = AgentSessionOptions;

export type ReasoningMode = 'react' | 'tot';

export type AgentMessage = ChatCompletionMessageParam;
