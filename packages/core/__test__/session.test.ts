import {describe, expect, it} from 'vitest';
import {AgentSession} from '../src/session.js';

describe('AgentSession cwd', () => {
  it('keeps cwd and options.cwd as one source of truth', async () => {
    const session = new AgentSession({cwd: '/old', onEvent() {}});

    await session.setWorkspace('/new');

    expect(session.cwd).toBe('/new');
    expect(session.options.cwd).toBe('/new');
    expect(session.createChildOptions({maxSteps: 5})).toMatchObject({cwd: '/new', maxSteps: 5});
  });
});
