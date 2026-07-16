import {beforeEach, describe, expect, it, vi} from 'vitest';

const {callStructuredLlm} = vi.hoisted(() => ({callStructuredLlm: vi.fn()}));

vi.mock('../../src/structured-llm-caller.js', () => ({callStructuredLlm}));

import {AgentSession} from '../../src/session.js';
import {VerifyCoordinator} from '../../src/verify/verify-coordinator.js';

describe('VerifyCoordinator.judgeGate', () => {
  beforeEach(() => callStructuredLlm.mockReset());

  it('requires verification for writes without asking the model', async () => {
    const session = new AgentSession({cwd: '/project', onEvent() {}});
    session.beginTurn('修改');
    session.ledger.recordToolCall('write_file', {path: 'a.ts'});

    const result = await VerifyCoordinator.judgeGate(session);

    expect(result.gate.shouldVerify).toBe(true);
    expect(callStructuredLlm).not.toHaveBeenCalled();
  });

  it('skips pure read-only turns without asking the model', async () => {
    const session = new AgentSession({cwd: '/project', onEvent() {}});
    session.beginTurn('解释代码');
    session.ledger.recordToolCall('read_file', {path: 'a.ts'});

    const result = await VerifyCoordinator.judgeGate(session);

    expect(result.gate.shouldVerify).toBe(false);
    expect(callStructuredLlm).not.toHaveBeenCalled();
  });
});
