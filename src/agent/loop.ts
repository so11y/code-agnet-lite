import type {ChatCompletion} from 'openai/resources/chat/completions';
import {toolsByName} from '../tools/index.js';
import {callLlm} from './llm.js';
import {ReActAgent} from './react-agent.js';
import type {AgentMessage, AgentOptions} from './types.js';

class CodeAgent extends ReActAgent {
  protected callLlm(messages: AgentMessage[]): Promise<ChatCompletion> {
    return callLlm(messages);
  }

  protected findTool(name: string) {
    return toolsByName.get(name);
  }
}

export async function runAgent(options: AgentOptions): Promise<void> {
  await new CodeAgent(options).run();
}
