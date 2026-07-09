export class TurnAbortedError extends Error {
  constructor(message = '任务已取消') {
    super(message);
    this.name = 'AbortError';
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof TurnAbortedError || (error instanceof Error && error.name === 'AbortError');
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new TurnAbortedError();
  }
}

function abortPromise(signal?: AbortSignal): Promise<never> | undefined {
  if (!signal) {
    return;
  }

  if (signal.aborted) {
    return Promise.reject(new TurnAbortedError());
  }

  return new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(new TurnAbortedError()), {once: true});
  });
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs = 60_000,
  signal?: AbortSignal
): Promise<T> {
  throwIfAborted(signal);

  let timer: NodeJS.Timeout | undefined;

  try {
    const racers: Array<Promise<T | never>> = [operation];

    racers.push(
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms.`)), timeoutMs);
      })
    );

    const onAbort = abortPromise(signal);
    if (onAbort) {
      racers.push(onAbort);
    }

    return await Promise.race(racers);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
