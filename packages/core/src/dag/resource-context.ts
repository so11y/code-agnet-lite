import {normalizePath} from '@code-agent-lite/shared';
import type {ResourceClaim} from './types.js';

export {Semaphore} from 'async-mutex';

export function claimsConflict(left: ResourceClaim, right: ResourceClaim): boolean {
  const leftWrites = new Set(left.writes.map(normalizePath));
  const rightWrites = new Set(right.writes.map(normalizePath));
  const leftReads = new Set(left.reads.map(normalizePath));
  const rightReads = new Set(right.reads.map(normalizePath));

  for (const filePath of leftWrites) {
    if (rightWrites.has(filePath) || rightReads.has(filePath)) {
      return true;
    }
  }

  for (const filePath of rightWrites) {
    if (leftReads.has(filePath)) {
      return true;
    }
  }

  return left.commands.length > 0 && right.commands.length > 0;
}

export type ReleaseHandle = () => void;

export type ResourceContext = {
  acquireRead(filePath: string, holder?: string): Promise<ReleaseHandle>;
  acquireWrite(filePath: string, holder?: string): Promise<ReleaseHandle>;
  acquireCommand(holder?: string): Promise<ReleaseHandle>;
};

type HolderEntry = {
  mode: 'read' | 'write';
  count: number;
};

class PathRwLock {
  private readonly holders = new Map<string, HolderEntry>();
  private readonly waitQueue: Array<() => void> = [];

  async acquireRead(holder: string): Promise<ReleaseHandle> {
    while (!this.canAcquireRead(holder)) {
      await this.waitTurn();
    }

    const entry = this.holders.get(holder);
    if (entry?.mode === 'write') {
      return () => {};
    }

    this.holders.set(holder, {mode: 'read', count: (entry?.count ?? 0) + 1});
    return () => this.release(holder);
  }

  async acquireWrite(holder: string): Promise<ReleaseHandle> {
    while (!this.canAcquireWrite(holder)) {
      await this.waitTurn();
    }

    const entry = this.holders.get(holder);
    if (entry?.mode === 'write') {
      entry.count += 1;
      return () => this.release(holder);
    }

    this.holders.set(holder, {mode: 'write', count: 1});
    return () => this.release(holder);
  }

  private canAcquireRead(holder: string): boolean {
    for (const [other, entry] of this.holders) {
      if (other !== holder && entry.mode === 'write') {
        return false;
      }
    }
    return true;
  }

  private canAcquireWrite(holder: string): boolean {
    for (const [other] of this.holders) {
      if (other !== holder) {
        return false;
      }
    }
    return true;
  }

  private waitTurn(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  private release(holder: string): void {
    const entry = this.holders.get(holder);
    if (!entry) {
      return;
    }

    entry.count -= 1;
    if (entry.count <= 0) {
      this.holders.delete(holder);
      this.waitQueue.shift()?.();
    }
  }
}

class CommandLock {
  private holder?: string;
  private count = 0;
  private readonly waitQueue: Array<() => void> = [];

  async acquire(holder: string): Promise<ReleaseHandle> {
    while (this.holder !== undefined && this.holder !== holder) {
      await new Promise<void>((resolve) => {
        this.waitQueue.push(resolve);
      });
    }

    this.holder = holder;
    this.count += 1;
    return () => this.release(holder);
  }

  private release(holder: string): void {
    if (this.holder !== holder) {
      return;
    }

    this.count -= 1;
    if (this.count <= 0) {
      this.holder = undefined;
      this.count = 0;
      this.waitQueue.shift()?.();
    }
  }
}

export function createResourceContext(): ResourceContext {
  const pathLocks = new Map<string, PathRwLock>();
  const commandLock = new CommandLock();

  const getPathLock = (filePath: string) => {
    const normalized = normalizePath(filePath);
    let lock = pathLocks.get(normalized);
    if (!lock) {
      lock = new PathRwLock();
      pathLocks.set(normalized, lock);
    }
    return lock;
  };

  return {
    acquireRead(filePath, holder = '') {
      return getPathLock(filePath).acquireRead(holder);
    },
    acquireWrite(filePath, holder = '') {
      return getPathLock(filePath).acquireWrite(holder);
    },
    acquireCommand(holder = '') {
      return commandLock.acquire(holder);
    }
  };
}
