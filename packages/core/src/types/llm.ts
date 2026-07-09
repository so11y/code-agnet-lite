import type {ChatCompletionMessageParam} from 'openai/resources/chat/completions';
import type {ToolRegistry} from '../tool-registry.js';
import type {TokenUsageSink} from './token.js';

export type AgentMessage = ChatCompletionMessageParam;

/** LLM 调用所需的 session 上下文。AgentSession 满足此契约。 */
export type LlmSessionContext = {
  toolRegistry: ToolRegistry;
  events: TokenUsageSink & {say(role: 'thinking', content: string): void};
};

export type LlmOptions = {
  session?: LlmSessionContext;
  signal?: AbortSignal;
};

export type LlmStreamOptions = LlmOptions & {
  onDelta: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
};
