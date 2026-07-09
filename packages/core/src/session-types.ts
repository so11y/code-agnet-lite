import type {ChatCompletionMessageParam} from 'openai/resources/chat/completions';
import type {AgentMemory} from './agent-memory.js';
import {createAgentMemory} from './agent-memory.js';
import type {AgentProviderKind} from './provider/types.js';
import type {SerializedTaskGraph, TaskNodeKind, TaskNodeStatus, TaskOutput} from './dag/types.js';

export type DagTaskOutput = {
  summary: string;
  operations: TurnOperations;
  facts: string[];
  visitedFiles?: string[];
  searchedTerms?: string[];
};

export type AgentStatus = 'idle' | 'thinking' | 'running_tool' | 'done' | 'error';

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool' | 'thinking';

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
  onReasoningDelta?: (delta: string) => void;
};

export type AgentEvent =
  | {type: 'status'; status: AgentStatus; message?: string}
  | {type: 'message'; role: ChatRole; content: string}
  | {type: 'message_start'; role: ChatRole}
  | {type: 'message_delta'; delta: string}
  | {type: 'message_end'}
  | {type: 'thinking_start'}
  | {type: 'thinking_delta'; delta: string}
  | {type: 'thinking_end'}
  | {type: 'workspace'; cwd: string}
  | {type: 'tool_start'; call: ToolCallItem}
  | {type: 'tool_end'; id: string; output?: string; error?: string}
  | {type: 'token_usage'; usage: TokenUsage}
  | {type: 'dag_snapshot'; graph: SerializedTaskGraph}
  | {type: 'task_start'; nodeId: string; kind: TaskNodeKind}
  | {type: 'task_end'; nodeId: string; output?: DagTaskOutput; error?: string};

/** 程序侧详细账本，供调度、冲突检测、verify 等使用 */
export type InternalState = AgentMemory;

/** @deprecated 使用 InternalState */
export type AgentState = InternalState;

export function createInternalState(): AgentMemory {
  return createAgentMemory();
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
  provider?: AgentProviderKind;
};

export type AgentOptions = AgentSessionOptions;

export type ReasoningMode = 'react' | 'tot' | 'dag';

export type AgentMessage = ChatCompletionMessageParam;

export type {SerializedTaskGraph, TaskNodeKind, TaskNodeStatus, TaskOutput};
