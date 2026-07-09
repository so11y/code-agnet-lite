import type {AgentMemory} from './agent-memory.js';
import {createAgentMemory} from './agent-memory.js';
import type {SerializedTaskGraph, TaskNodeKind, TaskNodeStatus, TaskOutput} from './dag/types.js';

export * from './types/events.js';
export * from './types/llm.js';
export * from './types/operations.js';
export * from './types/reasoning.js';
export * from './types/session-config.js';
export * from './types/token.js';

/** 程序侧详细账本，供调度、冲突检测、verify 等使用 */
export type InternalState = AgentMemory;

export function createInternalState(): AgentMemory {
  return createAgentMemory();
}

export type {SerializedTaskGraph, TaskNodeKind, TaskNodeStatus, TaskOutput};
