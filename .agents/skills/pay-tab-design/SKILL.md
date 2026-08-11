---
name: pay-tab-design
description: Use this skill when modifying or debugging After Zero's “还款日” tab (`react/src/pay/**`), per-installment list expansion, nearest-due hero aggregation, 7/15/30-day stats and filters, custom date range, urgency colors, or the left-swipe “销这期” interaction.
---

# 还款日页

保持“一行 = 一期未还款项”，不要退回“一笔债务只显示下一期”的旧模型。

## 数据与视图

- `App.tsx` 从每笔在还债务的 `plan` 展开全部未还且日期有效的期次，按日期排序。React key 使用 `d.id + ":" + planIdx`。
- 每行金额读取该期 `r.amount`，不能用 `d.monthly`；先息后本、自定义和最后一期的金额可能不同。
- 只有每笔债务最早的未还期 `isNextUnpaid` 可以“销这期”。后续期按钮保留可点但呈禁用态，点击提示先处理更早期次；不要直接调用会销错期的 `payInstallment`。
- Hero 聚合与全局最早期次同一天的所有行：笔数按 debt id 去重，金额按期次原样合计，名称显示“首笔名称 等N笔”。
- 7/15/30 天三张小卡按期统计、累计包含、排除逾期，同时显示金额和期数。

## 筛选与严重度

- 筛选为 `next | overdue | d7 | d15 | d30 | custom`。“下一期”每笔只留最早未还期；逾期和时间窗口都按期。
- 7/15/30 天与自定义窗口是累计口径，只包含 `diff >= 0`；自定义日期通过共享 `confirmAsync({date,dateMin})` 换算成天数。
- 当前列表只有一个与筛选一致的表头，例如“30天内 · N期 · ¥X”，不再按 `dueBucket()` 分成四段。
- `dueBucket()` 仍留在 `calc.js` 和单测中，但当前 pay UI 不消费它；不要根据该 helper 误写当前列表结构。
- `urgencyTier(diff)` 只控制颜色：逾期、≤3 天、≤14 天、其余四档；它与筛选阈值不是同一套概念。

## 左滑与导航

- 保持原生 Touch Events：`touchmove` 使用 `{passive:false}`，先按 dx/dy 判轴；桌面鼠标走独立 Pointer Events 分支。手势细节和 WebView 滚动冲突同时加载 `capacitor-ui-system`。
- 每次新手势开始清 `__justDragged`；真实滑动可能没有后续 click，不能只在 click 中消费标记。
- 同时只展开一行；切走 pay tab 时收起。前景点击在展开时先收起，否则打开对应永久 debt id 的详情。
- 还款动作和期次账本归 `debt-domain`；通知铃铛打开 `NotifySheet`，原生通知调度归 `capacitor-native-runtime`。

## 验证

- 运行 `npm run test:react`，重点覆盖 `PayApp`、`Hero`、`Stats`、`FilterBar`、`PayList`、`PayRow` 和 `PayGestures`。
- 修改阈值 helper 或还款计算时同时运行 `npm test`；至少验证同日多债务、同债务多期、非首期禁用、逾期排除、累计窗口和实际期次金额。
