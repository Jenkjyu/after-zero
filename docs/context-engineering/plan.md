# AGENTS.md 上下文工程计划

状态：已完成步骤 1～9，等待用户检查步骤 9

建立日期：2026-08-11

执行约束：严格按 1～9 顺序执行；每完成一步就停止，等待用户检查和明确批准后再开始下一步。

## 目标

把当前体量过大、历史与现状混杂的 `AGENTS.md` 改造成精简的常驻控制面：只保留每次开发都需要知道的稳定事实、硬性规则和按任务加载 skill 的路由。低频领域知识、专项工作流和历史原因迁入 `.agents/skills/`，避免无关任务反复占用上下文。

本计划本身不授权执行后续步骤。每一步允许修改的文件，以用户当步批准的范围为准。

## 九步执行计划

| 步骤 | 改造板块 | 改造方式 | 新归属 | 新归属是什么意思 | 预计涉及文件 |
|---|---|---|---|---|---|
| 1 | 事实基线 | 只读核对代码、文档、skill 与当前项目状态，列出冲突和过时事实；不修改文件 | 事实基线清单 | 后续改造采用的“当前真实状态”，用来避免把旧结论重新写回文档 | 全仓库只读；结果记录在本文和 `PROGRESS.md` |
| 2 | Flutter 重写与暂停状态 | 将“正在推进的主路线”改成“已停止、未经重新授权不得恢复”；把大量阶段史从常驻上下文移出 | `flutter-rewrite-parity` skill | 仅在用户重新处理 Flutter 重写、对齐审计或阶段 8 工具时加载的专项说明；普通 Capacitor/React 开发不会加载 | 新增 `.agents/skills/flutter-rewrite-parity/SKILL.md`；阶段内精简 `AGENTS.md` 对应 Flutter 段落 |
| 3 | 债务领域与计算模型 | 将稳定的数据口径、账本语义、容差、还款/减免/结清规则集中；把“按日期追述修复经过”改成“按问题检索领域规则” | `debt-domain` skill | 处理 Debt、PlanRow、`calc.js`、还款账本、结清和模拟算法时加载的领域知识入口 | 新增 `.agents/skills/debt-domain/SKILL.md`；迁入并移除 `.agents/skills/debt-model-history/SKILL.md`；精简 `AGENTS.md` 债务历史段落 |
| 4 | React 与 vanilla 桥接架构 | 抽出 React 多入口、状态所有权、`window.__azBridge`、硬件返回链、挂载和构建边界 | `react-bridge-architecture` skill | 修改 React 页面、共享状态或 `www/index.html` 桥接代码时，用来判断逻辑应放 React、vanilla 还是 bridge | 新增 `.agents/skills/react-bridge-architecture/SKILL.md`；精简 `AGENTS.md` React 迁移史 |
| 5 | Capacitor UI 与交互系统 | 汇总主题变量、层级、sheet/subpage、手势、WebView 视觉雷区；删除按迁移轮次叙述的 UI 历史 | `capacitor-ui-system` skill | 修改当前 App 的布局、弹层、动画、拖拽、左滑和图表交互时加载的 UI 约束 | 新增 `.agents/skills/capacitor-ui-system/SKILL.md`；精简 `AGENTS.md` UI/手势长段落 |
| 6 | 原生运行时与构建边界 | 汇总 Capacitor sync 边界、手写 Java 源码、通知、SAF 保存、微信插件和构建注意事项；保留专门部署/签名 skill 的分工 | `capacitor-native-runtime` skill | 涉及 `android/`、原生插件、通知、文件保存或 WebView/原生边界时加载的总入口；再按需路由到微信、签名、云函数专项 skill | 新增 `.agents/skills/capacitor-native-runtime/SKILL.md`；校准 `.agents/skills/wechat-login-setup/SKILL.md`、`.agents/skills/release-keystore/SKILL.md`、`.agents/skills/cloudbase-deploy/SKILL.md`；精简 `AGENTS.md` 原生段落 |
| 7 | 其余产品领域 skill | 为统计/策略、账户/Premium 建立领域入口；校准现有 AI、云备份、还款日、编辑表单 skill 的事实与触发条件，去重交叉内容 | `report-strategy-design`、`account-premium-design` 及校准后的现有 skills | 前者负责统计口径、还清策略、导出；后者负责账户、Premium、兑换码和法律页。现有 skills 继续负责各自功能，但内容以当前代码为准 | 新增 `.agents/skills/report-strategy-design/SKILL.md`、`.agents/skills/account-premium-design/SKILL.md`；更新 `.agents/skills/ai-advisor-design/SKILL.md`、`cloud-backup-design/SKILL.md`、`pay-tab-design/SKILL.md`、`edit-sheet-design/SKILL.md`，必要时校准同目录其他 skill |
| 8 | `AGENTS.md` 常驻控制面 | 全文重写为短文档：当前架构、源码边界、硬规则、验证命令、skill 路由和少量高频雷区；历史过程不再常驻 | 精简 `AGENTS.md` | 每个任务都会读取的最小项目地图，只回答“现在是什么、不能做什么、何时加载哪个 skill” | 重写 `AGENTS.md`；复核全部 `.agents/skills/*/SKILL.md` 的路由与交叉引用 |
| 9 | 文档同步与总验收 | 同步面向人的项目状态，给历史 Flutter 文档加清晰封存标识，检查断链、重复、过时数字、skill 触发和工作树差异 | 最终文档体系 | `README.md` 面向人，`AGENTS.md` 是常驻控制面，skills 是按任务加载的知识，历史文档只作存档，`PROGRESS.md` 记录本机过程 | `README.md`、`AGENTS.md`、`docs/flutter-parity*.md`、`docs/flutter-parity/*.md`、`docs/context-engineering/plan.md`、`PROGRESS.md`，以及验证发现必须同步的 skill 文件 |

## 每一步的停点规则

每一步按以下顺序执行：

1. 只处理该步列出的板块，不提前实施后续步骤。
2. 做与该步风险相称的检查，包括链接、关键词、skill 触发范围和 `git diff --check`。
3. 向用户报告本步具体修改、验证结果和未处理事项。
4. 停止，不自动开始下一步。

停下来不会破坏连续性：本文保存总计划，`PROGRESS.md` 保存当前停点；新任务读取两者即可续接。

## 步骤 1：事实基线（已完成）

步骤 1 只进行了只读审计，当时工作树干净，没有修改项目文件。确认的基线如下：

- Flutter 重写已于 2026-08-10 按用户要求立即停止；除非用户重新明确授权，不得恢复阶段 8.1 或后续工作。权威停点在 `PROGRESS.md` 最近条目。
- 当前可用产品主线是 Capacitor + React。`react/src/` 负责现行界面和 React 状态；`www/index.html` 仍承担宿主、存储、云端与原生桥接等胶水职责，不能把它简单描述成唯一 UI 源文件。
- Flutter、README 和 `AGENTS.md` 中仍有把重写描述为“进行中”的旧内容，需要在后续步骤改成明确封存状态。
- AI 用量的当前权威口径是云函数服务端按月计数、每月 50 次；现有 `ai-advisor-design` skill 和部分常驻说明仍残留“客户端每天 20 次”等旧口径。
- Debt 已有稳定的永久 `id`；`AGENTS.md` 的通知历史段落仍有“没有稳定 id”的旧表述。
- `www/js/calc.js` 当前导出 57 个函数；这属于可验证的代码事实，不应继续依赖迁移阶段叙述。
- 云备份当前规则为最多 20 条记录、总空间 300 MB、单文件 8 MB；后续应以云函数和现有 `cloud-backup-design` skill 交叉核准。
- Premium 当前是 ¥15 一次性买断，真实支付仍是占位流程；旧的 Premium/Premium+、月付/年付历史不应常驻。
- 当前手写 Android 原生 Java 源码共有 4 个核心类：`MainActivity`、`SaveFilePlugin`、`WeChatLoginPlugin`、`WXEntryActivity`；它们不是 `npx cap sync android` 生成物。
- `.agents/skills/` 已入库，是项目 skill 的唯一来源；步骤 1 审计时共有 8 个，步骤 2 新增 `flutter-rewrite-parity` 后共有 9 个，不再维护 `.claude/skills/` 副本。
- React sheets 入口实际挂载的 screen/sheet 数量与 README 现存数字不一致；后续文档不应继续手写易漂移的“共 N 个页面”数字，除非同时建立自动核对方式。

## 步骤 2：Flutter 重写与暂停状态治理（已完成）

- 将 `AGENTS.md` 原本把 Flutter 重写描述为“进行中”的大段阶段史替换为简短的封存门禁：当前主线是 Capacitor + React；Flutter 阶段 8 未完成、阶段 9 从未开始；未经用户当前任务中的重新明确授权不得恢复或修改。
- 新增 `.agents/skills/flutter-rewrite-parity/SKILL.md`，按需保存阶段 0～8 摘要、架构边界、2026-08-10 精确 WIP/CI 停点、旧版 oracle 保护规则和获准后的恢复流程。
- skill 的触发范围刻意限制为用户明确要求处理 Flutter 重写、旧版对齐审计、阶段 8/8.1 证据工具或相关文档；普通 Capacitor/React 开发不触发。
- 未修改 Flutter 产品代码、parity 工具、旧版产品路径或步骤 3 的债务领域文档。

## 步骤 3：债务领域与计算模型（已完成）

- 新增 `.agents/skills/debt-domain/SKILL.md`，以当前代码而非修复日期为组织方式，集中 Debt/PlanRow/GenSpec 不变量、57 个 `calc.js` 导出的双运行时契约、计划生成与 0.015 容差、派生字段、利息优先账本、还款/减免/结清恢复、聚合/提醒/导出和两类模拟算法。
- 将旧 `.agents/skills/debt-model-history/SKILL.md` 的仍有效内容迁入新 skill 后移除，并更新 `edit-sheet-design` 与 `AGENTS.md` 中的交叉引用。
- 将 `AGENTS.md` 的纯计算迁移史、数据模型缺口史、提前结清长叙事和模拟算法三轮排错史改成当前规则摘要与 `debt-domain` 路由；保留多策略 UI 的当前入口、排序控件和静态图表事实，未提前整理后续 UI/统计领域。
- 只读反核对 `www/js/calc.js`、`react/src/types.ts`、`EditSheet.tsx`、`www/index.html` 和现有回归测试；未修改任何产品源码。

## 步骤 4：React 与 vanilla 桥接架构（已完成）

- 新增 `.agents/skills/react-bridge-architecture/SKILL.md`，以当前代码为权威整理五个 Vite 入口、React/vanilla/calc.js 状态所有权、`window.__azBridge` 三处同步契约、`useSyncExternalStore` 快照缓存、跨树 screen 状态、反向返回桥接、脚本顺序和 build→sync 边界。
- 用当前架构摘要替换 `AGENTS.md` 里按第一～十一步枚举的 React 迁移史和会漂移的 bridge 函数快照；同步校正顶部“源码只等于 `www/index.html`”的旧表述、挂载 DOM 删除规则、返回链双顺序约束和构建命令。
- 新 skill 的标准元数据保存在 `.agents/skills/react-bridge-architecture/agents/openai.yaml`；已通过 `skill-creator` 的 `quick_validate.py` 校验。
- 源码反核对发现一个未在本步修产品的现有审计项：premium 同时存在原地字段写和整体替换，而当前 `usePremium()` 直接返回对象引用；新 skill 明确禁止把它当成安全 snapshot 模板，后续若处理 Premium 响应性应单独补缓存和回归测试。
- 只修改上下文治理文档与新 skill；未修改 `react/`、`www/`、`android/` 或任何产品代码，也未执行步骤 5 的 UI/交互系统整理。

## 步骤 5：Capacitor UI 与交互系统（已完成）

- 新增 `.agents/skills/capacitor-ui-system/SKILL.md`，按当前源码集中主题四入口、表面/elevation与按钮前景token、sheet/subpage/Popover/modal层级、焦点与滚动结构、债务/还款/图表重手势、edge-to-edge、overscroll、原生表单控件和pdf.js预览等WebView视觉约束。
- 用当前UI路由和少量业务摘要替换 `AGENTS.md` 里按修复日期叙述的edge-to-edge、Popover、flex、sheet、overscroll、focus、表面色板、首页视觉、导航重排和统计看板演进史；保留步骤6原生运行时、步骤7 Premium/统计领域尚待整理的内容。
- 反核对 `www/index.html` 主题token与z-index、`react/src/shared` primitives、`react/src/sheets/gripDrag.ts`、债务/还款/图表手势和 `MainActivity.java` 的WebView视觉配合；未修改任何产品源码。
- 新 skill 的标准元数据保存在 `.agents/skills/capacitor-ui-system/agents/openai.yaml`；步骤5只改文档与skill，不运行产品build或`cap sync`。

## 步骤 6：原生运行时与构建边界（已完成）

- 新增 `.agents/skills/capacitor-native-runtime/SKILL.md`，集中当前Capacitor生成/手写文件边界、四个Java类、手写与npm插件注册差异、`MainActivity`的WebView/返回职责、SAF大文件临时文件架构、本地通知manifest merge与排程、build→sync→Gradle工作流和原生验证面。
- 精简 `AGENTS.md` 的SaveFile、WeChat、Local Notifications、构建环境和单次代理故障长叙事，常驻层保留手写源码门禁、SAF不可回退规则、通知当前口径、JDK/SDK事实和专项skill路由。
- 校准 `wechat-login-setup`、`release-keystore`、`cloudbase-deploy` 的分工与当前事实；release工作流补上React build和JDK 21，`wxLogin`环境变量清单补齐`WX_APPID`/`WX_APPSECRET`及三项`TCB_CUSTOM_LOGIN_*`。
- 反核对 `capacitor.config.json`、package依赖、Android Gradle/manifest/四个Java类、Local Notifications插件manifest、合并manifest、`www/index.html`原生调用和`calc.js`通知排程；未修改任何产品源码或生成物。
- 新 skill 的标准元数据保存在 `.agents/skills/capacitor-native-runtime/agents/openai.yaml`；步骤6只改文档与skills，不运行产品build、`cap sync`或Gradle构建。

## 步骤 7：其余产品领域 skill（已完成）

- 新增 `.agents/skills/report-strategy-design/SKILL.md`，集中统计报告的数据口径、四条结论规则、压力/排行/类型图约束、Excel/PDF 导出边界，以及雪球/雪崩/自定义顺序的两轮资金池模拟；明确当前源码中 `StrategyCta` 仍实际执行 Premium 门禁，`simulateRepaymentOrder()` 返回 `null` 的算法含义是 600 个月未收敛。
- 新增 `.agents/skills/account-premium-design/SKILL.md`，集中登录/退出/本地重置/注销四条账户路径、单一 Premium 数据模型、¥15 买断占位、兑换码与调试入口、当前门禁消费者、结清庆祝邀请和会员协议双副本同步规则；既有 `usePremium()` 响应性审计项只作路由记录，未修改产品实现。
- 校准 `ai-advisor-design`：把旧“客户端每天20次软限”改成服务端按北京时间自然月 50 次、`aiUsage` 集合权威计数和本地 quota 缓存；保留当前 fail-open 降级、`hy3`、历史续聊、最近12条上下文、重试/建议/假流式等真实边界，删除按修复日期展开的长叙事。
- 校准 `cloud-backup-design`：确认完全手动多记录、五个云函数、20条/300MB/单文件8MB、服务端归属校验、整体覆盖恢复、注销联动清理和上传先于建档的孤儿文件边界，并把 Premium/账户/部署职责路由到各自 skill。
- 校准 `pay-tab-design`：改成当前“一行一期”、同日 Hero 聚合、7/15/30 天三卡与累计筛选、单表头列表；明确 `dueBucket()` 仍是纯 helper 但已不被当前 pay UI 用于分组。
- 校准 `edit-sheet-design`：集中 React 状态所有权、`oneTimeStash`、五种生成方式、0.015 保存容差、批量/日期/`required` 规则；纠正旧版 `#gFirstField` DOM 搬移为当前 React 条件渲染，并把生成算法历史去重到 `debt-domain`。
- 两个新 skill 的标准元数据保存在各自 `agents/openai.yaml`；六个 skill 均通过 `quick_validate.py`，旧口径/触发关键词和交叉路由核对、`git diff --check` 通过。步骤7未修改 `AGENTS.md` 或任何产品源码，未运行产品测试、build、`cap sync` 或原生构建。

## 步骤 8：`AGENTS.md` 常驻控制面（已完成）

- 将 `AGENTS.md` 从 286 行历史/现状混杂文档重写为 98 行常驻控制面，只保留开始任务前的读取规则、当前 Capacitor + React 架构、源码/生成物边界、8 条硬规则、6 个高频雷区、按改动范围选择的验证入口和完整 skill 路由。
- 移除 Premium/Premium+ 演进、按日期修复过程、已删除功能、单次真机验证和产品页面长叙事；这些内容不再每次加载，仍有效的领域知识已由步骤 2～7 迁入对应 skill，历史过程仍可从 git 与 `PROGRESS.md` 追溯。
- 纠正常驻层中的旧状态：当前多策略入口按源码归 `report-strategy-design` 的 Premium 门禁口径；AI 只写“服务端月额度”并路由到 `ai-advisor-design`，不再保留“每日软上限”描述；Flutter 明确为封存且 Flutter 阶段 9 从未开始。
- 复核 `.agents/skills/*/SKILL.md` 共 14 个：frontmatter 名称/触发范围均可被 `AGENTS.md` 路由覆盖，现有交叉引用均指向现存 skill，无需修改任何 skill 文件。
- 本步只修改 `AGENTS.md`、本文和本机 `PROGRESS.md`；未修改产品源码、未处理既有 `usePremium()` 响应性审计项，未运行产品测试、build、`cap sync` 或原生构建。

## 步骤 9：文档同步与总验收（已完成）

- 重写根 `README.md` 为面向人的当前产品说明：明确 Capacitor + React Android 是唯一产品主线，按 React/vanilla/calc/Android/CloudBase 的真实边界描述架构，去掉会漂移的常驻入口数量和已经删除的 `AGENTS.md` 章节链接，并把 Android SDK、Premium 权益、多策略门禁和 AI 服务端月额度同步到当前代码事实。
- 新增 `docs/flutter-parity/README.md` 作为 Flutter 历史文档的统一封存入口，记录 2026-08-10 停止命令、最终 WIP 提交/CI、280/104/43/3367 证据规模和 0 verified 的未完成事实；为阶段计划、8.1 WIP 交接、早期审计、早期视觉交接、Flutter 工程 README 和 parity 工具 README 增加醒目的封存/历史快照标识。
- 保持生成的 `docs/flutter-parity/matrix.md` 不手工修改；封存索引明确它只是最后一份 WIP 矩阵，不是完成证明。没有修改 Flutter 产品、parity 工具实现、旧版产品源码或任何生成物，也没有恢复阶段 8/8.1。
- 将 `AGENTS.md` 中容易与本上下文工程步骤 9 混淆的“阶段 9”统一写成“Flutter 阶段 9”；没有修改任何 skill，既有 `usePremium()` 响应性审计项仍保持未处理。
- 总验收确认 14 个实际 `SKILL.md` 的 frontmatter 名称与目录一致，且全部被 `AGENTS.md` 路由覆盖；步骤 9 文档集的 Markdown 相对链接无断链；旧 `debt-model-history` 只在迁移历史中保留，当前路由无残留；旧 Flutter“进行中”、Premium+、客户端每日 20 次、多策略免费和 Android 34 等口径不再出现在当前说明中。
- 全仓扩展扫描另发现已封存 Flutter 产品资产 `flutter/assets/legal/用户服务协议.md` 中的 `../../LICENSE` 按仓库路径无法解析；权威源稿 `docs/legal/用户服务协议.md` 中同一链接有效。本步按用户“不要修改产品源码、不要恢复 Flutter”的边界保留该产品资产原样，作为范围外既有发现报告，不将其误计为步骤 9 文档断链。
- 工作树差异全部属于本次上下文工程的 `AGENTS.md`、根 README、docs、`.agents/skills/**` 以及 Flutter 工程/工具 README；没有产品源码差异。新增/修改内容的敏感模式扫描只命中字段名和安全规则，没有发现账户标识、token、密钥或真实财务数据。步骤 9 只运行链接、关键词、路由、差异边界和 `git diff --check` 等文档验收，不运行产品测试、React build、`cap sync`、Gradle 或 Flutter 命令。

## 下一停点

上下文工程步骤 1～9 已全部完成，当前停止等待用户检查步骤 9；不自动开始任何新工作。步骤 9 验收时仍未处理的 `usePremium()` 响应性审计项，已在用户随后单独授权的产品修复中关闭；这不改变步骤 9 当时的文档范围。Flutter 重写和阶段 8/8.1 仍保持封存。
