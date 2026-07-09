import type {ToolDisplay} from '@code-agent-lite/shared';

export type FinishToolOptions = {
  error?: string;
  display?: ToolDisplay;
  toolName?: string;
  toolInput?: unknown;
};
