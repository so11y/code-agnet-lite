import {describe, expect, it} from 'vitest';
import {withTimeout} from '@code-agent-lite/shared';

describe('withTimeout', () => {
  it('aborts the underlying operation when the timeout expires', async () => {
    let operationSignal: AbortSignal | undefined;

    const result = withTimeout(
      (signal) => {
        operationSignal = signal;
        return new Promise<never>(() => {});
      },
      5
    );

    await expect(result).rejects.toThrow('Timed out after 5ms');
    expect(operationSignal?.aborted).toBe(true);
  });

  it('propagates parent cancellation to the underlying operation', async () => {
    const controller = new AbortController();
    let operationSignal: AbortSignal | undefined;
    const result = withTimeout(
      (signal) => {
        operationSignal = signal;
        return new Promise<never>(() => {});
      },
      1_000,
      controller.signal
    );

    controller.abort();

    await expect(result).rejects.toMatchObject({name: 'AbortError'});
    expect(operationSignal?.aborted).toBe(true);
  });
});
