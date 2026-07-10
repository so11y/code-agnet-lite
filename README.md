# OpenCode Lite

用于学习 Agent 内部机制的最小终端 Code Agent（TypeScript + Ink + OpenAI）。

## 运行

```bash
npm install
# 配置 .env：OPENAI_API_KEY=...
npm run dev
```

Provider 可选 `AGENT_PROVIDER=openai|cursor`（见 `packages/platform`）。该选项只影响 **Agent 执行层**；router / planner 等结构化 LLM 调用目前固定走 OpenAI（见架构文档）。

## 架构

实现说明见 [docs/architecture.md](docs/architecture.md)。`md/` 目录为设计探索笔记，非实现权威。

## 包

| 包 | 说明 |
|----|------|
| `@code-agent-lite/cli` | TUI |
| `@code-agent-lite/core` | Agent 核心 |
| `@code-agent-lite/tools` | 工具、Skill、Rule |
| `@code-agent-lite/platform` | env / workspace |
| `@code-agent-lite/shared` | 共享工具函数 |
