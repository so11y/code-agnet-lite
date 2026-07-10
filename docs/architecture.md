# 架构说明

OpenCode Lite 是一个用于学习 Agent 内部机制的最小 Code Agent。**本文描述当前代码的实际结构与约定**，以仓库内源码为准。

产品路线图见 [paln.md](../paln.md)。Session / 记忆等概念背景见 [md/session.md](../md/session.md)（设计笔记，非实现权威）。

---

## 包结构

```
packages/
  cli/        Ink TUI，错误展示，用户输入
  core/       Agent 循环、Session、Plugin、Provider
  tools/      工具实现、Skill、Rule
  platform/   环境变量、工作区路径
  shared/     通用小工具
```

依赖方向：`cli → core → {tools, platform, shared}`。

---

## 一轮 Turn

```
CLI runTurn
  → runAgentTurn (loop.ts)
      → PluginDriver.run
          prepare    Skill / Rule / beginTurn
          router     选择 react | tot | dag
          provider   创建 CodeAgent (openai / cursor)
          mode       按路由执行 react / tot / dag
          verify     可选验证
  → 出错: abort 在 core 处理；其它错误 throw 给 CLI
```

**约定：** Turn 执行不经过 ProviderRegistry 的多层转发，入口只有 `runAgentTurn → PluginDriver`。

---

## AgentSession

Session 是会话门面，组合三个子模块，各司其职：

| 模块 | 职责 |
|------|------|
| `ConversationStore` | 维护 `messages[]`，供 LLM 使用的 OpenAI 格式 transcript |
| `SessionEventBus` | 向 CLI 发 status / stream / tool / token 事件 |
| `TurnLedger` | 程序账本：visitedFiles、facts、本轮 tool 操作 |

```typescript
session.messages          // → ConversationStore
session.events            // → SessionEventBus（UI 副作用走这里）
session.state             // → TurnLedger.state（SessionState）
session.toolRegistry      // 工具列表，LLM tool calling 用
```

**约定：**

- 改 LLM 上下文 → `ConversationStore`（或 session 上保留 session 语义的方法，如 `addSystemNote`）
- 改终端显示 → `session.events`
- 业务代码不要通过 Session 逐方法转发 EventBus（已暴露 `session.events`）

**已知例外：** `DagScheduler` 目前直接调用 `session.options.onEvent` 发送 `dag_snapshot` / `task_start` / `task_end` 等 DAG 专用事件，未经过 `SessionEventBus` 封装。后续可收敛到 EventBus。

### ConversationStore 补充

- Skill 目录通过 `skillCatalogMessageIndex_` / `skillCatalogCwd_` 原地更新一条 system 消息，避免重复堆积
- `finishTool`：写 tool message + 通知 EventBus

---

## 程序状态与记忆

运行时全量状态在 `TurnLedger.state`（类型 `SessionState`，继承 `BaseMemory`）：

| 字段 | 范围 | 说明 |
|------|------|------|
| `facts` | 会话累计 | 已确认事实 |
| `hypotheses` | 会话当前 | 当前假设（TOT / planner 维护） |
| `rejected` | 会话累计 | 已拒绝方向 |
| `confidence` | 会话当前 | 置信度 |
| `visitedFiles` | 会话累计 | `read_file` 追踪 |
| `searchedTerms` | 会话累计 | `grep` 追踪 |
| `writtenFiles` 等 | 视场景 | `BaseMemory` 上有字段；ReAct 单轮写删命令主要走 `TurnLedger.turnOps`，DAG 走 `Blackboard.mergeFrom` |

本轮 tool 操作（写文件 / 删文件 / 跑命令）在 `TurnLedger.turnOps`，每轮 `beginTurn` 时清空。通过 `session.refreshOperations()` 读取。

Tool → 状态映射在 `turn-ledger.ts` 的 `SESSION_TOOL_TRACKS` / `TURN_TOOL_TRACKS` 中集中定义。

---

## 状态增量投影（StateDelta）

LLM 上下文**不注入全量状态**，而是在每次 `buildLlmMessages()` 前调用 `flushStateDelta()`，把自上次投影以来的变化写成 system note（`[stateΔ step=N]`）。

| 层 | 文件 | 职责 |
|----|------|------|
| 纯函数 | `state-ai-view.ts` | `InjectedSnapshot` 快照、`StateDelta` diff、`formatStateDelta` |
| 有状态 | `state-delta-projector.ts` | 维护 `lastInjected` 与步进计数 |
| 触发 | `session.buildLlmMessages()` | flush 后返回 `messages` |

`StateDelta` 中的 `added*` 字段表示增量（如 `addedVisited`、`addedWritten`）；`hypotheses` 变化时整表替换。全量快照仅存在于内存（`session.state` + `buildInjectedSnapshot`），不 format 给 LLM。

访问文件较多时（≥10），每 5 步会附带最近访问文件的 rollup 摘要。

---

## LLM 调用：两层模型

当前实现分为 **Agent 执行层** 与 **结构化 LLM 层**，并非统一走 ProviderRegistry。

### Agent 执行层（可切换 backend）

由 `AgentProviderRegistry`（`agentProviders`）按 key 创建 `CodeAgent`：

```typescript
agentProviders.resolve('openai' | 'cursor')
  → { kind, provide(session), dispose?(session) }

agentProviders.plugin()   // 挂进 defaultPlugins，prepareAgent 时 resolve
```

| key | provide | dispose |
|-----|---------|---------|
| openai | `DefaultCodeAgent`（ReAct + OpenAI tool loop） | — |
| cursor | `CursorCodeAgent`（Cursor SDK） | 释放 Cursor SDK 会话 |

`DefaultCodeAgent` 内部通过模块级 `openAiLlm` 调 OpenAI；`CursorCodeAgent` 走 Cursor SDK，不参与本地 tool loop。

环境变量 `AGENT_PROVIDER=openai|cursor`（见 `packages/platform`）决定默认 backend。

### 结构化 LLM 层（固定 OpenAI）

Router、Planner、Verify gate、DAG 规划等结构化 JSON 调用，统一走 `structured-llm-caller.ts` → 模块级 **`openAiLlm`**（`OpenAiLlmProvider` 单例）。

**当前没有** `resolveLlmProvider()` 或 ProviderRegistry 上的 `.llm` 字段。即使 Agent 执行层选 `cursor`，结构化调用仍使用 OpenAI。

Verify fix loop 中，若当前 Agent 不支持本地 tool loop（如 Cursor），会 fallback 到 `agentProviders.resolve('openai').provide(session)`（见 `turn/post-turn.ts`）。

### LlmOptions 契约

```typescript
session.llmOptions()  // → { session: AgentSession, signal }

OpenAiLlmProvider:
  tools  ← session.toolRegistry.tools
  token  ← session.events.recordTokenUsage
  UI     ← session.events.say (如 reasoning)
```

**约定：** `LlmOptions.session` 始终是完整的 `AgentSession`（满足 `LlmSessionContext`），不要只传 `events` 或半个对象。

未传 `session` 时（极少数路径），Provider 使用默认 tool registry。

---

## Plugin 链

`defaultPlugins()` 固定顺序，provider 差异只在 `agentProviders.plugin()`：

```
prepare → router → provider → mode → verify
```

扩展方式：自定义 `session.options.plugins` 替换整条链，或仿 builtins 增删 plugin。`react/tot/dag` 已合并为 `modePlugin`。

Plugin 以工厂函数返回 plain object（`AgentPlugin`），不是 class。

---

## 错误与取消

| 情况 | 处理位置 |
|------|----------|
| 用户 Ctrl+C / abort | `loop.ts` → `session.events.status('cancelled')` |
| 业务错误（LLM、工具等） | core `throw` → CLI `App.runInWorkspace().catch` |
| CLI 展示 | `updateStatus('error')` + 聊天区 assistant 消息 |

**约定：** core 不替 CLI 决定如何展示业务错误；`error` 状态不算 busy，输入框可继续使用。

---

## 类型与命名约定

| 类型 | 含义 |
|------|------|
| `PluginTurnContext` | Plugin 管道上下文（session, cwd, input, route, agent） |
| `TurnSummary` | 回合摘要（userInput, operations, assistantText），verify 用 |
| `TurnOperations` | 单轮写删命令记录（writtenFiles / deletedFiles / executedCommands） |
| `InjectedSnapshot` | 状态投影用全量快照（内存 diff，不直接给 LLM） |
| `StateDelta` | 投影增量（`added*` 字段 + hypotheses 整表替换） |
| `ReasoningRoute` | 路由结果（mode + confidence + reason） |

避免使用模糊的 `TurnContext`。

**class vs type 约定：**

- **class**：长期存活、可变、有行为（`AgentSession`、`TurnLedger`、`SessionState`）
- **type + 纯函数**：快照、diff、DTO（`InjectedSnapshot`、`StateDelta`）
- **工厂 plain object**：Plugin hook

---

## 文档索引

| 文件 | 性质 | 内容 |
|------|------|------|
| **docs/architecture.md** | **实现权威** | 当前代码结构与约定（本文） |
| [paln.md](../paln.md) | 规划 | 版本规划 V1–V5 |
| [md/session.md](../md/session.md) | 设计笔记 | Session / 记忆概念 |
| [md/README.md](../md/README.md) | 设计笔记索引 | `md/` 目录说明 |
| [md/engineering.md](../md/engineering.md) | 设计笔记 | Loop / Harness 设计 |
| [md/](../md/) 其余文件 | 设计笔记 | 推理、检索、DAG 等探索性文档 |

`md/` 目录下的文件用于背景学习与方案探索，**若与本文或源码不一致，以源码和本文为准**。
