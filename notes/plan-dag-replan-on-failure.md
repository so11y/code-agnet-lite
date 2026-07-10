# 待办：DAG 失败后自动换思路重规划

> **状态**：草案（待实施）  
> **目标**：DAG 某节点失败、下游被跳过后，Orchestrator 能带失败上下文重新规划并再跑一轮，尽量完成 merge，而不是直接以「DAG 未完整完成」收尾。

---

## 1. 背景与问题

### 1.1 现状

| 阶段 | 当前行为 |
|------|----------|
| 规划 | `llmPlanDag` 只执行一次 |
| 执行 | `DagScheduler` 跑完全图；上游失败 → 下游 `skipped` |
| 收尾 | 有 `failed` / `skipped` 且 merge 未成功 → `dagSucceeded=false`，verify 跳过 |
| 重试 | 无节点重试、无 replan |

关键代码：

- `packages/core/src/dag/orchestrator.ts` — `runDagTurn`
- `packages/core/src/dag/dag-scheduler.ts` — 上游失败跳过逻辑
- `packages/core/src/dag/dag-planner.ts` — 仅 root 规划
- `packages/core/src/dag/worker.ts` — `未返回有效摘要` 等 worker 错误

### 1.2 典型失败场景

- Worker 跑完步数但 assistant 无文本 → `Worker xxx 未返回有效摘要`
- explore 节点步数耗尽 → `Worker xxx 未在 N 步内完成`
- 规划路径本身不对（文件不存在、依赖关系错误等）

### 1.3 UI 误导

规划阶段设置 `status('thinking', 'DAG 规划')` 后，执行期不再更新 status，界面会一直显示「思考中 · DAG 规划」，易被误认为正在重新规划。

---

## 2. 目标行为

对齐 verify 的 fix loop（`verify-coordinator.ts` + `decideFixLoopAction`）：

```text
规划 → 执行 DAG
  ├─ merge 成功 → dagSucceeded=true，走现有 ledger merge
  └─ 有 failed / skipped
       ├─ replan 次数 < MAX → 拼装失败报告 → llmReplanDag → 再执行一轮
       └─ 达上限 → 现有失败收尾（报失败/跳过节点列表）
```

**原则：**

- 全图 replan，不做「只重跑失败分支」的增量 DAG（改动过大）
- replan 上限默认 **1**（与 `MAX_REPLAN_ATTEMPTS` 一致）
- replan prompt 携带：失败节点、跳过节点、已完成节点摘要
- 磁盘上已完成的 edit 不 rollback；新规划应补剩余工作

---

## 3. 改动范围

| 文件 | 改动 |
|------|------|
| `packages/core/src/prompt.ts` | 新增 `DAG_REPLAN_PROMPT` |
| `packages/core/src/dag/dag-planner.ts` | 新增 `llmReplanDag(input, session, failureContext)` |
| `packages/core/src/dag/orchestrator.ts` | `runDagTurn` 加 replan 循环 + `formatDagFailureReport` |
| `packages/core/src/dag/dag-scheduler.ts` | 执行开始设 `status('thinking', 'DAG 执行')` |
| `packages/core/src/dag/types.ts`（或新建 constants） | `MAX_DAG_REPLAN_ATTEMPTS = 1` |

**可选增强（Phase 2）：**

| 文件 | 改动 |
|------|------|
| `packages/core/src/dag/worker.ts` | 空摘要 / 步数耗尽时同 goal 重试 1 次 |

---

## 4. 实施待办

### Phase 1 — Orchestrator replan（推荐先做）

- [ ] 在 `types.ts` 定义 `MAX_DAG_REPLAN_ATTEMPTS = 1`
- [ ] `prompt.ts` 增加 `DAG_REPLAN_PROMPT`（参考 `PLAN_REPLAN_PROMPT`：不重复失败路径、利用已完成摘要）
- [ ] `dag-planner.ts` 实现 `llmReplanDag`：
  - status：`DAG 换思路规划`
  - user message = 原请求 + `failureContext`
  - 复用 `dagPlanSchema` / `validateDagPlan` / `buildGraphFromPlan`
- [ ] `orchestrator.ts` 改造 `runDagTurn` 为 while 循环：
  - merge 成功 → `return true`
  - 失败且 `replans < MAX` → `formatDagFailureReport(graph)` → `llmReplanDag` → 清空 blackboard → 继续
  - 达上限 → 现有 `DAG 未完整完成` 收尾 → `return false`
- [ ] `formatDagFailureReport`：输出失败节点（含 error）、跳过节点 id、已完成节点 summary
- [ ] `dag-scheduler.ts`：`run()` 入口设 `DAG 执行` status
- [ ] 补充单元测试（mock planner + scheduler）

### Phase 2 — Worker 节点重试（可选）

- [ ] `worker.ts`：`未返回有效摘要` 时同节点重试 1 次
- [ ] `worker.ts`：`未在 N 步内完成` 时是否重试 — 待议（可能浪费步数）
- [ ] 测试：mock 第一次空摘要、第二次有摘要 → 节点 `done`

### Phase 3 — 文档与观测

- [ ] `docs/architecture.md` 补充 DAG replan 流程说明
- [ ] replan 轮次写入 system 消息或 event，便于 CLI 展示
- [ ] 确认 replan 后 `dag_snapshot` 事件正确刷新任务列表

---

## 5. `formatDagFailureReport` 草案

```text
先前 DAG 未完整完成：

失败节点：
- explore-mcp-test：Worker explore-mcp-test 未返回有效摘要

跳过节点：edit-xxx、verify-all、merge-final

已完成节点：
- explore-server：已确认 mcp-server.js 导出结构…
- edit-list-users：已添加 list_users 工具…

请换思路重新规划，避免重复已失败路径；利用已完成结论补全剩余工作。
```

---

## 6. 边缘情况

| 场景 | 预期 |
|------|------|
| 全图成功 | 不触发 replan |
| 1 节点失败，replan 后成功 | `dagSucceeded=true` |
| replan 后仍失败 | 报失败/跳过列表，`verifyPlugin` 仍跳过 |
| 部分 edit 已落盘 | 新图不 rollback；replan prompt 告知已完成摘要 |
| replan 规划出环 / 非法依赖 | 与 `llmPlanDag` 一致抛错 |
| 用户 abort | `session.throwIfAborted()` 在循环内检查 |
| 并行分支一成功一失败 | 一次 replan 统一换方案 |

---

## 7. 测试用例

1. **全成功**：mock 所有 worker 返回摘要 → merge done → `true`，replan 调用 0 次
2. **一次失败后 replan 成功**：第一次 merge 未达 → replan 1 次 → 第二次 merge done → `true`
3. **replan 仍失败**：两次均有 failed → `false`，system 消息含失败/跳过列表
4. **failureContext 内容**：已完成节点 summary 进入 replan user message
5. **status 文案**：规划 → `DAG 规划`；执行 → `DAG 执行`；replan → `DAG 换思路规划`
6. **blackboard 清空**：replan 后新一轮不携带上一轮 nodeOutputs（摘要已在 prompt）

---

## 8. 明确不做（保持最简）

- [ ] 不做增量 DAG（只重跑失败子图）
- [ ] 不做无限 replan
- [ ] 不改 router 选 dag 的逻辑
- [ ] 不在 DAG 失败时 fallback 到 react 单 Agent（除非另开需求）

---

## 9. 决策记录

| 项 | 决定 | 备注 |
|----|------|------|
| `MAX_DAG_REPLAN_ATTEMPTS` | **1** | 与 verify `MAX_REPLAN_ATTEMPTS` 对齐 |
| blackboard 策略 | replan 前 **清空** | 已完成信息写入 failureContext |
| Worker 重试 | Phase 2 可选 | 先解决结构性失败 |

---

**若与 [architecture.md](../docs/architecture.md) 或源码不一致，以源码为准；落地后请更新本文档勾选状态。**
