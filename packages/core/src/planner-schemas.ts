import {zodToJsonSchema} from 'zod-to-json-schema';
import {z} from 'zod';

/** Planner 输出：工作假设与验证计划（对应 session.ledger.state.hypotheses） */
export const planSchema = z.object({
  summary: z.string().describe('一句简洁的中文摘要'),
  hypotheses: z
    .array(z.string().describe('单条假设或执行步骤'))
    .min(1)
    .describe('当前工作假设；首项为主方向，其余为具体步骤'),
  risks: z.array(z.string().describe('单条风险、隐含假设或取舍')).default([]).describe('重要风险与待验证前提'),
  verification: z
    .array(z.string().describe('单条检查项'))
    .default([])
    .describe('ReAct 执行器必须完成的验证项')
});

/** Review 输出：复盘结果（写入 session.ledger.state 的 facts / rejected / hypotheses） */
export const reviewSchema = z.object({
  directionCorrect: z.boolean().describe('当前假设方向是否基本正确'),
  summary: z.string().describe('复盘摘要，需包含执行过程中实际发生了什么'),
  confidence: z.number().min(0).max(1).default(0.5).describe('对当前方向与结论的置信度，0–1'),
  facts: z
    .array(z.string().describe('单条已知事实'))
    .default([])
    .describe('从对话记录中可观察到的已知事实，写入 session.ledger.state.facts'),
  rejected: z
    .array(z.string().describe('单条被否定的假设'))
    .default([])
    .describe('directionCorrect=false 时被否定的假设；否则为空数组'),
  hypotheses: z
    .array(z.string().describe('单条修正假设或后续步骤'))
    .default([])
    .describe('directionCorrect=false 时的修正假设与后续步骤；否则为空数组'),
  verification: z
    .array(z.string().describe('单条检查项'))
    .default([])
    .describe('修正方向后 ReAct 必须完成的验证项')
});

export type Plan = z.infer<typeof planSchema>;
export type Review = z.infer<typeof reviewSchema>;

export function formatSchemaForPrompt(schema: z.ZodTypeAny): string {
  const jsonSchema = zodToJsonSchema(schema, {$refStrategy: 'none'});
  const {$schema: _, ...rest} = jsonSchema as Record<string, unknown> & {$schema?: string};
  return JSON.stringify(rest, null, 2);
}
