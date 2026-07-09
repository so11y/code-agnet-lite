# 架构说明

OpenCode Lite 是一个用于学习 Agent 内部机制的最小 Code Agent。本文描述当前代码的实际结构与设计约定。

产品路线图见 [paln.md](../paln.md)。Session / 记忆等概念背景见 [md/session.md](../md/session.md)。

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
          skill      加载 Skill / Rule
          router     选择 react | tot | dag
          provider   创建 CodeAgent (openai / cursor)
          react/tot/dag  执行
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
session.state             // → TurnLedger
session.toolRegistry      // 工具列表，LLM tool calling 用
```

**约定：**

- 改 LLM 上下文 → `conversation`（或 session 上保留 session 语义的方法）
- 改终端显示 → `session.events`
- 业务代码不要通过 Session 逐方法转发 EventBus（已暴露 `session.events`）

### ConversationStore 补充

- Skill 目录通过 `skillCatalogMessageIndex_` / `skillCatalogCwd_` 原地更新一条 system 消息，避免重复堆积
- `finishTool`：写 tool message + 通知 EventBus

---

## LLM 调用契约

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

## ProviderRegistry

按 key 注册 backend 实现，一次 lookup 返回 bundle：

```typescript
providerRegistry.resolve('openai' | 'cursor')
  → { key, createAgent, disposeSession? }

providerRegistry.plugin()   // 挂进 defaultPlugins，prepareAgent 时 resolve
```

| key | createAgent | disposeSession |
|-----|-------------|----------------|
| openai | DefaultCodeAgent (ReAct + OpenAI) | — |
| cursor | CursorCodeAgent | 释放 Cursor SDK 会话 |

LLM API（router / planner / verify）走 `resolveLlmProvider()` → `providerRegistry.resolve(defaultKey).llm`。

---

## Plugin 链

`defaultPlugins()` 固定顺序，provider 差异只在 `providerRegistry.plugin()`：

```
skill → router → provider → react → tot → dag → verify
```

扩展方式：自定义 `session.options.plugins` 替换整条链，或仿 builtins 增删 plugin。

---

## 错误与取消

| 情况 | 处理位置 |
|------|----------|
| 用户 Ctrl+C / abort | `loop.ts` → `session.events.status('cancelled')` |
| 业务错误（LLM、工具等） | core `throw` → CLI `App.runInWorkspace().catch` |
| CLI 展示 | `updateStatus('error')` + 聊天区 assistant 消息 |

**约定：** core 不替 CLI 决定如何展示业务错误；`error` 状态不算 busy，输入框可继续使用。

---

## 类型命名

| 类型 | 含义 |
|------|------|
| `PluginTurnContext` | Plugin 管道上下文（session, cwd, input, route, agent） |
| `TurnSummary` | 回合摘要（userInput, operations, assistantText），verify 用 |

避免使用模糊的 `TurnContext`。

---

## 文档索引

| 文件 | 内容 |
|------|------|
| [paln.md](../paln.md) | 版本规划 V1–V5 |
| [md/session.md](../md/session.md) | Session / 记忆概念 |
| [md/engineering.md](../md/engineering.md) | Loop / Harness 设计笔记 |
