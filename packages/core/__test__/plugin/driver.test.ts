import {describe, expect, it} from 'vitest';
import {PluginDriver} from '../../src/plugin/driver.js';
import type {AgentPlugin, PluginTurnContext} from '../../src/plugin/types.js';
import {createAgentSession} from '../../src/session.js';

function createCtx(input = 'hello', cwd = '/tmp'): PluginTurnContext {
  const events: unknown[] = [];
  const session = createAgentSession({
    cwd,
    onEvent: (event) => events.push(event)
  });

  return {session, cwd, input, meta: new Map()};
}

describe('PluginDriver', () => {
  it('runs hooks in rollup order and stops execute when done', async () => {
    const order: string[] = [];

    const plugins: AgentPlugin[] = [
      {
        name: 'skill',
        async transformInput(input, ctx) {
          order.push('transform');
          ctx.meta.set('prepared', true);
          return `${input}!`;
        }
      },
      {
        name: 'router',
        async resolveMode() {
          order.push('route');
          return {mode: 'dag', confidence: 1, reason: 'test'};
        }
      },
      {
        name: 'agent',
        prepareAgent(ctx) {
          order.push('prepareAgent');
          ctx.agent = {
            run: async () => ({completed: true, steps: 1, reason: 'final_answer'})
          };
        }
      },
      {
        name: 'dag',
        async execute(ctx) {
          order.push('execute');
          expect(ctx.input).toBe('hello!');
          expect(ctx.meta.get('prepared')).toBe(true);
          return {done: true};
        }
      },
      {
        name: 'verify',
        async closeTurn() {
          order.push('closeTurn');
        }
      }
    ];

    const ctx = createCtx();
    await new PluginDriver(plugins).run('hello', '/tmp', ctx.session);

    expect(order).toEqual(['transform', 'route', 'prepareAgent', 'execute']);
    expect(ctx.session.reasoningMode).toBe('dag');
  });

  it('sorts enforce pre/post plugins', async () => {
    const order: string[] = [];

    const plugins: AgentPlugin[] = [
      {name: 'post', enforce: 'post', buildStart: () => { order.push('post'); }},
      {name: 'normal', buildStart: () => { order.push('normal'); }},
      {name: 'pre', enforce: 'pre', buildStart: () => { order.push('pre'); }}
    ];

    const ctx = createCtx();
    await new PluginDriver(plugins).run('x', '/tmp', ctx.session);

    expect(order).toEqual(['pre', 'normal', 'post']);
  });
});
