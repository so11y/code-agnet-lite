import {messageText} from '../openai-message.js';
import {createWorkspaceSystemMessages, formatWorkspaceContext} from '../prompt.js';
import type {AgentMessage, AssistantMessage} from '../session-types.js';
import type {SessionEventBus} from './event-bus.js';
import type {FinishToolOptions} from './finish-tool-options.js';

export class ConversationStore {
  readonly messages: AgentMessage[];
  private workspaceMessage: AgentMessage;
  private skillCatalogMessageIndex?: number;
  private skillCatalogCwd?: string;
  private skillCatalogSyncedCwd?: string;

  constructor(
    cwd: string,
    private readonly events: SessionEventBus
  ) {
    this.messages = createWorkspaceSystemMessages(cwd);
    this.workspaceMessage = this.messages[1];
  }

  resetWorkspace(cwd: string, leadingPrompt?: string) {
    this.invalidateSkillCatalog();
    this.messages.length = 0;
    this.messages.push(...createWorkspaceSystemMessages(cwd, leadingPrompt));
    this.workspaceMessage = this.messages[1];
  }

  appendUser(content: string, options?: {emit?: boolean}) {
    this.messages.push({role: 'user', content});
    if (options?.emit !== false) {
      this.events.say('user', content);
    }
  }

  commitAssistant(message: AssistantMessage, streamed: boolean) {
    this.messages.push(message);

    if (streamed) {
      this.events.commitAssistantStream();
      return;
    }

    const content = messageText(message.content);
    if (content) {
      this.events.say('assistant', content);
    }
  }

  addAssistant(message: AssistantMessage) {
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
    const index = this.messages.indexOf(this.workspaceMessage);

    if (index >= 0) {
      this.messages[index] = message;
    } else {
      this.messages.splice(1, 0, message);
    }

    this.workspaceMessage = message;
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
    this.messages.push({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: id,
          toolName: options?.toolName ?? 'unknown_tool',
          output: options?.error
            ? {type: 'error-text', value: content}
            : {type: 'text', value: content}
        }
      ]
    });
    this.events.finishTool(id, content, options);
  }

  setSkillCatalog(content: string, cwd: string) {
    if (this.skillCatalogCwd === cwd && this.skillCatalogMessageIndex !== undefined) {
      return;
    }

    const message: AgentMessage = {role: 'system', content};

    if (this.skillCatalogMessageIndex !== undefined) {
      this.messages[this.skillCatalogMessageIndex] = message;
    } else {
      this.skillCatalogMessageIndex = this.messages.length;
      this.messages.push(message);
    }

    this.skillCatalogCwd = cwd;
  }

  isSkillCatalogSynced(cwd: string): boolean {
    return this.skillCatalogSyncedCwd === cwd;
  }

  markSkillCatalogSynced(cwd: string) {
    this.skillCatalogSyncedCwd = cwd;
  }

  invalidateSkillCatalog() {
    this.clearSkillCatalog();
    this.skillCatalogSyncedCwd = undefined;
  }

  clearSkillCatalog() {
    if (this.skillCatalogMessageIndex === undefined) {
      this.skillCatalogCwd = undefined;
      return;
    }

    this.messages.splice(this.skillCatalogMessageIndex, 1);
    this.skillCatalogMessageIndex = undefined;
    this.skillCatalogCwd = undefined;
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
