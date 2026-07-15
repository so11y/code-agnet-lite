import type {AgentTool} from '@code-agent-lite/tools';
import {formatSkillCatalog} from '@code-agent-lite/tools';
import {buildCursorTurnPrompt} from '../prompt.js';
import {messageText} from '../openai-message.js';
import type {
  AgentMessage,
  AssistantMessage,
  LlmStreamOptions,
  ToolCall,
  ToolCallItem
} from '../session-types.js';
import {ReActAgent, type AgentRunResult} from '../react-agent.js';
import {
  mapCursorStreamEvent,
  shouldStartAssistantStream,
  type CursorSdkMessage,
  type CursorStreamMapperSink
} from './cursor-stream-mapper.js';
import {cursorSessionPool} from './cursor-session-pool.js';
import {normalizeCursorUsage, recordTokenUsage} from './token-usage.js';

function cursorAssistantMessage(text: string | undefined, toolCalls: ToolCall[]): AssistantMessage {
  if (!toolCalls.length) {
    return {role: 'assistant', content: text ?? ''};
  }

  return {
    role: 'assistant',
    content: [
      ...(text ? [{type: 'text' as const, text}] : []),
      ...toolCalls
    ]
  };
}

export class CursorCodeAgent extends ReActAgent {
  async run(): Promise<AgentRunResult> {
    this.session.events.status('thinking', 'Cursor Agent');

    const agent = await cursorSessionPool.ensure(this.session, this.session.cwd);
    const openTools = new Map<string, ToolCallItem>();
    const completedToolCalls: ToolCall[] = [];
    let assistantStreamStarted = false;

    const userInput = this.session.ledger.collectTurnRecord(
      this.session.conversation.extractLastAssistantText()
    ).userInput;
    const prompt = buildCursorTurnPrompt(userInput, {
      catalog: formatSkillCatalog(this.session.skills.listCatalog()),
      skillNotes: collectSkillNotes(this.session.conversation.messages)
    });
    const run = await agent.send(prompt);
    let recordedUsageFromStream = false;

    for await (const event of run.stream()) {
      this.session.throwIfAborted();
      const message = event as CursorSdkMessage;

      if (!assistantStreamStarted && shouldStartAssistantStream(message)) {
        this.session.events.startAssistantStream();
        assistantStreamStarted = true;
      }

      if (
        mapCursorStreamEvent(message, this.cursorStreamSink(completedToolCalls), openTools) ===
        'usage'
      ) {
        recordedUsageFromStream = true;
      }
    }

    this.session.throwIfAborted();

    const result = await run.wait();

    if (!recordedUsageFromStream && result.usage) {
      recordTokenUsage(this.session.events, normalizeCursorUsage(result.usage));
    }

    if (result.status === 'error') {
      throw new Error(`Cursor Agent 运行失败（run ${result.id ?? 'unknown'}）`);
    }

    const text = result.result?.trim();

    if (assistantStreamStarted) {
      this.session.conversation.commitAssistant(
        cursorAssistantMessage(text, completedToolCalls),
        true
      );
    } else if (text || completedToolCalls.length) {
      this.session.conversation.commitAssistant(
        cursorAssistantMessage(text, completedToolCalls),
        false
      );
    } else {
      this.session.events.say('assistant', '（Cursor Agent 未返回文本）');
    }

    return {steps: 1, reason: 'final_answer'};
  }

  private cursorStreamSink(completedToolCalls: ToolCall[]): CursorStreamMapperSink {
    return {
      startTool: (call) => this.session.events.startTool(call),
      finishTool: (id, output, options) => {
        if (options?.toolName) {
          this.session.ledger.recordToolCall(options.toolName, options.toolInput ?? {});
          completedToolCalls.push({
            type: 'tool-call',
            toolCallId: id,
            toolName: options.toolName,
            input: options.toolInput ?? {}
          });
        }

        this.session.conversation.finishTool(id, output, options);
      },
      appendAssistantDelta: (text) => this.session.events.appendAssistantDelta(text),
      recordTokenUsage: (usage) => this.session.events.recordTokenUsage(usage)
    };
  }

  protected async streamLlm(
    _messages: AgentMessage[],
    _options: LlmStreamOptions
  ): Promise<AssistantMessage> {
    throw new Error('CursorCodeAgent 不使用 OpenAI streamLlm');
  }

  protected findTool(_name: string): AgentTool | undefined {
    return undefined;
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
