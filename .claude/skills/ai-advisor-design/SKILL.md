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

**⚠️`#aiHistorySheet`当年漏包了`.sheet-scroll`这层内层滚动容器**（见CLAUDE.md"`.sheet`的滚动必须在内层"一节），2026-08-04补上——历史对话条数多起来滚动时，深色模式圆角处会露白边，跟`DetailSheet`/`EditSheet`/`NotifySheet`/`SortSheet`当年踩的是同一个坑，只是这个sheet是在那条规则定下来之后才另外新写的，没人工核对到。

## 2026-08：追问建议芯片 + 失败重试 + 富文本渲染 + "思考中N秒" + 假流式打字动画

这五项是同一轮("完善AI债务顾问")加的，`react/src/sheets/AiScreen.tsx`（都在这个文件里，没有新增文件）+ `cloudbase/functions/aiAdvisor/index.js`（只有追问建议这一项touch了云函数）。

**追问建议芯片**：system prompt里要求模型在正文之后另起一段，按固定格式追加2~3条追问（`###SUGGESTIONS###`这个marker+`- `列表）。客户端`splitSuggestions(text)`按这个marker把回复切成`{body, suggestions}`两部分——**持久化进`aiConvos`/`AI_CHATLOG_KEY`的是剥离掉marker之后的干净`body`**，不是原始text，这样历史对话reload回来不会残留字面的"###SUGGESTIONS###"文字；代价是重新打开一条历史对话不会恢复它当时的追问建议（芯片是纯展示层状态，只挂在`DisplayMsg.suggestions`上，不落盘）。`hy3`不保证100%遵循这个格式，找不到marker就整段当正文、建议列表为空——这是优雅降级，不是错误。芯片只挂在"最后一条、已完成、没出错、没在打字动画中"的回复下面，问新问题/开始新一轮打字动画时自然消失，不需要额外状态去手动隐藏。点芯片直接调用`composeAndSend(建议文字, false)`，跟手输问题走同一条路径。

**失败重试**：错误气泡上加了"重试"按钮。**关键设计是`RetryCtx`按`msgIndex`（消息在数组里的下标）定位，不是假设"错误气泡永远是最后一条"**——如果用户在失败后又问了新问题，错误气泡就不再是最后一条，但它自己的重试按钮依然要能精确重发它自己那条。为此把原来"只更新`prev.length-1`"的写法改成了`runAdvisor(msgIndex, ...)`统一按传入的下标原地更新，`composeAndSend`/`onRetry`都收敛到这一个共享的执行体。重试不会重新追加一条用户提问（避免同一个问题在气泡列表/历史记录里出现两遍），原地把那条气泡打回pending、用当时的原始参数（`recId`/`displayQ`/`isReportMode`/`contextHistory`）重新调用。

**富文本渲染**：`parseAiBlocks()`把回复文本切成段落/列表两种块（`- `/`* `/`• `开头判定`<ul>`，`1. `/`1、`开头判定`<ol>`），渲染成真正的`<p>`/`<ul><li>`，不再是markdown列表原样堆在一起的纯文字。仍然只处理`**加粗**`这一种行内样式（`renderInline()`），其余交给JSX天然转义。`.ai-msg`本身的`white-space:pre-wrap`继续被这些新增的块级子元素（`.ai-msg-p`/`.ai-msg-list`）继承，段落内部保留的`\n`依然按空行渲染。

**"思考中N秒"**：`runAdvisor()`里用`window.setInterval`（1秒一次）+`Date.now()-startedAt`算经过秒数，`thinkingSeconds>0`时才在"思考中"后面追加` Ns`，避免请求还没到1秒时显得多余。这个interval的写法（进度算在闭包变量里、`setState`只接收算好的值）后来被"假流式"那部分抄了过去，见下面那条踩过的坑。

**假流式打字动画（`startReveal`）**：回复其实是`callAiAdvisor()`一次性整段拿到手的（这套调用链是`cbApp().callFunction()`，见CLAUDE.md本节"真实生成报告/追问往返"那条——非流式，客户端必须等模型把整段生成完才有任何内容返回，这条链路目前做不到真正的逐token流式；`revealState`只是在拿到完整文本之后，客户端自己按小段(`REVEAL_CHUNK=3`字符/`REVEAL_INTERVAL_MS=16ms`)"回放"打出来，制造观感上的逐字效果，不改变实际等待时间）。`message.content`从一开始就是完整正文，`revealState.shown`只影响这次渲染截取多少个字符，不影响持久化。`prefers-reduced-motion`时`startReveal()`直接不启动动画，跟`castWand()`共用同一条媒体查询判断。追问建议芯片、聊天记录自动滚动到底部都会等打字动画播完（`lastIsRevealing`这个派生量），不会在文字还没打完时抢先出现/半途卡住。

**⚠️踩了一个真实的React bug，测试当场抓到、装机验证前就发现了**：`startReveal()`第一版在`setRevealState(prev => {...})`这个**函数式updater内部**调用了`window.clearInterval(timer)`——updater函数必须是纯函数，**React可能会不止调用一次**（用来做一致性检查/重放），这一多调用直接让"判断到点了就清掉定时器"这个副作用执行了不止一次也不管用，interval实际上永远没被真正清掉，表现为`shown`卡在一个小数值来回震荡、动画永远播不完整段文字（写`AiScreen.test.tsx`里"回复到达后不是一次性整段出现"这条用例、配合`vi.useFakeTimers()`把500ms虚拟时间一次性推进时，立刻复现：连续打印`prev`发现是`0,3,6,null,3,6,null,3,6,null...`不断循环，而不是`0,3,6,null`后停住）。**修法**：把"打到第几个字"这个进度改成用闭包里的普通变量`shown`记（不再依赖`setRevealState`的函数式updater去算下一个值），`window.clearInterval`只在**外层的interval回调本体**里调用（那里是安全的副作用位置，不是传给`setState`的那个函数），`setRevealState`永远只接收一个算好的普通对象/`null`——这跟`runAdvisor()`里"思考中N秒"那个定时器的写法（`Date.now()`算经过时间存在闭包变量里，不是从`setState`的`prev`推导）是同一个模式，早改过一次、这次踩坑之后统一成同一套。**教训：`setState(prev => ...)`这个函数只应该是纯计算，任何副作用(定时器/网络请求/DOM操作)都不能放在里面——哪怕看起来只是"顺手判断一下要不要清定时器"这么小的一步，这条规则在这个项目里是第一次真正踩坑，以后写任何"定时器+setState"组合，进度值算在闭包变量或ref里，`setState`调用本身保持零副作用。**

**切换会话时对"打字动画还没播完"这个场景的防御**：`revealTokenRef`是一个每次真正重置会话（新对话/加载历史/删除当前对话/重新打开screen）都递增的令牌，`startReveal()`的interval每次tick都先检查`revealTokenRef.current !== token`，不等于就自杀。**不能只靠`msgIndex`判断"这个interval还有效吗"**——新对话的消息数组从头计数，新回复的`msgIndex`完全可能跟旧对话里正在"打字"到一半的那条撞上同一个数字（都是从1开始），两个interval会认错状态互相打架；令牌是独立于消息下标的单调递增值，不会有这个重用冲突。`AiScreen.test.tsx`里有一条专门覆盖"打字动画进行中切换到新对话"这个场景的回归测试。

**测试环境的配套坑**：jsdom本来就没有`window.matchMedia`，`AiScreen.test.tsx`的`beforeEach`统一桩成`matches:true`（模拟"prefers-reduced-motion: reduce"），让绝大多数测试断言"回复内容"时不用等一段打字动画播完（回复到达后立刻整段显示，等同关闭动画）——这份桩同时也覆盖了`castWand()`用的同一条媒体查询，两者互不冲突。真正要验证打字动画本身的两条测试会在各自用例里临时换成`matches:false`并配合`vi.useFakeTimers()`。
