# 待办：DAG 失败后的分层恢复（链级 replan）

> **状态**：草案（待实施）  
> **目标**：DAG 某节点失败时，按「先修节点 → 再修链 → 最后全图」逐级恢复；默认**链级 replan**（失败节点 + 其下游），其它独立链不动。

---

## 1. 背景与问题

### 1.1 现状

| 阶段 | 当前行为 |
|------|----------|
| 规划 | `llmPlanDag` 只执行一次 |
| 执行 | `DagScheduler` 跑完全图；上游失败 → 下游 `skipped` |
| 收尾 | 有 `failed` / `skipped` 且 merge 未成功 → `dagSucceeded=false`，verify 跳过 |
| 恢复 | 无 worker 重试、无分支续跑、无 replan |

关键代码：

- `packages/core/src/dag/orchestrator.ts` — `runDagTurn`
- `packages/core/src/dag/dag-scheduler.ts` — 上游失败跳过逻辑
- `packages/core/src/dag/dag-planner.ts` — 仅 root 规划
- `packages/core/src/dag/worker.ts` — `未返回有效摘要` 等 worker 错误
- `packages/core/src/dag/graph-utils.ts` — 已有 `getSuccessors` / `getPredecessors`

### 1.2 典型失败场景

| 类型 | 典型表现 | 应对层级 |
|------|----------|----------|
| 执行偶发失败 | 空摘要、LLM 抽风 | 第 1 层：worker 补救 + 重试 |
| 链路中断 | 6 失败 → 7、8 skipped | 第 2 层：链级 replan |
| 整体拆法错误 | 多条链失败、merge 无法汇总 | 第 3 层：全图 replan |

### 1.3 UI 误导

规划阶段设置 `status('thinking', 'DAG 规划')` 后，执行期不再更新 status，界面会一直显示「思考中 · DAG 规划」，易被误认为正在重新规划。

---

## 2. 核心原则

> **失败是局部的，恢复也局部——成功的节点是资产，不是废纸。**

1. `done` 节点的结论（summary、facts、已写文件）是下游输入，**默认不推翻**
2. 单点失败只阻断**它的依赖链**，无关节点（并行已成功分支）**不动**
3. 恢复逐级升级：**先修节点，再修链，最后才换整图**
4. replan 锚定在**用户原始请求 + 已完成事实**，多数是**修链路**而非重新理解需求

---

## 3. 目标行为（三层恢复）

```text
跑 DAG
  │
  ├─ 全 done + merge 成功 → 结束
  │
  └─ 有 failed
       │
       ├─ 第 1 层：Worker 补救 + 重试
       │    · 空摘要 → 先从对话 / ledger 捞摘要（0 次 LLM）
       │    · 捞不到 → 同 goal、新 session、带硬约束重试 1 次
       │    · 成功 → 只唤醒下游 skipped，scheduler 续跑（不重规划）
       │
       ├─ 第 2 层：链级 replan（主方案）
       │    · 算出 replanSet = 失败节点 + 其 skipped 下游
       │    · LLM 只重规划 replanSet 对应子图
       │    · 其它 done 节点不动；blackboard 保留已完成输出
       │    · scheduler resume：done 短路，pending 执行
       │
       └─ 第 3 层：全图 replan（最后手段）
            · 链级 replan 仍失败，或多条独立链都挂
            · 仍保留 done 节点摘要作约束，不默认重跑已成功节点
            · 达上限 → 现有「DAG 未完整完成」收尾
```

### 3.1 链级 replan 示例（任务 6 失败）

```text
        [1]──[2]──┬──[3]✅──┐
                  │         ├──[7]──[8]
                  └──[6]❌──┘
        [4]✅─────────────────┘

6 失败 → replanSet = {6, 7, 8}
3✅、4✅ 保持 done，摘要作为 7/8 的外部上游输入
LLM 只输出 6→7→8 的新子 TaskGraph，拼回原图
scheduler 续跑：3、4 短路；新 6、7、8 执行
```

**规则：**

- replanSet = `{失败节点}` ∪ `{所有因它而 skipped 的传递下游}`
- 汇入 replan 链的**外部** done 节点（如 3、4）不重规划，摘要写入 replan prompt
- 若 8 同时依赖 replan 链和外部 done 节点，新 8 必须兼容两侧输入

---

## 4. 第 1 层：Worker 补救 + 重试

### 4.1 不是换方案

| | Worker 重试 | 链级 replan |
|--|-------------|-------------|
| goal | **不变** | 6/7/8 的 goal 可调整 |
| session | 新建，不续聊 | 新子图节点 |
| 适用 | 偶发空摘要、抽风 | 路径错了、重试仍失败 |

### 4.2 重试步骤

```text
1. 补救提取（0 次 LLM）
   extractLastAssistantText 为空时，尝试：
   · 倒数几条 assistant 消息拼摘要
   · ledger.facts 拼一段
   有内容 → 直接 done

2. 同 goal 重试（1 次）
   新建 session，goal 不变，追加：
   「上次未产出有效摘要，完成后必须输出明确文字结论。」

3. 仍失败 → 升级到第 2 层
```

---

## 5. 第 2 层：链级 replan

### 5.1 算法草案

```typescript
// graph-utils.ts
function computeReplanSet(graph: TaskGraph, failedNodeId: string): Set<string> {
  // BFS/DFS：失败节点 + 所有 status=skipped 且可达的传递下游
}

// dag-planner.ts
function llmReplanSubgraph(
  input: string,
  session: AgentSession,
  context: {
    replanSet: string[];
    failedNode: { id; error };
    doneSummaries: Record<string, string>;  // 含外部上游
    originalGraphSummary: string;
  }
): SubDagPlan  // 只含 replanSet 范围内的新 tasks + 与外部的 dependsOn 衔接
```

```typescript
// orchestrator.ts
function spliceSubgraph(graph: TaskGraph, newTasks: TaskNode[]): void {
  // 替换 replanSet 内节点（可保留 id 或生成新 id）
  // 重置这些节点 status=pending，清 error/output
  // 图外边和边关系按新 plan 更新
}

// dag-scheduler.ts
async resume(): Promise<void> {
  // done 节点 → results 直接返回 blackboard 缓存
  // pending 节点 → 正常 runNode
}
```

### 5.2 replan prompt 锚点（防「问题和结果偏差」）

```text
[用户原始请求]          ← 始终锚定，防跑偏
[全局 DAG 摘要]
[已完成节点（图外）]     ← 3✅、4✅ 的 summary，视为已验证事实
[失败链路]
- 失败：6（未返回有效摘要）
- 待重规划：6、7、8
[指令]
只重规划上述链路，修复失败、补通到 merge。
这是修复链路，不是重新理解用户意图。
新 6 必须能衔接已完成外部结论；新 7、8 据此调整。
```

---

## 6. 改动范围

| 文件 | 改动 |
|------|------|
| `packages/core/src/dag/worker.ts` | 摘要补救 + 同 goal 重试 1 次 |
| `packages/core/src/dag/graph-utils.ts` | `computeReplanSet` |
| `packages/core/src/prompt.ts` | `DAG_SUBGRAPH_REPLAN_PROMPT` |
| `packages/core/src/dag/dag-schemas.ts` | 可选：子图 plan schema（无 merge 或局部 merge） |
| `packages/core/src/dag/dag-planner.ts` | `llmReplanSubgraph` |
| `packages/core/src/dag/orchestrator.ts` | 三层恢复循环 + `spliceSubgraph` |
| `packages/core/src/dag/dag-scheduler.ts` | `resume()` + done 短路 + `DAG 执行` status |
| `packages/core/src/dag/types.ts` | `MAX_WORKER_RETRIES`、`MAX_SUBGRAPH_REPLANS`、`MAX_FULL_REPLANS` |

---

## 7. 实施待办

### Phase 1 — Worker 补救 + 重试

- [ ] `worker.ts`：`salvageSummary(conversation, ledger)` 补救提取
- [ ] `worker.ts`：补救失败后，同 goal + 硬约束重试 1 次
- [ ] `types.ts`：`MAX_WORKER_RETRIES = 1`
- [ ] 重试成功 → 返回 `TaskOutput`，不抛错
- [ ] 测试：空摘要 → 补救成功；补救失败 → 重试成功

### Phase 2 — Scheduler 分支续跑

- [ ] `dag-scheduler.ts`：`resume()` 方法
- [ ] done 节点：直接返回 `{nodeId, output: blackboard 缓存}`
- [ ] pending 节点：正常执行
- [ ] worker 重试成功后，只重置该链 skipped 下游为 `pending`，调用 `resume()`
- [ ] `run()` 入口设 `status('thinking', 'DAG 执行')`
- [ ] 测试：6 重试成功 → 7、8 自动执行，3✅ 不重复

### Phase 3 — 链级 replan（主方案）

- [ ] `graph-utils.ts`：`computeReplanSet(graph, failedNodeId)`
- [ ] `prompt.ts`：`DAG_SUBGRAPH_REPLAN_PROMPT`
- [ ] `dag-planner.ts`：`llmReplanSubgraph(...)`
- [ ] `orchestrator.ts`：`spliceSubgraph(graph, newTasks)`
- [ ] orchestrator 恢复循环：worker 重试仍失败 → 链级 replan → `resume()`
- [ ] blackboard **保留** done 节点输出，不清空
- [ ] replan 子图与外部 done 节点的边衔接正确
- [ ] 测试：6 失败 → replan {6,7,8} → 3✅、4✅ 不动 → merge 成功

### Phase 4 — 全图 replan（最后手段）

- [ ] `prompt.ts`：`DAG_FULL_REPLAN_PROMPT`
- [ ] `dag-planner.ts`：`llmReplanDag(...)`（整图，但 prompt 含 done 摘要约束）
- [ ] 触发条件：链级 replan 仍失败，或 `failed` 节点 ≥ 2 条独立链
- [ ] scheduler resume：done 节点仍短路，只跑新图中 pending 部分
- [ ] `MAX_FULL_REPLANS = 1`

### Phase 5 — 文档与观测

- [ ] `docs/architecture.md` 补充三层恢复流程
- [ ] replan 轮次 / replanSet 写入 system 消息或 event
- [ ] CLI `dag_snapshot` 正确展示节点替换与状态
- [ ] status：`DAG 规划` → `DAG 执行` → `DAG 链级重规划` → `DAG 全图重规划`

---

## 8. 边缘情况

| 场景 | 预期 |
|------|------|
| 6 空摘要，重试成功 | 不重规划；7、8 续跑 |
| 6 失败，3✅ 已完成 | replan 仅 {6,7,8}；3 摘要进 prompt |
| 8 依赖 7（replan 链）和 4✅（外部） | 新 8 兼容两侧 |
| 两条独立链各有一个 failed | 先各自链级 replan；都失败再全图 |
| replan 后新 6 仍失败 | 链级 replan 次数 +1，达上限升全图 |
| 部分 edit 已落盘 | 不 rollback；prompt 告知已完成摘要 |
| merge 发现整体拆法错了 | 跳过链级，直接全图 replan |
| 用户 abort | 各层循环内 `session.throwIfAborted()` |

---

## 9. 测试用例

1. **全成功**：无重试、无 replan → `dagSucceeded=true`
2. **6 空摘要，补救成功**：0 次重试、0 次 replan
3. **6 空摘要，重试成功**：7、8 续跑，3✅ 不重复执行
4. **6 失败，链级 replan 成功**：replanSet={6,7,8}；3✅、4✅ 摘要保留；merge 成功
5. **链级 replan 仍失败 → 全图 replan**：done 节点仍短路
6. **replan prompt 含用户原始请求 + 外部 done 摘要**
7. **blackboard 在链级 replan 后保留 done 节点输出**

---

## 10. 明确不做

- [ ] 失败就整图清空重跑（无 done 短路）
- [ ] 无限 replan / 无限重试
- [ ] replan 时 rollback 已写文件
- [ ] DAG 失败自动 fallback 到 react 单 Agent
- [ ] 改 router 选 dag 的逻辑

---

## 11. 决策记录

| 项 | 决定 | 备注 |
|----|------|------|
| 恢复顺序 | 重试 → 链级 replan → 全图 replan | 逐级升级 |
| replan 粒度 | **失败节点 + skipped 下游** | 如 6 失败 → {6,7,8} |
| Worker 重试 | 同 goal，**不换方案** | 带一句硬约束 |
| blackboard | 链级 replan **保留** done 输出 | 不全量清空 |
| scheduler | **resume + done 短路** | 不重复执行已成功节点 |
| replan 锚点 | 用户原始请求 + done 摘要 | 修链路，非重做需求 |
| `MAX_WORKER_RETRIES` | **1** | 含补救后重试 |
| `MAX_SUBGRAPH_REPLANS` | **1** | 每条失败链 |
| `MAX_FULL_REPLANS` | **1** | 最后手段 |

---

**若与 [architecture.md](../docs/architecture.md) 或源码不一致，以源码为准；落地后请更新本文档勾选状态。**
