# 规划：Plugin 生命周期钩子与 Skill Catalog 初始化

> **历史规划稿**（2025）。Skill Catalog 部分**已落地**：`skillCatalogPlugin` + `sessionReady` / `workspaceChange`。  
> 当前实现见 [docs/architecture.md](../docs/architecture.md#skill-加载)。下文描述的是规划时的「现状」，不再与代码一一对应。

> 原状态：草案  
> 目标：把 Skill Catalog 等「Session 级、一次初始化」的逻辑从 Turn 链路中拆出，改由 Plugin 在 App / Session 生命周期钩子里驱动。

---

## 1. 背景与问题

### 1.1 现状（规划时）

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

（以下钩子名部分已实现为 `sessionReady` / `workspaceChange` / `sessionDispose`，见 `packages/core/src/plugin/types.ts`。）

### 3.1 类型拆分

Turn 钩子与生命周期钩子 **context 不同**，避免复用 `PluginTurnContext`（后者强依赖 `input`）。

```typescript
type PluginSessionContext = {
  session: AgentSession;
  cwd: string;
  meta: Map<string, unknown>;
};

type AgentPlugin = {
  name: string;
  enforce?: 'pre' | 'post';

  sessionReady?(ctx: PluginSessionContext): void | Promise<void>;
  workspaceChange?(ctx: PluginSessionContext, prevCwd: string): void | Promise<void>;
  sessionDispose?(ctx: PluginSessionContext): void | Promise<void>;

  buildStart?(ctx: PluginTurnContext): void | Promise<void>;
  transformInput?(...): ...;
};
```

---

## 7. 实施阶段

### Phase 1 — Skill Catalog ✅ 已落地

- [x] `sessionReady` / `workspaceChange`
- [x] `skillCatalogPlugin`
- [x] 从 `prepareTurn` 移除每轮 discover
- [x] `ConversationStore` cwd 同步标记

### Phase 2+ — 未做

- [ ] `onAppStart`
- [ ] Rule 索引插件
- [ ] 独立 `PluginLifecycleDriver`（当前 Session 钩子在 `AgentSession` 内直接 `runHook`）

---

**若与 [architecture.md](../docs/architecture.md) 或源码不一致，以源码为准。**
