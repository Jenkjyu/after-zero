---
name: ai-advisor-design
description: This skill should be used when working on the AI debt advisor feature (`react/src/sheets/AiScreen.tsx`, `cloudbase/functions/aiAdvisor`), or debugging AI usage limits, chat history persistence, or model selection.
---

# AI 债务顾问（Premium）设计细节

**聊天式界面，不是"大按钮生成报告+底部迷你问答框"**（第一版做法已推翻）。只做"报告+智能问答"，没做OCR（明确推迟）。

## 空状态 + 消息流

打开页面/点"新对话"看到欢迎语+魔法棒图标+3个快捷芯片（生成分析报告+2个常见问题）。点任意一个都走同一条统一消息流——报告只是`isReportMode=true`时调云函数`mode:"report"`，气泡里仍显示"生成分析报告"这句话，报告和问答不是两套UI。魔法棒入场动效（摇两下再定住）在打开页面/新对话时触发，`prefers-reduced-motion`跳过整个流程。

## 云函数：CloudBase自带大模型，不接第三方API

`app.ai().createModel("cloudbase").generateText({model, messages})`——计费走CloudBase资源点，不需要第三方API Key。**模型id是实机核对控制台后定的**：当前「体验版」套餐下只有混元（`hy3`）状态「已开启」，DeepSeek全系被套餐锁住。`hy3`那行"免费额度剩余"显示"-"不代表免费，账单异常先看这里。升级套餐想换模型改`AI_MODEL`常量即可，**但只能填控制台里当时状态为「已开启」的model id**。函数不需要envVariables，吃权限控制`*`安全默认值即可。

## 成本兜底：客户端每日用量软上限

`AI_USAGE_KEY`存`{date, count}`，`AI_DAILY_LIMIT`（默认20）次/天，跨天清零，超限toast拦截。**这是客户端软限、可绕过，beta够用**——买断用户的AI是一次付费、持续产生算力成本，正式上线要换服务端计数才防得住。

## 历史对话：真实持久化+可继续追问，不是只读快照

`AI_CHATLOG_KEY`存`aiConvos`数组（`{id, title, isReport, updatedAt, messages}`）。**任何时候只有一个"当前会话"**：点历史列表某一条=整个加载回当前会话，之后可以直接继续追问，新问答**追加**进这条记录并顶到最前，不产生重复；"新对话"才真正清空开始新记录。`currentAiConvId`是null表示"还没产生过消息的全新会话"，第一次成功收到回复才真正创建写入。**这条是产品决策明确纠正过的**——最初设计"点历史=只读快照"，用户指出"所有chatbot都能在旧对话继续追问"才改成现在这套；以后碰到类似设计先假设标准聊天应用心智模型，不要凭直觉发明限制。

消息数/对话总条数各自封顶（`AI_CHATLOG_MAX_MSGS`=40、`AI_CHATLOG_MAX_CONVOS`=50），纯防御性上限。失败的对话如果从没成功回复过（`messages.length<=1`）会从`aiConvos`撤销，不留僵尸记录。

发给云函数的`history`参数是"这次提问之前的上下文"，不含这次提问本身（`rec.messages.slice(-12)`，在push这次user消息之前取快照）——避免服务端拼接逻辑把同一句话发两次。`report`模式不需要`history`。

## z-index坑

`#aiHistorySheet`是从`#aiScreen`（`.subpage`，z-index 35）内部打开的sheet（`.sheet`默认z-index 31），必须手动提到36才不会被`#aiScreen`盖住——这是这个项目第一次出现"从subpage内部打开sheet"的场景，以后同类场景记得同样手动提升（但别超过`.login-gate`的40）。返回键链里这个sheet的判断要排在`aiScreen`判断之前。
