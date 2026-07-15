# 快速上手

终端 Code Agent：Ink TUI + ReAct，自动路由 react / tot / dag。

## 环境要求

Node.js 22+、Git、OpenAI 兼容 API（或 Cursor API Key）。

## 安装与启动

```bash
git clone <repo-url> code-agent-lite
cd code-agent-lite
npm install
```

### 配置 API Key

**第一步：** 复制环境变量模板

```bash
cp .env.example .env
# Windows PowerShell:
copy .env.example .env
```

**第二步：** 编辑项目根目录的 `.env` 文件（不要提交到 git）

| 变量 | 必填？ | 说明 |
|------|--------|------|
| `OPENAI_API_KEY` | **是**（默认模式） | OpenAI 或兼容网关的 API Key |
| `OPENAI_BASE_URL` | 否 | 默认 `https://api.openai.com/v1`；国内/自建网关改成你的地址 |
| `OPENAI_MODEL` | 否 | 如 `gpt-4o`，省略则用平台默认 |
| `AGENT_PROVIDER` | 否 | `openai`（默认）或 `cursor` |
| `CURSOR_API_KEY` | cursor 模式时 | [Cursor 设置](https://cursor.com/settings) 获取 |

**OpenAI 官方示例：**

1. 打开 https://platform.openai.com/api-keys → Create new secret key
2. `.env` 写入：

```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxx
```

**国内 OpenAI 兼容网关示例：**

```env
OPENAI_API_KEY=你的网关密钥
OPENAI_BASE_URL=https://api.example.com/v1
OPENAI_MODEL=gpt-4o
```

**说明：** `AGENT_PROVIDER` 只影响**主 Agent 执行**（读改文件那层）。任务路由、ToT/DAG 规划、验证等仍调用 OpenAI 接口，因此 **cursor 模式下也需要配置 `OPENAI_API_KEY`**（或指向兼容网关）。

全部变量见 [.env.example](../.env.example)。

### 启动

```bash
npm run dev                          # 工作区 = 当前目录
npm run dev -- D:\code\my-project    # 指定工作区
```

## TUI 操作

| 操作 | 说明 |
|------|------|
| Enter | 发送 |
| `@文件路径` | 文件全文作为 prompt（相对工作区） |
| `/` | 命令补全 |
| Ctrl+C | 中断 |

| 命令 | 作用 |
|------|------|
| `/new` `/clear` | 新会话 |
| `/skill <name> 任务` | 强制加载 Skill，如 `/skill minimal-code 重构 auth` |

## 工具

Agent 操作**当前工作区**：`read_file` `write_file` `delete_file` `grep` `list_files` `git_diff` `run_cmd` `web_search` `set_workspace` `load_skill` `list_skills`。

示例：

```text
看一下 packages/core/src/session.ts 的结构

帮我在 packages/tools 里加一个 hello 工具，别加新依赖

/skill minimal-code 重构 packages/tools/src/load-skill.ts
```

## 推理模式

终端显示 `路由 → react|tot|dag`，一般无需手动选择：

| 模式 | 场景 |
|------|------|
| react | 读改代码、调试（默认） |
| tot | 设计取舍、需求模糊 |
| dag | 跨模块大任务 |

## Provider

| | OpenAI（默认） | Cursor |
|--|----------------|--------|
| 执行 | 本地 ReAct + 工具 | Cursor SDK |
| Skill | Agent 调 `load_skill` | prompt 附带 Catalog；见 [skills.md](skills.md) |
| `/skill` | ✅ | ✅ |

## Skill

目录 `{工作区}/.agent/skills/`。**编写与激活详见 [skills.md](skills.md)**（本文不重复）。

## 开发

```bash
npm run typecheck && npm run test && npm run build
```

实现细节：[architecture.md](architecture.md)

## 常见问题

**Missing OPENAI_API_KEY** — 确认根目录有 `.env`（从 `.env.example` 复制），且 `OPENAI_API_KEY=` 后填了真实密钥，保存后重新 `npm run dev`。

**文件不在期望的项目** — `npm run dev -- <项目路径>` 指定工作区。

**Skill 没生效** — 见 [skills.md#常见问题](skills.md#常见问题)。

**改 Agent 行为** — `packages/core/src/prompt.ts`、`packages/tools/src/registry.ts`、`packages/core/src/plugin/builtins.ts`
