# After Zero iOS 主线滚动交接

更新时间：2026-08-12

总计划：[`implementation-plan.md`](implementation-plan.md)

## 当前控制状态

- 当前步骤：步骤 2“本地优先模式与云功能登录门”
- 当前状态：等待用户检查
- 上一步：步骤 1 已批准
- 下一步骤：步骤 3“Apple 登录与统一内部账户端到端闭环”
- 下一步骤授权：未授权，严禁开始
- Git 操作：未暂存、未提交、未推送；未经用户改变指令，后续各步也不得执行这些操作
- Flutter：继续停止并封存；本计划只处理根 Capacitor + React 主线

## 用户已确认的长期决策

1. App 允许先本地使用，登录推迟到 AI、云备份等真实云功能。
2. Apple 登录可以独立创建和使用完整云账号，不强制再验证微信。
3. Apple 与微信绑定只是为同一个 After Zero 云账号增加登录方式；只在绑定/合并那一次验证双方身份。
4. Android/iOS 本地债务数据不会因登录或绑定自动合并、同步、上传、下载或覆盖。
5. 同一账号可在两端同时登录，两端保留各自本地数据；云备份只在用户主动创建时上传，恢复只在用户主动确认时覆盖当前设备。
6. 若 Apple 和微信各自已经形成云账号，绑定时合并云端账户归属并保留双方备份；不触碰两端当前本地账本。
7. 执行必须逐步进行；同一端到端任务不得拆成前后两个步骤。每步完成代码、测试、部署/真机验证、相关项目文档和本交接后停止等待用户检查。
8. 用户批准上一步后仍不得自动进入下一步；必须再次收到明确的“开始下一步”指令。
9. 不执行 git 提交。

## 当前仓库与环境事实

- 当前可发布产品仍是 Capacitor + React Android App；根 `ios/` 已是可编译、可在模拟器冷启动的 Capacitor 原生壳，尚不是功能完整或可发布 iOS 产品。
- `@capacitor/core`、CLI、Android、iOS 当前均为 `8.4.1`；Local Notifications 为 `8.2.1`。
- Node.js `v24.15.0`、npm `11.12.1`，满足当前 Capacitor CLI Node `>=22` 要求。
- 本机已安装并选择 Xcode `26.6`（build `17F113`），Xcode 许可已由用户本人接受；已安装 iOS `26.5` Simulator Runtime。
- CocoaPods 已按用户要求卸载；当前不安装也不使用。iOS 工程只使用 Swift Package Manager，未来只有原生依赖明确不支持 SPM 时才按需安装 CocoaPods。
- `Package.resolved` 将 `capacitor-swift-pm` 固定为 `8.4.1`。不提交 Pods、DerivedData、构建目录、用户签名数据或同步后的 Web assets。
- 当前通知计算未来 6 个月，Android 最多提交 450 条。计划中的 iOS 策略是最多 63 条正式提醒，为测试通知保留一个槽位；尚未实现。
- 当前 Android 有四个手写 Java 类；iOS 主要需要 Swift 文件保存插件、微信登录插件及 App 回调/配置，不机械复制四个类。
- 当前云端把微信 `openid` 同时当作 CloudBase `customUserId` 和通用归属。步骤 3 才会建立 provider-neutral 内部 `userId`；尚未实现。
- 当前 Premium 是本地状态和买断占位，尚无 StoreKit 或可信服务端购买权益。步骤 8 才会闭环；不能把当前本地 Premium 描述成跨设备账号权益。

## 步骤 0 本轮变更

- 新增 `docs/ios/implementation-plan.md`：11 个原子步骤、批准门禁、每步范围和验收门槛。
- 新增本文：保存跨 session 的准确停点、决定、环境事实和下一步授权状态。
- `AGENTS.md` 新增进行中 iOS 计划入口与门禁。
- `README.md` 新增“iOS 扩展（仅计划）”入口，不宣称 iOS 已支持。
- `PROGRESS.md` 记录本机停点。
- 未修改 `react/`、`www/`、`android/`、`cloudbase/`、`flutter/`、依赖或生成物。

## 步骤 0 验证

- Markdown 相对链接检查通过：`AGENTS.md`、`README.md` 和两份 iOS 文档共 4 个入口文件无断链。
- 状态/门禁关键词检查通过：计划与交接一致写明步骤 0 等待检查、步骤 1 未授权、不得自动进入下一步、不得提交。
- `git diff --check` 通过。
- `git status --short` 的 tracked/untracked 变更仅为 `AGENTS.md`、`README.md` 和新增 `docs/ios/**`；`PROGRESS.md` 已按本机忽略规则更新，不出现在 git 状态中。
- 没有修改产品源码、依赖、生成物、原生工程、CloudBase 或 Flutter。
- 纯计划文档步骤，不运行产品测试、React build、Capacitor sync、Gradle、Xcode 或 Flutter 命令。

## 当前停点与恢复动作

步骤 2 已达到验收门槛并停止等待用户检查。用户若检查通过，步骤 2 才可标为“已批准”；步骤 3“Apple 登录与统一内部账户端到端闭环”仍未授权，必须再次明确指示开始。当前仅有 Android 微信原生登录；iOS Apple、微信、身份绑定和内部 `userId` 都还没有实现。

## 步骤 1 本轮变更

- `package.json`、`package-lock.json` 新增 `@capacitor/ios@8.4.1`，未升级现有 Capacitor 依赖。
- 通过一次 `npx cap add ios` 建立根 `ios/`；Bundle ID `io.github.jenkjyu.afterzero`、App 名 `After Zero`、最低 iOS 15，使用 Swift Package Manager 接入 Capacitor 8.4.1 和 Local Notifications。
- 用现有 `resources/icon-only.png` 生成 1024×1024 iOS AppIcon 与基础启动图；没有修改 Android 图标源或生成物。
- `ios/.gitignore` 排除 Web 同步资产、配置生成物、Pods、build、DerivedData 和 `xcuserdata`；`Package.resolved` 留在版本控制范围以固定远程 Swift package。
- `www/index.html` 只在 Android 调用 Android 专属 `LocalNotifications.createChannel()`，消除 iOS 启动的 `UNIMPLEMENTED` 错误；未改提醒计算、权限、数量或数据形状。
- `AGENTS.md`、README、`capacitor-native-runtime` skill 和界面元数据已同步 Android/iOS 双平台源码、生成物和构建边界。

## 步骤 1 验证证据

- 工具链：Xcode 26.6、iOS 26.5 Runtime；Node 24.15.0、npm 11.12.1。CocoaPods 已卸载，SPM-only 的 sync/build 复验通过。
- 依赖：`npm ls` 确认 core/CLI/Android/iOS 均为 8.4.1，Local Notifications 为 8.2.1。
- Web/测试：`npm test` 116/116；`npm run test:react` 44 文件、356/356；TypeScript 无错误；`npm run build:react` 成功。
- 同步：`npx cap sync ios`、`npx cap sync android` 成功；两端都识别 Local Notifications 8.2.1。
- iOS：iPhone 17 Pro / iOS 26.5 模拟器无签名 Debug 构建成功，安装与冷启动成功；控制台有 `WebView loaded`，平台保护后无 error，截图确认原登录门和项目图标正常渲染。
- Android：JDK 21 `:app:assembleDebug` 成功，APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。
- skill：`quick_validate.py` 通过。

## 明确留给后续步骤的范围

- 步骤 2：移除启动强制登录、建立本地优先和云功能登录门。
- 步骤 3～4：Apple 登录、iOS 微信登录、统一内部账户和身份绑定/合并。
- 步骤 5～10：iOS 文件、完整通知、UI 适配、StoreKit、签名合规和上架。当前原生壳成功不代表这些能力已支持。
- `npm install` 报告现有依赖树有 2 个 moderate、3 个 high 漏洞；本步骤不运行可能升级依赖或改变行为的 `npm audit fix`，留作独立审计任务。

## 步骤 1 检查后修正

- 用户确认当前依赖均支持 SPM 后要求卸载 CocoaPods。已执行 `brew uninstall cocoapods`；Homebrew 同时移除仅由它使用的 Ruby 4.0.6 和 libyaml 0.2.5。
- 计划和 README 已修正为 SPM-first：不预装 CocoaPods，需要只支持 Pod 的实际依赖时再安装。
- Android 通知频道只在 `Capacitor.getPlatform() === "android"` 时创建。iOS 不再收到自己不支持的 `createChannel` 命令，冷启动控制台不再出现 `UNIMPLEMENTED`。

## 步骤 2 本轮变更

- `www/index.html` 将 `#loginGate` 从启动强制门改为按需、可取消的云功能登录表面：未登录首屏直接显示空白本地账本；AI、云备份或账户页主动登录时才说明对应云端用途。取消、失败和硬件返回都会关闭提示并保留原页面。
- AI 与云备份在 React 入口调用 `requestCloudLogin(purpose)`，已登录时直接进入；未登录取消后不打开受保护 screen。`callAiAdvisor()`、备份列表/创建/恢复/删除与注销执行层也独立拒绝无账户调用，不会为本地模式建立匿名 CloudBase 会话或发出受保护请求。
- 保留 `after-zero-account-v1` 和全部既有持久化键；旧微信账户继续按既有形状读取。账户展示明确区分“本地使用 / 微信登录 / 未来 Apple 登录或统一账号形状”，但未添加不可用的 Apple 入口，也未实现步骤 3 的 `userId`、Apple token 或云函数改造。
- 账户生命周期重新表述：退出只结束云会话；注销只删除云账号和云备份、保留本机数据；重置本地数据是独立二次确认操作，不删除云账号或云备份。登录、退出或注销都不会自动上传、下载、同步、合并或覆盖本地账本。
- 同步用户服务协议、隐私政策及 App 内副本；README、AGENTS 和 React bridge/account/AI/备份/微信专项 skills 已改为本地优先与执行层 fail-closed 规则。

## 步骤 2 验证证据

- React：`npm run test:react` 45 个文件、361/361 通过；新增本地模式、AI/云备份按需登录取消、账户三态及重置/注销分离的覆盖。
- 类型与构建：`npx tsc --noEmit --project react/tsconfig.json`、`npm run build:react` 通过；`npm test` 116/116 通过。
- 浏览器运行时：以无账户状态实际加载 Web 宿主，首屏直接显示空本地账本；启用测试 Premium 后，AI 与云备份均打开含明确用途的登录提示，点击“继续本地使用”后提示消失、受保护 screen 不打开、原 tab 保持可用；浏览器控制台无 error。
- 原生：`npx cap sync android`、`npx cap sync ios` 通过；JDK 21 `:app:assembleDebug` 通过；iPhone 17 Pro / iOS 26.5 无签名 Debug `xcodebuild`、安装和冷启动通过（bundle id `io.github.jenkjyu.afterzero`）。
- 此步未修改 CloudBase 函数或权限，故不部署云函数；真实微信 OAuth 仍必须以登记签名的 Android release 包验证，iOS 微信登录属于步骤 4，Apple 登录属于步骤 3。
- `git diff --check` 通过；未暂存、未提交、未推送；未修改 Flutter 或直接编辑生成 Web assets。

## 明确留给后续步骤的范围

- 步骤 3：Apple 登录、provider-neutral 内部 `userId`、旧微信账户兼容映射和相关云函数部署/真机验证。
- 步骤 4：iOS 微信 SDK、身份绑定与两个既有云账号合并。
- 步骤 5～10：iOS 文件、完整通知、UI 适配、StoreKit、签名合规和上架。当前按需登录表面不代表 iOS 已支持任一原生登录方式。
