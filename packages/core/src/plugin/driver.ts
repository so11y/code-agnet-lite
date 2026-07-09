import type {AgentSession} from '../session.js';
import {sortPlugins} from './sort.js';
import {createPluginTurnContext, type AgentPlugin, type PluginTurnContext} from './types.js';

export class PluginDriver {
  constructor(private readonly plugins: AgentPlugin[]) {}

  async run(input: string, cwd: string, session: AgentSession): Promise<void> {
    const ctx = createPluginTurnContext(session, input, cwd);
    const plugins = sortPlugins(this.plugins);

    for (const plugin of plugins) {
      await plugin.buildStart?.(ctx);
    }

    let text = input;
    for (const plugin of plugins) {
      const next = await plugin.transformInput?.(text, ctx);
      if (typeof next === 'string') {
        text = next;
      }
    }

    ctx.input = text;

    for (const plugin of plugins) {
      const route = await plugin.resolveMode?.(text, ctx);
      if (route) {
        ctx.route = route;
      }
    }

    if (ctx.route) {
      session.reasoningMode = ctx.route.mode;
      session.events.say('system', `路由 → ${ctx.route.mode}：${ctx.route.reason}`);
    }

    for (const plugin of plugins) {
      await plugin.prepareAgent?.(ctx);
    }

    let finished = false;
    for (const plugin of plugins) {
      const result = await plugin.execute?.(ctx);
      if (result?.done) {
        finished = true;
        break;
      }
    }

    if (finished) {
      return;
    }

    for (const plugin of plugins) {
      await plugin.closeTurn?.(ctx);
    }
  }
}
