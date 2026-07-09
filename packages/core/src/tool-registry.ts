import {tools, toolsByName, type AgentTool} from '@code-agent-lite/tools';

export type ToolRegistry = {
  readonly tools: readonly AgentTool[];
  find(name: string): AgentTool | undefined;
};

export function createDefaultToolRegistry(): ToolRegistry {
  return {
    tools,
    find: (name) => toolsByName.get(name)
  };
}
