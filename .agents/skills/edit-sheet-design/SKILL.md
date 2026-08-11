---
name: edit-sheet-design
description: Use this skill when modifying or debugging After Zero's new/edit debt form (`EditSheet.tsx`, `GenPanel.tsx`, `PlanRows.tsx`, `BatchBlock.tsx`), one-time-plan state, formula generation UI, batch editing, plan-row validation, or edit-sheet picker/back behavior.
---

# 新增/编辑债务表单

把 `plan` 当作债务数据源头。涉及生成、APR、金额容差或账本字段的数值语义时同时加载 `debt-domain`，不要在表单组件复制计算算法。

## 所有权与保存

- `EditSheet.tsx` 拥有表单字段、`editingPlan`、`oneTimeStash`、`planMode`、生成器字段和计息方式 picker 状态。
- `openEditSheet(id)` / `closeEditSheet()` 是 React 共享 UI 状态；保存和删除通过 bridge 的 `setDebt` / `deleteDebt` 修改 vanilla debts。
- 用永久 debt id 查找编辑目标和检测删除，不用数组下标或对象引用。
- 保存时至少要求名称、借款日和一期计划；每行金额/本金/利息非负，本金和利息不能同时为 0，且 `amount` 与 `principal + interest` 偏差不得超过 0.015。
- `original`、`balance`、`rate`、`monthly` 等派生字段只给占位，交给 `setDebt()` 内的 `recompute()`。

## 一次性与手动编辑

- 勾选“一次性还清”时把第 2 期起从 `editingPlan` 移入 `oneTimeStash`；取消时原样放回。每次打开表单都从目标 debt 重建两者，不能跨债务残留。
- 一次性模式强制回到手动模式，只展示唯一一期；公式生成完成后也回到手动模式，允许逐行微调。
- 修改本金或利息时联动重算金额；直接改金额不反推本金/利息，保存时仍受 0.015 一致性校验。
- 手动勾“已还”只编辑历史标记，不写 `paidAt`；取消已还时清 `paidAt` 和 `paidAmount`。真实还款盖章必须走 `recordPayment`、`waivePeriod` 或 `applySettle`。

## 五种生成方式

- 保持 `amort`、`equalprincipal`、`equalfee`、`interestfirst`、`custom` 五种 `GenSpec.kind`；统一调用 `window.genPlan(spec)`。
- `custom` 只生成指定期数的空白行；其它四种字段分组以 `react/src/types.ts` 的 `GenSpec` 为准。
- React 版 `#gFirstField` 通过各分支条件渲染绑定同一个 `fields.first`，不再使用旧 vanilla 的 `appendChild` 物理搬 DOM 技巧。
- 计息方式使用 `PickerSheet`，其开关提升到 `EditSheet`，使硬件返回先关 picker、再关编辑 sheet。布局、sheet 和返回层级问题加载 `capacitor-ui-system` 与 `react-bridge-architecture`。

## 日期、批量与表单校验

- 公式生成的首期日期和批量“每月几号”只允许 1～28 日；逐行日期记录真实计划，可使用 29/30/31 日。
- 批量日期先收集“几号”，再用共享 `confirmAsync({month})` 收集首期年月，后续逐月铺开。
- 批量本金/利息会联动金额；批量直接设金额会先确认并把本金、利息清零，用户必须重新补齐后才能通过保存校验。
- 与主 `<form>` 共存但会隐藏的生成器字段不要使用原生 `required`；在“生成计划”按钮中手动校验并 toast。顶层始终可见的名称和借款日可以保留 `required`。
- “还款日（几号）”只读并从计划第 1 期日期派生；Debt 不持久化独立 `day` 字段。

## 验证

- 修改表单组件运行 `npm run test:react` 的 `EditSheet` 集成测试，覆盖新增/回填、oneTime stash、五种生成、批量操作、0.015 校验、删除后关闭和 picker 返回顺序。
- 修改 `genPlan`、`impliedAPR` 或 `recompute` 时运行 `npm test`，并按 `debt-domain` 的边界补纯函数回归；不要把旧修复过程继续堆进本 skill。
