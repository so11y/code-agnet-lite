import {getContextLimit} from '@code-agent-lite/platform';
import {inferToolDisplay} from '@code-agent-lite/shared';
import {
  AgentStatus,
  createTokenUsage,
  type AgentEvent,
  type ChatRole,
  type TokenUsage,
  type ToolCallItem
} from '../session-types.js';
import type {FinishToolOptions} from './finish-tool-options.js';

export class SessionEventBus {
  readonly tokenUsage: TokenUsage = createTokenUsage();
  private assistantEvents?: AgentEvent[];

  constructor(private readonly onEvent: (event: AgentEvent) => void) {}

  emit(event: AgentEvent) {
    this.dispatch(event);
  }

  beginAssistantCapture(): void {
    if (this.assistantEvents) {
      throw new Error('Assistant event capture 已经开始');
    }

    this.assistantEvents = [];
  }

  endAssistantCapture(): AgentEvent[] {
    const events = this.assistantEvents ?? [];
    this.assistantEvents = undefined;
    return events;
  }

  publish(events: readonly AgentEvent[]): void {
    for (const event of events) {
      this.onEvent(event);
    }
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

    this.dispatch({
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
    this.dispatch({type: 'status', status, message});
  }

  say(role: ChatRole, content: string) {
    this.dispatch({type: 'message', role, content});
  }

  startAssistantStream() {
    this.dispatch({type: 'message_start', role: 'assistant'});
  }

  appendAssistantDelta(delta: string) {
    this.dispatch({type: 'message_delta', delta});
  }

  startThinkingStream() {
    this.dispatch({type: 'thinking_start'});
  }

  appendThinkingDelta(delta: string) {
    this.dispatch({type: 'thinking_delta', delta});
  }

  endThinkingStream() {
    this.dispatch({type: 'thinking_end'});
  }

  commitAssistantStream() {
    this.dispatch({type: 'message_end'});
  }

  startTool(call: ToolCallItem) {
    this.status(AgentStatus.RunningTool, call.name);
    this.dispatch({type: 'tool_start', call});
  }

  finishTool(id: string, content: string, options?: FinishToolOptions) {
    const display =
      options?.display ??
      (options?.toolName ? inferToolDisplay(options.toolName, content, options.toolInput) : undefined);
    const error = options?.error;

    if (error) {
      this.dispatch({
        type: 'tool_end',
        id,
        error,
        display: display ?? {kind: 'text', content: error}
      });
      return;
    }

    this.dispatch({type: 'tool_end', id, output: content, display});
  }

  setWorkspace(cwd: string) {
    this.dispatch({type: 'workspace', cwd});
  }

  private dispatch(event: AgentEvent): void {
    if (
      this.assistantEvents &&
      (event.type === 'message_start' ||
        event.type === 'message_delta' ||
        event.type === 'message_end' ||
        (event.type === 'message' && event.role === 'assistant'))
    ) {
      this.assistantEvents.push(event);
      return;
    }

    this.onEvent(event);
  }
}
