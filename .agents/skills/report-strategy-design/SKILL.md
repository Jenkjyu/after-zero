---
name: report-strategy-design
description: Use this skill when modifying or debugging After Zero's statistics/report tab (`react/src/report/**`), findings and report metrics, charts, Excel/PDF export, or the multi-strategy repayment comparison (`StrategyCompareScreen`, `StrategyChart`, `simulateRepaymentOrder`).
---

# 统计报告与还款策略

先按当前源码核对口径，再修改展示。不要从旧版“高级统计看板”或 `AGENTS.md` 的产品演进记录反推现状。

## 代码归属

- 用 `react/src/report/App.tsx` 编排报告：报告头 → 结论 → 行动建议 → 策略入口 → 走势 → 压力 → 余额排行 → 类型构成 → 导出/口径说明。
- 用 `react/src/report/findings.tsx` 维护规则结论；不要把结论文案改成脱离数据的固定断言。
- 用 `www/js/calc.js` 的 `computeReportData`、`summarizeDebts`、`computeUpcomingPressure`、`pressureWindowMonths`、`remainingInterest` 提供权威数据。修改任何数值算法时同时加载 `debt-domain` skill。
- 用 `react/src/sheets/StrategyCompareScreen.tsx`、`StrategyChart.tsx` 渲染策略对比；跨 React 入口开关和返回桥接归 `react-bridge-architecture` skill。
- Excel/PDF 生成仍在 `www/index.html` 的 `exportReportXlsx`、`exportReportPdf` 和 `buildExportChartsSVG`，React 的 `ExportMenu` 只负责门禁和调用 bridge。
- 图表尺寸、触摸、隐藏 tab 零宽、`ResizeObserver`、Popover 和 SVG/CSS 视觉问题归 `capacitor-ui-system` skill。

## 报告口径

- 只把未结清债务纳入当前余额、加权利率、预计还清日期、余额排行、类型构成和预测走势。
- 把 `summarizeDebts().paidPrincipal` / `paidInterest` 作为全量累计口径，包含已结清债务；不要把 `data.active` 传给它。
- 把预计还清日取为各在还债务最后一个未还期次的最晚日期。走势按真实日期累计扣减未还本金；逾期或无效日期归到今天，避免时间倒流。
- 类型超过 6 类时保留前 5 类，其余合并为“其他”。余额排行按余额降序展示到累计覆盖至少 70%，其余可展开。
- 压力图只算未结清债务的未还期次，部分还款扣除 `paidAmount`，逾期单列、不混入未来月份；窗口从当前月开始，按最后未还期次在 12～60 个月间钳制。
- 把 `amount` 作为月度应还总额，把 `principal` / `interest` 只作为构成。手动数据可能不完全相等，柱高必须由 `total` 决定，再按本金/利息比例切分。

## 结论规则

- 保持“高利率”和“高剩余利息”分离：年化高不代表剩余利息占比高。
- 利息集中度在单笔占剩余待付利息至少 30% 时触发。
- 高息债务阈值为年化至少 18%。
- 峰值月在峰值 ÷ 月均至少 1.5 时触发。
- 利息负担按剩余待付利息 ÷ 剩余本金分档：`>25%` 偏重，`>10%` 中等，其余很轻；它是不可行动结论。
- 按 `severity` 取前三条“值得注意的事”，并从 `actionable` 结论中选最高项作为首尾行动建议。

## 多策略对比

- 当前入口 `StrategyCta` 在至少 2 笔在还债务时显示，并实际执行 Premium 门禁；报告查看本身免费。权益变更同时加载 `account-premium-design`。
- 对比雪球法（余额升序）、雪崩法（年化降序）和用户自定义顺序；自定义顺序用上下移动按钮，不复用债务卡拖拽手势。
- 保持 `simulateRepaymentOrder()` 的两轮月度资金池：先给每笔活跃债务结算自身月供，再把额外投入、已结清债务月供和当月多余月供按优先级连续追加本金。
- 保持标准等额本息简化：只读 `{id,balance,rate,monthly}`，不逐行复刻五种原计划；结果页必须保留该免责声明。
- `extra` 和自定义顺序是点击“开始对比”时的快照；债务余额变化后结果按最新 `active` 重算。
- `simulateRepaymentOrder()` 返回 `null` 的当前算法含义是 600 个月仍未收敛。不要依赖界面里仍写着“月供不够利息”的旧提示来定义算法语义。

## 导出与验证

- 不要随手改变 `computeReportData()` 返回形状；两个 vanilla 导出函数按字段名精确消费。新增维度优先做独立纯函数。
- 保持 `xlsx` / `jspdf` 为 `www/js/` 本地静态库。PDF 使用字面浅色 SVG → canvas → PNG；中文不得直接交给 jsPDF 内置字体绘制。
- Premium 门禁放在 React 触发点；生成函数本身保持无 DOM 依赖并经 bridge 调用。
- 修改纯计算后运行 `npm test`；修改报告或策略 React 后运行 `npm run test:react`，重点覆盖 `findings`、`ReportApp`、`Pressure`、`Rank`、`TypePie`、`Journey`、`StrategyCta`、`StrategyCompareScreen` 和 `ExportMenu`。
