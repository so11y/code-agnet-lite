import type {AgentSession} from '../session.js';
import {defaultPlugins, PluginDriver} from '../plugin/index.js';
import type {AgentPlugin} from '../plugin/types.js';

export class TurnOrchestrator {
  constructor(
    private readonly session: AgentSession,
    private readonly plugins: AgentPlugin[] = session.options.plugins ?? defaultPlugins(session.options.provider)
  ) {}

  async run(input: string, cwd: string): Promise<void> {
    await new PluginDriver(this.plugins).run(input, cwd, this.session);
  }
}
