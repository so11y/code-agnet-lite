import {isReActAgent} from '../code-agent.js';
import {runDagTurn} from '../dag/orchestrator.js';
import {agentProviders} from '../provider/provider-registry.js';
import {routeReasoningMode} from '../router.js';
import {prepareTurn} from '../turn/prepare-turn.js';
import {runPostTurnVerify} from '../turn/post-turn.js';
import {runTotTurn} from '../turn/tot-turn.js';
import type {AgentPlugin} from './types.js';

export function skillPlugin(): AgentPlugin {
  return {
    name: 'skill',
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

export function reactPlugin(): AgentPlugin {
  return {
    name: 'react',
    async execute(ctx) {
      if (ctx.route?.mode !== 'react' || !ctx.agent) {
        return;
      }

      await ctx.agent.run();
      return {done: false};
    }
  };
}

export function totPlugin(): AgentPlugin {
  return {
    name: 'tot',
    async execute(ctx) {
      if (ctx.route?.mode !== 'tot' || !ctx.agent) {
        return;
      }

      if (!isReActAgent(ctx.agent)) {
        ctx.session.events.say('system', 'TOT 模式需要 OpenAI ReAct，当前 provider 已降级为 react。');
        await ctx.agent.run();
        return {done: false};
      }

      await runTotTurn(ctx.session, ctx.agent);
      return {done: false};
    }
  };
}

export function dagPlugin(): AgentPlugin {
  return {
    name: 'dag',
    async execute(ctx) {
      if (ctx.route?.mode !== 'dag') {
        return;
      }

      await runDagTurn(ctx.session, ctx.input);
      return {done: true};
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

      await runPostTurnVerify(ctx.agent, ctx.session);
    }
  };
}

export function defaultPlugins(): AgentPlugin[] {
  return [
    skillPlugin(),
    routerPlugin(),
    agentProviders.plugin(),
    reactPlugin(),
    totPlugin(),
    dagPlugin(),
    verifyPlugin()
  ];
}
