# 架构说明

OpenCode Lite 是一个用于学习 Agent 内部机制的最小 Code Agent。**本文描述当前代码的实际结构与约定**，以仓库内源码为准。

Session / 记忆等概念背景见 [notes/session.md](../notes/session.md)（设计学习笔记，非实现权威）。

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
          verify     ReAct/ToT 可选验证；DAG 成功使用图内 verify，失败后按实际 operations 判断是否补验
  → 出错: abort 在 core 处理；其它错误 throw 给 CLI
```

**约定：** Turn 执行不经过多层 provider 转发，入口只有 `runAgentTurn → PluginDriver`。

---

## AgentSession

Session 是会话门面，组合三个子模块，各司其职：

| 模块 | 职责 |
|------|------|
| `ConversationStore` | 维护 `messages[]`，供 LLM 使用的 OpenAI 格式 transcript |
| `SessionEventBus` | 向 CLI 发 status / stream / tool / token 事件 |
| `TurnLedger` | 程序账本：facts、探索轨迹（visitedFiles / searchedTerms）、本轮 tool 操作 |

```typescript
session.conversation.messages // OpenAI 格式 transcript
session.events                // UI 事件
session.ledger.state           // SessionState
session.toolRegistry           // LLM tool calling 的工具列表
```

**约定：**

- 改 LLM 上下文 → `session.conversation`
- 改终端显示 → `session.events`
- 业务代码不要通过 Session 逐方法转发 EventBus（已暴露 `session.events`）
- `session.config` 保存只读初始化配置；`session.cwd` 是工作区运行时状态，两者不重复保存 cwd
- 用户从外部切换工作区时重置旧 conversation / memory；工具在当前 Turn 内切换工作区时保留本轮上下文
- DAG Worker 通过 `session.createChild()` 创建隔离的子 Session，继承当前 cwd、取消信号和已加载 Skill

DAG 的 `dag_snapshot` / `task_start` / `task_end` 也统一通过 `session.events.emit` 发送。

### ConversationStore 补充

- Skill 目录通过 `skillCatalogMessageIndex` / `skillCatalogCwd` 原地更新一条 system 消息，避免重复堆积
- 工具在 Turn 内切换 workspace 时原地更新“当前工作区”消息；外部切换时重建工作区上下文
- `finishTool`：写 tool message + 通知 EventBus

---

## Skill 加载

用户说明：[skills.md](skills.md)

```
sessionReady  → skillCatalogPlugin → Skills.mountCatalog()
prepareTurn   → /skill → ensureLoaded → inject
execute       → load_skill → ensureLoaded → inject（OpenAI 模式）
```

- 状态与去重：`Skills`（`packages/core/src/skills/skills.ts`），唯一入口 `ensureLoaded`
- IO / 文案：`packages/tools/src/skills/`
- 主 Agent 自决是否调 `load_skill`；无 Skill Resolver
- Cursor 模式：`cursor-code-agent` 将 Catalog + 已 inject 正文拼进 SDK prompt
- DAG Planner / Worker / Merge 继承父 Session 已加载的 Skill 正文

---

## 程序状态与记忆

运行时全量状态在 `TurnLedger.state`（类型 `SessionState`，继承 `BaseMemory`）。程序侧维护完整账本，LLM 侧通过 StateDelta 只看增量（见下一节）。

### SessionState 字段（`agent-memory.ts`）

| 字段 | 类型 | 范围 | 写入来源 | 说明 |
|------|------|------|----------|------|
| `facts` | `string[]` | 会话累计 | ToT 复盘 `updateStateFromRun` → `addFacts` | 经复盘确认的已知事实；去重追加，只增不减 |
| `hypotheses` | `string[]` | 会话当前 | Planner `llmPlan` / `llmReplan` → `applyHypotheses` | 当前待验证假设；每次整表替换，不是追加 |
| `rejected` | `string[]` | 会话累计 | 复盘或换思路时 → `rejectHypotheses` | 已证伪或主动放弃的方向；去重追加 |
| `confidence` | `number` | 会话当前 | 复盘 `updateStateFromRun`；换思路 `llmReplan` 时 -0.15 | 对当前方向的置信度，0–1；`llmReplan` 会下调 |
| `noProgress` | `number` | 会话当前 | `noteProgress` 每轮自增/归零 | 连续无进展的步数；事实、探索轨迹或本轮 operations 任一增长则归零；ToT 重试时 `≥2` 触发 `llmReplan` |
| `visitedFiles` | `string[]` | 会话累计 | `read_file` → `recordToolCall` | Agent 读过的文件路径；取工具入参 `path`，去重追加 |
| `searchedTerms` | `string[]` | 会话累计 | `grep` → `recordToolCall` | Agent 搜过的关键词；取工具入参 `pattern`，去重追加 |
| `operations` | `TurnOperations` | 单轮 | `recordToolCall` / DAG `Blackboard.mergeFrom` | 本轮写入、删除和命令记录 |

**探索轨迹**：`visitedFiles` 与 `searchedTerms` 成对，分别记录「读过什么」和「搜过什么」，用于避免重复探索，并参与 `noProgress` 判断。

**假设 vs 事实**：`hypotheses` 是 Planner 给出的待验证方向，经 ReAct 实验后由复盘提炼为 `facts` 或归入 `rejected`。ReAct 模式不主动维护 hypotheses，但字段仍存在。

### 单轮操作 TurnOperations（`TurnLedger.state.operations`）

每轮 `beginTurn` 时清空，记录本轮副作用，不跨轮累计：

| 字段 | 类型 | 写入来源 | 说明 |
|------|------|----------|------|
| `writtenFiles` | `string[]` | `write_file` → `recordToolCall` | 本轮写入的文件路径（`path`） |
| `deletedFiles` | `string[]` | `delete_file` → `recordToolCall` | 本轮删除的文件路径（`path`） |
| `executedCommands` | `string[]` | `run_cmd` → `recordToolCall` | 本轮执行的 shell 命令（`command`） |

通过 `session.ledger.snapshotOperations()` 读取，用于 `TurnRecord` 与 verify。

### Tool → 状态映射（`turn-ledger.ts`）

| 工具 | 状态目标 | 入参字段 | 累计方式 |
|------|----------|----------|----------|
| `read_file` | `state.visitedFiles` | `path` | 会话累计 |
| `grep` | `state.searchedTerms` | `pattern` | 会话累计 |
| `write_file` | `state.operations.writtenFiles` | `path` | 单轮 |
| `delete_file` | `state.operations.deletedFiles` | `path` | 单轮 |
| `run_cmd` | `state.operations.executedCommands` | `command` | 单轮 |

映射在 `SESSION_TOOL_TRACKS`（会话级）与 `TURN_TOOL_TRACKS`（单轮级）中集中定义。`react-agent` 与 `cursor-code-agent` 在 tool 执行后均调用 `session.ledger.recordToolCall`。

### DAG Blackboard（`dag/dag-model.ts`）

多 Agent 模式下，Orchestrator 的 `Blackboard` 继承 `BaseMemory`，通过 `mergeNodeOutput` 合并各 Worker 的 `TaskOutput`（含 `facts`、`visitedFiles`、`searchedTerms`、`operations`）。Worker 各自维护独立 `SessionState`，不共享 Orchestrator 的全量 `visitedFiles`；DAG 无论成功、失败或抛出异常，已发生的 Blackboard memory 都会合回父 `TurnLedger`。

DAG 在执行前校验两条流程约束：edit 必须依赖 explore，并且 edit 后必须有 verify。

---

## 状态增量投影（StateDelta）

LLM 上下文**不注入全量状态**，而是在每次 `buildLlmMessages()` 前调用 `flushStateDelta()`，把自上次投影以来的变化写成 system note（`[stateΔ step=N]`）。

| 层 | 文件 | 职责 |
|----|------|------|
| 纯函数 | `state-ai-view.ts` | `InjectedSnapshot` 快照、`StateDelta` diff、`formatStateDelta` |
| 有状态 | `state-delta-projector.ts` | 维护 `lastInjected` 与步进计数 |
| 触发 | `session.buildLlmMessages()` | flush 后返回 `messages` |

`InjectedSnapshot`（`state-ai-view.ts`）是内存中的全量快照，由 `buildInjectedSnapshot(state)` 构建，**不直接** format 给 LLM。

`diffInjectedSnapshot(prev, next)` 产出 `StateDelta`，`formatStateDelta` 写成 `[stateΔ step=N]` system note 追加到 messages。

### StateDelta 字段与来源映射

| StateDelta 字段 | 对应快照字段 | 投影格式 | 说明 |
|-----------------|--------------|----------|------|
| `addedFacts` | `facts` 新增项 | `+ fact: …` | 本轮新确认的事实 |
| `addedRejected` | `rejected` 新增项 | `+ rejected: …` | 本轮新拒绝的方向 |
| `hypotheses` | `hypotheses` 整表 | `= hypotheses:` 列表 | 有变化时整表替换，空则 `(空)` |
| `confidence` | `confidence` 变化 | `~ confidence: 0.50 → 0.75` | 仅数值变化时输出 |
| `addedVisited` | `visitedFiles` 新增项 | `+ 已访问: …` | 本轮新读的文件 |
| `addedSearched` | `searchedTerms` 新增项 | `+ 已搜索: …` | 本轮新搜的 pattern |
| `addedWritten` | `operations.writtenFiles` 新增项 | `+ written this turn: …` | 本轮新写入的文件 |
| `addedDeleted` | `operations.deletedFiles` 新增项 | `+ deleted this turn: …` | 本轮新删除的文件 |
| `addedCommands` | `operations.executedCommands` 新增项 | `+ command this turn: …` | 本轮新执行的命令 |

`noProgress` **不投影**给 LLM，仅供程序侧判断是否需要换思路。

访问文件较多时（`visitedFiles` ≥ 10），每 5 步会附带最近 5 个文件的 rollup 摘要（`# 已访问共 N 个，最近:`）。

---

## LLM 调用：两层模型

当前实现分为 **Agent 执行层** 与 **结构化 LLM 层**，两层使用不同的模型入口。

### Agent 执行层（可切换 backend）

由固定 provider 映射 `agentProviders` 按 key 创建 `CodeAgent`：

```typescript
agentProviders.resolve('openai' | 'cursor')
  → { kind, provide(session), dispose?(session) }

agentProviders.plugin()   // 挂进 defaultPlugins，prepareAgent 时 resolve
```

| key | provide | dispose |
|-----|---------|---------|
| openai | `DefaultCodeAgent`（本地 ReAct + AI SDK tool calling） | — |
| cursor | `CursorCodeAgent`（Cursor SDK） | 释放 Cursor SDK 会话 |

`DefaultCodeAgent` 内部通过模块级 `openAiLlm` 调 AI SDK；`CursorCodeAgent` 走 Cursor SDK，不参与本地 tool loop。

环境变量 `AGENT_PROVIDER=openai|cursor`（见 `packages/platform`）决定默认 backend。

### 结构化 LLM 层（固定 OpenAI）

Router、Planner、Verify gate、DAG 规划等结构化调用，统一走 `structured-llm-caller.ts` → 模块级 **`openAiLlm`**（`OpenAiLlmProvider` 单例），由 AI SDK `Output.object()` 和 Zod 4 校验输出。

**当前没有** `resolveLlmProvider()` 或 `agentProviders.llm`。即使 Agent 执行层选 `cursor`，结构化调用仍使用 OpenAI。

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

`defaultPlugins()` 顺序：

```
skillCatalog → prepare → router → provider → mode → verify
```

Session 级：`skillCatalogPlugin` 在 `sessionReady` / `workspaceChange` 挂 Catalog。

`verifyPlugin` 对 ReAct/ToT 正常执行；DAG 成功依赖图内 verify，DAG 失败则根据已回写的 operations 决定是否补充验证。

扩展方式：在 `AgentSessionOptions.plugins` 中替换整条链，或仿 builtins 增删 plugin。`react/tot/dag` 已合并为 `modePlugin`。

Plugin 以工厂函数返回 plain object（`AgentPlugin`），不是 class。

---

## 错误与取消

| 情况 | 处理位置 |
|------|----------|
| 用户 Ctrl+C / abort | `loop.ts` → `session.events.status('cancelled')` |
| 业务错误（LLM、工具等） | core `throw` → CLI `App.runInWorkspace().catch` |
| CLI 展示 | `updateStatus('error')` + 聊天区 assistant 消息 |

**约定：** core 不替 CLI 决定如何展示业务错误；`error` 状态不算 busy，输入框可继续使用。

父 Turn 的 `AbortSignal` 会传给 DAG Worker、OpenAI 流式/非流式请求、工具和自动验证命令；工具达到 timeout 时同时中止底层操作。

---

## 类型与命名约定

| 类型 | 含义 |
|------|------|
| `PluginTurnContext` | Plugin 管道上下文（session, targetCwd, input, route, agent, execution） |
| `TurnExecution` | mode 执行结果（mode, succeeded），由 verify 消费 |
| `TurnRecord` | 回合记录（userInput, operations, assistantText），verify 用 |
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

| 文件 | 内容 |
|------|------|
| [getting-started.md](getting-started.md) | 使用说明 |
| [skills.md](skills.md) | Skill |
| [notes/README.md](../notes/README.md) | 设计探索 |

`notes/` 与源码不一致时，以源码和本文为准。
