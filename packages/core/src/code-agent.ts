import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import type {AgentTool} from '@code-agent-lite/tools';
import {callLlmStream} from './llm.js';
import {ReActAgent, type AgentRunResult} from './react-agent.js';
import type {AgentSession} from './session.js';
import type {AgentMessage, AgentSessionOptions, LlmStreamOptions} from './session-types.js';
import {CursorCodeAgent} from './provider/cursor-code-agent.js';

export class DefaultCodeAgent extends ReActAgent {
  protected async streamLlm(
    messages: AgentMessage[],
    options: LlmStreamOptions
  ): Promise<ChatCompletionAssistantMessageParam> {
    return callLlmStream(messages, options);
  }

  protected findTool(name: string): AgentTool | undefined {
    return this.session.toolRegistry.find(name);
  }
}

export type CodeAgent = {
  run(): Promise<AgentRunResult>;
};

export function createDefaultCodeAgent(options: AgentSessionOptions, session: AgentSession): DefaultCodeAgent {
  return new DefaultCodeAgent(options, session);
}

export function isReActAgent(agent: CodeAgent): agent is ReActAgent {
  return agent instanceof ReActAgent && !(agent instanceof CursorCodeAgent);
}
