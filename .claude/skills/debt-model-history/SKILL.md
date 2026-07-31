---
name: debt-model-history
description: This skill should be used when the user asks why PlanRow has fields like paidAt/paidAmount, why the amount/principal/interest consistency check has a 0.015 tolerance, why recordPayment/waivePeriod/rowRemaining work the way they do, or wants the full history behind the 2026-07-29/07-30 debt data-model gap fixes (notification scheduling, export completeness, payment ledger, partial payments, amount consistency, the dead `d.day` field).
---

# 债务数据模型缺口修复史（2026-07-29/07-30，全部已修）

2026-07-29盘点起因：还款日页"一行=一笔债务"的缺陷被真机戳破后，顺着同一个思路扫了全项目，发现共同形状——`plan`数组一直有逐期数据，但消费者习惯性只读"第一期"或"只读active那部分"。①②风险低（只改读取侧）、③④是真的要改数据结构、⑥是清理死字段，全部已修完；⑤在独立worktree并行处理。

## 当前数据模型（不用看历史也该知道的部分）

`PlanRow` = `{date, amount, principal, interest, paid: boolean, paidAt?: string, paidAmount?: number, settleRow?: boolean}`：
- `paidAt`只在**真实发生的还款事件**时写（`recordPayment()`/`waivePeriod()`/`applySettle()`结清行），手动编辑器勾选"已还"不会盖章。
- `paidAmount`是这一期累计收到多少钱，`principal`/`interest`两个字段永远是原计划、不因部分还款/减免改变；已还本金/利息由`recompute()`按`paidAmount`**利息优先分摊**算出。
- `rowRemaining(r)` = `amount - (paidAmount||0)`，UI和`computeUpcomingPressure()`都用它算"这期还欠多少"。

`calc.js`两个纯函数只操作"当前最早的未还期次"：
- `recordPayment(d, amount, todayString)`——够了标`paid=true`+`paidAt`；不够`paidAmount`累加、继续留在未还列表。
- `waivePeriod(d, amount, todayString)`——不管填多少都强制关闭当前最早未还期次，差额自动算成"少收的那部分"（协商减免）。

`EditSheet.tsx`保存时校验`amount === principal + interest`（容差0.015即1.5分钱，覆盖`genPlan()`边界情况下的四舍五入噪声），只堵"手动改金额输入框"这一条路径——改本金/利息/批量设置/公式生成器都会自动联动重算`amount`，不受影响。

`Debt.day`字段已删除（2026-07-30）——只读输入框`#f-day`显示的还款日几号，现算自`editingPlan[0].date`，不再持久化成字段。

## 完整修复叙事（一次性历史，不需要每次都读）

### ①通知只排下一期
`syncNotifications()`原来只看`d.nextDate`，只有靠重新打开App才滚动到下一期——两个月不开App只收到一次提醒。修法：新增`computeNotifySchedule(debts, notify, now, windowMonths, maxCount)`纯计算，一次性把未来6个月内全部未还期次排上，`NOTIFY_MAX_PENDING`(450)兜底截断安卓`AlarmManager`约500个的隐性上限，按触发时间保留最近的。

### ②导出不含已结清债务
`exportReportXlsx`/`exportReportPdf`原来都过滤`data.active`。`computeReportData()`本身没改（统计tab图表镜像，按设计只反映在还部分）；改的是导出函数本身直接遍历全部`debts`，Excel加"状态"/"结清日期"列，PDF新增`buildSettledDebtsRows()`。

### ③没有还款流水
`PlanRow`原来`{date,amount,principal,interest,paid}`——`date`是计划日期不是实付日期，算不出"这个月实际还了多少"。修法即上面"当前数据模型"里的`paidAt`。统计页`PayoffLine`"本App不保存历史余额"这条footnote依然成立——这次只加字段，没回填历史数据。

### ④不支持部分还款
`payInstallment`原来只能全还/不还。修法即上面`paidAmount`/`recordPayment`/`waivePeriod`。`computeUpcomingPressure()`连带改成同样的利息优先分摊，避免部分还款后虚高"还欠多少"。`computeMonthlyRepayment()`是死代码（`PressureChart.tsx`取代了`MonthlyChart.tsx`），故意没改。详情窗`partialNote()`给"已还¥X欠¥Y"/"实收¥X减免¥Y"两种状态加小字提示。验证：`test/calc.test.js`新增21用例、`DetailSheet.test.tsx`+6、`EditSheet.test.tsx`+2，`tsc`/`build:react`均通过。

### ⑤amount和principal+interest两条轴没有一致性校验（部分已修）
两套数值：`amount`（还款日列表/三张卡/压力图柱高读）vs `principal`/`interest`（剩余待还/已还本金/年化利率读），保存时原来只校验"本金利息不能同时为0"，没校验两者相加等于`amount`。曾经真实症状：`amount=100`而`principal+interest=2194`导致压力图柱子2194%高度冲出画布（那个具体症状已经通过"柱高改由total决定"修好，但根因当时还在）。**⚠️曾经的错误说法"custom计划不拆本金利息会静默低估"不准确**——保存校验早就挡住了"本金利息全填0"。

修复（独立分支`feature/amount-consistency-check`）：`EditSheet.tsx`保存时补上`amount === principal + interest`校验，容差0.015（实测遍历`genPlan()`三种计息方式超10万组合，amort分支`n=1`边界下三个值各自独立`r2()`四舍五入真实存在1分钱量化误差，容差必须盖过这条噪声下限）。**只是"检测到就拦截"，不是自动同步或改数据模型**——考虑过让`amount`变成像`f-day`那样的只读派生字段，但`BatchBlock.tsx`"批量设置金额"依赖`amount`可独立编辑，做成只读会废掉这个功能，所以选了危害面更小的拦截方案。

### ⑥`d.day`是死字段
`grep`确认全项目没有代码读`d.day`（当年是手填的还款日几号，后来改成从计划第1期日期自动推导后就没人用，但`EditSheet.tsx`一直还在算它写它）。删掉`types.ts`的字段声明+`EditSheet.tsx`里的赋值，只读输入框`#f-day`本身不受影响（那是现算的本地展示变量，跟持久化字段是两个变量）。老数据带着这个字段不影响任何东西，不需要迁移脚本。
