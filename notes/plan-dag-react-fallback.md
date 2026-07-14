# DAG 失败后的 ReAct 兜底

> 状态：设计稿，尚未实现。
> 当前已实现的恢复行为见 [plan-dag-replan-on-failure.md](plan-dag-replan-on-failure.md)。

## 目标

DAG 是优先执行策略，ReAct 是最终恢复策略。DAG 规划或执行无法继续时，不立即把错误交给 UI，而是把原始请求、失败原因和已经产生的进度交给父 Session 的 ReAct Agent 继续完成任务。只有 ReAct 也无法完成时，错误才向上传递给 CLI。

```text
DAG 规划
  ├─ 合法 → DAG 执行
  └─ 非法 → 带验证错误重试 1 次
               ├─ 合法 → DAG 执行
               └─ 仍非法 → ReAct 接管

DAG 执行
  ├─ 成功 → 正常结束
  └─ Worker 重试和子图重规划后仍失败 → ReAct 接管

ReAct
  ├─ 成功 → 正常验证并结束
  └─ 失败 → core 抛错，由 CLI 展示
```

## 适用范围

以下失败可以由 ReAct 接管：

- DAG 通过 JSON Schema 校验，但 `TaskGraph.fromPlan()` 语义验证失败，重试后仍无法修复。
- Worker 自身重试失败，子图重规划也未能恢复。
- 子图重规划产生非法图。
- DAG 最终存在 failed、skipped 或无法完成的 merge 节点。

以下情况不切换执行模式，直接保持现有异常传播：

- 用户取消或 Turn 已中止。
- Provider 鉴权失败。
- 网络或服务不可用，ReAct 使用同一服务也无法继续。
- Session 已经关闭或工作区不可用。

## 职责边界

| 组件 | 职责 |
|------|------|
| `TaskGraph` | 校验图结构并抛出具体错误，不负责重试或模式切换 |
| `dag-planner` | 对 LLM 生成的非法 DAG 携带错误重试一次 |
| `DagOrchestrator` | 收集图状态、Blackboard 输出和失败原因，生成交接结果 |
| `executeReasoningMode` | 判断 DAG 结果并调用已经创建的父 ReAct Agent |
| `verifyPlugin` | ReAct 接管成功后执行普通 Turn 的最终验证 |
| CLI | 只展示无法恢复的最终错误 |

模式切换应位于 `executeReasoningMode()`。Planner、TaskGraph 和 Scheduler 不应直接依赖 ReAct，因为它们只负责 DAG 内部职责。

## DAG 规划重试

`llmPlanDag()` 第一次得到计划后照常调用 `TaskGraph.fromPlan()`。验证失败时，将错误追加到下一次规划请求：

```text
[上一次 DAG 验证失败]
merge 节点必须是终点。

请修正上述问题并重新返回完整 DAG，不要只返回修改部分。
```

最多重试一次。第二次仍失败时，不在 Planner 内调用 ReAct，而是把规划失败结果交给 `executeReasoningMode()`。

取消、鉴权和基础设施错误不属于计划内容错误，不应进入该重试。

## DAG 执行结果

现有 `runDagTurn()` 只返回 `boolean`，无法携带 ReAct 恢复所需的信息。改为返回最小的结果对象：

```ts
type DagTurnResult = {
  succeeded: boolean;
  handoff?: string;
};
```

如实现时确实需要程序化区分规划失败和执行失败，再增加：

```ts
reason?: 'invalid_plan' | 'execution_failed';
```

不要预先增加更多失败枚举；详细信息放在 `handoff` 中即可。

## ReAct 交接上下文

ReAct 必须基于当前工作区继续，不能把 DAG 当作从未执行。交接 system note 至少包含：

- 用户原始请求。
- DAG 摘要；规划阶段失败时包含最后一次验证错误。
- 已完成节点及其 `TaskOutput.summary`。
- 失败节点及其错误。
- skipped 或 pending 节点。
- 已写入、删除的文件和已执行命令。
- 明确要求先检查当前工作区，不重复已经完成的操作。

示例：

```text
[DAG 交接]
DAG 未能完成，现在由 ReAct 继续处理原始请求。

已完成：
- explore-api：接口入口位于 src/api.ts。

失败：
- edit-api：修改后类型检查失败。

已有副作用：
- 已修改 src/api.ts
- 已执行 npm test

请先检查当前工作区，复用已经完成的结果，不要盲目重复修改，然后完成用户的原始请求。
```

`DagOrchestrator.run()` 的 `finally` 已经把 Blackboard memory 合回父 `TurnLedger`。交接仍需显式写入 `ConversationStore`，因为 EventBus 的 UI 文案不是 LLM 上下文。

## 状态与最终验证

DAG 仍可交给 ReAct 时，不发送终态 `error`，而是：

1. 发送 `thinking` 状态和“DAG 未完成，切换 ReAct”的系统事件。
2. 将 handoff 作为 system note 写入父 conversation。
3. 调用父 ReAct Agent。
4. ReAct 完成后进入普通 Turn 的最终验证。

模式路由仍是 `dag`，因此需要在 Turn metadata 标记：

```ts
meta.set('dagFallbackToReact', true);
```

`verifyPlugin` 看到该标记时按 ReAct/ToT 路径执行最终验证。不能因为最初路由是 DAG 就跳过验证，也不能在 React 已经恢复成功后继续显示“DAG 未完整完成”。

## 错误可见性

- DAG 内部可恢复错误：写入 handoff，不直接显示为最终 assistant 错误。
- ReAct 接管成功：用户只看到最终结果，过程可通过 system status 了解。
- ReAct 接管失败：异常继续经过 `runAgentTurn()`，最终由 CLI 的 `runTurn().catch()` 格式化和展示。
- Abort 始终沿现有取消链路处理，不转换为 fallback。

## 实施顺序

1. 为 `llmPlanDag()` 增加一次带验证反馈的重试。
2. 让 `runDagTurn()` 返回 `DagTurnResult` 并生成 handoff。
3. 在 `executeReasoningMode()` 中实现 DAG → ReAct 接管。
4. 调整 `verifyPlugin` 的 metadata 判断和状态事件。
5. 补齐单元测试与集成测试。

## 验收场景

1. 第一次规划非法、第二次合法：进入 DAG，不启动父 ReAct。
2. 连续两次规划非法：父 ReAct 收到最后的验证错误并完成任务。
3. Worker 重试和子图重规划后仍失败：父 ReAct 收到成功节点、失败节点及副作用。
4. DAG 已修改文件后失败：ReAct 先读取当前状态，不重复覆盖已完成修改。
5. ReAct 接管成功：执行普通最终验证，Turn 状态为 done。
6. ReAct 接管也失败：CLI 只展示最终错误。
7. 用户取消：不重试规划，不启动 ReAct，状态为 cancelled。
8. Provider 鉴权或基础设施失败：不启动无意义的 ReAct 兜底。
