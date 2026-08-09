# 阶段 8.1 进行中交接（2026-08-10）

> 状态：**进行中，绝不能写成完成。** 本文件记录一次因用户切换 session 而提交的 WIP 快照。阶段 8 的权威计划见 [`stage-8-plan.md`](stage-8-plan.md)。

## 用户目标与执行约束

- 阶段 8 的唯一目标是 Flutter 与受保护旧版在 UI、排版、文案、交互、手势、计算、数据、错误状态、持久化和原生行为上零个未解释差异。
- 唯一 oracle 是旧版源码加旧版实际运行表现；历史审计文档只提供线索。
- 旧版受保护路径继续只读：`www/`、`react/`、根 `android/`、`cloudbase/`、`capacitor.config.json`、根 `package*.json`。
- 用户因用量压力决定后续使用 Max，不再使用 Ultra；避免无边界并行审计和阶段外扩张。
- 每个阶段完成后才更新完成状态、完整验证、commit、push、确认 CI，然后停止等待用户审核。本次提交是用户明确要求的换 session 交接，不代表 8.1 达到完成门槛。

## 冻结基准

- 开始本轮时的 `main`/`origin/main`：`6fa1712dcdb2ba6e617810dffa8bbe38193140aa`。
- 旧版包名：`io.github.jenkjyu.afterzero`。
- Flutter 并行测试包名：`io.github.jenkjyu.after_zero`。
- 基准树和两份 debug APK SHA-256 已写入 `flutter/tool/parity/manifest.json`。
- 本轮持续检查受保护旧版路径，提交前仍须再次确认 tracked/untracked 均为零改动。

## 当前已形成的产物

### 1. 权威计划

- `docs/flutter-parity/stage-8-plan.md` 保存用户确认的 8.1–8.10 完整计划、阶段门槛、固定收尾流程及 iOS/阶段 9 门禁。

### 2. 初版契约矩阵与源码清单

- `flutter/tool/parity/catalog.py` 是人工维护的矩阵与场景生成源。
- `manifest.json` 当前生成 233 个契约条目：
  - `difference`：107
  - `missing_in_flutter`：22
  - `flutter_extra`：10
  - `mapped_unverified`：90
  - `blocked_external`：4
- `source_inventory.json` 当前有 3367 个 observation，包含：
  - 57 个旧版 calc export；
  - 39 个旧版 bridge 成员；
  - 11/12 个旧版/Flutter storage key；
  - 45 个 legacy test SHA（已补扫 `react/__tests__`）；
  - 9 个 Flutter test SHA；
  - 产品源码、字体、图片、锁文件、原生构建配置和 parity 工具/fixture 的完整字节 SHA。
- `docs/flutter-parity/matrix.md` 是生成的人类可读矩阵。

### 3. Case profile 的诚实分类

- `scenarios.json` 有 104 个 case profile、43 个场景规格。
- 只有 11 个 profile 的 storage payload 与描述精确对应，标记为 `storage_status=materialized`。
- 其余 93 个明确标记为 `case_spec_only`；`materialize` 和 seed 工具会拒绝把它们伪装成已实现 fixture。
- 当前完整驱动 profile 为 **0**；场景状态为 1 个 `automated`、42 个 `specified`。固定时钟、时区、网络、权限、viewport、inset、motion 等仍主要是规格元数据，不能宣称已应用。
- 场景已增加 fixture composition、normalization rule、comparison contract 和证据命名规格，但这些新字段还没有完成全部强校验和执行器。

### 4. 对齐证据工具

- `parity_tool.py`
  - 生成/冻结源码清单；
  - 校验旧版基准树和受保护路径；
  - 校验 matrix、fixture、scenario 双向引用；
  - materialize 精确 storage seed；
  - JSON canonical compare；
  - 像素 compare、diff heatmap、严格尺寸或最多 2px 中心裁切；
  - 阈值限制 0–64，避免高阈值让明显差异通过；
  - 生成 Markdown 矩阵。
- `android_capture.py`
  - 设备环境记录、精确 launcher 解析、前台包校验；
  - UI XML、截图、preferences SHA 采集；
  - Flutter storage seed 前强制私密备份、恢复和读回校验；
  - staging 后统一提交证据，降低失败时留下半套输出的风险；
  - installed APK 字节 SHA 校验入口。
- `cdp_capture.mjs`
  - 唯一页面选择、ready/fonts/bridge/React roots 等待；
  - DOM/样式/几何/可见文本/localStorage key 与截图采集；
  - 遮挡与 viewport 可见性检查；
  - 动画冻结与恢复；
  - legacy seed 前备份、finally 恢复、reload、读回比较后删除备份。
- `tests/test_parity_tool.py` 当前 13 条测试覆盖 57 calc/39 bridge/存储 key discovery、fixture overlay、case spec 拒绝、JSON/像素 mutant、阈值/裁切绕过、Android 启动/UI dump 重试/storage XML/APK SHA。
- CI 的 Flutter job 已加入 catalog、validator、renderer、工具单测、Python/Node 语法门禁。
- WIP push 的 CI 暴露并已修复两个环境问题：source inventory 曾纳入本机未跟踪的 Flutter `GeneratedPluginRegistrant` 生成物，现只枚举 git-tracked 原生源码并有回归测试；Flutter job 的浅克隆又无法解析冻结基准提交，现为 parity validator 使用完整 git 历史。两次失败都在 parity 门禁阶段，不是产品测试失败。

## 已完成的模拟器实跑证据（最终补丁前）

以下只证明工具方向可行，不等于 8.1 产品 parity：

- Android 14 模拟器中两包均可由解析出的 launcher 正确启动；错误前台包会 exit 2，不再把 Flutter 画面误标为 legacy。
- 旧版同页两次 CDP 截图在冻结动画后达到 `0 / 2,598,964` changed pixels。
- 遮挡的两个 swipe action 已从 visible nodes 排除。
- 合成 empty seed 下登录门动画被收口到终态，微信按钮可见、`opacity=1`。
- legacy seed 后 finally 恢复并 reload，恢复前后 canonical localStorage SHA 完全一致，私密备份删除。
- threshold 65/256 和大幅 center-crop 均被拒绝；实际 1082×2402 对 1080×2400 的 2px capture border 可显式裁切。
- 测试结束时 adb forward、远端 `parity_ui_*`、含真实 localStorage 值的临时证据均已清理。

注意：上述实跑之后又修改了 root/text 可见性、动画恢复、Android 原子落盘、精确前台匹配、storage read-back 和 APK provenance。**这些最后补丁尚未重新做真实模拟器复验。** 原始实跑文件位于本机 `/tmp/after-zero-parity-audit-rerun`，不提交，因为其中曾涉及当前测试安装的数据；仓库没有加入真实账户、债务、token 或响应。

## 已确认的旧清单外产品差异

下面只是高风险摘要，完整 provisional 条目见 matrix：

- Flutter 使用 `after-zero-backup-v1`，旧版使用 `after-zero-backup-meta-v1`。
- Flutter 未持久化 `after-zero-simulate-v1` 和 AI 首次额度说明 key。
- 编辑已结清债务会丢失 `settled`/`settledDate`。
- 非匿名 CloudBase session 没有静默续期，前台跨 expiry 后还可能继续发送旧 Bearer token。
- Flutter 冷启动没有首次通知重排；测试通知 id/title/body 与旧版不同。
- 微信 OAuth 没有随机 state 生成与回调校验。
- 注销云账户的客户端流程会额外清空本地数据，与旧版“服务器注销”和“仅重置本地”边界不同。
- 备份恢复的缺字段、文件下载中途失败与恢复原子性不同。
- PDF 内容结构、档案 Markdown/内置文档操作、HEIC/HEIF/BMP MIME 等不一致。
- 编辑器逐期 controller 在批量更新/同 key 重新生成后可能显示旧值。
- 首次长按不能同一手势继续拖；tab/back 不完整收口 jiggle/swipe。
- Journey 使用等距下标而旧版使用真实日期比例；Pressure 默认模式、横向时间轴和两种模式交互不同。
- 结清 Premium 邀请、AI 首次额度说明、AI 按错误消息重试和删除当前会话收口等缺失。
- 详情、编辑器和通知设置仍需按计划恢复旧版 bottom sheet surface/关闭契约。

## 8.1 尚未关闭的硬阻塞

这些问题必须由新 session 继续处理，不能因为当前 validator 绿色就忽略：

1. **“零未分类入口”尚未证明。** `INV-SOURCE-LEGACY`/`INV-SOURCE-FLUTTER` 的 catch-all selector 仍可把大量 observation 作为 drift ledger 吞掉；validator 尚未区分“只被静态守卫覆盖”和“已被语义契约分类”。
2. **39 个 bridge 尚未逐入口映射。** 当前仍主要是一个 aggregate entry，和其自身“39/39 反查到 Flutter 动作”的 acceptance 不一致。
3. **源码锚点尚未全部可靠。** `catalog.source()` 仍允许模糊解析；独立审计统计过 78 个 fuzzy anchor，且若干 exact anchor 在文件中重复。`SYS.TAB_BAR`、`ACTION.EDITOR.ADD_ROW` 等曾发现明显误锚。应改为精确唯一 anchor/line+context hash；缺失能力使用可验证 absence query，不能锚附近无关代码。
4. **`verified` 门禁尚不充分。** 当前只初步要求非空 evidence list 和 approval 文件/hash，尚未强制证据文件存在、双端配对、scenario/fixture、证据类型覆盖、comparator pass 和内容 SHA 全部一致。任何条目仍不得改成 `verified`。
5. **93 个 case spec 和 42 个 specified scenario 没有驱动。** 固定 clock/timezone、状态生成、network/native/permission/device/viewport/text-scale/inset/motion driver 均待实现或接线；当前 fully driven 为 0。
6. **场景规格仍偏粗。** 新增 composition/actions/checkpoint/comparator 字段后，validator 尚未完整验证组合数量、原子动作、稳定等待和逐 checkpoint 预期；视觉笛卡尔积和微信成功所需组合不能再用 fixture 并集冒充。
7. **运行工具最后补丁待真机/模拟器复验。** 特别检查可见 root/文本不含被 gate 或 offscreen surface 遮挡内容、动画状态确实恢复、Android 失败无半套输出、精确前台包不会被权限窗/相似包名误判、storage 读回失败保留备份、installed APK SHA 与 manifest 一致。
8. **运行 oracle provenance 还没有进入阶段证据。** 新增了 `verify-install`，但两包尚未用最终工具重新读取 installed APK 并保存去敏结果。
9. **阶段 8.1 的设备与发布侧验收未跑完。** 本次 WIP 已完成 Node、React、TypeScript、React build、`flutter analyze` 和 `flutter test`；但尚未运行 preview APK build、最终模拟器矩阵、完整仓库隐私扫描和远端 CI，因此仍不能完成 8.1。

## 新 session 推荐恢复顺序

严格只做 8.1，不修 8.2 以后的产品差异：

1. 阅读 `docs/flutter-parity/stage-8-plan.md`、本文件和 `flutter/tool/parity/README.md`，再读本机 `PROGRESS.md` 最新自然日。
2. 先运行当前静态自检，确认 WIP 提交可重现：

   ```bash
   python3 flutter/tool/parity/catalog.py --check
   python3 flutter/tool/parity/parity_tool.py validate --json
   python3 flutter/tool/parity/parity_tool.py render --check
   python3 -m unittest discover -s flutter/tool/parity/tests -p 'test_*.py' -v
   python3 -m py_compile flutter/tool/parity/*.py
   node --check flutter/tool/parity/cdp_capture.mjs
   ```

3. 先关闭上节 1–6：语义覆盖、39 bridge、exact anchors、verified evidence、fixture driver 和 scenario validator；不要继续增加新的高层功能。
4. 用合成数据复验最终 Android/CDP 工具，并提交去敏 summary；禁止提交真实 preferences/localStorage/UI 文本。
5. 达到 8.1 完成门槛后，再跑计划要求的全量 Node/Flutter/构建/模拟器/隐私/旧版零修改检查。
6. 更新 README/AGENTS/PROGRESS 和最终 8.1 报告，commit、push、确认 CI，然后停止等待用户审核。

## 本次 WIP 快照的验证状态

提交前已通过：

- `python3 -m py_compile flutter/tool/parity/*.py`
- `node --check flutter/tool/parity/cdp_capture.mjs`
- `python3 flutter/tool/parity/catalog.py --check`
- `python3 flutter/tool/parity/parity_tool.py validate --json`
- `python3 flutter/tool/parity/parity_tool.py render --check`
- parity 工具单测 14/14
- `npm test`：116/116
- `npm run test:react`：44 个文件、354/354
- `npx tsc --noEmit --project react/tsconfig.json`
- `npm run build:react`
- `flutter analyze`：0 issue
- `flutter test`：178/178
- `git diff --check`
- 受保护旧版 tracked/untracked 零改动

尚未运行 preview APK build、最终模拟器矩阵、完整仓库隐私扫描和远端 CI；其余硬阻塞见上文。不能从本 WIP 提交推导阶段完成。
