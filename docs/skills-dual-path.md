# Skill 双路径问题整理

## 问题是什么

当前 Skill 加载存在**两条互不统一的通道**，同一份 Skill 正文可能以不同方式、不同次数进入上下文，且状态不同步。

```
通道 A（插件层）                    通道 B（Tool 层）
─────────────────                  ─────────────────
/skill minimal-code                模型调用 load_skill
    ↓                                  ↓
prepareTurn                          ReAct tool loop
    ↓                                  ↓
resolveAndInjectTurnSkills           loadSkill() 读文件
    ↓                                  ↓
session.skills.inject()              返回字符串 → tool message
    ↓                                  ↓
system note 注入                     不进 loaded_ 状态
```

**双写**：同一次任务里，插件已经 `inject` 了，模型又调 `load_skill`，同一份指引出现两次、形式不同。

**双轨**：Skill 有时是「框架注入的规则」，有时是「模型调用的函数」，语义不一致。

---

## 两条通道对比

| 维度 | 插件路径（A） | Tool 路径（B） |
|------|---------------|----------------|
| 触发方式 | `/skill <name>` 或 `@skill:<name>` | 模型自主调 `load_skill` |
| 执行位置 | `prepareTurn` → `resolveAndInjectTurnSkills` | `react-agent` → `runTool` |
| 进入上下文 | `conversation.addSystemNote()` → **system 消息** | `finishTool()` → **tool 消息** |
| 状态记录 | `Skills.loaded_` 有记录 | **不经过** `Skills`，无去重 |
| Catalog 指引 | 与 inject 无关 | 提示「匹配时用 load_skill」 |
| Cursor Provider | inject 在本地 messages 里 | Cursor Agent **不参与**本地 tool loop |

---

## 重复加载怎么发生

典型场景：用户输入 `/skill minimal-code 重构 xxx`

```
1. prepareTurn
   → parseSkillInput 识别 /skill
   → session.skills.inject(minimal-code)     ✅ 第一次加载

2. 主 Agent / ReAct 循环
   → 看到 Catalog：「匹配时用 load_skill」
   → 或看到用户消息里的 skill 语义
   → 调用 load_skill("minimal-code")       ✅ 第二次加载

3. 结果
   → system note 里有一份 [Skill: minimal-code] 正文
   → tool message 里又有一份相同正文
   → loaded_ 只认第一次；tool 路径不更新状态
```

自然语言场景也会重复：Catalog 已挂载，模型不调 `/skill`，但可能仍调 `load_skill`；若将来插件层也做自动 inject，会和 tool 再撞一次。

---

## 和 Catalog 的关系

Catalog **不是**加载，只是目录索引：

```
sessionReady
  → skillCatalogPlugin
  → mountCatalog()
  → messages 里插入一条 [Skill Catalog]（仅 name + description）
```

| 环节 | 做了什么 | 没做什么 |
|------|----------|----------|
| Catalog | 让模型/Resolver 知道有哪些 Skill | 不注入 Skill 正文 |
| inject | 把 SKILL.md 正文写入 system note | 不更新 Catalog |
| load_skill | 把正文放进 tool 返回值 | 不走 inject、不记 loaded_ |

用户常见误解：**「Catalog 初始加载了」=「Skill 已生效」**。实际只是挂了目录，正文未必进上下文。

---

## Skills 类当前能力与缺口

```typescript
// packages/core/src/skills/skills.ts（现状）
class Skills {
  private loaded_ = new Set<string>();  // 只知道 name，不知道 message 位置

  inject(skill) {
    if (loaded_.has(skill.name)) return false;
    loaded_.add(skill.name);
    conversation.addSystemNote(formatForPrompt(skill));
    return true;
  }
}
```

**已有**：`loaded_` 去重、`inject` 写 system note。

**缺口**：

1. `load_skill` tool **绕开** `Skills` 类，直接 `loadSkill()` + 返回文本
2. 无 `ensureLoaded()` 统一入口，外部路径无法共用去重
3. `loaded_` 不记录对应 message index，无法判断「正文是否已在 messages 里」
4. 无「根据任务语义自动选型」——只有 `/skill` 显式指定或模型调 tool

---

## Cursor Provider 的额外断层

`CursorCodeAgent` 不走本地 ReAct tool loop：

```typescript
// 只把用户原文发给 Cursor SDK
const userInput = session.ledger...userInput;
await agent.send(userInput);

// 本地 tools 全部无效
findTool() { return undefined; }
```

因此：

- 本地 `messages` 里的 Catalog、inject 的 system note，**Cursor Agent 未必能看到**
- `load_skill` 在 Cursor 模式下**本来就不会执行**
- Skill 要在 Cursor 下生效，必须在 **发给 Cursor 之前** 由插件层 inject 进 prompt

---

## description 与匹配：另一个「双写」

Agent Skills **标准**里，触发条件应写在 `description`（`Use when...`），没有独立 `when` 字段。

若：

- `description` 给人看 + 给 Catalog 展示
- 又用关键词去匹配 `description` 里的字眼

则出现：**用户每种说法都要往 description 里塞**，否则匹配不上。这和「改代码就应触发 minimal-code」矛盾——应匹配**任务类型**，不是穷举原话。

| 写法 | 标准？ | 适用 |
|------|--------|------|
| `description` 含 `Use when writing/modifying code...` | ✅ Cursor / agentskills.io | 通用 |
| 顶层 `when:` | ❌ 非标准 | 仅自定义 resolver |
| `metadata.when` | △ 扩展 | 自定义 resolver 可读 |
| `paths: "**/*.{ts,js}"` | ✅ 标准 | 按文件类型限定 |

---

## 目标架构（讨论共识，未落地）

```
用户发消息（自然语言，不必 /skill）
        ↓
discover(cwd)                    // 运行时扫 .agent/skills/，开放集合
        ↓
Skill Resolver（独立一步，非 mode router）
  输入：用户消息 + catalog(name+description) + listLoaded()
  输出：{ skills: ["minimal-code", ...] }   // 0～N 个
        ↓
Skills.ensureLoaded(name)        // 唯一注入入口，已加载则 skip
        ↓
resolveMode（只管 react/tot/dag）
        ↓
主 Agent 执行
```

**原则**：

1. **Skill 不是 tool** — 禁止（或移除）`load_skill` 作为普通 tool 加载正文
2. **`Skills` 是唯一状态源** — 所有加载走 `ensureLoaded`
3. **决策与执行分离** — Resolver 选哪些；`Skills` 负责 inject 与去重
4. **新 Skill 零改代码** — 只加 `.agent/skills/<name>/SKILL.md`
5. **`/skill`** — 可选保留为强制指定，也走 `ensureLoaded`，与 Resolver 共用去重

---

## 建议处置项（待拍板）

| 项 | 建议 | 状态 |
|----|------|------|
| 移除 `load_skill` from tools registry | 避免 Skill 变函数 | 待确认 |
| `/skill` 解析 | 保留为强制指定，改走 `ensureLoaded` | 待确认 |
| 独立 Skill Resolver 插件 | `prepareAgent` 阶段，读 catalog 动态选型 | 待确认 |
| `Skills.ensureLoaded` + `listLoaded` | 统一入口与状态 | 待确认 |
| Catalog / prompt 文案 | 去掉「用 load_skill 加载」 | 待确认 |
| `description` 按标准写 WHEN | minimal-code 等 Skill 改写 | 待确认 |

---

## 相关文件索引

| 文件 | 职责 |
|------|------|
| `packages/core/src/turn/prepare-turn.ts` | 每轮准备，`/skill` 解析入口 |
| `packages/core/src/skills/apply-turn-skills.ts` | `/skill` → load + inject |
| `packages/core/src/skills/skills.ts` | `loaded_`、`inject`、`mountCatalog` |
| `packages/core/src/plugin/skill-catalog-plugin.ts` | Session 级挂 Catalog |
| `packages/tools/src/load-skill.ts` | Tool 通道（与插件双轨） |
| `packages/tools/src/skills/format.ts` | Catalog 文案、Skill 正文格式化 |
| `packages/tools/src/skills/loader.ts` | `discoverSkills`、`loadSkill` |
| `packages/core/src/prompt.ts` | 系统提示词中的 Skill 规则 |
| `packages/core/src/provider/cursor-code-agent.ts` | Cursor 模式不传本地 tools |

---

## 一句话

**Skill 正文只应通过 `Skills.inject` 进 system note 一次；`load_skill` tool 与插件 inject 并存是当前双写、双轨的根因。**
