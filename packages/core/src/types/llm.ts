import type {ChatCompletionMessageParam} from 'openai/resources/chat/completions';
import type {TokenUsageSink} from './token.js';

export type AgentMessage = ChatCompletionMessageParam;

export type LlmOptions = {
  session?: TokenUsageSink;
  signal?: AbortSignal;
};

export type LlmStreamOptions = LlmOptions & {
  onDelta: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
};
