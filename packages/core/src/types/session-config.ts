import type {AgentProviderKind} from '@code-agent-lite/platform';
import type {AgentEvent} from './events.js';
import type {ToolRegistry} from '../tool-registry.js';
import type {SkillRegistry} from '../skill-registry.js';
import type {AgentPlugin} from '../plugin/types.js';

export type AgentSessionOptions = {
  cwd: string;
  onEvent(event: AgentEvent): void;
  maxSteps?: number;
  provider?: AgentProviderKind;
  tools?: ToolRegistry;
  skills?: SkillRegistry;
  plugins?: AgentPlugin[];
};
