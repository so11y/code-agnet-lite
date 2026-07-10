import {describe, expect, it, vi} from 'vitest';
import {PluginDriver} from '../../src/plugin/driver.js';
import {
  createPluginSessionContext,
  HookStrategy,
  PluginHook,
  type AgentPlugin,
  type PluginTurnContext
} from '../../src/plugin/types.js';
import {AgentSession} from '../../src/session.js';

function createCtx(input = 'hello', cwd = '/tmp'): PluginTurnContext {
  const events: unknown[] = [];
  const session = new AgentSession({
    cwd,
    onEvent: (event) => events.push(event)
  });

  return {session, cwd, input, meta: new Map()};
}

describe('PluginDriver', () => {
  it('runs hooks in rollup order and always closeTurn', async () => {
    const order: string[] = [];

    const plugins: AgentPlugin[] = [
      {
        name: 'prepare',
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
        name: 'mode',
        async execute(ctx) {
          order.push('execute');
          expect(ctx.input).toBe('hello!');
          expect(ctx.meta.get('prepared')).toBe(true);
          ctx.meta.set('dagSucceeded', true);
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

    expect(order).toEqual(['transform', 'route', 'prepareAgent', 'execute', 'closeTurn']);
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

  it('runHook all collects returns', async () => {
    const plugins: AgentPlugin[] = [
      {name: 'a', sessionReady: () => 'a'},
      {name: 'b', sessionReady: () => 'b'}
    ];
    const session = new AgentSession({cwd: '/tmp', plugins, onEvent: () => {}});

    const results = await new PluginDriver(plugins).runHook(
      PluginHook.SessionReady,
      HookStrategy.All,
      createPluginSessionContext(session)
    );

    expect(results).toEqual(['a', 'b']);
  });

  it('runHook first returns first accepted value', async () => {
    const plugins: AgentPlugin[] = [
      {name: 'a', resolveMode: () => null},
      {name: 'b', resolveMode: () => ({mode: 'react', confidence: 1, reason: 'b'})},
      {name: 'c', resolveMode: () => ({mode: 'dag', confidence: 1, reason: 'c'})}
    ];
    const ctx = createCtx();

    const route = await new PluginDriver(plugins).runHook(
      PluginHook.ResolveMode,
      HookStrategy.First,
      ctx.input,
      ctx
    );

    expect(route).toEqual({mode: 'react', confidence: 1, reason: 'b'});
  });

  it('runs session lifecycle hooks in enforce order', async () => {
    const order: string[] = [];

    const plugins: AgentPlugin[] = [
      {name: 'post', enforce: 'post', sessionReady: () => { order.push('post'); }},
      {name: 'normal', sessionReady: () => { order.push('normal'); }},
      {name: 'pre', enforce: 'pre', sessionReady: () => { order.push('pre'); }}
    ];

    const session = new AgentSession({cwd: '/tmp', plugins, onEvent: () => {}});
    await new PluginDriver(plugins).runHook(
      PluginHook.SessionReady,
      HookStrategy.Void,
      createPluginSessionContext(session)
    );

    expect(order).toEqual(['pre', 'normal', 'post']);
  });

  it('passes prev cwd to workspaceChange', async () => {
    const workspaceChange = vi.fn(async () => {});
    const plugins: AgentPlugin[] = [{name: 'ws', workspaceChange}];
    const session = new AgentSession({cwd: '/tmp', plugins, onEvent: () => {}});

    await new PluginDriver(plugins).runHook(
      PluginHook.WorkspaceChange,
      HookStrategy.Void,
      createPluginSessionContext(session),
      '/old'
    );

    expect(workspaceChange).toHaveBeenCalledWith(
      expect.objectContaining({cwd: '/tmp', session}),
      '/old'
    );
  });
});
