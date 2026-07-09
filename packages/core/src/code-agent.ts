import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import type {AgentTool} from '@code-agent-lite/tools';
import {openAiLlm} from './provider/openai-provider.js';
import {ReActAgent, type AgentRunResult} from './react-agent.js';
import type {AgentSession} from './session.js';
import type {AgentMessage, AgentSessionOptions, LlmStreamOptions} from './session-types.js';
import {CursorCodeAgent} from './provider/cursor-code-agent.js';

export class DefaultCodeAgent extends ReActAgent {
  protected async streamLlm(
    messages: AgentMessage[],
    options: LlmStreamOptions
  ): Promise<ChatCompletionAssistantMessageParam> {
    return openAiLlm.streamWithTools(messages, options);
  }

  protected findTool(name: string): AgentTool | undefined {
    return this.session.toolRegistry.find(name);
  }
}

export type CodeAgent = {
  run(): Promise<AgentRunResult>;
};

export function isReActAgent(agent: CodeAgent): agent is ReActAgent {
  return agent instanceof ReActAgent && !(agent instanceof CursorCodeAgent);
}
