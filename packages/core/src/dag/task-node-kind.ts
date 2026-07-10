export const TASK_NODE_KINDS = ['explore', 'edit', 'verify', 'merge'] as const;

export type TaskNodeKind = (typeof TASK_NODE_KINDS)[number];
