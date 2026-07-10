# 规划：Plugin 生命周期钩子与 Skill Catalog 初始化

> 状态：**草案**（仅规划，未实现）  
> 目标：把 Skill Catalog 等「Session 级、一次初始化」的逻辑从 Turn 链路中拆出，改由 Plugin 在 App / Session 生命周期钩子里驱动。

---

## 1. 背景与问题

### 1.1 现状

| 层级 | 当前行为 |
|------|----------|
| CLI | `useAgentSession` → `new AgentSession({ cwd })`，Session 长活复用 |
| Turn | `runAgentTurn` → `PluginDriver.run`，仅 **Turn 级** 钩子 |
| prepare | 每轮调用 `ensureSkillCatalog`（discover + 写 messages）+ `/skill` 解析 |

Plugin 现有钩子全部绑定 **单次 Turn**（`PluginTurnContext` 含 `input`）：

```
buildStart → transformInput → resolveMode → prepareAgent → execute → closeTurn
```

### 1.2 问题

1. **Skill Catalog 是 Session / 工作区级索引**，却在 `prepareTurn` 里每轮执行；同 cwd 虽靠 index 避免重复写入 messages，但 **仍会每轮扫盘 discover**。
2. **语义错位**：Catalog 属于「上下文 bootstrap」，不是「用户输入预处理」。
3. **扩展困难**：Rule 目录、MCP 清单、工作区元数据等若也按 Turn 挂，会重复同样的问题。

### 1.3 目标

- Catalog **Session 创建时初始化一次**（同 cwd 不重复 discover）。
- **换工作区**时由钩子触发重新初始化。
- **`/skill` 命令解析**仍留在 Turn 的 `prepare`（用户显式加载正文，与 Catalog 索引分离）。
- 新能力通过 **Plugin 注册钩子** 扩展，不在 `prepareTurn` 里堆逻辑。

---

## 2. 生命周期分层

```
App 启动（CLI 进程 / TUI mount）
  ↓
Session 创建（首次 ensureSession / AgentSession 构造完成）
  ↓
Session 就绪（可选：async 初始化完成，可接受 Turn）
  ↓
[ 多次 Turn：runAgentTurn → PluginDriver（Turn 钩子）]
  ↓
Session 销毁（/new、clearSession、进程退出）
  ↓
App 关闭
```

**原则：**

| 层级 | 放什么 | 不放什么 |
|------|--------|----------|
| **App** | 全局单例、与 cwd 无关的配置 | 依赖具体 Session 的状态 |
| **Session** | Catalog、工作区 bootstrap 上下文 | 单轮 user input 解析 |
| **Turn** | beginTurn、/skill 加载、路由、执行 | 重复的 Catalog discover |

---

## 3. 建议新增的 Plugin 钩子

### 3.1 类型拆分

Turn 钩子与生命周期钩子 **context 不同**，避免复用 `PluginTurnContext`（后者强依赖 `input`）。

```typescript
// 草案类型名

type PluginSessionContext = {
  session: AgentSession;
  cwd: string;
  meta: Map<string, unknown>;
};

type PluginAppContext = {
  meta: Map<string, unknown>;
  // 可选：registry 级只读配置，不绑 session
};

type AgentPlugin = {
  name: string;
  enforce?: 'pre' | 'post';

  // --- 生命周期（新增）---
  onAppStart?(ctx: PluginAppContext): void | Promise<void>;
  onSessionCreate?(ctx: PluginSessionContext): void | Promise<void>;
  onSessionReady?(ctx: PluginSessionContext): void | Promise<void>;
  onWorkspaceChange?(ctx: PluginSessionContext, prevCwd: string): void | Promise<void>;
  onSessionDispose?(ctx: PluginSessionContext): void | Promise<void>;

  // --- Turn（现有）---
  buildStart?(ctx: PluginTurnContext): void | Promise<void>;
  transformInput?(...): ...;
  // ...
};
```

### 3.2 各钩子语义

| 钩子 | 触发时机 | 典型用途 |
|------|----------|----------|
| `onAppStart` | CLI `App` mount 或 core 首次 import 后一次 | 全局日志、版本检查、预加载静态配置 |
| `onSessionCreate` | `AgentSession` 构造完成后、**首个 Turn 之前** | 注册 Session 级 meta、同步初始化（轻量） |
| `onSessionReady` | Session 异步 bootstrap 完成后 | **Skill Catalog discover**、Rule 索引（IO 密集） |
| `onWorkspaceChange` | `setWorkspace` / `ensureWorkspace` 检测到 cwd 变化 |  invalidate + 重新挂载 Catalog |
| `onSessionDispose` | `/new`、`clearSession`、`agentProviders.dispose` | 释放 Cursor 会话以外的 Plugin 资源 |

### 3.3 `onSessionCreate` vs `onSessionReady`

Session 构造是同步的，discover 是异步的。建议：

- **`onSessionCreate`**：同步、快速，不调 LLM、不做重 IO。
- **`onSessionReady`**：允许 async；CLI 在首个 Turn 前 `await sessionReady(session)`。
- 若未 ready 就收到 Turn，**排队或 await**（避免 Catalog 缺失的第一轮）。

可选 API：

```typescript
AgentSession.open(options): Promise<AgentSession>
  → new AgentSession
  → PluginLifecycleDriver.runSessionReady(session)
  → return session
```

不在 `constructor` 里做 async。

---

## 4. 驱动器设计

### 4.1 两个 Driver（推荐）

| Driver | 职责 |
|--------|------|
| `PluginLifecycleDriver` | App / Session 钩子，持有 `plugins[]` |
| `PluginDriver`（现有） | 单 Turn 钩子，不变 |

二者共用 `session.options.plugins`（或拆成 `lifecyclePlugins` + `turnPlugins`，**第一版建议共用**，靠钩子是否存在区分）。

### 4.2 调用点（实现时改哪些文件）

| 调用点 | 文件 | 钩子 |
|--------|------|------|
| App mount | `packages/cli/src/ui/App.tsx` 或 `useAgentSession` | `onAppStart` |
| Session 创建 | `useAgentSession.ensureSession` 或 `AgentSession.open` | `onSessionCreate` → `onSessionReady` |
| cwd 变化 | `AgentSession.setWorkspace` / `ensureWorkspace` | `onWorkspaceChange` |
| Session 清理 | `useAgentSession.clearSession` | `onSessionDispose` |
| 用户 Turn | `loop.ts` → `PluginDriver`（不变） | Turn 钩子 |

### 4.3 enforce 顺序

生命周期钩子同样走 `sortByEnforceOrder`（`@code-agent-lite/shared`）：`pre` → 默认 → `post`。

Skill Catalog 插件建议 `enforce: 'pre'`，优先于其他 Session bootstrap。

---

## 5. Skill Catalog 作为第一个落地 Plugin

### 5.1 新 Plugin：`skillCatalogPlugin`

```typescript
function skillCatalogPlugin(): AgentPlugin {
  return {
    name: 'skill-catalog',
    enforce: 'pre',

    async onSessionReady(ctx) {
      await mountSkillCatalog(ctx.session, ctx.cwd);
    },

    async onWorkspaceChange(ctx, _prevCwd) {
      ctx.session.clearSkillCatalog(); // 或 invalidate API
      await mountSkillCatalog(ctx.session, ctx.cwd);
    }
  };
}
```

### 5.2 `mountSkillCatalog` 行为（从 `ensureSkillCatalog` 演进）

| 条件 | 行为 |
|------|------|
| 同 cwd 已挂载 | **直接 return**，不 discover |
| 有 skills | `session.setSkillCatalog(catalog, cwd)`（固定 index slot） |
| 无 skills | `session.clearSkillCatalog()` + 标记 cwd 已同步（避免空目录每轮扫） |

### 5.3 从 `prepareTurn` 移除

```diff
 export async function prepareTurn(...) {
   session.ensureWorkspace(cwd);
-  await ensureSkillCatalog(session, cwd);
   const { cleanedInput, ... } = await resolveAndInjectTurnSkills(...);
   ...
 }
```

**保留** `resolveAndInjectTurnSkills`：`/skill`、`@skill:` 仍在 Turn 级处理（或后续迁到 CLI 斜杠命令层，另议）。

### 5.4 defaultPlugins 注册顺序（草案）

```
lifecycle: skillCatalogPlugin（Session 钩子）
turn:      prepare → router → provider → mode → verify
```

实现上可以是同一数组，`PluginLifecycleDriver` 只调 lifecycle 钩子，`PluginDriver` 只调 Turn 钩子。

---

## 6. 与现有模块的关系

```
┌─────────────────────────────────────────────────────────┐
│ CLI App                                                  │
│   onAppStart (可选)                                      │
│   AgentSession.open()                                    │
│     → onSessionCreate                                    │
│     → onSessionReady → skillCatalogPlugin → mountCatalog │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ AgentSession                                             │
│   ConversationStore.messages[]                           │
│     [system] prompt                                      │
│     [system] workspace                                   │
│     [system] Skill Catalog  ← 固定 slot，Session 级       │
│     [user/assistant/...]                                 │
└───────────────────────────┬─────────────────────────────┘
                            │ runAgentTurn (每轮)
┌───────────────────────────▼─────────────────────────────┐
│ PluginDriver (Turn)                                      │
│   prepare: /skill 解析 + beginTurn（不再 discover）       │
└─────────────────────────────────────────────────────────┘
```

---

## 7. 实施阶段（建议）

### Phase 1 — 最小可用（只做 Catalog）

- [ ] 定义 `PluginSessionContext`、`onSessionReady`、`onWorkspaceChange`
- [ ] 实现 `PluginLifecycleDriver`
- [ ] `AgentSession.open()` + CLI 改用 open
- [ ] `skillCatalogPlugin` + 从 `prepareTurn` 移除 `ensureSkillCatalog`
- [ ] `ConversationStore` 增加 cwd 同步标记（空目录也不重复 discover）
- [ ] 单测：`mountSkillCatalog` 同 cwd 跳过、换 cwd 刷新

### Phase 2 — 补齐生命周期

- [ ] `onSessionCreate` / `onSessionDispose`
- [ ] `onAppStart`（若 CLI 有全局需求）
- [ ] 文档更新 `docs/architecture.md`

### Phase 3 — 扩展点（可选）

- [ ] Rule 索引插件（同 Catalog 模式）
- [ ] `onWorkspaceChange` 时同步更新 workspace system 消息（当前仅 Catalog 原地更新，workspace 行仍可能过期）
- [ ] Plugin 拆分为 `lifecyclePlugins` / `turnPlugins` 配置项

---

## 8. 非目标（本阶段不做）

- 不改 Skill Catalog 在 `messages[]` 里的存储方式（仍用 index slot，不引入独立 LLM context 层）。
- 不把 `/skill` 解析从 Turn 挪走（除非后续单独讨论 CLI 斜杠命令层）。
- 不实现 App 级 Skill 缓存跨 Session 共享（每个 Session 独立 discover 即可）。
- 不增加文件 watcher 自动刷新 Catalog（换 cwd 或手动 `/new` 时刷新足够）。

---

## 9. 风险与决策点

| 议题 | 选项 | 建议 |
|------|------|------|
| Session 创建 API | `new` + 外部 ready / `AgentSession.open` | **`open` 工厂**，语义清晰 |
| 首个 Turn 竞态 | fire-and-forget / await ready | **await ready**，避免首轮无 Catalog |
| DAG Worker Session | 子 Session 是否挂 Catalog | **不挂**；Worker 用精简 messages，与现 `worker.ts` 一致 |
| 插件列表 | 一套 / 两套 | **第一版一套**，按钩子分流 |
| `ensureSkillCatalog` 导出 | 保留 / 改名 deprecated | 保留别名 `@deprecated`，内部调 `mountSkillCatalog` |

---

## 10. 验收标准

1. 同 Session、同 cwd 连续 N 轮 Turn：**0 次**额外 `discoverSkills`（可用 mock 计数断言）。
2. 换 workspace 后：Catalog 内容更新，messages 中仍只有 **1** 条 Catalog system 消息。
3. `/skill foo` 仍能加载正文并跑 Turn。
4. 现有 `PluginDriver` Turn 测试全部通过。
5. `defaultPlugins()` 增删 `skillCatalogPlugin` 即可关闭 Catalog 行为，无需改 `prepareTurn`。

---

## 11. 相关文件索引

| 文件 | 规划中的角色 |
|------|----------------|
| `packages/core/src/plugin/types.ts` | 新增 lifecycle 钩子类型 |
| `packages/core/src/plugin/lifecycle-driver.ts` | 新建 |
| `packages/core/src/plugin/builtins.ts` | 注册 `skillCatalogPlugin` |
| `packages/core/src/skills/skill-catalog.ts` | `mountSkillCatalog` + cwd 缓存 |
| `packages/core/src/turn/prepare-turn.ts` | 移除 catalog |
| `packages/core/src/session.ts` | `open()`、workspace 时调 lifecycle |
| `packages/cli/src/ui/useAgentSession.ts` | `AgentSession.open` |
| `packages/core/src/session/conversation-store.ts` | sync 标记 |

---

**下一步：** 确认本规划（尤其 §3 钩子命名、§7 Phase 1 范围）后，再按 Phase 1 实现；实现前不改动 Skill 相关行为。
