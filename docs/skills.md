# Skill

可复用的任务指引。Session 启动只挂 **Catalog**（name + description）；正文匹配后通过 `load_skill` 或 `/skill` 激活。

CLI 斜杠命令见 [getting-started.md](getting-started.md#tui-操作)。

## 目录

```
{工作区}/.agent/skills/<name>/SKILL.md
```

本仓库示例：`minimal-code`、`no-wrapper`、`caveman`。

- **运行时**读 `.agent/skills/`（跟当前工作区走，换项目要拷或自建）
- **Cursor IDE** 开发本仓库时用 `.cursor/skills/`（与 Agent 运行时目录分离）

## 激活方式

| 方式 | 行为 |
|------|------|
| 自动 | Agent 对照 Catalog description，匹配则 `load_skill` |
| 强制 | `/skill <name> 任务` → `prepareTurn` 里 `ensureLoaded` |

```
sessionReady → mountCatalog（索引）
用户任务   → load_skill → ensureLoaded → inject 正文到 system note
/skill     → ensureLoaded（同上，跳过匹配）
```

Catalog **不会**自动注入正文。已加载 Skill 由 `loaded_` 去重，不重复 inject。

## 新建 Skill

```markdown
---
name: my-skill
description: >-
  一句话能力。Use when ...（匹配的唯一依据，写任务类型而非穷举原话）
---

# 正文
```

`description` 建议含 `Use when`，中英文场景均可。各 Skill 各管各的（改代码、浏览器 MCP 等互不冲突）。

可选：`reference.md`、`scripts/`。正文建议 < 500 行。

## Provider 差异

| | OpenAI | Cursor |
|--|--------|--------|
| 自动激活 | `load_skill` tool | 每轮 prompt 带 Catalog + 已 inject 正文 |
| 强制 | `/skill` | `/skill` |

## 常见问题

**说了「重构」没加载？** 确认 `{工作区}/.agent/skills/` 有文件；`/new` 新 session；或 `/skill minimal-code ...`。

**Skill vs Rule？** Skill 按需加载；Rule 会话级常驻（若启用）。

**改 Skill 后要重启吗？** 换 cwd 或 `/new` 会重新 discover；同 session 已加载的不重复 inject。

## 开发约定

代码规范见 [.cursor/skills/no-wrapper/SKILL.md](../.cursor/skills/no-wrapper/SKILL.md)。实现见 [architecture.md#skill-加载](architecture.md#skill-加载)。
