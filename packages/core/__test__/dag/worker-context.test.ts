import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {AgentMessage, LlmStreamOptions} from '../../src/session-types.js';

const {streamWithTools} = vi.hoisted(() => ({streamWithTools: vi.fn()}));

vi.mock('../../src/provider/openai-provider.js', () => ({
  openAiLlm: {streamWithTools}
}));

import {DagWorker} from '../../src/dag/worker.js';
import {Blackboard, TaskNode} from '../../src/dag/dag-model.js';
import {AgentSession} from '../../src/session.js';
import type {SkillRegistry} from '../../src/skill-registry.js';

const skills: SkillRegistry = {
  parseInput: (input) => ({cleanedInput: input}),
  discover: async () => [],
  load: async (_cwd, name) => ({
    name,
    dirName: name,
    description: 'test skill',
    body: 'follow skill instructions',
    path: `/skills/${name}/SKILL.md`
  }),
  formatCatalog: () => '',
  formatNotFound: (name) => `missing:${name}`,
  formatForPrompt: (skill) => `[Skill: ${skill.name}]\n${skill.body}`
};

describe('DagWorker parent context', () => {
  beforeEach(() => {
    streamWithTools.mockReset();
  });

  it('inherits the abort signal and loaded skills while aggregating token deltas', async () => {
    const seenMessages: AgentMessage[][] = [];
    const seenSignals: Array<AbortSignal | undefined> = [];
    let call = 0;
    streamWithTools.mockImplementation(
      async (...args: [AgentMessage[], LlmStreamOptions]) => {
        const [messages, options] = args;
        if (!options) {
          throw new Error(`streamWithTools arguments: ${args.length}`);
        }
        call += 1;
        seenMessages.push(messages);
        seenSignals.push(options.signal);
        options.session?.events.recordTokenUsage({prompt: 10, completion: 5, total: 15});

        if (call === 1) {
          return {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'unknown',
                type: 'function',
                function: {name: 'unknown_tool', arguments: '{}'}
              }
            ]
          };
        }

        return {role: 'assistant', content: 'worker answer'};
      }
    );

    const controller = new AbortController();
    const parent = new AgentSession({cwd: '/project', skills, onEvent() {}});
    parent.setTurnSignal(controller.signal);
    await parent.skills.ensureLoaded('/project', 'minimal-code');
    const node = new TaskNode({
      id: 'explore',
      kind: 'explore',
      goal: 'inspect',
      dependsOn: []
    });

    const output = await new DagWorker(node, new Blackboard(), parent, 3).run();

    expect(output.summary).toBe('worker answer');
    expect(seenSignals).toEqual([controller.signal, controller.signal]);
    expect(
      seenMessages[0].some(
        (message) => message.role === 'system' && String(message.content).includes('[Skill: minimal-code]')
      )
    ).toBe(true);
    expect(parent.events.tokenUsage).toMatchObject({prompt: 20, completion: 10, total: 30});
  });
});
