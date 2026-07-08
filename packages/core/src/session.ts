import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import {compact, union} from 'lodash-es';
import {messageText} from './openai-message.js';
import type {CursorAgentHandle} from './provider/types.js';
import {SYSTEM_PROMPT} from './prompt.js';
import {
  buildInjectedSnapshot,
  createInjectedSnapshot,
  diffInjectedSnapshot,
  formatStateDelta
} from './state-ai-view.js';
import {
  createInternalState,
  createTokenUsage,
  type AgentMessage,
  type AgentSessionOptions,
  type AgentStatus,
  type ChatRole,
  type InternalState,
  type LlmOptions,
  type LlmStreamOptions,
  type ReasoningMode,
  type TokenUsage,
  type ToolCallItem,
  type TurnContext,
  type TurnOperations
} from './session-types.js';

const assistantMessage = (message: ChatCompletionAssistantMessageParam): AgentMessage => ({
  role: 'assistant',
  content: message.content ?? null,
  tool_calls: message.tool_calls
});

type StateListKey = 'visitedFiles' | 'searchedTerms' | 'writtenFiles' | 'deletedFiles' | 'executedCommands';

type ToolTrack = {
  stateKey: StateListKey;
  field: string;
  turnKey?: keyof TurnOperations;
};

const TOOL_TRACKS: Record<string, ToolTrack> = {
  read_file: {stateKey: 'visitedFiles', field: 'path'},
  grep: {stateKey: 'searchedTerms', field: 'pattern'},
  write_file: {stateKey: 'writtenFiles', field: 'path', turnKey: 'writtenFiles'},
  delete_file: {stateKey: 'deletedFiles', field: 'path', turnKey: 'deletedFiles'},
  run_cmd: {stateKey: 'executedCommands', field: 'command', turnKey: 'executedCommands'}
};

function pickString(input: unknown, field: string): string | undefined {
  if (!input || typeof input !== 'object' || !(field in input)) {
    return;
  }

  return String((input as Record<string, unknown>)[field]);
}

export class AgentSession {
  cwd: string;
  reasoningMode?: ReasoningMode;
  cursorAgent?: CursorAgentHandle;
  cursorAgentCwd?: string;
  readonly messages: AgentMessage[];
  /** 程序侧详细 state */
  readonly state: InternalState;
  readonly tokenUsage: TokenUsage = createTokenUsage();
  private turnUserInput = '';
  private turnOps: TurnOperations = {writtenFiles: [], deletedFiles: [], executedCommands: []};
  /** AiView：上次已注入 LLM 的投影 baseline */
  private lastInjected_ = createInjectedSnapshot();
  private deltaStep_ = 0;

  constructor(readonly options: AgentSessionOptions) {
    this.cwd = options.cwd;
    this.state = createInternalState();
    this.messages = [
      {role: 'system', content: SYSTEM_PROMPT},
      {role: 'system', content: `当前工作区：${options.cwd}`}
    ];
  }

  beginTurn(userInput: string) {
    this.turnUserInput = userInput;
    this.turnOps = {writtenFiles: [], deletedFiles: [], executedCommands: []};
  }

  appendUser(content: string) {
    this.messages.push({role: 'user', content});
    this.say('user', content);
  }

  flushStateDelta() {
    const next = buildInjectedSnapshot(this.state, this.turnOps);
    const delta = diffInjectedSnapshot(this.lastInjected_, next);
    if (!delta) {
      return;
    }

    this.deltaStep_ += 1;
    this.addSystemNote(formatStateDelta(this.deltaStep_, delta, this.state));
    this.lastInjected_ = next;
  }

  buildLlmMessages(): AgentMessage[] {
    this.flushStateDelta();
    return this.messages;
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
    const track = TOOL_TRACKS[name];
    if (!track) {
      return;
    }

    const value = pickString(input, track.field);
    if (!value) {
      return;
    }

    this.state[track.stateKey] = union(this.state[track.stateKey], [value]);

    if (track.turnKey) {
      this.turnOps[track.turnKey] = union(this.turnOps[track.turnKey], [value]);
    }
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

  refreshOperations(): TurnOperations {
    return {
      writtenFiles: [...this.turnOps.writtenFiles],
      deletedFiles: [...this.turnOps.deletedFiles],
      executedCommands: [...this.turnOps.executedCommands]
    };
  }

  collectTurnContext(): TurnContext {
    return {
      userInput: this.turnUserInput,
      operations: this.refreshOperations(),
      assistantText: this.extractLastAssistantText()
    };
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

  recordTokenUsage(usage: TokenUsage) {
    this.tokenUsage.prompt += usage.prompt;
    this.tokenUsage.completion += usage.completion;
    this.tokenUsage.total += usage.total;
    this.options.onEvent({type: 'token_usage', usage});
  }

  llmOptions(): LlmOptions {
    return {session: this};
  }

  streamOptions(onDelta: (delta: string) => void): LlmStreamOptions {
    return {session: this, onDelta};
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

  setCursorAgent(agent?: CursorAgentHandle) {
    this.cursorAgent = agent;
  }

  setCursorAgentCwd(cwd?: string) {
    this.cursorAgentCwd = cwd;
  }
}

export function createAgentSession(options: AgentSessionOptions): AgentSession {
  return new AgentSession(options);
}
