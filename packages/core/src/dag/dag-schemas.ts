import {z} from 'zod';

export const dagPlanSchema = z.object({
  summary: z.string().describe('一句中文摘要，说明整体拆分策略'),
  tasks: z
    .array(
      z.object({
        id: z.string().describe('节点唯一 id，如 explore-auth'),
        kind: z.enum(['explore', 'edit', 'verify', 'merge']).describe('节点类型'),
        goal: z.string().describe('Worker 的自然语言子目标'),
        dependsOn: z.array(z.string()).default([]).describe('前置节点 id 列表'),
        reads: z.array(z.string()).default([]).describe('预计读取的文件路径'),
        writes: z.array(z.string()).default([]).describe('预计写入的文件路径'),
        commands: z.array(z.string()).default([]).describe('预计运行的 shell 命令')
      })
    )
    .min(2)
    .describe('DAG 节点列表，必须包含 1 个 merge 节点')
});

export type DagPlan = z.infer<typeof dagPlanSchema>;
