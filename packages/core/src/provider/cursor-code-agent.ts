import {throwIfAborted} from '@code-agent-lite/shared';
import type {AgentTool} from '@code-agent-lite/tools';
import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import type {AgentSession} from '../session.js';
import type {AgentMessage, AgentSessionOptions, LlmStreamOptions} from '../session-types.js';
import {ReActAgent, type AgentRunResult} from '../react-agent.js';
import {
  mapCursorStreamEvent,
  shouldStartAssistantStream,
  type CursorSdkMessage
} from './cursor-stream-mapper.js';
import {getCursorSessionPool} from './cursor-session-pool.js';
import {normalizeCursorUsage, recordTokenUsage} from './token-usage.js';

export class CursorCodeAgent extends ReActAgent {
  async run(): Promise<AgentRunResult> {
    this.session.status('thinking', 'Cursor Agent');

    const agent = await getCursorSessionPool().ensure(this.session, this.session.cwd);
    const openTools = new Set<string>();
    let assistantStreamStarted = false;

    const userInput = this.session.collectTurnContext().userInput;
    const run = await agent.send(userInput);
    let recordedUsageFromStream = false;

    for await (const event of run.stream()) {
      throwIfAborted(this.session.turnSignal());
      const message = event as CursorSdkMessage;

      if (!assistantStreamStarted && shouldStartAssistantStream(message)) {
        this.session.startAssistantStream();
        assistantStreamStarted = true;
      }

      if (mapCursorStreamEvent(message, this.session, openTools) === 'usage') {
        recordedUsageFromStream = true;
      }
    }

    throwIfAborted(this.session.turnSignal());

    const result = await run.wait();

    if (!recordedUsageFromStream && result.usage) {
      recordTokenUsage(this.session, normalizeCursorUsage(result.usage));
    }

    if (result.status === 'error') {
      throw new Error(`Cursor Agent 运行失败（run ${result.id ?? 'unknown'}）`);
    }

    const text = result.result?.trim();

    if (assistantStreamStarted) {
      this.session.commitAssistant({role: 'assistant', content: text || null}, true);
    } else if (text) {
      this.session.say('assistant', text);
    } else if (result.status !== 'error') {
      this.session.say('assistant', '（Cursor Agent 未返回文本）');
    }

    return {completed: true, steps: 1, reason: 'final_answer'};
  }

  protected async streamLlm(
    _messages: AgentMessage[],
    _options: LlmStreamOptions
  ): Promise<ChatCompletionAssistantMessageParam> {
    throw new Error('CursorCodeAgent 不使用 OpenAI streamLlm');
  }

  protected findTool(_name: string): AgentTool | undefined {
    return undefined;
  }
}

export function createCursorCodeAgent(options: AgentSessionOptions, session: AgentSession): CursorCodeAgent {
  return new CursorCodeAgent(options, session);
}
