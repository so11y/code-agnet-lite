import {agentProviders} from '../provider/provider-registry.js';
import {routeReasoningMode} from '../router.js';
import {executeReasoningMode} from '../turn/execute-mode.js';
import {prepareTurn} from '../turn/prepare-turn.js';
import {runPostTurnVerify} from '../turn/post-turn.js';
import {skillCatalogPlugin} from './skill-catalog-plugin.js';
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

      await executeReasoningMode(ctx.session, mode, {
        agent: ctx.agent,
        input: ctx.input,
        meta: ctx.meta
      });
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
  return [skillCatalogPlugin(), preparePlugin(), routerPlugin(), agentProviders.plugin(), modePlugin(), verifyPlugin()];
}
