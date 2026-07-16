import type {SerializedTaskGraph, TaskNodeKind, TaskOutput} from '../dag/dag-model.js';
import type {TokenUsage} from './token.js';
import type {ToolDisplay} from '@code-agent-lite/shared';

export type {ToolDisplay};

export enum AgentStatus {
  Idle = 'idle',
  Thinking = 'thinking',
  RunningTool = 'running_tool',
  Done = 'done',
  Error = 'error',
  Cancelled = 'cancelled'
}

export function isAgentBusy(status: AgentStatus): boolean {
  return status === AgentStatus.Thinking || status === AgentStatus.RunningTool;
}

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
  display?: ToolDisplay;
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
  | {type: 'tool_end'; id: string; output?: string; error?: string; display?: ToolDisplay}
  | {type: 'token_usage'; usage: TokenUsage}
  | {type: 'dag_snapshot'; graph: SerializedTaskGraph}
  | {type: 'task_start'; nodeId: string; kind: TaskNodeKind}
  | {type: 'task_end'; nodeId: string; output?: TaskOutput; error?: string};
