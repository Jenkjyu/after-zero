# Flutter 重写封存索引

> 状态：**已停止并封存。** 用户于 2026-08-10 明确要求立即停止 Flutter 重写。未经用户在当前任务中重新明确授权，不得恢复阶段 8.1、继续 8.2～8.10、开始 Flutter 阶段 9，或修改 `flutter/` 产品代码与 `flutter/tool/parity/`。

## 当前结论

- 当前可用产品主线是根目录下的 Capacitor + React Android App；`flutter/` 不是当前产品、发布候选或已验收替代版本。
- Flutter 阶段 0～7 已实现；阶段 8 未完成；Flutter 阶段 9 从未开始。
- 封存提交为 `1528e34dbd1c49a19a7226cb9a08e2792278c757`，对应 GitHub Actions run `31334340620` 全绿。绿色只证明当时的静态门禁和测试通过，不证明产品已经对齐。
- 最后 WIP 有 280 个 matrix 条目、104 个 fixture profile、43 个 scenario 和 3367 个 source observation；仍为 0 个 fully-driven fixture、1 个 automated / 42 个 specified scenario、0 个 verified 条目。
- iOS 已暂缓，未完成工具链、CI 或真机验收；不得描述成已经支持。

## 文档性质

| 文档 | 性质 |
|---|---|
| [`stage-8-plan.md`](stage-8-plan.md) | 用户当时确认的 8.1～8.10 历史执行计划；当前不再处于执行状态 |
| [`stage-8.1-handoff-2026-08-10.md`](stage-8.1-handoff-2026-08-10.md) | 最终封存提交前一次换 session 的 WIP 快照；正文中的“进行中”“当前”只描述当时 |
| [`matrix.md`](matrix.md) | parity 工具生成的最后一份 WIP 矩阵；不是完成证明，不手工编辑 |
| [`../flutter-parity-audit-2026-08-08.md`](../flutter-parity-audit-2026-08-08.md) | 早期逐页审计与修复记录，只作历史线索 |
| [`../flutter-parity-handover-2026-08-09.md`](../flutter-parity-handover-2026-08-09.md) | 早期视觉对齐交接，只作历史线索 |
| [`../../flutter/tool/parity/README.md`](../../flutter/tool/parity/README.md) | 已封存证据工具的使用说明；命令不构成恢复授权 |

需要解释或重新处理这条路线时，先读根 `PROGRESS.md` 最近记录和 `.agents/skills/flutter-rewrite-parity/SKILL.md`。文档冲突时采用：用户当前明确指令 → `PROGRESS.md` 最新停止记录 → Flutter skill → 本索引 → 历史计划/交接/审计。
