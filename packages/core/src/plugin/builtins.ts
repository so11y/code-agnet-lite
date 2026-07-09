import {supportsToolLoop} from '../code-agent.js';
import {runDagTurn} from '../dag/orchestrator.js';
import {agentProviders} from '../provider/provider-registry.js';
import {routeReasoningMode} from '../router.js';
import {prepareTurn} from '../turn/prepare-turn.js';
import {runPostTurnVerify} from '../turn/post-turn.js';
import {runTotTurnWithRetries} from '../turn/tot-turn.js';
import type {AgentPlugin} from './types.js';

export function preparePlugin(): AgentPlugin {
  return {
    name: 'prepare',
    async transformInput(input, ctx) {
      return prepareTurn(ctx.session, input, ctx.cwd);
    }
  };
}

export function routerPlugin(): AgentPlugin {
  return {
    name: 'router',
    async resolveMode(input, ctx) {
      ctx.session.events.status('thinking', '路由判断');
      return routeReasoningMode(input, ctx.session);
    }
  };
}

export function modePlugin(): AgentPlugin {
  return {
    name: 'mode',
    async execute(ctx) {
      const mode = ctx.route?.mode;
      if (!mode) {
        return;
      }

      if (mode === 'dag') {
        const succeeded = await runDagTurn(ctx.session, ctx.input);
        ctx.meta.set('dagSucceeded', succeeded);
        return;
      }

      if (!ctx.agent) {
        return;
      }

      switch (mode) {
        case 'react':
          await ctx.agent.run();
          return;
        case 'tot':
          if (supportsToolLoop(ctx.agent)) {
            await runTotTurnWithRetries(ctx.session, ctx.agent);
            return;
          }

          ctx.session.events.say('system', 'TOT 模式需要 OpenAI ReAct，当前 provider 已降级为 react。');
          await ctx.agent.run();
          return;
      }
    }
  };
}

export function verifyPlugin(): AgentPlugin {
  return {
    name: 'verify',
    async closeTurn(ctx) {
      if (!ctx.agent) {
        return;
      }

      if (ctx.route?.mode === 'dag' && ctx.meta.get('dagSucceeded') === false) {
        return;
      }

      await runPostTurnVerify(ctx.agent, ctx.session);
    }
  };
}

export function defaultPlugins(): AgentPlugin[] {
  return [preparePlugin(), routerPlugin(), agentProviders.plugin(), modePlugin(), verifyPlugin()];
}

/** @deprecated 使用 preparePlugin */
export const skillPlugin = preparePlugin;

/** @deprecated 合并进 modePlugin */
export const reactPlugin = modePlugin;

/** @deprecated 合并进 modePlugin */
export const totPlugin = modePlugin;

/** @deprecated 合并进 modePlugin */
export const dagPlugin = modePlugin;
