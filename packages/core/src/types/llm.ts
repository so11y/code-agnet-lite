import type {AssistantModelMessage, ModelMessage, ToolCallPart} from 'ai';
import type {ToolRegistry} from '../tool-registry.js';
import type {AgentSession} from '../session.js';
import type {TokenUsageSink} from './token.js';

export type AgentMessage = ModelMessage;
export type AssistantMessage = AssistantModelMessage;
export type ToolCall = ToolCallPart;

/** LLM 调用所需的 session 上下文。AgentSession 满足此契约。 */
export type LlmSessionContext = Pick<AgentSession, 'toolRegistry' | 'events'>;

export type LlmOptions = {
  session?: LlmSessionContext;
  signal?: AbortSignal;
};

export type LlmStreamOptions = LlmOptions & {
  onDelta: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  allowTools?: boolean;
};

export type {ToolRegistry, TokenUsageSink};
