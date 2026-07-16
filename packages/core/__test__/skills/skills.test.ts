import {describe, expect, it} from 'vitest';
import {AgentSession} from '../../src/session.js';
import type {Skill, SkillRegistry} from '../../src/skill-registry.js';

function createSession(skills: SkillRegistry) {
  return new AgentSession({
    cwd: '/project',
    skills,
    onEvent: () => {}
  });
}

function mockRegistry(overrides: Partial<SkillRegistry> = {}): SkillRegistry {
  const skill: Skill = {
    name: 'minimal-code',
    dirName: 'minimal-code',
    description: 'Use when writing code',
    body: 'Keep it simple.',
    path: '/project/.agent/skills/minimal-code/SKILL.md'
  };

  return {
    parseInput: () => ({cleanedInput: '', skillName: undefined}),
    load: async (_cwd, name) => (name === 'minimal-code' ? skill : undefined),
    discover: async () => [{name: skill.name, description: skill.description, dirName: skill.dirName}],
    formatCatalog: (items) => (items.length ? `catalog:${items.map((s) => s.name).join(',')}` : ''),
    formatNotFound: (name) => `missing:${name}`,
    formatForPrompt: (loaded) => `[Skill: ${loaded.name}]\n${loaded.body}`,
    ...overrides
  };
}

describe('Skills.ensureLoaded', () => {
  it('injects skill on first load', async () => {
    const session = createSession(mockRegistry());
    const outcome = await session.skills.ensureLoaded('/project', 'minimal-code');

    expect(outcome?.injected).toBe(true);
    expect(session.skills.listLoaded()).toEqual(['minimal-code']);
    expect(session.conversation.messages.some((m) => String(m.content).includes('[Skill: minimal-code]'))).toBe(true);
  });

  it('skips duplicate injection', async () => {
    const session = createSession(mockRegistry());

    await session.skills.ensureLoaded('/project', 'minimal-code');
    const second = await session.skills.ensureLoaded('/project', 'minimal-code');

    expect(second?.injected).toBe(false);
    expect(session.skills.listLoaded()).toEqual(['minimal-code']);
    expect(
      session.conversation.messages.filter((m) => String(m.content).includes('[Skill: minimal-code]')).length
    ).toBe(1);
  });

  it('returns undefined when skill is missing', async () => {
    const session = createSession(mockRegistry());
    const outcome = await session.skills.ensureLoaded('/project', 'missing');

    expect(outcome).toBeUndefined();
    expect(session.skills.listLoaded()).toEqual([]);
  });

  it('clears loaded state and injected prompt when workspace changes', async () => {
    const registry = mockRegistry({
      load: async (cwd, name) => ({
        name,
        dirName: name,
        description: 'workspace skill',
        body: `body:${cwd}`,
        path: `${cwd}/SKILL.md`
      })
    });
    const session = createSession(registry);

    await session.skills.ensureLoaded('/a', 'minimal-code');
    session.skills.resetWorkspace();
    const outcome = await session.skills.ensureLoaded('/b', 'minimal-code');

    expect(outcome?.injected).toBe(true);
    expect(session.skills.listLoaded()).toEqual(['minimal-code']);
    const skillMessages = session.conversation.messages.filter(
      (message) => message.role === 'system' && String(message.content).startsWith('[Skill:')
    );
    expect(skillMessages).toHaveLength(1);
    expect(String(skillMessages[0]!.content)).toContain('body:/b');
    expect(String(skillMessages[0]!.content)).not.toContain('body:/a');
  });
});

describe('prepareTurn /skill', () => {
  it('loads skill from /skill input', async () => {
    const registry = mockRegistry({
      parseInput: () => ({skillName: 'minimal-code', cleanedInput: 'refactor auth'})
    });
    const session = createSession(registry);
    const {prepareTurn} = await import('../../src/turn/prepare-turn.js');

    const cleaned = await prepareTurn(session, '/skill minimal-code refactor auth', '/project');

    expect(cleaned).toBe('refactor auth');
    expect(session.skills.isLoaded('minimal-code')).toBe(true);
  });
});
