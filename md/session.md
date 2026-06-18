# Agent 中的 Session、Summary 与召回（Recall）

## 问题背景

很多人第一次实现 Agent 时，会这样做：

```ts
const messages = [];

messages.push(userMessage);
messages.push(assistantMessage);
messages.push(toolResult);
```

然后不断追加。

随着对话进行：

```text
第1轮
第2轮
第3轮
...
第100轮
```

最终会出现：

```text
上下文越来越大
Token越来越高
请求越来越慢
成本越来越高
```

原因是：

LLM 每次调用都需要重新发送上下文。

例如：

```text
第1轮：
发送 1轮消息

第2轮：
发送 1轮 + 2轮消息

第3轮：
发送 1轮 + 2轮 + 3轮消息

...

第100轮：
发送前99轮 + 当前问题
```

因此上下文会不断膨胀。

---

# Session

Session 可以理解为：

```text
完整历史记录
```

类似：

```text
会议录音
聊天原文
完整日志
```

例如：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "修复登录Bug"
    },
    {
      "role": "assistant",
      "content": "先搜索 auth"
    },
    {
      "role": "tool",
      "content": "src/auth.ts"
    }
  ]
}
```

保存位置：

```text
.agent/sessions/001.json
```

作用：

```text
关闭程序
↓
明天重新打开
↓
恢复完整历史
```

Session 是：

```text
完整事实
永久保存
不丢信息
```

---

# Summary

Summary 可以理解为：

```text
历史总结
```

例如已经聊了：

```text
100轮
```

不可能全部发给模型。

于是让模型总结：

```text
已检查：

- auth.ts
- router.ts
- token.ts

发现：

- token过期判断异常

已修改：

- auth.ts

当前状态：

- npm test通过
```

保存：

```text
.agent/summaries/001.md
```

作用：

```text
让模型快速了解历史
```

Summary 是：

```text
压缩版历史
方便进入Prompt
节省Token
```

---

# 为什么不能只有 Summary

错误做法：

```text
生成Summary
↓
删除历史
```

问题：

Summary 会丢信息。

例如：

```text
第37轮发现：

userId为空
```

总结时忘记写进去。

那么：

```text
userId为空
```

这个信息永久消失。

因此：

```text
Session 不能删
```

---

# 正确架构

```text
Session
+
Summary
```

Session：

```text
完整历史
```

Summary：

```text
压缩历史
```

---

# Recall（召回）

很多人会问：

```text
既然不把历史都发给模型

模型怎么知道细节？
```

答案：

```text
需要的时候重新获取
```

这就叫：

```text
Recall（召回）
```

---

# 代码场景示例

上午：

```text
用户：
修复登录Bug

Agent：
read_file("src/auth.ts")
```

看到了：

```ts
function verifyToken() {
    ...
}
```

---

下午：

```text
用户：
继续看看登录问题
```

此时 Prompt 中只有：

```text
Summary：

已检查：
- auth.ts

发现：
- token验证逻辑可疑
```

模型知道：

```text
以前检查过 auth.ts
```

但不知道：

```text
auth.ts 第237行是什么
```

---

于是：

```text
Thought:
需要重新查看 auth.ts
```

调用：

```bash
read_file src/auth.ts
```

再次读取源码。

这就是：

```text
Recall
```

---

# 为什么 Recall 比长期携带源码更好

方案一：

```text
永远携带 auth.ts
```

问题：

```text
Prompt越来越大
越来越贵
越来越慢
```

---

方案二：

```text
只保留结论

需要时重新读取
```

优点：

```text
上下文小
成本低
速度快
信息不会丢失
```

因此现代 Agent 基本都采用：

```text
Summary
+
Recall
```

模式。

---

# Cursor、Claude Code、OpenCode 的实际思路

并不是：

```text
永远记住所有代码
```

而是：

```text
Session
↓
保存完整历史

Summary
↓
保存关键结论

Recall
↓
需要时重新读取文件
重新搜索代码
重新获取细节
```

因此用户感觉：

```text
Agent一直记得
```

实际上是：

```text
Agent一直能找回来
```

这是现代 Agent 与普通聊天机器人的核心区别之一。

---

# 一句话总结

Session：

```text
完整录音
```

Summary：

```text
会议纪要
```

Recall：

```text
需要时重新翻录音
重新查看原始资料
```

现代 Agent：

```text
Session
+
Summary
+
Recall
```

共同工作，而不是把所有历史永远塞进 Prompt。



Agent 系统的 Cache 优化原则
要让 Prompt Cache 真正生效，你的上下文需要满足几个条件。

保持提示前缀稳定。System Prompt 放在最前面，且内容不要频繁变动。不要在开头放秒级时间戳或随机 ID——这会让每次请求的前缀都不同，Cache 命中率归零。

上下文只追加（Append-Only）。新消息追加到末尾，不要修改或重排历史消息。这确保了序列化的确定性——前缀始终一致。

工具定义保持稳定。不要在运行时动态增删工具定义。工具定义通常紧跟在 System Prompt 之后，如果变更了，后续所有 KV Cache 都会失效。需要控制工具可用性时，用 logit 掩蔽（在解码时屏蔽某些工具的输出概率）而不是删除工具定义——这样缓存不受影响。

注意 TTL。对于高频请求场景，保持请求间隔在 Cache TTL 以内（Claude 是 5 分钟），确保缓存不过期。