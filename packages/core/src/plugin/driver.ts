import {sortByEnforceOrder} from '@code-agent-lite/shared';
import type {ReasoningRoute} from '../router.js';
import type {AgentSession} from '../session.js';
import {
  createPluginTurnContext,
  HookStrategy,
  PluginHook,
  type AgentPlugin,
  type PluginTurnContext
} from './types.js';

function acceptsHookResult(hook: PluginHook, result: unknown): boolean {
  if (result === undefined) {
    return false;
  }

  if (hook === PluginHook.TransformInput) {
    return typeof result === 'string';
  }

  if (hook === PluginHook.ResolveMode) {
    return result != null;
  }

  return true;
}

export class PluginDriver {
  constructor(private readonly plugins: AgentPlugin[]) {}

  private ordered(): AgentPlugin[] {
    return sortByEnforceOrder(this.plugins);
  }

  async runHook(hook: PluginHook, strategy: HookStrategy, ...args: unknown[]): Promise<unknown> {
    const plugins = this.ordered();
    const collected: unknown[] = [];
    let reduced = args[0];
    let last: unknown;

    for (const plugin of plugins) {
      const fn = plugin[hook];
      if (typeof fn !== 'function') {
        continue;
      }

      const callArgs = strategy === HookStrategy.Reduce ? [reduced, ...args.slice(1)] : args;
      const result = await (fn as (...callArgs: unknown[]) => unknown | Promise<unknown>).apply(plugin, callArgs);

      if (!acceptsHookResult(hook, result)) {
        continue;
      }

      last = result;

      if (strategy === HookStrategy.First) {
        return result;
      }

      if (strategy === HookStrategy.Reduce) {
        reduced = result;
      }

      if (strategy === HookStrategy.All) {
        collected.push(result);
      }
    }

    switch (strategy) {
      case HookStrategy.All:
        return collected;
      case HookStrategy.Reduce:
        return reduced;
      case HookStrategy.Last:
        return last;
      default:
        return undefined;
    }
  }

  async run(input: string, cwd: string, session: AgentSession): Promise<void> {
    const ctx = createPluginTurnContext(session, input, cwd);

    await this.runHook(PluginHook.BuildStart, HookStrategy.Void, ctx);

    ctx.input = (await this.runHook(PluginHook.TransformInput, HookStrategy.Reduce, input, ctx)) as string;

    const route = (await this.runHook(
      PluginHook.ResolveMode,
      HookStrategy.Last,
      ctx.input,
      ctx
    )) as ReasoningRoute | undefined;
    if (route) {
      ctx.route = route;
      session.reasoningMode = route.mode;
      session.events.say('system', `路由 → ${route.mode}：${route.reason}`);
    }

    await this.runHook(PluginHook.PrepareAgent, HookStrategy.Void, ctx);
    await this.runHook(PluginHook.Execute, HookStrategy.Void, ctx);
    await this.runHook(PluginHook.CloseTurn, HookStrategy.Void, ctx);
  }
}

export type {PluginTurnContext};
