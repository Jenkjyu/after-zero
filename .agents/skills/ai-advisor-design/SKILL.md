---
name: ai-advisor-design
description: Use this skill when modifying or debugging After Zero's AI debt advisor (`react/src/sheets/AiScreen.tsx`, `AiLimitModal.tsx`, `cloudbase/functions/aiAdvisor`), server-side monthly quota, conversation persistence, prompts, model selection, retry/reveal behavior, or AI history sheet.
---

# AI 债务助手

按当前“聊天式报告 + 问答”实现维护，不恢复旧版一次性报告页面，也不加入尚未实现的 OCR。

## 边界与调用链

- AI 是 Premium 功能；门禁与权益文案归 `account-premium-design` skill。
- `AiScreen.tsx` 拥有会话、历史、额度缓存、重试、建议芯片和展示动画；`www/index.html` 的 `buildAiSummary()` / `callAiAdvisor()` 保留认证会话与云函数 bridge。
- 客户端把完整逐期还款计划和计息方式放进 summary；云函数不读用户数据库中的债务数组。
- 云函数用 `app.ai().createModel("cloudbase").generateText()`，当前模型是 `hy3`，不需要第三方 API Key 或 envVariables。换模型时只使用 CloudBase 控制台当前已启用的 model id。
- 云函数部署、集合或权限问题加载 `cloudbase-deploy`；screen/历史 sheet 层级和返回链加载 `react-bridge-architecture` 与 `capacitor-ui-system`。

## 服务端月度额度

- 权威限制是每个已认证 `customUserId` 每个北京时间自然月 50 次，记录在 `aiUsage` 集合，以 `{openid, month}` 查询。
- 只在模型成功返回非空内容后计数；失败、超时和空回复不扣次数。超额返回 `code: "QUOTA_EXCEEDED"` 和 `{month,used,limit}`。
- `AI_USAGE_KEY = "after-zero-ai-usage-v1"` 只是服务端 quota 的本地缓存，用于欢迎态显示和已知超额时的快路径拦截，不是权威计数器。旧 `{date,count}` 数据或跨月缓存应视为未知并放行到服务端。
- 月份计算客户端和云函数都按 UTC+8；不要直接用 UTC 月份。
- 当前计数读取失败会 fail-open，写计数失败只记日志；它是服务端主控但不是事务级强一致限流，不要把它描述成绝对不可绕过的计费系统。

## 会话与消息

- `AI_CHATLOG_KEY` 保存最多 50 个会话，每会话最多 40 条消息；当前会话可从历史加载并继续追问。
- 新会话第一次发问先进入内存，收到成功回复后才持久化；从未成功回复且只有用户消息的失败会话不留僵尸记录。
- chat 请求只带发送前最近 12 条历史，不重复包含本次问题；report 模式不带 history。
- 持久化正文时剥离 `###SUGGESTIONS###`；建议芯片只保留在当前最后一条成功回复的展示状态，重新打开历史不会恢复旧芯片。
- 重试用原气泡的 `msgIndex` 和原始上下文原地执行，不重复追加用户消息。

## 展示约束

- 云函数一次性返回完整文本；`startReveal()` 只是客户端每 16ms 显示 3 个字符的假流式动画，不改变网络等待或持久化内容。`prefers-reduced-motion` 时跳过。
- 保持计时器副作用在 interval 回调中，不放进 React 函数式 state updater。切换会话用单调递增 token 让旧 reveal 自行停止，不能只用可能复用的 `msgIndex`。
- 只解析段落、无序/有序列表和 `**加粗**`；其余内容由 JSX 转义。模型不输出建议 marker 时按普通正文优雅降级。
- `AiLimitModal` 首次进入只提示一次，真正超额时再次显示，并提供复制完整债务提示词到外部 AI 的退路。
- AI 历史 sheet 是 `AiScreen` 本地状态，但视觉上盖在 subpage 上方；返回时先关历史 sheet，再关 AI screen。

## 验证

- 修改客户端运行 `npm run test:react`，重点覆盖月度缓存、跨月、服务端超额、历史续聊、重试、建议剥离、reduced motion、假流式和会话切换。
- 修改云函数时核对未登录、缺 summary、空问题、成功后计数、超额拒绝和模型异常分支；真实模型/额度/权限需部署后验证。
