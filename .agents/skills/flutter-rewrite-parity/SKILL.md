---
name: flutter-rewrite-parity
description: This skill should be used only when the user explicitly asks to inspect, resume, modify, test, or audit the paused Flutter rewrite (`flutter/`), the Flutter-versus-Capacitor parity effort, stage 8/8.1 evidence tooling, or files under `docs/flutter-parity*` and `flutter/tool/parity/`. It records the authoritative suspension boundary, historical architecture decisions, parity evidence rules, and the safe resumption workflow. Do not trigger it for ordinary work on the current Capacitor + React product merely because a feature also has an archived Flutter implementation.
---

# Flutter 重写与全量对齐（已暂停）

## 先执行暂停门禁

- 把 Flutter 重写视为**已停止并封存**，不是“进行中”。用户于 2026-08-10 明确要求立即停止。
- 未经用户在当前任务中重新明确授权，不得恢复阶段 8.1，不得修改 `flutter/` 产品代码、`flutter/tool/parity/`、`docs/flutter-parity*`，也不得开始 8.2–8.10 或阶段 9。
- 普通产品开发的当前主线是 Capacitor + React；不要因为 `flutter/` 中存在同名功能就把修改做进 Flutter。
- 允许按用户要求只读说明、审计或核对封存状态；只读检查不等于恢复重写。
- 即使用户授权恢复，也只执行其明确批准的阶段，完成后验证、汇报并停止等待检查，不自动进入下一阶段。

## 权威状态与读取顺序

处理本领域任务时依次读取：

1. 根目录 `PROGRESS.md` 最近一个自然日；若要恢复重写，再按关键词读取 2026-08-10 的停止记录。
2. `docs/flutter-parity/stage-8-plan.md`：用户确认的 8.1–8.10 阶段范围与完成门槛。
3. `docs/flutter-parity/stage-8.1-handoff-2026-08-10.md`：8.1 WIP 的详细交接；其标题中的“进行中”是停止前快照，不覆盖后来的暂停命令。
4. `flutter/tool/parity/README.md`：证据工具的命令、隐私边界和产物说明。
5. 仅在追查旧视觉审计时读取 `docs/flutter-parity-audit-2026-08-08.md` 与 `docs/flutter-parity-handover-2026-08-09.md`；它们只提供历史线索，不是当前完成证明。

文档冲突时采用这个优先级：用户当前明确指令 → `PROGRESS.md` 最新停止记录 → 本 skill → stage 8 权威计划 → 旧交接/审计文档。

## 精确封存停点（2026-08-10）

- 阶段 0–7 已实现；阶段 8 未完成；阶段 9 从未获准开始。
- 阶段 8 后来拆为 8.1–8.10，目前只留下 8.1 的静态完整性门禁 WIP。
- 最后封存提交为 `1528e34`（完整 SHA：`1528e34dbd1c49a19a7226cb9a08e2792278c757`），提交说明为 `chore(flutter): checkpoint stage 8.1 parity gates`，已推送到 `origin/main`。
- 对应 GitHub Actions run `31334340620` 已成功；`test`、`legacy-guard`、`flutter` 三个 job 全绿。历史提交 `96bda9c7` 的红色 run 已由后续提交 `8b8e5687` 修复，不能误判成封存提交失败。
- 当前生成证据规模：280 个 matrix 条目、104 个 fixture profile、43 个 scenario、3367 个 source observation。
- 静态 validator 绿色不代表产品对齐：当前仍是 0 个 fully-driven fixture、1 个 automated / 42 个 specified scenario、0 个 verified 条目。
- 8.1 未完成项包括 fixture/scenario driver、最终 Android/CDP 回放、installed APK provenance、模拟器矩阵、隐私检查和完整阶段验收。不要写成“8.1 已完成”“零差异已证明”或“Flutter 已可切换”。
- 停止时未修改受保护旧版路径；WIP 只涉及 Flutter parity 工具与生成证据。

## 架构边界与长期决策

- `flutter/` 是独立工程，与当前产品的 `www/`、`react/`、根 `android/` 并行存在；当前不能删除任何一套。
- Flutter Android 测试包名为 `io.github.jenkjyu.after_zero`，旧 Capacitor 包名为 `io.github.jenkjyu.afterzero`，故意不同以便同机对照。包名是否统一原计划留到阶段 9。
- Flutter 的 `shared_preferences` 与 Capacitor WebView 的 `localStorage` 完全隔离；相同 key 不会自动迁移数据。已有 version 6 JSON 导入通道，但切换迁移政策尚未决定。
- Flutter 使用 Riverpod 手写 `Notifier`/`NotifierProvider`、`shared_preferences`、`integration_test`；没有引入 Riverpod 代码生成。
- CloudBase 没有可用的 Dart 3 官方 SDK，Flutter 通过 HTTP 网关实现匿名登录、custom ticket 登录与云函数调用。网关复用现有云函数调用权限，不需要额外控制台策略。
- 微信登录使用 `fluwx`；安装微信的 Android 真机、包名/签名登记与 OAuth 端到端仍未完成验收。非匿名 CloudBase session 的静默续期也是已登记差异。
- Android 文件另存为使用手写 MethodChannel + 真正的 SAF `ACTION_CREATE_DOCUMENT`；iOS 对应分享面板/Files。通知使用 `flutter_local_notifications`。
- debug 预览仅在 `kDebugMode && AFTER_ZERO_PREVIEW=true` 时绕过登录门；profile/release 不能绕过，预览也不伪造云端账户。
- iOS 于 2026-08-08 明确暂缓，尚未安装完整 Xcode/CocoaPods，也没有 iOS CI 或双端验收。不得写成 iOS 已支持或已验证。

## 阶段史摘要

- 阶段 0（2026-08-05）：建立 Android/iOS Flutter 工程与 CI；Android 工具链可用，iOS 工具链未就绪。
- 阶段 1：把 `www/js/calc.js` 的 57 个函数移植到 `flutter/lib/calc/calc.dart`，保留 `Map<String, dynamic>` 以便逐行对账；JS/Dart 四舍五入差异由自定义 `r2()` 处理，`math.max/min` 与 `as double` 组合必须使用 `0.0`。
- 阶段 2：增加 immutable 数据模型、Debt↔Map 桥接、SharedPreferences 持久化与 Riverpod providers；计算继续复用阶段 1 函数，不在 UI 重写财务逻辑。
- 阶段 3：完成 CloudBase HTTP 与微信登录编排；匿名 HTTP API 和现有权限复用经过真实请求验证，真机 OAuth 与正式会话续期仍待验收。
- 阶段 4：完成债务 tab、编辑器、详情、还款/减免/结清/恢复、排序与手势基础；业务变更通过已验证的 debt operations。
- 阶段 5：完成还款日和统计 tab；还款日按“期”展开，非最早未还期不能越序销期；统计复用移植计算函数。
- 阶段 6：完成“我的”与全部子页面/sheet、账户、Premium、云备份、档案、AI、策略与图表交互。
- 阶段 7（2026-08-06）：完成通知排程、Android SAF/iOS 分享、PDF/Excel/JSON 导出和 PDF 预览；当时全量 `flutter test` 为 178 条。
- 阶段 8：先做逐页审计与若干视觉/文案/手势修复，后把验收提升为“旧版源码 + 实际运行表现是唯一 oracle，零个未解释差异”，再拆成 8.1–8.10。8.1 只做到静态门禁 WIP 即被用户叫停。

更细的阶段实现史保留在 `PROGRESS.md` 的 2026-08-05～2026-08-10 条目；不要把这些按日期叙述重新搬回常驻 `AGENTS.md`。

## 对齐工作的硬规则

- 旧版 oracle 路径始终只读：`www/`、`react/`、根 `android/`、`cloudbase/`、`capacitor.config.json`、根 `package*.json`。恢复 Flutter 对齐也不授权修改它们。
- 唯一 oracle 是旧版源码加旧版实际运行表现；历史审计、现有 Flutter 测试、语义树或“功能已存在”都不能单独证明一致。
- 不用像素差百分比自行宣布通过。平台不可避免差异也必须留证并由用户逐项接受。
- `mapped_unverified` 只表示找到双向映射；只有场景、fixture、双端证据、比较器结果与内容 hash 门禁全部通过后才可标记 `verified`。
- 真实账户、债务、token、openid、档案或原始 preferences/localStorage 只能留在权限受控的临时目录；仓库只提交合成 fixture 与去敏证据。
- 不为让 validator 变绿而盲目刷新 snapshot；任何源码变化要先归入有场景和验收条件的 matrix 条目。

## 获得恢复授权后的工作流

1. 先确认用户授权的是状态核对、8.1 续作还是另一个明确范围；授权恢复“Flutter”不自动授权所有后续阶段。
2. 读取上述权威文件并检查当前 `git status`、HEAD、远端/CI 状态；不要假设 2026-08-10 后仓库没有变化。
3. 若继续 8.1，只关闭 8.1 的完整性系统，不修 8.2 以后登记的产品差异。
4. 先运行静态自检：

   ```bash
   python3 flutter/tool/parity/catalog.py --check
   python3 flutter/tool/parity/parity_tool.py validate --json
   python3 flutter/tool/parity/parity_tool.py render --check
   python3 -m unittest discover -s flutter/tool/parity/tests -p 'test_*.py' -v
   python3 -m py_compile flutter/tool/parity/*.py
   node --check flutter/tool/parity/cdp_capture.mjs
   ```

5. 按 `stage-8-plan.md` 完成本阶段全部证据、全量验证、旧版零修改检查、文档同步、精确暂存、提交、推送和 CI；任一项没完成就保持“进行中”。
6. 汇报证据和未完成项，然后立即停止；未经用户再次批准不得进入下一阶段。
