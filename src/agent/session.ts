import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import {messageText} from '../utils/openai-message.js';
import {SYSTEM_PROMPT} from './prompt.js';
import type {AgentMessage, AgentOptions, AgentStatus, ChatRole, ToolCallItem} from './types.js';

const assistantMessage = (message: ChatCompletionAssistantMessageParam): AgentMessage => ({
  role: 'assistant',
  content: message.content ?? null,
  tool_calls: message.tool_calls
});

export class AgentSession {
  cwd: string;
  readonly messages: AgentMessage[];
  private userAnnounced = false;

  constructor(private readonly options: AgentOptions) {
    this.cwd = options.cwd;
    this.messages = [
      {role: 'system', content: SYSTEM_PROMPT},
      {role: 'system', content: `当前工作区：${options.cwd}`},
      {role: 'user', content: options.input}
    ];
  }

  status(status: AgentStatus, message?: string) {
    this.options.onEvent({type: 'status', status, message});
  }

  say(role: ChatRole, content: string) {
    this.options.onEvent({type: 'message', role, content});
  }

  announceUser() {
    if (this.userAnnounced) {
      return;
    }

    this.userAnnounced = true;
    this.say('user', this.options.input);
  }

  addAssistant(message: ChatCompletionAssistantMessageParam) {
    this.messages.push(assistantMessage(message));
    const content = messageText(message.content);
    if (content) {
      this.say('assistant', content);
    }
  }

  addSystemNote(content: string) {
    this.messages.push({role: 'system', content});
    this.say('system', content);
  }

  startTool(call: ToolCallItem) {
    this.status('running_tool', call.name);
    this.options.onEvent({type: 'tool_start', call});
  }

  finishTool(id: string, content: string, error?: string) {
    this.messages.push({role: 'tool', tool_call_id: id, content});
    this.options.onEvent(error ? {type: 'tool_end', id, error} : {type: 'tool_end', id, output: content});
  }

  setWorkspace(cwd: string) {
    this.cwd = cwd;
    this.options.onEvent({type: 'workspace', cwd});
  }
}
