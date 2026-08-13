# AGENTS.md

本文件是 After Zero 的常驻控制面，只记录每次任务都需要知道的当前事实、硬规则、验证入口和 skill 路由。面向人的项目介绍见 `README.md`；领域细节按任务读取 `.agents/skills/*/SKILL.md`，历史过程查 git 与本机 `PROGRESS.md`。

## 开始任务前

- 如果根目录存在 `PROGRESS.md`，先读最近一个自然日的全部记录；不要默认从头读取。先用 `rg -n '^## 20' PROGRESS.md | tail -20` 定位最近日期，内容很短时再向前带一天。
- 保留用户工作树中的既有改动。先看 `git status --short`，不要覆盖、回滚或顺手整理无关文件。
- `.agents/skills/` 是项目 skill 的唯一来源；不维护 `.claude/skills/` 副本。任务命中下方路由时，先完整读取相应 `SKILL.md`，需要时组合多个 skill。
- 文档与实现冲突时，以用户当前指令和当前代码为准；`PROGRESS.md` 只记录本机当前停点，稳定结论应落在本文件或对应 skill。

## 进行中的 iOS 扩展计划

- iOS 步骤 2 已通过检查；步骤 3“Apple 登录与统一内部账户端到端闭环”云端已部署，仍差 iPhone 真机验收。用户已明确允许步骤 4、5、6 在此前停点未解除时先行实施：步骤 4 等微信审核、官方 iOS SDK 接入与真机验收；步骤 5 文件代码与本机构建已完成；步骤 6 通知代码与本地验证已完成。步骤 3～6 均等待集中真机验收；不能据此进入步骤 7。权威计划为 `docs/ios/implementation-plan.md`，准确恢复动作见 `docs/ios/handoff.md`。
- 该计划严格逐步执行：每一步必须完成本步的代码、测试、原生/云端验证和相关文档后停止等待用户检查；用户批准后仍不得自动进入下一步，必须再次收到明确开工指令。
- 计划期间未经用户改变指令不得暂存、提交、推送或创建 PR。新 session 涉及 iOS 计划时，先完整读取交接和当前步骤；没有明确批准只讨论，不实施。
- 根 `ios/` 已是可编译、可在模拟器冷启动的 Capacitor 8.4.1 Swift Package Manager 原生壳；Apple 登录云端已部署、iOS `SaveFile` 与本地通知代码均已实现并通过本机构建，但都尚未真机验收；微信、购买和上架仍未实现，不能把原生壳误写成可发布 iOS 产品。Flutter 继续封存。

## 当前产品与架构

After Zero 当前产品主线是 **Capacitor + React**：Android App 是当前可用、可发布产品；iOS 已建立可运行原生壳，功能适配仍按计划逐步进行。

- `react/src/**`：四个主 tab、subpage、sheet 和 React 侧状态。Vite 使用 `debts`、`pay`、`report`、`mine`、`sheets` 五个入口。
- `www/index.html`：唯一 Web 宿主，保留全局 CSS、tabbar、登录门、共享确认框、隐藏导入 input、localStorage/IndexedDB、CloudBase、原生插件与文件 I/O 等 impure 编排。
- `www/js/calc.js`：Debt/PlanRow 的计算、账本变换、聚合和模拟算法权威；浏览器作为 classic script 使用，Node 通过 CommonJS 导出运行 `test/calc.test.js`。
- `window.__azBridge`：vanilla 向 React 暴露数据和 impure 操作的窄边界。运行时形状、`react/src/types.ts` 的 `AzBridge`、`react/__tests__/mockBridge.ts` 必须同步。
- `cloudbase/functions/**`：独立服务端单元，不进入 APK，也不由 Capacitor sync 自动部署。
- 根 `android/`：当前 Capacitor 原生工程，混合项目维护源码与生成接线；不是可以整体重建后丢弃的目录。
- 根 `ios/`：Capacitor 8.4.1 iOS 原生工程，最低 iOS 15，通过 `ios/App/CapApp-SPM/Package.swift` 接入 Capacitor 与 Local Notifications；手写 `AppleLoginPlugin` 由 `AfterZeroBridgeViewController` 注册；`npx cap add ios` 已执行且不得重复重建。

`flutter/` 是已停止并封存的重写成果。Flutter 阶段 8 未完成，Flutter 阶段 9 从未开始。除非用户在当前任务中明确重新授权，不得修改 Flutter 产品、parity 工具或相关历史文档，不得恢复阶段 8.1、继续 8.2–8.10 或开始 Flutter 阶段 9；普通产品需求只处理当前 Capacitor + React 主线。需要检查或恢复该路线时必须加载 `flutter-rewrite-parity`。

## 源码与生成物边界

- 修改 `react/src/**` 后先运行 `npm run build:react`，生成 gitignored 的 `www/js/react-debts/**`；不要直接编辑该目录。
- Web 内容要进入原生 assets 时运行对应的 `npx cap sync android` / `npx cap sync ios`。不要直接编辑 `android/app/src/main/assets/public/**` 或 `ios/App/App/public/**`。
- `android/capacitor.settings.gradle` 与 `android/app/capacitor.build.gradle` 是生成接线；不要手写修改。
- 根 Android 工程中需要长期维护的内容包括 `MainActivity`、`SaveFilePlugin`、`WeChatLoginPlugin`、`wxapi/WXEntryActivity`、主 manifest、非生成 Gradle 配置和手写资源。具体边界以 `capacitor-native-runtime` 为准。
- iOS 长期源码包括 Xcode 工程、`AppDelegate.swift`、`AppleLoginPlugin.swift`、`AfterZeroBridgeViewController.swift`、`App.entitlements`、`Info.plist`、storyboard 和 asset catalog；`ios/App/App/capacitor.config.json`、`config.xml`、`public/`、Pods/build/DerivedData 和用户签名数据均为生成或本机内容，不提交。
- `resources/` 是 App 图标设计源；`android/app/src/main/res/mipmap-*` 是生成结果。重新生成图标后要按原生 skill 核对自适应图标 background inset。
- CloudBase 函数必须单独部署；任何密钥、AppSecret、私钥或环境专属配置只能放受控环境变量/本机忽略文件，不能提交进仓库。

## 硬规则

1. **持久化键名不可改、不可复用、不可合并。** 当前受保护键为：`debt-manager-v5`、`debt-manager-docs-v5`、`after-zero-account-v1`、`debt-manager-sort-v1`、`after-zero-notify-v1`、`after-zero-premium-v1`、`after-zero-simulate-v1`、`after-zero-backup-meta-v1`、`after-zero-ai-usage-v1`、`after-zero-ai-chatlog-v1`、`after-zero-ai-limit-notice-v1`。需要演进数据形状时做兼容迁移，不能用改 key 的方式清空旧数据。
2. **新安装必须为空数据。** `SEED` 与 `DOCS_SEED` 保持空值；测试数据只放测试/临时环境。提交前检查真实姓名、金额、日期、openid、token、档案和个人财务描述等隐私内容，不能只搜 seed 常量。
3. **App 身份与恢复策略不可随意改。** `io.github.jenkjyu.afterzero` 是包名、更新、微信回调和签名身份；manifest 保持 `android:allowBackup="false"`，否则卸载重装可能恢复旧数据。`INTERNET` 权限已被 CloudBase/微信登录使用，不能删除。
4. **本地优先与云功能 fail-closed。** `#loginGate` 默认隐藏，仅由本地模式进入 AI、云备份或账户主动登录时按需打开；iOS 只展示 Apple、Android 只展示微信，取消后必须回到原页面继续本地使用。AI、云备份、注销等 CloudBase 执行层必须拒绝无 `ACCOUNT_KEY` 的调用，不能以匿名会话绕过；只有用户主动发起的登录换票据流程可按专项 skill 使用匿名垫底。
5. **账本只有一份实现。** 财务变换复用 `www/js/calc.js` 中已测试函数；`plan` 是账本权威，派生字段由 `recompute()` 计算，不在 React、bridge、导出或云端另写一套算法。
6. **release keystore 是长期身份材料。** 不提交、不移动、不重建替换；一旦正式发布后丢失，将无法用同一身份更新 App。release 构建必须加载 `release-keystore`。
7. **License 是 PolyForm Noncommercial 1.0.0。** 修改 `LICENSE`、`package.json` license 或 README 许可说明前，必须确认非商业授权前提确实改变。
8. **Flutter 暂停门禁优先。** 加载 Flutter skill 只提供上下文，不等于获得恢复或 Flutter 阶段 9 授权。

## 高频实现雷区

- `useSyncExternalStore` 的 snapshot 引用必须稳定；测试 mock 也不能让 getter 每次返回新的数组/对象。具体缓存模式见 `react-bridge-architecture`。
- 删除或替换宿主 DOM id 时，同时搜索 `www/index.html` 的顶层事件绑定；对 `null` 调 `addEventListener` 会让 IIFE 初始化、bridge 和整站一起中断。
- sheet/subpage 的视觉顺序与硬件返回检查顺序相反：同 z-index 下 JSX 后渲染者在上，返回链要先关闭最上层。跨树状态、反向 back hook 和类型声明必须一起核对。
- 拖拽、左滑、图表触摸等会接管滚动的连续手势沿用原生 Touch Events 与 `{passive:false}`；不要无依据改成 React 合成事件或纯 Pointer Events。
- `SaveFilePlugin` 的 SAF 保存使用 cache 临时文件与 64 KB 流式复制；不要退回让大 base64 跨 Activity/Binder 边界。
- 桌面浏览器伪造 account 只能绕过 UI 登录门，不能验证需要真实微信自定义会话的 CloudBase 往返；登录、备份、AI 和真实通知按专项 skill 在 Android/真机验证。

## 验证入口

按改动范围选择最小充分验证；不要为纯文档改动刷新生成物。

```bash
# calc.js / 债务纯计算
npm test

# React 页面、状态、bridge 或 UI
npm run test:react
npx tsc --noEmit --project react/tsconfig.json
npm run build:react

# Web 产物需要打进 Android
npx cap sync android

# Web 产物需要打进 iOS
npx cap sync ios

# iOS 模拟器构建（设备 id 按本机替换）
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,id=<device-id>' \
  CODE_SIGNING_ALLOWED=NO build

# debug APK（在 android/ 下）
JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew :app:assembleDebug --no-daemon --console=plain

# 文档与全部改动
git diff --check
```

Debug APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。微信登录必须使用已注册签名的 release 包；CloudBase 函数用部署 skill 的命令和服务端日志验证。只改文档/skill 时做链接、关键词、路由和 `git diff --check`，不运行产品 build、sync 或 Gradle。

## Skill 路由

| 任务范围 | 必须加载 |
|---|---|
| Debt、PlanRow、`calc.js`、计划生成、金额/APR/账本、结清、通知计算输入、提前还款或多债务模拟 | `debt-domain` |
| `react/src/**`、共享状态、AzBridge、挂载入口、跨树导航、外部 store、硬件返回链、Vite 多入口 | `react-bridge-architecture` |
| 主题/CSS、卡片按钮、sheet/subpage/popover/modal、动画、焦点、手势、图表触摸、safe area、WebView 视觉 | `capacitor-ui-system` |
| 新增/编辑债务表单、公式生成、one-time 状态、批量编辑、计划行校验 | `edit-sheet-design`，涉及数值时再加 `debt-domain` |
| “还款日”tab、逐期列表、同日 Hero、7/15/30 天筛选、急迫色、左滑“销这期” | `pay-tab-design` |
| 统计/报告、findings、指标/图表、Excel/PDF 导出、多策略对比 | `report-strategy-design`；改算法再加 `debt-domain` |
| 账户生命周期、退出/重置/注销、Premium、兑换码、价格/购买占位、结清邀请、会员协议双副本 | `account-premium-design` |
| AI 助手、`aiAdvisor`、服务端月额度、会话/提示词/模型/重试/历史 | `ai-advisor-design` |
| 云备份 UI/bridge、`backups`/Storage、配额、恢复/删除归属、五个备份函数 | `cloud-backup-design` |
| 根 `android/` 或 `ios/`、Capacitor sync、Java/Swift 插件、manifest/plist/resource、本地通知、文件保存、WebView/原生边界、debug APK/模拟器构建 | `capacitor-native-runtime` |
| 微信 SDK、`WXEntryActivity`、`wxLogin`、匿名垫底、自定义登录票据 | `wechat-login-setup`，并按任务叠加原生/部署/签名 skill |
| CloudBase 函数部署、依赖、`cloudbaserc.json`、环境变量或权限控制 | `cloudbase-deploy` |
| release APK、keystore、SHA1、`assembleRelease` | `release-keystore`，先按 `capacitor-native-runtime` 确认构建边界 |
| 已暂停 Flutter 重写、旧版对齐审计、阶段 8/8.1 证据工具、`docs/flutter-parity*` | `flutter-rewrite-parity`；仅在用户当前任务明确要求时触发 |

专项 skill 只补充各自领域，不覆盖本文件硬规则。一个任务跨越架构、UI、领域和原生边界时组合加载，不要把同一规则复制回多个文档。
