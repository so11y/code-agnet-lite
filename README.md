# code-agent-lite

用于学习 Agent 内部机制的最小终端 Code Agent（TypeScript + Ink + OpenAI / Cursor）。在本地工作区读代码、改代码、跑命令。

## 快速开始

```bash
npm install
cp .env.example .env    # Windows: copy .env.example .env
```

编辑 `.env`，填入 API Key（见下方说明），然后：

```bash
npm run dev                  # 工作区 = 当前目录
npm run dev -- D:\my-project # 指定工作区
```

### 配置 API Key

1. 复制 `.env.example` → `.env`（项目根目录，与 `package.json` 同级）
2. 打开 [OpenAI API Keys](https://platform.openai.com/api-keys)，创建密钥
3. 写入 `.env`：

```env
OPENAI_API_KEY=sk-proj-你的密钥
```

4. 若用国内/自建 **OpenAI 兼容网关**，再加一行 `OPENAI_BASE_URL=https://你的网关/v1`

**Cursor 模式（可选）：** `.env` 里设 `AGENT_PROVIDER=cursor` 和 `CURSOR_API_KEY`（Cursor 账户获取）。此时主 Agent 走 Cursor，但路由/规划仍要 `OPENAI_API_KEY`。

完整变量说明见 [.env.example](.env.example) 和 [docs/getting-started.md](docs/getting-started.md)。

**使用说明：** [docs/getting-started.md](docs/getting-started.md)

## 文档

| 文档 | 读者 |
|------|------|
| [getting-started.md](docs/getting-started.md) | 安装、配置、TUI、命令、工具 |
| [skills.md](docs/skills.md) | Skill 编写与激活 |
| [architecture.md](docs/architecture.md) | 实现架构（开发者） |
| [notes/](notes/) | 原理探索（非实现权威） |

索引：[docs/README.md](docs/README.md)
