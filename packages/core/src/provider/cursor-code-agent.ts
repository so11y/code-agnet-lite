import {formatSkillCatalog} from '@code-agent-lite/tools';
import {getContextLimit, getCursorModel} from '@code-agent-lite/platform';
import {buildCursorTurnPrompt} from '../prompt.js';
import {messageText} from '../openai-message.js';
import {
  AgentStatus,
  type AgentMessage,
  type TokenUsage,
  type ToolCall,
  type ToolCallItem
} from '../session-types.js';
import type {FinishToolOptions} from '../session/finish-tool-options.js';
import type {CodeAgent} from '../code-agent.js';
import {AgentRunReason, type AgentRunResult} from '../react-agent.js';
import type {AgentSession} from '../session.js';
import {
  CursorStreamEventResult,
  mapCursorStreamEvent,
  shouldStartAssistantStream,
  type CursorSdkMessage,
  type CursorStreamMapperSink
} from './cursor-stream-mapper.js';
import {cursorSessionPool} from './cursor-session-pool.js';
import {normalizeCursorUsage, recordTokenUsage} from './token-usage.js';

type CompletedCursorTool = {
  call: ToolCallItem;
  output: string;
  options?: FinishToolOptions;
};

const MUTATING_TOOLS = new Set(['write_file', 'delete_file', 'run_cmd', 'set_workspace']);

function cursorToolCall(call: ToolCallItem): ToolCall {
  return {
    type: 'tool-call',
    toolCallId: call.id,
    toolName: call.name,
    input: call.input
  };
}

export class CursorCodeAgent implements CodeAgent {
  constructor(private readonly session: AgentSession) {}

  async run(): Promise<AgentRunResult> {
    this.session.events.status(AgentStatus.Thinking, 'Cursor Agent');

    const agent = await cursorSessionPool.ensure(this.session, this.session.cwd);
    const openTools = new Map<string, ToolCallItem>();
    const completedTools: CompletedCursorTool[] = [];
    let streamedText = '';
    const streamSink = this.cursorStreamSink(completedTools, (text) => {
      streamedText += text;
    });
    let assistantStreamStarted = false;

    const userInput = this.session.ledger.collectTurnRecord(
      this.session.conversation.extractLastAssistantText()
    ).userInput;
    const prompt = buildCursorTurnPrompt(userInput, {
      catalog: formatSkillCatalog(this.session.skills.listCatalog()),
      skillNotes: collectSkillNotes(this.session.conversation.messages)
    });
    const mode = this.session.toolRegistry.tools.some((tool) => MUTATING_TOOLS.has(tool.name))
      ? 'agent'
      : 'plan';
    const run = await agent.send(prompt, {mode});
    let recordedUsageFromStream = false;

    for await (const event of run.stream()) {
      this.session.throwIfAborted();
      const message = event as CursorSdkMessage;

      if (!assistantStreamStarted && shouldStartAssistantStream(message)) {
        this.session.events.startAssistantStream();
        assistantStreamStarted = true;
      }

      if (
        mapCursorStreamEvent(message, streamSink, openTools) ===
        CursorStreamEventResult.Usage
      ) {
        recordedUsageFromStream = true;
      }
    }

    this.session.throwIfAborted();

    const result = await run.wait();

    if (!recordedUsageFromStream && result.usage) {
      recordTokenUsage(
        this.session.events,
        this.withCursorContext(normalizeCursorUsage(result.usage))
      );
    }

    if (result.status === 'error') {
      throw new Error(`Cursor Agent 运行失败（run ${result.id ?? 'unknown'}）`);
    }

    const text = result.result?.trim() || streamedText.trim();

    for (const {call, output, options} of completedTools) {
      this.session.conversation.recordAssistant({
        role: 'assistant',
        content: [cursorToolCall(call)]
      });
      this.session.conversation.recordToolResult(call.id, output, options);
    }

    if (text) {
      this.session.conversation.commitAssistant(
        {role: 'assistant', content: text},
        assistantStreamStarted
      );
      return {steps: 1, reason: AgentRunReason.FinalAnswer};
    }

    if (!completedTools.length) {
      this.session.events.say('assistant', '（Cursor Agent 未返回文本）');
    }

    return {steps: 1, reason: AgentRunReason.MaxSteps};
  }

  private cursorStreamSink(
    completedTools: CompletedCursorTool[],
    onText: (text: string) => void
  ): CursorStreamMapperSink {
    return {
      startTool: (call) => {
        this.session.ledger.recordToolCall(call.name, call.input);
        this.session.events.startTool(call);
      },
      finishTool: (id, output, options) => {
        const call = {
          id,
          name: options?.toolName ?? 'unknown_tool',
          input: options?.toolInput ?? {}
        };
        completedTools.push({call, output, options});
        this.session.events.finishTool(id, output, options);
      },
      appendAssistantDelta: (text) => {
        onText(text);
        this.session.events.appendAssistantDelta(text);
      },
      showThinking: (text) => this.session.events.say('thinking', text),
      recordTokenUsage: (usage) =>
        this.session.events.recordTokenUsage(this.withCursorContext(usage))
    };
  }

  private withCursorContext(usage: TokenUsage): TokenUsage {
    return {...usage, contextLimit: getContextLimit(getCursorModel())};
  }
}

function collectSkillNotes(messages: AgentMessage[]): string[] {
  const notes: string[] = [];

  for (const message of messages) {
    if (message.role !== 'system') {
      continue;
    }

    const content = messageText(message.content);
    if (content?.startsWith('[Skill:')) {
      notes.push(content);
    }
  }

  return notes;
}
