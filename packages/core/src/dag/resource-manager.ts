import path from 'node:path';
import type {ResourceClaim, TaskNode} from './types.js';

type PathLock = {
  nodeId: string;
  mode: 'read' | 'write';
};

export class ResourceManager {
  private readonly pathLocks = new Map<string, PathLock>();
  private commandLockNodeId?: string;

  tryAcquire(node: TaskNode): boolean {
    const claim = node.resources;

    if (claim.commands.length > 0 && this.commandLockNodeId && this.commandLockNodeId !== node.id) {
      return false;
    }

    for (const readPath of claim.reads) {
      const lock = this.pathLocks.get(normalizePath(readPath));
      if (lock && lock.nodeId !== node.id && lock.mode === 'write') {
        return false;
      }
    }

    for (const writePath of claim.writes) {
      const lock = this.pathLocks.get(normalizePath(writePath));
      if (lock && lock.nodeId !== node.id) {
        return false;
      }
    }

    for (const readPath of claim.reads) {
      this.pathLocks.set(normalizePath(readPath), {nodeId: node.id, mode: 'read'});
    }

    for (const writePath of claim.writes) {
      this.pathLocks.set(normalizePath(writePath), {nodeId: node.id, mode: 'write'});
    }

    if (claim.commands.length > 0) {
      this.commandLockNodeId = node.id;
    }

    return true;
  }

  release(nodeId: string) {
    for (const [filePath, lock] of this.pathLocks.entries()) {
      if (lock.nodeId === nodeId) {
        this.pathLocks.delete(filePath);
      }
    }

    if (this.commandLockNodeId === nodeId) {
      this.commandLockNodeId = undefined;
    }
  }

  recordDynamicWrite(nodeId: string, filePath: string): boolean {
    return this.recordDynamicPath(nodeId, filePath, 'write');
  }

  recordDynamicDelete(nodeId: string, filePath: string): boolean {
    return this.recordDynamicPath(nodeId, filePath, 'write');
  }

  tryAcquireCommand(nodeId: string): boolean {
    if (this.commandLockNodeId && this.commandLockNodeId !== nodeId) {
      return false;
    }

    this.commandLockNodeId = nodeId;
    return true;
  }

  private recordDynamicPath(nodeId: string, filePath: string, mode: 'read' | 'write'): boolean {
    const normalized = normalizePath(filePath);
    const lock = this.pathLocks.get(normalized);

    if (lock && lock.nodeId !== nodeId) {
      return false;
    }

    this.pathLocks.set(normalized, {nodeId, mode});
    return true;
  }
}

function normalizePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  return path.posix.normalize(normalized);
}

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
