import {agentProviders} from '../provider/agent-providers.js';
import {routeReasoningMode} from '../router.js';
import {AgentStatus, VerificationOutcome} from '../session-types.js';
import {executeReasoningMode} from '../turn/execute-mode.js';
import {prepareTurn} from '../turn/prepare-turn.js';
import {runPostTurnVerify} from '../turn/post-turn.js';
import {skillCatalogPlugin} from './skill-catalog-plugin.js';
import type {AgentPlugin} from './types.js';

export function preparePlugin(): AgentPlugin {
  return {
    name: 'prepare',
    async transformInput(input, ctx) {
      return prepareTurn(ctx.session, input, ctx.targetCwd);
    }
  };
}

export function routerPlugin(): AgentPlugin {
  return {
    name: 'router',
    async resolveMode(input, ctx) {
      ctx.session.events.status(AgentStatus.Thinking, '路由判断');
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

      try {
        ctx.execution = await executeReasoningMode(ctx.session, mode, {
          agent: ctx.agent,
          input: ctx.input
        });
      } catch (error) {
        ctx.execution = {mode, succeeded: false, error};
        throw error;
      }
    }
  };
}

export function verifyPlugin(): AgentPlugin {
  return {
    name: 'verify',
    async closeTurn(ctx) {
      if (!ctx.agent || !ctx.execution) {
        return;
      }

      const operations = ctx.session.ledger.snapshotOperations();
      const failureMessage =
        ctx.execution.mode === 'dag' ? 'DAG 未完整完成' : 'Agent 未在限制内完成任务';

      if (ctx.execution.mode === 'dag' && ctx.execution.succeeded) {
        return;
      }

      if (!ctx.execution.succeeded && !operations.hasSideEffects) {
        ctx.session.events.status(AgentStatus.Error, failureMessage);
        return;
      }

      ctx.execution.verification = await runPostTurnVerify(
        ctx.agent,
        ctx.session,
        ctx.execution.mode
      );
      if (ctx.execution.verification === VerificationOutcome.Failed) {
        ctx.execution.succeeded = false;
      }
      if (!ctx.execution.succeeded) {
        ctx.session.events.status(AgentStatus.Error, `${failureMessage}（已检查副作用）`);
      }
    }
  };
}

export function defaultPlugins(): AgentPlugin[] {
  return [
    skillCatalogPlugin(),
    preparePlugin(),
    routerPlugin(),
    agentProviders.plugin(),
    modePlugin(),
    verifyPlugin()
  ];
}
