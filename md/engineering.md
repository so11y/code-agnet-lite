Prompt Engineering 怎么问模型
Context Engineering 给模型什么上下文
Harness Engineering 不是只调模型，而是设计“模型外面那一整套工程壳子”。工具、上下文、记忆、流程、权限、验证、观察、回滚、日志、评估等外部系统
Engineering 设计 Agent 如何自动一轮一轮地思考、执行、观察、验证、继续或停止。



Goal
  ↓
Find Work
  ↓
Plan
  ↓
Act
  ↓
Observe
  ↓
Verify
  ↓
Remember
  ↓
Continue / Stop


```typescript
while (!done) {
  const plan = await think(task, context);

  const result = await act(plan, tools);

  const observation = observe(result);

  const review = await reviewResult(task, plan, observation);

  if (review.done) {
    return finalAnswer(review);
  }

  context = updateContext(context, observation, review);
}
```


# Loop Engineering

## 目录

1. [什么时候开始？](#1-什么时候开始)
2. [每轮做什么？](#2-每轮做什么)
3. [调哪些工具？](#3-调哪些工具)
4. [工具结果怎么喂回模型？](#4-工具结果怎么喂回模型)
5. [怎么判断成功？](#5-怎么判断成功)
6. [失败怎么重试？](#6-失败怎么重试)
7. [什么时候停止？](#7-什么时候停止)
8. [怎么避免死循环？](#8-怎么避免死循环)
9. [怎么记录历史？](#9-怎么记录历史)
10. [怎么降低 token 成本？](#10-怎么降低-token-成本)

---

# Loop Engineering 关注什么？

Loop Engineering 关注的不是“模型怎么想”，而是 **Agent 如何一轮一轮地推进任务**。

它重点解决这些问题：

* 什么时候启动任务？
* 每一轮应该做什么？
* 该调用哪些工具？
* 工具结果怎么整理后再喂给模型？
* 怎么判断任务完成？
* 失败后怎么重试？
* 什么时候停止？
* 怎么避免死循环？
* 怎么记录过程？
* 怎么降低 token 成本？

简单说：

> Loop Engineering 是在设计 Agent 的执行循环，而不是设计模型的思维方式。

---

## 1. 什么时候开始？

Loop 的入口可以来自很多地方，不一定只能由用户手动触发。

常见启动方式：

* 用户发来任务
* 定时任务触发
* 检测到新 issue
* 检测到测试失败
* 检测到 TODO
* 检测到新邮件
* 检测到新告警

也就是说，Loop 的第一步是确定：

> 什么事件会触发 Agent 开始工作？

例如：

```ts
const triggers = [
  "user_task",
  "schedule",
  "new_issue",
  "test_failed",
  "todo_found",
  "new_email"
];
```

---

## 2. 每轮做什么？

Loop 不是一次性把事情做完，而是分成多轮推进。

每一轮通常会做这些事情：

* 查看当前任务目标
* 检查 TODO
* 查看报错信息
* 找失败测试
* 找未完成步骤
* 找新邮件
* 找新 issue
* 判断下一步动作

核心是：

> 每轮都要根据当前状态，决定下一步最有价值的动作。

例如：

```ts
while (!done) {
  const state = observe();
  const action = decideNextAction(state);
  const result = await execute(action);
  updateState(result);
}
```

---

## 3. 调哪些工具？

Loop 本身不直接做事，它通过工具执行动作。

常见工具映射：

```txt
search_code  -> search_files
read_file    -> read_file
edit_file    -> edit_file
run_test     -> run_cmd
analyze      -> no tool，只让模型分析
```

工具大致可以分为几类：

| 类型   | 作用                |
| ---- | ----------------- |
| 搜索工具 | 查代码、查文件、查 issue   |
| 读取工具 | 读取文件、读取日志、读取邮件    |
| 修改工具 | 编辑文件、创建文件、更新内容    |
| 执行工具 | 跑测试、跑 lint、跑构建    |
| 分析动作 | 不调用工具，只让模型根据上下文判断 |

关键点是：

> 工具不是越多越好，而是要让 Agent 能完成闭环。

最小可用工具通常是：

```txt
search_files
read_file
edit_file
run_cmd
```

---

## 4. 工具结果怎么喂回模型？

工具结果不能原样全部塞回模型，尤其是长日志、大文件、大量搜索结果。

错误做法：

```txt
npm test 输出 5000 行，全部塞给模型
```

正确做法：

```txt
先整理，再喂给模型
```

例如测试日志应该提取：

* 失败的测试名
* 报错位置
* 错误信息
* 相关堆栈
* 可能原因
* 被影响的文件

示例：

```ts
const summary = {
  command: "npm test",
  status: "failed",
  failedTests: ["login should redirect"],
  error: "Expected /home but received /login",
  files: ["src/auth/login.ts"]
};
```

核心原则：

> 工具原始输出是数据，喂给模型前要变成摘要。

---

## 5. 怎么判断成功？

Agent 不能只靠“模型觉得完成了”来判断成功。

应该用可验证条件判断：

* 测试是否通过
* 类型检查是否通过
* lint 是否通过
* 构建是否成功
* 页面是否正常
* 用户目标是否满足
* 没有新的错误出现

例如：

```ts
const success =
  testsPassed &&
  typecheckPassed &&
  lintPassed &&
  userGoalSatisfied;
```

对于 Code Agent 来说，比较常见的成功条件是：

```txt
测试通过
类型检查通过
没有新增报错
修改符合用户目标
```

核心是：

> 成功条件要尽量可验证，而不是只靠模型自我判断。

---

## 6. 失败怎么重试？

失败不能无脑重试，要先区分失败类型。

常见失败类型：

| 失败类型 | 说明          | 处理方式     |
| ---- | ----------- | -------- |
| 工具失败 | 参数错、路径错、命令错 | 修正参数后重试  |
| 测试失败 | 代码逻辑不对      | 分析错误后继续修 |
| 信息不足 | 还没读到关键文件    | 继续搜索或读取  |
| 权限问题 | 没有权限执行操作    | 停止并提示用户  |
| 连续失败 | 多次失败没有进展    | 换方案或停止   |

推荐策略：

```txt
第一次失败：分析错误，继续修
第二次失败：换一个假设
第三次失败：总结失败原因，停止或请求用户确认
```

可以记录失败状态：

```ts
const state = {
  failedCount: 0,
  lastError: null,
  triedActions: []
};
```

核心原则：

> 重试不是重复执行，而是带着新信息换策略。

---

## 7. 什么时候停止？

Loop 必须有明确的停止条件，否则 Agent 很容易一直跑下去。

常见停止条件：

* 任务完成
* 测试通过
* 没有新工作
* 达到最大轮数
* 连续失败 N 次
* 需要用户确认
* 遇到危险操作
* 权限不足
* 当前信息不足以继续

例如：

```ts
if (success) stop("task_completed");
if (round >= maxRounds) stop("max_rounds_reached");
if (failedCount >= 3) stop("too_many_failures");
if (needUserConfirm) stop("need_user_confirm");
```

核心是：

> 一个好的 Loop，必须知道什么时候不该继续。

---

## 8. 怎么避免死循环？

死循环通常不是代码层面的死循环，而是 Agent 行为上的重复。

常见表现：

* 重复搜索同一个关键词
* 重复读取同一个文件
* 重复运行同一个失败命令
* 重复修改同一段代码
* 模型一直说“再检查一下”
* 每轮没有产生新信息

解决方式：

1. 设置最大轮数限制
2. 设置连续失败次数限制
3. 记录已尝试动作
4. 检测重复 tool call
5. 同一个错误出现 N 次就停止
6. 每轮必须产生新信息，否则停止

可以记录每轮动作：

```ts
const actionKey = `${toolName}:${JSON.stringify(args)}`;

if (state.triedActions.includes(actionKey)) {
  stop("repeated_action");
}

state.triedActions.push(actionKey);
```

判断是否有新信息：

```ts
if (!result.hasNewInformation) {
  state.noProgressCount++;
}
```

核心原则：

> 每一轮必须带来新信息、新修改或新判断，否则就应该停止。

---

## 9. 怎么记录历史？

Loop 需要记录执行历史，方便后续复盘、压缩上下文、debug 和 eval。

建议记录：

* 用户目标
* 每轮计划
* 调用了什么工具
* 工具参数
* 工具结果摘要
* 修改了哪些文件
* 失败原因
* 当前状态
* 最终结果

示例：

```ts
const history = [
  {
    round: 1,
    goal: "修复登录测试失败",
    action: "run_cmd",
    args: "npm test",
    resultSummary: "login redirect test failed",
    filesChanged: [],
    error: "Expected /home but received /login"
  },
  {
    round: 2,
    action: "read_file",
    args: "src/auth/login.ts",
    resultSummary: "found redirect logic",
    filesChanged: []
  }
];
```

记录历史的作用：

* 防止重复操作
* 生成最终总结
* debug Agent 行为
* replay 执行过程
* 做 eval 评估
* 压缩上下文

核心是：

> 历史不是为了全部塞给模型，而是为了保留关键决策轨迹。

---

## 10. 怎么降低 token 成本？

Agent Loop 很容易消耗大量 token，尤其是多轮任务。

降低 token 成本的核心原则：

> 不要把所有历史、所有文件、所有日志都塞回模型。

常见优化方式：

1. 工具结果先摘要
2. 长日志截断
3. 文件按需读取
4. 搜索结果只保留最相关的
5. 历史压缩成 summary
6. 老轮次只保留结论
7. 大文件分段读取
8. 不重复传已经知道的信息
9. 只保留当前决策需要的上下文
10. 对工具结果做结构化提取

例如：

```ts
const context = {
  goal,
  currentPlan,
  relevantFiles,
  latestErrorSummary,
  changedFiles,
  previousConclusion
};
```

而不是：

```ts
const context = {
  allMessages,
  allFiles,
  allLogs,
  allToolResults
};
```

核心原则：

> 模型每一轮只需要当前决策所需的信息，不需要完整世界。

---

# 总结

Loop Engineering 的核心不是让模型“想得更聪明”，而是让 Agent 的执行过程更可靠。

它关注的是：

```txt
触发 -> 观察 -> 决策 -> 调工具 -> 整理结果 -> 更新状态 -> 判断是否继续
```

可以理解成：

```ts
while (shouldContinue(state)) {
  const observation = observe(state);
  const action = decide(observation);
  const result = await execute(action);
  const summary = summarize(result);
  state = updateState(state, summary);
}
```

最终目标是让 Agent：

* 不乱跑
* 不重复
* 不死循环
* 会验证
* 会重试
* 会停止
* 成本可控
* 过程可追踪

一句话：

> Loop Engineering = 设计 Agent 如何持续推进任务，直到完成或应该停止。
