import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import type {ChatCompletion} from 'openai/resources/chat/completions';
import type {AgentProviderKind} from '@code-agent-lite/platform';
import type {AgentMessage, LlmOptions, LlmStreamOptions} from '../types/llm.js';
import type {TokenUsageSink} from '../types/token.js';
import type {CursorSdkTokenUsage} from './token-usage.js';

export type {AgentProviderKind};

/** OpenAI 兼容的 chat 后端，供 router / planner / ReAct 使用 */
export interface LlmProvider {
  readonly kind: Extract<AgentProviderKind, 'openai'>;
  streamWithTools(
    messages: AgentMessage[],
    options: LlmStreamOptions
  ): Promise<ChatCompletionAssistantMessageParam>;
  chatWithTools(messages: AgentMessage[], options?: LlmOptions): Promise<ChatCompletion>;
  plainChat(messages: AgentMessage[], options?: LlmOptions): Promise<ChatCompletion>;
}

export type CursorAgentHandle = {
  send(prompt: string): Promise<CursorRunHandle>;
  dispose(): Promise<void>;
};

export type {CursorSdkTokenUsage} from './token-usage.js';

export type CursorRunStatus = 'completed' | 'error' | (string & {});

export type CursorRunHandle = {
  stream(): AsyncIterable<unknown>;
  wait(): Promise<{status: CursorRunStatus; result?: string; id?: string; usage?: CursorSdkTokenUsage}>;
};

export type {AgentMessage, LlmOptions, LlmStreamOptions, TokenUsageSink};
