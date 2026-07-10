import {describe, expect, it, vi} from 'vitest';
import {AgentSession} from '../../src/session.js';
import type {SkillMeta, SkillRegistry} from '../../src/skill-registry.js';

function createSession(skills: SkillRegistry) {
  return new AgentSession({
    cwd: '/project',
    skills,
    onEvent: () => {}
  });
}

function mockRegistry(discover: SkillRegistry['discover']): SkillRegistry {
  return {
    parseInput: () => ({cleanedInput: '', skillNames: []}),
    load: async () => undefined,
    discover,
    formatCatalog: (items) => (items.length ? `catalog:${items.map((s) => s.name).join(',')}` : ''),
    formatNotFound: (name) => `missing:${name}`,
    formatForPrompt: (skill) => skill.content
  };
}

describe('Skills.mountCatalog', () => {
  it('skips discover when cwd already synced', async () => {
    const discover = vi.fn(async () => [{name: 'foo', description: 'd', dirName: 'foo'} satisfies SkillMeta]);
    const session = createSession(mockRegistry(discover));

    await session.skills.mountCatalog('/project');
    await session.skills.mountCatalog('/project');

    expect(discover).toHaveBeenCalledTimes(1);
  });

  it('refreshes catalog after invalidate on cwd change', async () => {
    const discover = vi.fn(async (cwd: string) => {
      return [{name: cwd === '/a' ? 'skill-a' : 'skill-b', description: 'd', dirName: 'x'}];
    });
    const session = createSession(mockRegistry(discover));

    await session.skills.mountCatalog('/a');
    expect(session.conversation.messages.some((m) => m.role === 'system' && String(m.content).includes('skill-a'))).toBe(true);

    session.skills.invalidateCatalog();
    await session.skills.mountCatalog('/b');

    expect(discover).toHaveBeenCalledTimes(2);
    expect(session.conversation.messages.filter((m) => m.role === 'system' && String(m.content).startsWith('catalog:')).length).toBe(1);
    expect(String(session.conversation.messages.find((m) => String(m.content).startsWith('catalog:'))?.content)).toContain('skill-b');
  });

  it('marks empty cwd synced without leaving catalog message', async () => {
    const discover = vi.fn(async () => [] as SkillMeta[]);
    const session = createSession(mockRegistry(discover));

    await session.skills.mountCatalog('/empty');
    await session.skills.mountCatalog('/empty');

    expect(discover).toHaveBeenCalledTimes(1);
    expect(session.conversation.messages.every((m) => !String(m.content).startsWith('catalog:'))).toBe(true);
    expect(session.conversation.isSkillCatalogSynced('/empty')).toBe(true);
  });
});
