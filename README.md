# OpenCode Lite

用于学习 Agent 内部机制的最小终端 Code Agent（TypeScript + Ink + OpenAI）。

## 运行

```bash
npm install
# 配置 .env：OPENAI_API_KEY=...
npm run dev
```

Provider 可选 `AGENT_PROVIDER=openai|cursor`（见 `packages/platform`）。该选项只影响 **Agent 执行层**；router / planner 等结构化 LLM 调用目前固定走 OpenAI（见架构文档）。

## 文档

| 目录 | 性质 | 说明 |
|------|------|------|
| [docs/](docs/) | **本项目实现** | 与当前代码对应的架构、约定、字段说明 |
| [notes/](notes/) | **设计学习** | Agent 原理、记忆、推理、DAG 等探索性笔记，非实现权威 |

**实现权威：** [docs/architecture.md](docs/architecture.md)

**设计学习索引：** [notes/README.md](notes/README.md)

### 本项目（docs）

- [architecture.md](docs/architecture.md) — 包结构、Session、状态字段、StateDelta、LLM 两层模型

### 设计学习（notes）

| 文件 | 主题 |
|------|------|
| [session.md](notes/session.md) | Session、Summary、召回 |
| [engineering.md](notes/engineering.md) | Loop / Harness 工程 |
| [推理1.md](notes/推理1.md) / [推理2.md](notes/推理2.md) | 推理模式探索 |
| [短记忆与长记忆.md](notes/短记忆与长记忆.md) | 记忆分层 |
| [混合检索.md](notes/混合检索.md) / [多路召回.md](notes/多路召回.md) | 检索方案 |
| [多agent-dag.md](notes/多agent-dag.md) / [dag-promise-scheduler.md](notes/dag-promise-scheduler.md) | DAG 多 Agent |

若 `notes/` 与源码或 `docs/architecture.md` 不一致，**以源码和 architecture.md 为准**。

## 包

| 包 | 说明 |
|----|------|
| `@code-agent-lite/cli` | TUI |
| `@code-agent-lite/core` | Agent 核心 |
| `@code-agent-lite/tools` | 工具、Skill、Rule |
| `@code-agent-lite/platform` | env / workspace |
| `@code-agent-lite/shared` | 共享工具函数 |
