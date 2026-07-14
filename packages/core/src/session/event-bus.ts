import {getContextLimit} from '@code-agent-lite/platform';
import {inferToolDisplay} from '@code-agent-lite/shared';
import type {
  AgentEvent,
  AgentStatus,
  ChatRole,
  TokenUsage,
  ToolCallItem
} from '../session-types.js';
import {createTokenUsage} from '../session-types.js';
import type {FinishToolOptions} from './finish-tool-options.js';

export class SessionEventBus {
  readonly tokenUsage: TokenUsage = createTokenUsage();

  constructor(private readonly onEvent: (event: AgentEvent) => void) {}

  emit(event: AgentEvent) {
    this.onEvent(event);
  }

  recordTokenUsage(usage: TokenUsage) {
    this.tokenUsage.prompt += usage.prompt;
    this.tokenUsage.completion += usage.completion;
    this.tokenUsage.total += usage.total;

    const contextUsed = usage.contextUsed ?? usage.prompt;
    const contextLimit = usage.contextLimit ?? getContextLimit();

    if (contextUsed > 0) {
      this.tokenUsage.contextUsed = contextUsed;
    }

    this.tokenUsage.contextLimit = contextLimit;

    this.onEvent({
      type: 'token_usage',
      usage: {
        prompt: this.tokenUsage.prompt,
        completion: this.tokenUsage.completion,
        total: this.tokenUsage.total,
        contextUsed: this.tokenUsage.contextUsed,
        contextLimit: this.tokenUsage.contextLimit
      }
    });
  }

  status(status: AgentStatus, message?: string) {
    this.onEvent({type: 'status', status, message});
  }

  say(role: ChatRole, content: string) {
    this.onEvent({type: 'message', role, content});
  }

  startAssistantStream() {
    this.onEvent({type: 'message_start', role: 'assistant'});
  }

  appendAssistantDelta(delta: string) {
    this.onEvent({type: 'message_delta', delta});
  }

  startThinkingStream() {
    this.onEvent({type: 'thinking_start'});
  }

  appendThinkingDelta(delta: string) {
    this.onEvent({type: 'thinking_delta', delta});
  }

  endThinkingStream() {
    this.onEvent({type: 'thinking_end'});
  }

  commitAssistantStream() {
    this.onEvent({type: 'message_end'});
  }

  startTool(call: ToolCallItem) {
    this.status('running_tool', call.name);
    this.onEvent({type: 'tool_start', call});
  }

  finishTool(id: string, content: string, options?: FinishToolOptions) {
    const display =
      options?.display ??
      (options?.toolName ? inferToolDisplay(options.toolName, content, options.toolInput) : undefined);
    const error = options?.error;

    if (error) {
      this.onEvent({
        type: 'tool_end',
        id,
        error,
        display: display ?? {kind: 'text', content: error}
      });
      return;
    }

    this.onEvent({type: 'tool_end', id, output: content, display});
  }

  setWorkspace(cwd: string) {
    this.onEvent({type: 'workspace', cwd});
  }
}
