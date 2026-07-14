import {z} from 'zod';
import {TASK_NODE_KINDS} from './dag-model.js';

export const dagTaskSchema = z.object({
  id: z.string().describe('节点唯一 id，如 explore-auth'),
  kind: z.enum(TASK_NODE_KINDS).describe('节点类型'),
  goal: z.string().describe('Worker 的自然语言子目标'),
  dependsOn: z.array(z.string()).default([]).describe('前置节点 id 列表')
});

export const dagPlanSchema = z.object({
  summary: z.string().describe('一句中文摘要，说明整体拆分策略'),
  tasks: z
    .array(dagTaskSchema)
    .min(2)
    .describe('DAG 节点列表，必须包含 1 个 merge 节点')
});

export const dagSubgraphPlanSchema = z.object({
  tasks: z.array(dagTaskSchema).min(1).describe('只包含指定受影响节点，节点 id 必须保持不变')
});

export type DagTask = z.infer<typeof dagTaskSchema>;
export type DagSubgraphPlan = z.infer<typeof dagSubgraphPlanSchema>;
