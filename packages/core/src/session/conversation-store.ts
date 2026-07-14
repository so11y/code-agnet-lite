import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import {messageText} from '../openai-message.js';
import {createWorkspaceSystemMessages, formatWorkspaceContext} from '../prompt.js';
import type {AgentMessage} from '../session-types.js';
import type {SessionEventBus} from './event-bus.js';
import type {FinishToolOptions} from './finish-tool-options.js';

const assistantMessage = (message: ChatCompletionAssistantMessageParam): AgentMessage => ({
  role: 'assistant',
  content: message.content ?? null,
  tool_calls: message.tool_calls
});

export class ConversationStore {
  readonly messages: AgentMessage[];
  private workspaceMessage_: AgentMessage;
  private skillCatalogMessageIndex_?: number;
  private skillCatalogCwd_?: string;
  private skillCatalogSyncedCwd_?: string;

  constructor(
    cwd: string,
    private readonly events: SessionEventBus
  ) {
    this.messages = createWorkspaceSystemMessages(cwd);
    this.workspaceMessage_ = this.messages[1];
  }

  appendUser(content: string, options?: {emit?: boolean}) {
    this.messages.push({role: 'user', content});
    if (options?.emit !== false) {
      this.events.say('user', content);
    }
  }

  commitAssistant(message: ChatCompletionAssistantMessageParam, streamed: boolean) {
    this.messages.push(assistantMessage(message));

    if (streamed) {
      this.events.commitAssistantStream();
      return;
    }

    const content = messageText(message.content);
    if (content) {
      this.events.say('assistant', content);
    }
  }

  addAssistant(message: ChatCompletionAssistantMessageParam) {
    this.commitAssistant(message, false);
  }

  addSystemNote(content: string, options?: {emit?: boolean}): AgentMessage {
    const message: AgentMessage = {role: 'system', content};
    this.messages.push(message);
    if (options?.emit !== false) {
      this.events.say('system', content);
    }
    return message;
  }

  setWorkspace(cwd: string) {
    const message: AgentMessage = {role: 'system', content: formatWorkspaceContext(cwd)};
    const index = this.messages.indexOf(this.workspaceMessage_);

    if (index >= 0) {
      this.messages[index] = message;
    } else {
      this.messages.splice(1, 0, message);
    }

    this.workspaceMessage_ = message;
  }

  removeMessages(messages: readonly AgentMessage[]) {
    const targets = new Set(messages);
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      if (targets.has(this.messages[index])) {
        this.messages.splice(index, 1);
      }
    }
  }

  finishTool(id: string, content: string, options?: FinishToolOptions) {
    this.messages.push({role: 'tool', tool_call_id: id, content});
    this.events.finishTool(id, content, options);
  }

  setSkillCatalog(content: string, cwd: string) {
    if (this.skillCatalogCwd_ === cwd && this.skillCatalogMessageIndex_ !== undefined) {
      return;
    }

    const message: AgentMessage = {role: 'system', content};

    if (this.skillCatalogMessageIndex_ !== undefined) {
      this.messages[this.skillCatalogMessageIndex_] = message;
    } else {
      this.skillCatalogMessageIndex_ = this.messages.length;
      this.messages.push(message);
    }

    this.skillCatalogCwd_ = cwd;
  }

  isSkillCatalogSynced(cwd: string): boolean {
    return this.skillCatalogSyncedCwd_ === cwd;
  }

  markSkillCatalogSynced(cwd: string) {
    this.skillCatalogSyncedCwd_ = cwd;
  }

  invalidateSkillCatalog() {
    this.clearSkillCatalog();
    this.skillCatalogSyncedCwd_ = undefined;
  }

  clearSkillCatalog() {
    if (this.skillCatalogMessageIndex_ === undefined) {
      this.skillCatalogCwd_ = undefined;
      return;
    }

    this.messages.splice(this.skillCatalogMessageIndex_, 1);
    this.skillCatalogMessageIndex_ = undefined;
    this.skillCatalogCwd_ = undefined;
  }

  extractLastAssistantText(): string {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const message = this.messages[index];
      if (message.role === 'assistant') {
        return messageText(message.content) ?? '';
      }
    }

    return '';
  }
}
