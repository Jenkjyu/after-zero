# Flutter 全量对齐证据工具

这套工具服务于阶段 8 的唯一目标：Flutter 重写与受保护旧版在 UI、文案、排版、交互、手势、计算、持久化、网络和原生行为上完全一致。

阶段权威计划见 `docs/flutter-parity/stage-8-plan.md`；当前 WIP 状态与未完成硬阻塞见 `docs/flutter-parity/stage-8.1-handoff-2026-08-10.md`。当前阶段仍是 8.1 进行中，不能从本工具的绿色静态校验推导产品已经对齐。

旧版运行表现和旧版源码共同构成 oracle。历史审计文档、178 条 Flutter 测试以及“功能已经存在”都不能单独证明对齐。

## 8.1 产物

- `catalog.py`：人工维护的矩阵、fixture 和场景定义；它确定性生成下面两份 JSON。
- `manifest.json`：双向契约矩阵。每项都有稳定 ID、优先级、状态、旧/新源码锚点、场景和验收条件。
- `scenarios.json`：104 个原子 case profile 与 43 个双端验收场景规格。当前只有 11 个 profile 的 storage seed 已精确物化；其余明确标为 `case_spec_only`，驱动未实现前不计作已执行覆盖。
- `source_inventory.json`：源码扫描快照，覆盖逐文件 SHA、57 个 calc export、39 个 legacy bridge、存储 key、中文 UI 文案、事件、导航、依赖、原生文件和测试。
- `parity_tool.py`：验证、materialize、JSON/像素比较与矩阵渲染。
- `android_capture.py`：Android 环境、启动、截图、UI XML、SharedPreferences fixture 注入及恢复。
- `cdp_capture.mjs`：旧版 WebView 的 DOM/样式/几何/文案/localStorage 与截图证据。

8.1 的 `mapped_unverified` 只表示契约已经找到双向位置，绝不表示已经对齐。只有后续同场景证据通过并写入 `evidence_refs` 后，条目才可改成 `verified`。

## 本地验证

从仓库根目录执行：

```bash
python3 -m pip install -r flutter/tool/parity/requirements.txt
python3 flutter/tool/parity/catalog.py --check
python3 flutter/tool/parity/parity_tool.py validate --json
python3 -m unittest discover -s flutter/tool/parity/tests -p 'test_*.py' -v
node --check flutter/tool/parity/cdp_capture.mjs
python3 flutter/tool/parity/parity_tool.py render --check
```

有意识地新增、删除或修改产品源码后，先更新对应矩阵项，再显式刷新静态快照：

```bash
python3 flutter/tool/parity/parity_tool.py snapshot
python3 flutter/tool/parity/parity_tool.py validate
```

不能为了让门禁变绿而盲目刷新 snapshot；变动必须先归入一个有场景和验收条件的矩阵项。

## Storage fixture materialize

```bash
python3 flutter/tool/parity/parity_tool.py materialize FX-S01 \
  --output /tmp/after-zero-FX-S01.json
```

输出同时包含：

- `legacy.localStorage`
- `flutter.sharedPreferences`
- 固定时钟、时区、locale、random seed
- network/native/theme/viewport/text-scale profile

只有 `storage_status=materialized` 的 11 个 profile 能运行该命令。其余 profile 是机器可检查的用例规格，命令会主动拒绝，直到相应 state/network/native/device driver 真正实现；不得用共同的 base payload 冒充执行完成。当前所有 profile 的 `driver_status` 都仍是 `partial` 或 `pending`，所以 8.1 没有把任何端到端场景写成已执行。所有数据均为合成测试数据；不得把真实账户、债务、token 或档案复制进仓库 fixture。

## Android 采集

设备配置与环境快照：

```bash
python3 flutter/tool/parity/android_capture.py --serial emulator-5554 configure --animations 1.0
python3 flutter/tool/parity/android_capture.py --serial emulator-5554 environment
```

每轮运行 oracle 采集前，必须证明模拟器中安装的 APK 就是 manifest 冻结的那份，而不是同包名的旧构建：

```bash
python3 flutter/tool/parity/android_capture.py --serial emulator-5554 verify-install \
  --package io.github.jenkjyu.afterzero \
  --expected-sha256 f72fbb815b153f5e1701e1caef30007d7c10ac0a4ca52713511a4e79cb4ddc6e
```

Flutter 的安全组合采集会先备份现有 SharedPreferences，注入合成 fixture，启动并采集，然后在 `finally` 中恢复原状态；成功恢复后私密备份会删除：

```bash
python3 flutter/tool/parity/android_capture.py --serial emulator-5554 \
  capture-flutter-fixture \
  --state /tmp/after-zero-FX-S01.json \
  --label flutter-FX-S01-debts \
  --output-dir /tmp/after-zero-parity/flutter-FX-S01
```

普通 `capture` 默认只记录 preferences SHA，不写原始值。只有当前 App 明确运行合成 fixture 时才允许传 `--include-preferences`。

## 旧版 CDP 采集

先把目标 WebView 的 devtools socket 转发到本机，再运行：

```bash
node flutter/tool/parity/cdp_capture.mjs \
  --endpoint http://127.0.0.1:9222 \
  --target-title-contains "After Zero" \
  --seed-state /tmp/after-zero-FX-S01.json \
  --label legacy-FX-S01-debts \
  --output-dir /tmp/after-zero-parity/legacy-FX-S01
```

默认行为：

- 目标必须唯一，否则拒绝采集。
- 等待 document、fonts 和 `window.__azBridge` 就绪。
- 冻结 CSS animation/transition 后采集；动画/手势关键帧场景显式用 `--allow-animations`。
- seed 前将原 localStorage 写入权限为 `0600` 的临时备份；采集后在 `finally` 恢复并删除备份。
- 未 seed 时不输出 localStorage 值，只输出 key；显式 `--include-storage-values` 可能暴露私人数据，只能写私密临时目录。

`--keep-seeded-state` 会故意保留注入状态，只用于人工连续操作，必须由操作者自行恢复；自动化和基准采集禁止使用。

## 比较与 mutant 门禁

业务 JSON：

```bash
python3 flutter/tool/parity/parity_tool.py compare-json legacy.json flutter.json \
  --ignore captured_at --fail-if-changed
```

截图默认要求尺寸完全相同。CDP 与 ADB 只因采集边框出现已确认的 1px 差异时，才可显式中心裁切；中心裁切硬限制为每个维度最多相差 2px，阈值只允许 0～64，避免把横竖屏或明显不同的画面裁掉/忽略后误判通过。结果会记录原尺寸和 crop box：

```bash
python3 flutter/tool/parity/parity_tool.py compare-images legacy.png flutter.png \
  --size-mode center-crop --threshold 24 --output diff.png
```

单元测试会制造 JSON amount mutation 和单像素 mutation，确认比较器确实判失败；“测试自身会抓错”是完整性系统的退出条件之一。

## 隐私与证据落盘

- `artifacts/`、`private-evidence/` 和 pre-seed 备份已被本目录 `.gitignore` 排除。
- 仓库只允许提交合成 fixture、去敏环境信息、比较摘要和经审核的代表性截图。
- 原始 SharedPreferences、localStorage、token、openid、真实债务与档案只能留在权限受控的临时目录，并在完成后删除。
- `www/`、`react/`、根 `android/`、`cloudbase/`、`capacitor.config.json`、根 `package*.json` 始终只读。
