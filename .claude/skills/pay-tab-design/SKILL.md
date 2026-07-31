---
name: pay-tab-design
description: This skill should be used when working on the "还款日" (pay/repayment reminders) tab — PayHero, PayList, PayFilter, PayRow, pay/gestures.ts — or when the user asks why urgency tiers/dueBucket thresholds work a certain way, why the filter chips say "7天内/30天内", or how the left-swipe "销这期" gesture is implemented.

---

# 还款日页设计

> 渲染层已由React接管（`react/src/pay/`），这里记的是设计决定本身（为什么4档急迫程度、为什么筛选和分组语义不同、手势实现），依然是当前实现的依据；具体vanilla函数名/DOM id（`renderPayHero()`等）已是历史参照。

## ⚠️列表的一行 = 一期，不是一笔债务（本页最重要的一条）

早期是遍历`debts`、每笔只取`d.nextDate`生成一行——窗口只有7~30天时"一笔债务"和"一期还款"等价，看不出问题；日历自定义天数把窗口拉到上百天后才暴露：一笔月供债务要还3~4期，页面却只看得到第一期。

现在`PayItem`展开成逐期（`d`/`next`/`diff`/`amount`/`planIdx`/`isNextUnpaid`），同一笔债务按日期占多行，React key用`d.id + ":" + planIdx`。连带的规则：
- **`amount`必须用这一期的`r.amount`，不能用`d.monthly`**——先息后本这类计划每期金额不同，用`d.monthly`会让大额还款期在页面上彻底消失。
- **"下一期"是唯一按笔看的档**（原来叫"全部"，逐期展开后改名，避免"每笔只看下一期"和"所有期次全列出来"的歧义）。
- **只有每笔债务最早的未还期能"销这期"**——其余行按钮`.is-disabled`置灰但不用`disabled`属性（否则点了没反应像bug），点了toast提示去销更早的期次。
- 三张小卡计数口径按"期"不按"笔"，跟列表逐期展开保持一致。

这是"数据模型比产品意图浅"的典型案例：`plan`数组一直有逐期数据，只是这个页面的读取方式只取了第一期，扩展产品意图（窗口可自定义）时没同步检查读取方式。

## 急迫程度4档 + 分组/筛选两套不同语义的"7天内/30天内"

- `urgencyTier(diff)`：逾期(`overdue`)/≤3天(`crit`)/≤14天(`warn`)/其余(`dim`)。逾期从`crit`里单独拆出来，用`--critical`实心底+白字+`dotPulse`脉冲——代价比"还没到但快了"更高，需要更抢眼提示。`dim`档用`--good`不用`--accent`（浅色下`--accent`深墨绿在小圆点尺寸下几乎看着像黑色）。
- **分组**（`dueBucket(diff)`，已逾期/7天内/30天内/更晚四档）是给"全部"视图做**互斥**分段，避免同一条债务出现两次。
- **筛选**（`PayFilter`：`d7`/`d15`/`d30`/`custom`，早期叫`week`/`month`）是**累计**口径（`d30`包含`d15`包含`d7`）——点"30天内"想看的是"接下来30天全部要还的"，不是"只看第8~30天那一段"，不能照搬分组的互斥判定。
- 标签统一用字面天数（"7天内/30天内"），不用"本周/本月"——后者暗示按自然月计算，跟纯滚动天数窗口的实际逻辑对不上，真机反馈过这个误导。
- 筛选条布局：可横向滚动的一排芯片+固定不滚的日历图标（自定义天数入口），日历那条路复用`ask()`/`askAsync()`的`opts.date`（跟`opts.month`/`opts.amount`同一个套路，三者互斥使用）。

## 左滑"销这期"手势

- 沿用"在还债务"长按拖拽同一条教训：Touch Events（`touchstart`/`touchmove{passive:false}`/`touchend`），第一次移动按dx/dy哪个更大判断横滑还是竖直滚动；桌面走独立Pointer Events分支。`touch-action:pan-y`提前告诉浏览器"水平不归你管"。
- **`__justDragged`标记必须在每次新手势开始时重置，不能只靠click去消费**——真正带位移的手势结束后浏览器不会补发click，只在click handler里"用一次就清空"会导致标记位在一次真实拖拽后永远是`true`，误伤后续毫不相关的正常点击。
- 同一时间只允许一条卡片展开（`paySwipeOpen`），"销这期"复用`payInstallment(i)`同一个函数，不另写逻辑。
- 卡片改磨砂玻璃质感时，结构从"绝对定位叠层"换成"flex并排"（`.pay-row`→`.pay-swipe-row`→`.pay`+`.pay-swipe-btn`）——玻璃半透明会透出正后方内容，跟"在还债务"卡片踩过的坑一样，必须让按钮和卡片左右并排而不是叠在正后方。
- 点卡片非滑动状态会打开债务详情，圆角统一18px跟"在还债务"卡片对齐。

## Hero + 空状态

- Hero下方两个小指标卡（7天内/30天内待还，金额+笔数）是累计口径、不含逾期——逾期是"已经错过"不是"待还"。
- 空状态（无在还债务）：`--good-soft`背景+绿底白色对勾图标+"全部结清"标题，故意不用emoji，走克制的纯图标+文字方案。
