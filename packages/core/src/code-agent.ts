import type {AgentTool} from '@code-agent-lite/tools';
import {openAiLlm} from './provider/openai-provider.js';
import {ReActAgent, type AgentRunResult} from './react-agent.js';
import type {AgentMessage, AssistantMessage, LlmStreamOptions} from './session-types.js';
import {CursorCodeAgent} from './provider/cursor-code-agent.js';

export class DefaultCodeAgent extends ReActAgent {
  protected async streamLlm(
    messages: AgentMessage[],
    options: LlmStreamOptions
  ): Promise<AssistantMessage> {
    return openAiLlm.streamWithTools(messages, options);
  }

  protected findTool(name: string): AgentTool | undefined {
    return this.session.toolRegistry.find(name);
  }
}

/** 任意 Agent 后端：至少能执行一轮 run */
export type CodeAgent = {
  run(): Promise<AgentRunResult>;
};

export function supportsToolLoop(agent: CodeAgent): agent is ReActAgent {
  return agent instanceof ReActAgent && !(agent instanceof CursorCodeAgent);
}
