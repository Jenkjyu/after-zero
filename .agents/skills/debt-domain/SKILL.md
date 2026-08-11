---
name: debt-domain
description: Use this skill when working on After Zero's Debt, PlanRow, GenSpec, or derived debt fields; `www/js/calc.js` and `test/calc.test.js`; plan generation, rounding, APR, repayment ledgers, partial payments, installment waivers, early settlement/restoration, summaries, notification schedule inputs, or prepayment/repayment-order simulations. Also use it when debugging inconsistent principal/interest/amount totals, `paidAt`/`paidAmount`, `settleStash`, the 0.015 validation tolerance, or any numeric result produced from debt data.
---

# 债务领域与计算模型

## 先确认权威边界

- 以 `www/js/calc.js` 的当前实现和 `test/calc.test.js` 的回归用例为计算行为权威；文档只解释不可从代码一眼看出的口径。
- 以 `react/src/types.ts` 的 `Debt`、`PlanRow`、`GenSpec` 为当前类型形状；修改字段时同时搜索 `www/index.html` 的读写、备份/导出和 React 调用方。
- 把 `www/index.html` 留作存盘、弹窗、云端和原生调用等 impure 编排；不要在 UI 或 bridge 里再写一份财务变换。
- 修改前先运行 `node -e "console.log(Object.keys(require('./www/js/calc.js')).length)"` 核对导出数。2026-08-11 的代码事实是 57 个导出，不要再沿用历史上的 39/40/48 等阶段数字。

## 维护 `calc.js` 的双运行时契约

- 保持 `calc.js` 为普通 classic script，不改成 ES module。它在浏览器中先于 React module bundle 加载，顶层函数自然进入全局作用域；React 通过 `window.recompute(...)` 等显式调用。
- 保持文件末尾的 CommonJS `module.exports`。新增或删除函数时同步更新导出和 `test/calc.test.js`；只改浏览器全局而漏掉 Node 导出会让测试拿不到函数。
- 不把“纯计算文件”误解成每个函数都引用透明：`recompute`、`normalize`、`applySettle`、`undoSettle`、`recordPayment`、`waivePeriod` 等会原地修改传入对象，但不读取 DOM、localStorage 或模块级业务状态，因此仍可用输入对象的前后快照稳定测试。
- React 只为实际调用的全局函数在 `react/src/calcGlobals.d.ts` 声明类型；新增 React 调用时同步补声明。

## 数据模型不变量

### `Debt`

- 使用稳定且永久的 `id` 识别债务。`genDebtId()` 在新建时生成；`normalize()` 给旧 localStorage、旧备份或导入数据惰性补发。不要再用数组下标、对象引用或名称判断“同一笔债务”。
- `plan` 是账本权威。`gen` 只保存公式生成器种类与输入，供再次编辑回填；不要从 `gen` 猜当前逐期状态。
- `settled`/`settledDate` 表示结清状态；`settleStash` 只在提前结清时保存被移出的未还期次。
- `original`、`balance`、`paidPrincipal`、`paidInterest`、`totalTerms`、`paidTerms`、`terms`、`monthly`、`nextDate`、`rate` 全部由 `recompute()` 派生。业务写路径不得手工覆盖这些字段。
- 不恢复已删除的 `Debt.day`。还款日几号从 `plan[0].date` 展示时现算；旧数据残留该字段可直接忽略，无需迁移。

### `PlanRow`

保持当前形状：

```text
{ date, amount, principal, interest, paid, paidAt?, paidAmount?, settleRow? }
```

- 对原计划期次，`date` 是计划日期，`paidAt` 是通过 `recordPayment()`/`waivePeriod()` 真正关闭该期的日期，格式为 `YYYY-MM-DD`，两者不能混用。`applySettle()` 生成的是一条新的真实事件行，它当前直接以该行的 `date` 记录结清日，不另写 `paidAt`。
- `paidAmount` 是该期累计实收。部分还款和减免不得改写原计划的 `principal`/`interest`；统计时由 `recompute()`按利息优先分摊实收。
- `settleRow` 只标记 `applySettle()` 生成的真实结清行，不是原计划期次。
- 旧数据里 `paid=true` 且没有 `paidAmount` 时，按原计划全额计入，保持向后兼容。

## 计划生成与金额一致性

- `genPlan()` 支持 `amort`（等额本息）、`equalprincipal`（等额本金）、`equalfee`（等本等费）、`interestfirst`（先息后本）、`custom` 五种模式。
- 每个生成字段通过 `r2()` 保留两位；分期摊销使用已舍入本金推进余额，并把每期本金钳在剩余本金以内。最后一期吸收尾差，避免本金合计漂移或出现负本金。
- 保留 `amount` 与 `principal + interest` 两条输入轴：批量设置金额需要 `amount` 可独立编辑，不能简单把它改成只读派生字段。
- `EditSheet.tsx` 保存时要求 `abs(amount - r2(principal + interest)) <= 0.015`。0.015 用来覆盖三个分量分别 `r2()` 后真实存在的 0.01 量化误差；不要收紧到 0.005/0.01，也不要扩大到足以放过真实手填错误。
- 正常计划行拒绝负的 amount/principal/interest，且本金与利息不能同时为 0。提前结清行的 `interest` 可以为负，因为它表达整笔协商减免，不受普通编辑行规则替代。

## `recompute()` 的统一口径

- 对未还且没有部分付款的行，把全部本金计入 `balance`。
- 对未还但有 `paidAmount` 的行，先冲利息、再冲本金；已冲本金从 `balance` 扣除，但该期仍计作未还。
- 对 `paid=true` 且 `paidAmount < amount - 0.005` 的减免行，按实收利息优先计算已还本金/利息；该期既然已关闭，就不再进入 `balance`。
- 对普通已还行，按原计划本金/利息全额累计。
- 以 plan 数组中第一条未还行生成 `monthly` 和 `nextDate`；保持 plan 顺序就是业务顺序，不要在 `recompute()` 内偷偷排序。
- 提前结清后，以“非结清行 + `settleStash`”组成的原始完整计划反推 `rate`，不能让一次性结清行扭曲原债务年化。

## 还款、部分还款与减免

- 用 `rowRemaining(row) = amount - paidAmount` 展示和收取当前剩余应还；部分还款后不要继续展示整期 `amount`。
- `recordPayment(d, amount, todayString)` 只操作最早未还期：
  - 未达到 `amount - 0.005` 时累计 `paidAmount`，保持 `paid=false`，不写 `paidAt`；
  - 达到或超过时把 `paidAmount` 封顶为 `amount`，写 `paid=true` 和真正补齐当天的 `paidAt`；超额不结转下一期；
  - 最后一期完成时自动设置整笔债务结清及短格式 `settledDate`。
- `waivePeriod(d, finalReceived, todayString)` 同样只操作最早未还期，但无论实收多少都立即关闭该期并写 `paidAt`。`finalReceived` 表示该期最终累计实收，不是本次新增金额；差额由 `recompute()` 体现为没有计入的本金/利息。
- 保持两个入口分离：“少还一点以后补”用 `recordPayment`，“协商后就此关闭本期”用 `waivePeriod`。不要用一个布尔参数混淆两种账本语义。
- 手动编辑器勾选 `paid` 只是校正历史数据，不是实时付款事件，因此不会自动生成 `paidAt`。

## 提前结清与恢复

- 用 `applySettle(d, X, YYYY-MM-DD)` 记录用户真实付出的金额 `X`：
  - 把所有未还期次原样移入 `settleStash`；
  - 在已还行后追加一条 `{ amount:X, principal:P, interest:X-P, paid:true, settleRow:true }`，其中 `P` 是剩余本金；
  - `X>P` 的差额是手续费/违约金，`X<P` 的负利息是整笔协商减免；本金加利息始终等于真实付款。
- 不把未来每一期简单勾成已还；那会把从未发生的未来利息错误计入已还利息。
- `undoSettle()` 必须区分两条路径：
  - 有 `settleStash`：删除结清行并原样放回快照；
  - 没有 `settleStash`：这是销完最后一期的自动结清，恢复时只释放最后一期，并清掉它的 `paidAt`/`paidAmount`，避免生成待还 0 元的僵尸债务。
- `settledDate` 沿用已结清列表的 `M/D` 短格式，由 ISO 日期统一转换；不要让调用方分别传两个可能不一致的日期。

## 聚合、提醒与导出边界

- `summarizeDebts()` 中，`total`/`monthly`/`active` 只统计在还债务；`paidPrincipal`/`paidInterest`/`pct` 是累计成就，必须包含已结清债务。一次性债务不计入经常性 `monthly`。
- `computeUpcomingPressure()` 只看在还债务，把逾期未销单列为 overdue；部分还款行按 `rowRemaining()` 和同一套利息优先分摊计算未来压力。
- `computeMonthlyRepayment()` 按计划月份聚合历史已还/待还，保留已结清债务的历史；它与“未来压力”不是同一口径。
- `computeReportData()` 的主报告只看在还债务；timeline 把逾期或无效日期的未还本金归入“今天”桶，保持时间不倒流且最终归零。
- 报告导出债务明细时遍历全部债务并标注状态/结清日期，不要因为屏幕报告用 active 数据就漏掉已结清账本。
- `computeNotifySchedule()` 一次展开未来 6 个月的全部未还期次 × 全部规则，并按触发时间保留最近 450 条；不要退回只排 `nextDate`、依赖用户重开 App 才滚动的旧行为。

## 模拟算法的刻意简化

### 单笔提前还款

- `amortForward()`/`simulatePrepay()` 不追五种计划各自的逐行数学，而统一使用 `recompute()` 得到的 `balance`、`monthly`、`rate` 做标准等额本息前推。模拟结果与原计划逐行数字不完全一致是预期取舍。
- `amortForward()` 在月供明显低于利息（扣除 `interestCoverTolerance(balance)` 后仍不足）时返回 `null`；容差同时覆盖 APR 舍入噪声和先息期“月供约等于利息”的正常状态，本金贡献用 0 下限避免余额因噪声反向上升。
- `simulatePrepay()` 支持单次和每期追加，从指定期开始；返回节省月份、节省利息和新旧期限。`after-zero-simulate-v1` 只保存 `{mode, extra}`，不保存债务或期次，这是当前产品选择，不是因为债务仍没有稳定 id。

### 多债务顺序模拟

- `simulateRepaymentOrder(debts, orderIds, extraMonthly)` 只模拟 `orderIds` 覆盖的债务；调用方传子集就会忽略其余债务。
- 每月分两轮分配：先让每笔活跃债务用自身月供结算当月利息/本金并汇总所有省出的月供与额外投入，再按优先级把资金池连续追加到本金；一笔吃不完的资金必须当月继续流给下一笔。
- 不恢复“任意一笔自身月供覆盖不了自身利息就整体返回 null”的逐笔预检查。真实先息后本首期可能因非整月而偏高；排队期间允许轻微负摊还，轮到队首后可由 rollover 救援。
- 只有模拟达到 600 个月仍未还完时返回 `null`。`snowballOrder()` 按余额升序，`avalancheOrder()` 按年化降序。
- 用户质疑具体数字时，用其去敏/临时数据直接运行当前 `calc.js` 并检查 `monthly` 明细与预算守恒；不要仅凭截图给数学解释。真实数据曾抓出“队首小债吃不完的额外资金凭空消失”，回归测试已经锁定两轮资金池规则。

## 修改工作流与验证

1. 先定位数据权威、派生字段和所有消费者；区分“计划值”“真实付款”“显示聚合”“模拟值”。
2. 把业务变换集中在 `calc.js`，让 `www/index.html`/React 只负责输入校验、调用、持久化和重渲染。
3. 为每个边界补 `test/calc.test.js`：旧数据缺字段、部分付款、减免、最后一期、结清恢复、舍入边界、先息后本不规则首期和资金池守恒。
4. 至少运行：

   ```bash
   npm test
   node -e "console.log(Object.keys(require('./www/js/calc.js')).length)"
   ```

5. 若改了 React 类型或消费者，再运行：

   ```bash
   npm run test:react
   npx tsc --noEmit --project react/tsconfig.json
   npm run build:react
   ```

6. 若任务主要是编辑表单状态机/生成器 UI，同时加载 `edit-sheet-design`；若主要是还款日列表、筛选或左滑，同时加载 `pay-tab-design`。这些 UI skills 不覆盖本 skill 的账本语义。
