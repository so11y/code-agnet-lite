# DAG 失败恢复：当前实现

> 状态：已实现 Worker 重试与一次失败子图重规划。
> 本文只描述当前行为；计划中的 ReAct fallback 见 [plan-dag-react-fallback.md](plan-dag-react-fallback.md)。

## 恢复流程

```text
节点首次执行
  └─ 失败 → 同目标重试 1 次
       └─ 仍失败 → 重规划失败节点及其未完成下游 1 次
            └─ 仍失败 → DAG 失败收尾
```

约束：

- 已完成节点保留，不重复执行。
- Blackboard 保留成功输出和失败尝试已经发生的操作记录。
- 整个 DAG 最多进行一次子图重规划，不按失败链分别计数。
- 恢复后继续使用同一个 Scheduler 循环扫描 pending 节点。

## 代码位置

| 职责 | 位置 |
|------|------|
| Worker 执行与重试 | `packages/core/src/dag/worker.ts` → `DagWorker` |
| 节点状态 | `packages/core/src/dag/dag-model.ts` → `TaskNode` |
| ready/failed 查询与子图替换 | `packages/core/src/dag/task-graph.ts` → `TaskGraph` |
| 调度循环 | `packages/core/src/dag/dag-scheduler.ts` → `DagScheduler` |
| 恢复次数、重规划与收尾 | `packages/core/src/dag/orchestrator.ts` → `DagOrchestrator` |
| 子图规划 | `packages/core/src/dag/dag-planner.ts` → `llmReplanSubgraph` |
| 规划约束 | `packages/core/src/prompt.ts` → `DAG_SUBGRAPH_REPLAN_PROMPT` |

## 常量

```ts
MAX_WORKER_RETRIES = 1
MAX_SUBGRAPH_REPLANS = 1
```

两者分别与行为放在 `worker.ts` 和 `orchestrator.ts`。`MAX_SUBGRAPH_REPLANS` 是整个 DAG 的恢复上限。

## 子图范围

`TaskGraph.replanSet()` 从失败节点沿 DAG 边向下遍历：

- 收集失败节点。
- 收集其所有尚未完成的下游。
- 遇到 `done` 节点停止，不把成功结果重置。

`TaskGraph.externalDoneNodeIds()` 收集子图依赖的外部成功节点，其摘要会提供给重规划 LLM。

## 不实现

- 全图 replan。
- 失败后清空成功节点重新执行。
- 文件 rollback。
- DAG 失败后自动切换 ReAct（后续方案见 [plan-dag-react-fallback.md](plan-dag-react-fallback.md)）。
- 无限重试或无限重规划。
- Planner 猜测文件路径并据此加锁。

这些能力只有出现明确需求和可验证场景时再增加。

## 验收场景

1. 全成功：不重试、不重规划。
2. Worker 首次失败、重试成功：下游继续执行。
3. Worker 重试仍失败：替换失败节点及其 pending 下游，成功分支不动。
4. 子图重规划后仍失败：pending 下游标记 skipped，DAG 返回失败。
5. 重规划产生环或丢失 merge：拒绝替换。
