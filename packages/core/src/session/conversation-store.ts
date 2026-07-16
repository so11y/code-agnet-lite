import {messageText} from '../openai-message.js';
import {createWorkspaceSystemMessages, formatWorkspaceContext} from '../prompt.js';
import type {AgentMessage, AssistantMessage} from '../session-types.js';
import type {SessionEventBus} from './event-bus.js';
import type {FinishToolOptions} from './finish-tool-options.js';

export class ConversationStore {
  readonly messages: AgentMessage[];
  private workspaceMessage: AgentMessage;
  private readonly turnNotes: AgentMessage[] = [];
  private skillCatalogMessageIndex?: number;
  private skillCatalogCwd?: string;
  private skillCatalogSyncedCwd?: string;

  constructor(
    cwd: string,
    private readonly events: SessionEventBus
  ) {
    const messages = createWorkspaceSystemMessages(cwd);
    this.messages = messages;
    this.workspaceMessage = messages[1];
  }

  resetWorkspace(cwd: string, leadingPrompt?: string) {
    this.invalidateSkillCatalog();
    const messages = createWorkspaceSystemMessages(cwd, leadingPrompt);
    this.messages.length = 0;
    this.messages.push(...messages);
    this.workspaceMessage = messages[1];
    this.turnNotes.length = 0;
  }

  appendUser(content: string, options?: {emit?: boolean}) {
    this.messages.push({role: 'user', content});
    if (options?.emit !== false) {
      this.events.say('user', content);
    }
  }

  commitAssistant(message: AssistantMessage, streamed: boolean) {
    this.recordAssistant(message);

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

  recordAssistant(message: AssistantMessage) {
    this.messages.push(message);
  }

  addSystemNote(content: string, options?: {emit?: boolean}): AgentMessage {
    const message: AgentMessage = {role: 'system', content};
    this.messages.push(message);
    if (options?.emit !== false) {
      this.events.say('system', content);
    }
    return message;
  }

  addTurnNote(content: string, options?: {emit?: boolean}): AgentMessage {
    const message = this.addSystemNote(content, options);
    this.turnNotes.push(message);
    return message;
  }

  clearTurnNotes(): void {
    this.removeMessages(this.turnNotes);
    this.turnNotes.length = 0;
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
      const message = this.messages[index];
      if (message && targets.has(message)) {
        this.messages.splice(index, 1);
      }
    }
  }

  recordToolResult(id: string, content: string, options?: FinishToolOptions) {
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
  }

  finishTool(id: string, content: string, options?: FinishToolOptions) {
    this.recordToolResult(id, content, options);
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
      if (message?.role === 'assistant') {
        return messageText(message.content) ?? '';
      }
    }

    return '';
  }
}
