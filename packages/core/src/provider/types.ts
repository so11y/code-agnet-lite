import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import type {ChatCompletion} from 'openai/resources/chat/completions';
import type {AgentMessage, TokenUsageSink} from '../session-types.js';

export type AgentProviderKind = 'openai' | 'cursor';

export type LlmCallOptions = {
  session?: TokenUsageSink;
};

export type ProviderLlmStreamOptions = LlmCallOptions & {
  onDelta: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
};

/** OpenAI 兼容的 chat 后端，供 router / planner / ReAct 使用 */
export interface LlmProvider {
  readonly kind: 'openai';
  streamWithTools(
    messages: AgentMessage[],
    options: ProviderLlmStreamOptions
  ): Promise<ChatCompletionAssistantMessageParam>;
  chatWithTools(messages: AgentMessage[], options?: LlmCallOptions): Promise<ChatCompletion>;
  plainChat(messages: AgentMessage[], options?: LlmCallOptions): Promise<ChatCompletion>;
}

export type CursorAgentHandle = {
  send(prompt: string): Promise<CursorRunHandle>;
  dispose(): Promise<void>;
};

export type CursorRunHandle = {
  stream(): AsyncIterable<unknown>;
  wait(): Promise<{status: string; result?: string; id?: string}>;
};
