import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import {compact, isEmpty, union} from 'lodash-es';
import {messageText} from '../utils/openai-message.js';
import {SYSTEM_PROMPT} from './prompt.js';
import {
  createAgentState,
  type AgentMessage,
  type AgentOptions,
  type AgentState,
  type AgentStatus,
  type ChatRole,
  type ToolCallItem
} from './types.js';

const assistantMessage = (message: ChatCompletionAssistantMessageParam): AgentMessage => ({
  role: 'assistant',
  content: message.content ?? null,
  tool_calls: message.tool_calls
});

export class AgentSession {
  cwd: string;
  readonly messages: AgentMessage[];
  readonly state: AgentState;
  private userAnnounced = false;

  constructor(private readonly options: AgentOptions) {
    this.cwd = options.cwd;
    this.state = createAgentState();
    this.messages = [
      {role: 'system', content: SYSTEM_PROMPT},
      {role: 'system', content: `当前工作区：${options.cwd}`},
      {role: 'user', content: options.input}
    ];
  }

  buildStateMessages(): AgentMessage[] {
    const sections = compact([
      this.state.facts.length ? `已知事实：\n${this.state.facts.join('\n')}` : '',
      this.state.hypotheses.length ? `当前假设：\n${this.state.hypotheses.join('\n')}` : '',
      this.state.rejected.length ? `已拒绝方向：\n${this.state.rejected.join('\n')}` : '',
      this.state.visitedFiles.length ? `已访问文件：\n${this.state.visitedFiles.join('\n')}` : '',
      this.state.searchedTerms.length ? `已搜索关键词：\n${this.state.searchedTerms.join('\n')}` : '',
      `连续无进展：${this.state.noProgress}`,
      `置信度：${this.state.confidence.toFixed(2)}`
    ]);

    if (isEmpty(sections)) {
      return [];
    }

    return [{role: 'system', content: sections.join('\n\n')}];
  }

  applyHypotheses(hypotheses: string[]) {
    this.state.hypotheses = compact(hypotheses);
  }

  rejectHypotheses(hypotheses: string[]) {
    this.state.rejected = union(this.state.rejected, compact(hypotheses));
  }

  addFacts(facts: string[]) {
    this.state.facts = union(this.state.facts, compact(facts));
  }

  recordToolCall(name: string, input: unknown) {
    if (name === 'read_file' && input && typeof input === 'object' && 'path' in input) {
      this.state.visitedFiles = union(this.state.visitedFiles, [String((input as {path: string}).path)]);
    }

    if (name === 'grep' && input && typeof input === 'object' && 'pattern' in input) {
      this.state.searchedTerms = union(this.state.searchedTerms, [
        String((input as {pattern: string}).pattern)
      ]);
    }
  }

  snapshotProgress() {
    return {
      facts: this.state.facts.length,
      visitedFiles: this.state.visitedFiles.length,
      searchedTerms: this.state.searchedTerms.length
    };
  }

  noteProgress(before: ReturnType<AgentSession['snapshotProgress']>) {
    const after = this.snapshotProgress();
    const progressed =
      after.facts > before.facts ||
      after.visitedFiles > before.visitedFiles ||
      after.searchedTerms > before.searchedTerms;

    if (progressed) {
      this.state.noProgress = 0;
      return;
    }

    this.state.noProgress += 1;
  }

  status(status: AgentStatus, message?: string) {
    this.options.onEvent({type: 'status', status, message});
  }

  say(role: ChatRole, content: string) {
    this.options.onEvent({type: 'message', role, content});
  }

  startAssistantStream() {
    this.options.onEvent({type: 'message_start', role: 'assistant'});
  }

  appendAssistantDelta(delta: string) {
    this.options.onEvent({type: 'message_delta', delta});
  }

  commitAssistant(message: ChatCompletionAssistantMessageParam, streamed: boolean) {
    this.messages.push(assistantMessage(message));

    if (streamed) {
      this.options.onEvent({type: 'message_end'});
      return;
    }

    const content = messageText(message.content);
    if (content) {
      this.say('assistant', content);
    }
  }

  announceUser() {
    if (this.userAnnounced) {
      return;
    }

    this.userAnnounced = true;
    this.say('user', this.options.input);
  }

  addAssistant(message: ChatCompletionAssistantMessageParam) {
    this.commitAssistant(message, false);
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
