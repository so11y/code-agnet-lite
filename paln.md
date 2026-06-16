# OpenCode Lite

目标：

实现一个类似 OpenCode 的终端 Code Agent，用于学习 Agent 原理。

技术栈：

* TypeScript
* React
* Ink
* OpenAI SDK
* execa
* fast-glob
* zod

设计原则：

* 不依赖 LangChain
* 不依赖复杂框架
* 先实现 ReAct
* 每个版本都可独立运行
* 优先学习 Agent 原理

---

# V1 - ReAct Code Agent

目标：

实现最小可用 Code Agent。

用户输入：

```text
修复登录 Bug
```

Agent：

```text
思考
↓
搜索代码
↓
读取文件
↓
执行命令
↓
分析
↓
修改代码
↓
验证结果
```

---

## 功能

### TUI

使用 Ink 实现。

布局：

```text
┌────────────────────────────┐
│ Chat                       │
├────────────────────────────┤
│ Tool Calls                 │
├────────────────────────────┤
│ Status                     │
├────────────────────────────┤
│ Input                      │
└────────────────────────────┘
```

---

### Tool Calling

实现：

```text
read_file
write_file
grep
list_files
run_cmd
```

---

### grep

底层：

```bash
rg
```

示例：

```bash
rg "auth"
rg "token"
rg "router"
```

---

### ReAct Loop

核心循环：

```text
Thought
↓
Action
↓
Observation
↓
Thought
↓
Action
↓
Observation
↓
Final
```

伪代码：

```ts
while (true) {
  const result = await llm(messages, tools);

  if (result.final) {
    break;
  }

  const toolResult = await executeTool(result.toolCall);

  messages.push(toolResult);
}
```

---

### System Prompt

```text
你是一个 Code Agent。

规则：

1. 不要直接猜测问题原因
2. 优先搜索代码
3. 优先阅读文件
4. 必要时运行命令验证
5. 修改后必须验证
6. 无法确认时明确说明
```

---

### 项目结构

```text
src/

  main.tsx

  ui/
    App.tsx
    ChatPanel.tsx
    ToolPanel.tsx
    StatusBar.tsx
    InputBox.tsx

  agent/
    loop.ts
    llm.ts
    prompt.ts
    types.ts

  tools/
    read-file.ts
    write-file.ts
    grep.ts
    list-files.ts
    run-cmd.ts

  utils/
    path-safe.ts
    truncate.ts
```

---

### V1 完成标准

支持：

```text
用户描述 Bug
↓
Agent 自动搜索
↓
Agent 自动读文件
↓
Agent 自动执行命令
↓
Agent 自动分析
↓
Agent 自动修改
↓
Agent 自动验证
```

代码量预估：

```text
500 ~ 1000 行
```

---

# V2 - 工程化增强

目标：

提升安全性、连续性和项目记忆能力。

---

## Diff Preview

write_file 不直接写入。

先展示：

```diff
- old code
+ new code
```

用户确认：

```text
[y] accept
[n] reject
```

---

## Session Persistence

保存：

```text
.agent/sessions/
```

内容：

```json
{
  "messages": [],
  "toolCalls": [],
  "modifiedFiles": []
}
```

支持：

```text
恢复上次会话
查看历史任务
```

---

## 项目配置

新增：

```text
.agent/config.json
```

例如：

```json
{
  "testCommand": "pnpm test",
  "lintCommand": "pnpm lint",
  "typecheckCommand": "pnpm typecheck"
}
```

Agent 不再猜命令。

---

## Mem0 长期记忆

存储：

```text
项目规范
常用命令
目录结构
用户偏好
历史结论
```

例如：

```text
项目使用 pnpm
测试命令是 pnpm test
认证模块位于 src/auth
```

流程：

```text
用户输入
↓
Mem0 Search
↓
注入上下文
↓
LLM
↓
Mem0 Add
```

---

## rtk 集成（可选）

替换：

```text
grep
read_file
git_diff
```

底层：

```text
rtk grep
rtk read
rtk git diff
```

作用：

```text
减少 Token
压缩输出
提升检索效率
```

---

### V2 完成标准

支持：

```text
Diff 预览
Session 恢复
长期记忆
项目配置
上下文压缩
```

代码量预估：

```text
1000 ~ 2000 行
```

---

# V3 规划（未来）

AoT

新增：

```text
Planner
Task Graph
Scheduler
Worker
Aggregator
```

示例：

```text
修复支付 Bug

Task A
分析前端

Task B
分析后端

Task C
分析数据库

Task D
汇总结果
```

支持并行任务。

---

# V4 规划（未来）

项目知识库。

新增：

```text
项目摘要
Embedding
LanceDB
语义检索
```

解决：

```text
项目架构是什么
权限系统如何实现
支付流程在哪里
```

---

# V5 规划（未来）

ToT（Tree of Thought）

支持：

```text
多个解决方案
评分
剪枝
搜索最优路径
```

用于复杂 Bug 定位和自动修复。
