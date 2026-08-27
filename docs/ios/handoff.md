# After Zero iOS 主线滚动交接

更新时间：2026-08-27

总计划：[`implementation-plan.md`](implementation-plan.md)

## 当前控制状态

- 当前发布停点：步骤 9“签名、隐私、合规与 TestFlight 发布候选”已完成；步骤 10“iOS 总回归、Android 内测冒烟与 App Store 首次提交”已完成。首次 App Review 因 Guideline 2.1 App Completeness 要求补充资料，账号持有人已在审核沟通中附上实体 iPhone 录屏并回复，当前等待 Apple 后续处理；尚未公开上架。步骤 3、5、6、7 的 iOS 验收已完成。
- 当前状态：步骤 3、5、6、7 的 iPhone 集中验收已通过。步骤 4 的微信开放平台审核、官方 iOS SDK、CloudBase 函数/私有集合和 iPhone Apple→微信绑定均已通过；其余账户组合及合并后备份可见性按用户决定延后到上架后。步骤 8 的剩余 StoreKit 真机生命周期验收也延后到上架后，不再阻塞当前发布。AI 识图已完成真实样本识别率与成本验证。步骤 10 的本地基线、Android Release、iOS Release 分发导出、总回归证据和 App Store 首次提交均已完成。公安平台主体与 After Zero APP 已提交，等待审核；Android 回归改列内部测试，不阻塞 iOS 发布。
- 上一步：步骤 2 已批准
- 当前恢复动作：`1.0.0 (4)` 已完成 App Store Connect 处理、App Store 版本关联、App Privacy/发布资料填写和 TestFlight 安装回归；公网页面已通过 Netlify 上线，`afterzero.tech` DNS 已验证。AI 识图 `1.0.0 (9)` 已完成真实样本识别率与成本验证。当前源码已将 App 内版本修正为 `1.0.0`，在“关于我们”底部增加可点击的 APP 备案编号 `粤ICP备2026116914号-1A`；最新 `1.0.0 (12)` 已完成 Release Archive、Apple Distribution 导出并上传 App Store Connect。首次审核被 Apple 以 Guideline 2.1 App Completeness 要求补充信息后，账号持有人已回复并附上实体 iPhone 录屏，当前等待 Apple 后续处理；该沟通不等于新的审核提交或公开上架。公安平台已录入主体和 After Zero APP；Support URL 继续使用 `https://afterzero.tech/support.html`，不因 Apple 要求而单独新增公安备案。步骤 4/8 剩余小项延后到上架后。
- 下一步骤授权：用户已于 2026-08-22 明确授权开始步骤 10，并确认本机 CoreDevice 不可用不再作为新增真机回归阻塞；步骤 10 已完成并已提交审核。当前等待 Apple 审核结果，不能据此宣称已公开上架。
- Git 操作：用户已于 2026-08-22 明确授权本次进度文档 `git commit` 和 `git push`；本次不创建 PR，App 审核提交已由用户在 App Store Connect 手动完成。此前各阶段的 Git 操作授权仍以当时记录为准。
- Flutter：继续停止并封存；本计划只处理根 Capacitor + React 主线

## 2026-08-27：外部审核与公安 APP 备案交接

- Apple App Review：`1.0.0` 首次审核因 Guideline 2.1 App Completeness 要求补充审核资料。账号持有人已在 App Review 页面回复，并附上实体 iPhone 的启动及主要用户流程录屏；当前等待 Apple 后续处理，不自动重新提交、不公开上架。
- 公安平台：个人主体申请和 After Zero APP 已提交/录入“管理 APP”；APP 类型为“计算机应用类 G / 应用工具类 G4”。APP 页的“相关前置许可”应为“否”，不因使用 AI 自动勾选“人工智能技术/算法”。主体页的“是否利用生成式人工智能”应如实填写“是”；若此前申请仍处于待审核且该项填错，优先按平台允许的撤销/补正流程处理。
- 技术支持网址：`https://afterzero.tech/support.html` 为 Apple Support URL 的静态页面，目前通过 Netlify 提供；Apple 要求该页面可访问，不会因填写 Support URL 自动产生一项新的公安联网备案。若未来迁移至中国大陆托管并作为独立网站运营，再单独评估 ICP 和公安联网备案。
- 当前动作：等待 Apple 审核沟通和公安平台审核；不新增构建、不自动重新提交 App Review、不修改代码。上架后的 StoreKit 完整生命周期、账户组合/合并后备份可见性和 Android 内测回归仍按既定交接延后。

## 用户已确认的长期决策

1. App 允许先本地使用，登录推迟到 AI、云备份等真实云功能。
2. Apple 登录可以独立创建和使用完整云账号，不强制再验证微信。
3. Apple 与微信绑定只是为同一个 After Zero 云账号增加登录方式；只在绑定/合并那一次验证双方身份。
4. Android/iOS 本地债务数据不会因登录或绑定自动合并、同步、上传、下载或覆盖。
5. 同一账号可在两端同时登录，两端保留各自本地数据；云备份只在用户主动创建时上传，恢复只在用户主动确认时覆盖当前设备。
6. 若 Apple 和微信各自已经形成云账号，绑定时合并云端账户归属并保留双方备份；不触碰两端当前本地账本。
7. 执行必须逐步进行；同一端到端任务不得拆成前后两个步骤。每步完成代码、测试、部署/真机验证、相关项目文档和本交接后停止等待用户检查。
8. 用户批准上一步后仍不得自动进入下一步；必须再次收到明确的“开始下一步”指令。用户已单次例外授权在步骤 3、4 停点未解除时提前实施步骤 5，并于 2026-08-13 明确授权提前实现步骤 6、步骤 7；这些例外都不授权步骤 8 或后续范围，步骤 3～7 仍需真机验收后才能改变状态。
9. 除用户于 2026-08-13 明确要求的步骤 3/4 提交和本次步骤 7 提交/推送外，不执行 git 操作。
10. 步骤 8 产品决策：仅 iOS 首发；每个登录身份首次服务端确认后赠送一次 7 天完整 Premium 会员体验，注销/重装/重新登录不重复赠送；体验结束后一次性买断价为人民币 28 元；每次在线服务端确认后可离线使用 3 天；旧用户不作免费升级，需重新购买。
11. 平台优先级：iOS 是正式发布主线；Android 仅供内部测试，不承诺 Google Play 发布。Android 回归不再阻塞 iOS 步骤完成、TestFlight 或 App Store；共享代码仍做基础构建验证，Android 原生改动或发放内测包前再做针对性 Android 回归。

> 本条优先级覆盖本文后续历史记录中所有“Android 回归阻塞 iOS 步骤”的旧表述；这些旧表述保留为当时事实，不再是当前门禁。

## 当前仓库与环境事实

- 当前正式发布目标是 Capacitor + React iOS App；根 `ios/` 已可编译、可在 iPhone 运行，步骤 9 的 App Store Connect 配置与 TestFlight 回归已完成，AI 识图真实样本识别率与成本已验证。步骤 10 的本地 Release 候选、总回归证据和 App Store 首次提交已完成，当前等待 Apple 审核；步骤 4/8 剩余小项延后到上架后。仍不能视为已公开上架的 iOS 产品。Android 保留为内部测试包。
- `@capacitor/core`、CLI、Android、iOS 当前均为 `8.4.1`；Local Notifications 为 `8.2.1`。
- Node.js `v24.15.0`、npm `11.12.1`，满足当前 Capacitor CLI Node `>=22` 要求。
- 本机已安装并选择 Xcode `26.6`（build `17F113`），Xcode 许可已由用户本人接受；已安装 iOS `26.5` Simulator Runtime。
- CocoaPods 已按用户要求卸载；当前不安装也不使用。iOS 工程只使用 Swift Package Manager，未来只有原生依赖明确不支持 SPM 时才按需安装 CocoaPods。
- `Package.resolved` 将 `capacitor-swift-pm` 固定为 `8.4.1`。不提交 Pods、DerivedData、构建目录、用户签名数据或同步后的 Web assets。
- 当前通知计算未来 6 个月：Android 最多提交 450 条，iOS 最多提交 63 条正式提醒并为测试通知保留一个槽位。iOS 配置已启用前台 sound/banner/list，正式/测试通知均不发送 Android 专属字段；iPhone 真机已验收，Android 仍待回归。
- 当前 Android 有四个手写 Java 类；iOS 已新增 `AppleLoginPlugin.swift`、`WeChatLoginPlugin.swift`、`SaveFilePlugin.swift` 与 `AfterZeroBridgeViewController.swift`，以后仍按能力逐项实现，不机械复制 Android 四个类。
- 步骤 3 已建立 provider-neutral 内部 `userId` 与 `identities` 映射：旧微信用户惰性保持 `userId === openid`，Apple 新用户使用随机内部 id。相关 CloudBase 函数已部署，`identities` 与 `appleLoginNonces` 已创建为 ADMINONLY；iPhone Apple 真机闭环已通过，仍不能以此替代 Android 旧微信账号回归。
- 当前 Premium 已有 StoreKit 2 客户端和 CloudBase 服务端权益验证；`premiumEntitlement` 与 App Store Server Notifications 接收器均已部署。真实购买、恢复、换机及退款/撤销的剩余验收按用户决定延后到上架后，不作为当前发布阻塞；仍不能据此描述为已完成上架后的全生命周期验收。

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

用户已确认步骤 2 检查通过并授权开始步骤 3。自定义登录凭据已轮换、旧凭据已停用，Apple App ID/Sign in with Apple 已配置，相关函数和权限已部署；但本机没有可用于验收的 iPhone，步骤 3 仍必须等待真实 Apple ID 真机端到端验证。用户随后明确允许步骤 4 在步骤 3 真机验收前先行实施；当时不得进入步骤 5，后续的步骤 5 例外授权见本文末尾。

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
- 当时留给后续的步骤 5～10：iOS 文件、完整通知、UI 适配、StoreKit、签名合规和上架。当前原生壳成功不代表这些能力已支持；步骤 5 的后续例外授权见本文末尾。
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

## 步骤 3 本地变更

- iOS 新增 `AppleLoginPlugin`，使用 `AuthenticationServices` 发起登录，以安全随机数生成 raw nonce/state，传给 Apple 的 nonce 为 SHA-256，并校验回调 state；`AfterZeroBridgeViewController` 显式注册插件，Xcode target 加入 Sign in with Apple entitlement。
- Web 登录门按平台展示 Apple 或微信入口；`after-zero-account-v1` 键名不变，旧微信展示资料惰性迁移为 provider-neutral 形状。账户页不再要求头像，支持显示 Apple 邮箱。
- 新增 `appleLogin` 云函数：校验 Apple JWKS 签名、issuer、audience、有效期和 nonce；以事务创建内部账户/身份映射并一次性消费 nonce，再签发 CloudBase 自定义登录票据。客户端传入的 `sub` 不参与信任决策。
- `wxLogin` 在保持旧用户 `userId === openid` 的前提下惰性补齐 `identities` 映射。AI 用量、云备份和注销改用内部 `userId`，读取时兼容旧 `openid` 字段。
- 没有实施 iOS 微信 SDK、身份绑定或两个既有账户合并；这些仍属于步骤 4。

## 步骤 3 已完成的本地验证

- Apple token/replay 单测覆盖有效 token、伪造签名、过期、错误 audience/issuer/nonce 和重复使用 nonce；`npm test` 共 123/123 通过。
- React 测试 45 文件 362/362 通过；TypeScript、React build、Android/iOS Capacitor sync、Android debug APK、iOS 无签名模拟器 build 全部通过。
- iPhone 17 Pro / iOS 26.5 模拟器安装与冷启动成功，截图确认本地空账本正常渲染；模拟器不能替代真实 Apple ID 登录验收。
- 七个同步更新的项目 skills 均通过 `quick_validate.py`；`git diff --check` 通过。
- 未部署任何 CloudBase 函数或权限，未暂存、提交、推送，未修改 Flutter。

## 步骤 3 当前阻塞与恢复动作

1. 借用或连接一台 iPhone，使用真实 Apple ID 完成首次登录、冷启动恢复、AI、云备份、退出/重登、注销；再回归旧微信账号及 Android 云功能。
2. 记录真机证据后，步骤 3 才可改为“等待用户检查”。

## 步骤 4 本轮进展与剩余验收

- 用户已明确允许在步骤 3 真机验收前先做步骤 4；这是当时对原逐步顺序的单次授权，后续步骤 5 的独立例外授权见本文末尾。
- 微信开放平台 iOS 审核已通过；iPhone Bundle ID 为 `io.github.jenkjyu.afterzero`，Universal Link 为 `https://afterzero.tech/wechat/`。iOS 手动接入官方 OpenSDK 2.0.7 静态库及隐私清单，配置 URL Scheme、Associated Domains、Swift `WeChatLoginPlugin` 和冷启动回调 state 恢复；未引入 CocoaPods 或客户端 AppSecret。
- 账户页已提供“绑定 Apple / 绑定微信”。绑定时强制当前身份和待绑定身份分别完成真实授权；发生既有账号冲突时才显示明确确认，合并只迁移云备份归属和 AI 月度用量，不触碰本机账本。
- 新增 `accountBinding` 云函数基础、合并事务和回归测试；合并后来源账号标记 `mergedInto`，AI/备份/注销等受保护函数拒绝旧会话，微信再次登录会换到目标内部 `userId`，避免云数据继续分叉。函数已部署；`accountBindingIntents`、`accountMerges` 已创建并设为 ADMINONLY，空身份调用实测返回 `LOGIN_REQUIRED`。
- 验证：`npm test` 131/131、React 45 文件 367/367、TypeScript、React build、iOS sync、`git diff --check`、签名 iPhone Debug 构建/安装/启动均通过。用户已在 iPhone 完成 Apple→微信绑定并确认无问题。
- 剩余：`先微信后绑 Apple`、两个既有云账号的确认合并及合并后备份可见性，和 Android 已注册签名包的旧微信账号/注销回归；不得以当前单条 iPhone 路径代替这些验收。

## 明确留给后续步骤的范围

- 步骤 3：仅剩 iPhone 真机 Apple 登录及 Android 真实账号回归；仍未验收完成。
- 步骤 4：补齐其余账户组合、合并后备份可见性与 Android 已注册签名包回归；仍未验收完成。
- 步骤 6：本地代码和构建已完成，仍待真机通知验收；步骤 7～10：UI 适配、StoreKit、签名合规和上架。当前按需登录表面不代表 iOS 已支持任一原生登录方式。

## 步骤 5 本轮变更与当前阻塞

- 用户明确授权这是一次步骤例外：可在步骤 3、4 的外部停点未解除时，提前实现步骤 5；此授权不进入步骤 6，也不改变步骤 3、4 的状态。
- 新增 iOS 手写 `SaveFilePlugin.swift`，保持既有 `save({ data, filename, mimeType })` JS 契约，并新增同形状的 `share()`。它将 base64 以 32 KiB、四字节对齐的块写入唯一临时文件，不把完整导出文件交给 UIKit 控制器持有。
- `save()` 使用 `UIDocumentPickerViewController(forExporting:asCopy:)` 打开系统 Files“另存为”；`share()` 使用 `UIActivityViewController` 打开系统分享面板。保存/分享成功、取消和失败路径均回收临时文件，iPad popover 也已设置锚点。
- `AfterZeroBridgeViewController` 显式注册 `SaveFilePlugin`，Xcode target 已加入该 Swift 源文件。`www/index.html` 保持所有导出/下载统一走现有 `saveToDeviceDownloads()`；档案分享仅在 iOS 走新原生 `SaveFile.share()`，Android 保持既有 Web Share fallback 与 SAF 保存实现，不更改 Android 的 cache 临时文件/64 KiB 流式复制。
- JSON 备份导入和档案上传继续使用既有 `<input type=file>`、FileReader 与 IndexedDB：iOS WebView 会调起系统文件选择器，不复制或重写账本导入逻辑。隐私政策 Markdown 与 App 内副本已说明 iOS 系统分享面板，不新增存储权限。

## 步骤 5 已完成的本地验证

- `npm run test:react`：45 文件、363/363 通过；`npx tsc --noEmit --project react/tsconfig.json` 通过；`npm test`：127/127 通过。
- `npm run build:react`、`npx cap sync ios`、`npx cap sync android` 通过；未直接编辑 iOS/Android 打包 Web assets。
- iOS：iPhone 17 Pro / iOS 26.5 无签名 Debug `xcodebuild` 成功，构建日志确认 `SaveFilePlugin.swift` 已编译并链接到 `App` target。首次隔离构建仅因无法解析 SPM GitHub 域名停止；允许 Xcode 使用已配置依赖缓存后复验成功。
- Android：JDK 21 `:app:assembleDebug` 成功，现有 SAF 源码未改。

## 步骤 5 真机验收与恢复动作

1. 在 iPhone 上实际导出 JSON、XLSX、PDF 和 Markdown，逐项验证 Files 保存、打开、取消（无错误提示、无 0B 残留）与系统分享；用较大 PDF/XLSX 和接近档案上限的文件观察内存与临时文件回收。
2. 在 iPhone 上用系统文件选择器导入 JSON 备份，并上传、下载、分享、打开档案文件；确认取消不改变现有本地账本或档案。
3. 在 Android 设备/模拟器回归既有 SAF 的保存成功、取消和大 PDF/XLSX，确认浏览器 fallback 仍可下载。
4. 记录上述证据后，步骤 5 才可从“阻塞”改为“等待用户检查”；不得以模拟器编译代替真机文件系统验收，不得进入步骤 7。

## 步骤 6 本轮变更与真机验收

- 用户明确授权在步骤 3～5 的真机停点未解除时提前实现步骤 6；这不改变步骤 3～5 的状态，也不授权步骤 7。
- `syncNotifications()` 继续使用 `calc.js` 的唯一排程和“全清再重排”：Android 正式提醒上限为 450，保留 `repay` channel、`channelId`、`smallIcon` 与既有非精确策略；iOS 正式提醒上限为 63，留出测试提醒位置，并且不发送 Android 专属字段。
- `capacitor.config.json` 为 iOS Local Notifications 显式配置前台 `sound`、`banner`、`list`；iOS 通知传空 `sound` 字段以使用系统默认声音。权限被拒时引导用户在系统设置开启；关闭开关会取消已排提醒；测试提示明确 Android 电池优化/自启动限制只是 Android 特有因素。
- 新增 iOS 63 条最近优先和夏令时本地提醒时间的计算回归，并更新通知 UI 说明。`npm test` 129/129、React 45 文件 364/364、TypeScript、React build、`npx cap sync android|ios`、Android JDK 21 debug APK、iPhone 17 Pro/iOS 26.5 无签名模拟器 `xcodebuild` 均通过；sync 后生成的 iOS 配置确认含 `presentationOptions: [sound, banner, list]`。
- 后续集中真机验收：iPhone 上完成权限允许/拒绝后重试、10 秒测试通知、前台 banner/list/sound、后台和锁屏到时通知、系统设置重新允许、关闭/删除规则/修改债务后的全清重排，以及 pending 正式提醒不超过 63；Android 设备或模拟器回归 channel、测试通知、450 条上限与重排。不得以模拟器编译替代这些检查，也不得进入步骤 7。

## 步骤 7 本轮变更与真机验收

- 用户已明确授权在步骤 3～6 真机停点未解除时提前实现步骤 7；这是单次例外授权，不改变步骤 3～6 的状态，也不授权步骤 8。
- `www/index.html` 为支持动态视口的 WebView 使用 `100dvh`（旧实现保留 `100vh` fallback），并把 App、sheet、subpage 的安全区、底部余量和滚动焦点余量收口；iOS 可编辑控件统一最小 16px，避免系统键盘聚焦自动缩放。
- 新增债务表的借款日继续使用 iOS 原生日期交互，但由等尺寸外框承接边框与裁切；“出资方/借款类型”和“借款日/还款日”两行统一为 1:1 双列、10px 间距和 44px 控件高度，避免原生日期控件撑破列宽或造成上下边界错位。
- `AfterZeroBridgeViewController` 明确禁用 WKWebView 前进/后退侧滑，保留各 screen/sheet 的既有返回链；`UIScrollView.keyboardDismissMode = .interactive` 让键盘可随原生手势下滑收起。
- 债务卡、还款日卡、档案预览和 AI 历史对话补上键盘焦点/Enter/Space 和 VoiceOver 语义；档案行不再把下载、删除等按钮嵌入另一个可点击语义中。
- 未改 `calc.js`、债务数据形状、登录/云端、文件保存契约或通知算法；未改 Flutter，也未直接编辑任一同步后的 Web assets。

## 步骤 7 已完成的本地验证

- `npm run test:react` 45 文件、366/366 通过；`npx tsc --noEmit --project react/tsconfig.json`、`npm run build:react`、`npx cap sync ios`、`npx cap sync android` 均通过。
- JDK 21 Android `:app:assembleDebug` 通过；iOS 无签名 `xcodebuild`（iOS 26.5 Simulator、最低 iOS 15、SPM）通过，确认修改后的 Swift 代码已编译链接。
- iPhone 17 Pro / iOS 26.5：主页安全区正常；新增债务 sheet 中焦点输入未被键盘遮挡，键盘可交互式下滑收起。iPhone 17 Pro Max / iOS 26.5：浅色和深色主页的灵动岛、Home Indicator、tabbar、卡片宽度与内容层级均正常；新增债务表四个双列输入框的左右边界、宽度、高度和底边已在最终模拟器包中对齐。

## 步骤 7 真机验收与恢复动作

1. 在至少一台 iPhone 上逐页检查四个 tab、全部 subpage/sheet/modal 的小/大屏、安全区、键盘、动态字体、VoiceOver、浅深色、滚动边界和 PDF 预览。
2. 以真实触摸完成长按排序、左右滑动/销期、图表 scrub/旋转、sheet grip、嵌套弹层和返回链；同时回归 Android 的浅深色、手势与硬件返回。
3. 记录上述证据后，步骤 7 才可从“阻塞”改为“等待用户检查”；不得以模拟器代替 iPhone 真机验收，不得进入步骤 8。

## 2026-08-13（续4）：iPhone 集中验收与新增债务滚动修复

- 设备：余莉的 iPhone（iPhone 16 Pro Max，iOS 26.4.1）。步骤 3 Apple 登录首次授权、冷启动保持会话、云备份创建、退出后重登并查看原备份、AI 调用、注销后云备份删除及再次登录均由用户确认通过。本机账本在退出/注销时保持不变。
- 注销后再次 Apple 登录未重复出现邮箱共享选择是 Apple 的预期行为：删除 After Zero 云账号不会撤销 Apple 对 App 的授权；云端仍以 Apple 稳定 `sub` 识别身份，不以邮箱作为账户主键。
- 步骤 5：用户确认 iPhone Files 保存、打开和取消路径无问题；当前档案界面只露出下载/删除，虽已存在原生分享能力但未暴露入口，用户确认本轮不以分享验收阻塞。Android SAF 仍未回归。
- 步骤 6：用户确认 iPhone 通知验收无问题；Android channel、450 条上限和重排仍需独立回归。
- 步骤 7：用户确认深色模式四主 tab、键盘/表单、债务详情拖拽关闭、长按排序、还款日左滑、统计图表触摸与动态字体等检查无问题。发现“新增债务”内层滚动到边界会带动主页面：原因是 React `EditSheet` 未调用旧 vanilla `lockScroll()`；已在打开期间给 `html/body` 加 `az-edit-sheet-open` 根滚动锁，新增回归测试，React 367/367、TypeScript、React build、iOS sync、签名真机构建/安装均通过，用户复测通过。
- 下一步仍只有步骤 4 的其余账户组合和各步骤待做的 Android 回归；步骤 8 未授权，禁止开始。未暂存、提交或推送。

## 2026-08-13（续5）：步骤 8 StoreKit Premium 本地实现与外部停点

- 用户明确授权开始步骤 8，并确认产品规则：iOS 首发、首次登录赠送一次 7 天完整体验、体验标签为“Premium 会员体验”、¥28 一次性买断、服务端确认后可离线 3 天、旧用户不免费升级。
- 新增 iOS `StoreKitPremiumPlugin`：基于 StoreKit 2 查询商品、购买、恢复购买、监听未完成交易；购买请求带服务端生成的 UUID `appAccountToken`，只在服务端验签并写入权益后完成交易。最近一次服务端确认结果同时进 Keychain，且仅在 3 天离线窗口内允许使用。
- 新增 `premiumEntitlement` CloudBase 函数及 Apple 根证书：用 Apple 官方 App Store Server Library 验证交易 JWS，校验 bundle/product/appAccountToken/撤销状态，保存 `premiumEntitlements`、交易去重记录和兑换结果。本地 `after-zero-premium-v1` 仅缓存访问窗口；iOS 不再信任旧本地 Premium 或备份内的 Premium 字段。
- Apple/微信新账号会写入仅含哈希 identity 文档 id 的 `premiumTrialClaims`；注销时删除用户资料、备份和登录映射，但保留最小试用/已购权益标记，以防重复赠送体验并允许购买恢复。账户绑定合并时优先保留已购权益并合并历史 appAccountToken。
- iOS 启动改为强制登录 → 服务端权益校验 → 有效体验/已购才进入完整账本；体验结束则在门禁内显示购买、恢复购买与兑换入口。Android 仍保留原有本地/兑换策略，本轮未被购买门禁锁死。
- 会员协议 Markdown/App 内副本、账户说明、Premium 页面和 bridge/type/mock 已同步为体验、¥28、一次性买断、恢复购买及注销后的最小权益保留语义。
- 本地验证通过：`npm test` 131/131、`npm run test:react` 45 文件/368 项、TypeScript、React build、iOS sync、主 Web 内联脚本语法与 `git diff --check`。iOS Simulator 无签名 `xcodebuild` 已通过；首次构建因本机 SPM 的 Capacitor Cordova 缓存缺件失败，重新解析已有 SPM 依赖后复验成功。
- 2026-08-14 已将 `premiumEntitlement` 加入本机受控部署配置并成功部署。仍未完成、不得宣称步骤 8 闭环：① 在 CloudBase 创建 `premiumEntitlements`、`premiumTransactions`、`premiumRedeemCodes`、`premiumTrialClaims` 为 ADMINONLY；② 配置生产环境 `APPLE_APP_STORE_ID`；③ 在 App Store Connect 创建非消耗型商品 `io.github.jenkjyu.afterzero.premium`、中国区价格 ¥28 与 Sandbox 测试账号；④ 配置 App Store Server Notifications V2，完成购买、取消、失败、恢复、换设备、退款/撤销的 iPhone 真机验收；⑤ Android 回归。未暂存、提交或推送。

## 步骤 8：2026-08-14 本轮体验与入口调整

- iOS 不再在冷启动强制打开登录门，也不会因体验结束封锁整 App。登录身份首次服务端确认后的 7 天体验，或服务端已确认且仍在离线窗口内的已购权益，仍可使用所有功能。
- 体验已结束且没有已购权益时，用户仍可使用第一个“债务”tab 的本地功能；AI 入口、第二个“还款日”tab 和第三个“统计”tab 统一打开 Premium 页面。我的页中“云备份、档案库、下载备份文件、上传备份文件”也统一打开该页面；头像进入账户页不受限制，会员字段显示“普通用户”。
- 登录门不展示用途说明、¥28 价卡、购买、恢复购买或兑换入口；Premium 页面保留原有体验说明、¥28 价卡、购买、恢复购买、兑换和协议入口。StoreKit/服务端权益实现与 Apple 商店配置保持不变。

## 2026-08-14（续）：冷启动品牌开屏

- 每次完整冷启动先显示既有登录门的 App 图标和 After Zero 手写 Logo，但此界面仅作品牌开屏：不显示 Apple/微信登录入口，也不调用登录、账户或 Premium 权益逻辑。
- 手写 Logo 完成现有逐字动画后固定再停留 0.5 秒（正常动效共约 1.87 秒；系统“减少动态效果”时停留 0.5 秒），再自动关闭开屏并固定回到第一个“债务”tab；开屏期间硬件返回不关闭它。

## 2026-08-14（续2）：Apple 登录换票据重试

- Apple 登录按钮在原生授权和云端换票据全过程保持单次进行，重复点击不再触发第二条请求或提前关闭登录门。
- Apple 已签发凭证后，客户端仅对临时云端交付故障自动重试一次，不重新打开 Apple 认证面板；服务端仍校验签名、issuer、audience、有效期和 raw nonce，同一份未过期凭证只允许为其原内部账户补发票据，不能转给其他账户或创建第二个账户。
- `appleLogin` 云函数已部署，并增加无身份信息的阶段/耗时日志。无凭证调用返回预期 `TOKEN_MALFORMED`，函数冷启动约 532ms、函数主体约 5ms。开发签名 iPhone Debug 已重新构建、安装并冷启动；Apple 密码/Face ID 路径需用户本人完成一次真机验收。

## 2026-08-14（续3）：账户头像与昵称编辑

- 账户页顶部增加圆形头像：无自定义图片时保持纯色默认头像，登录后点击可从系统图片选择器自定义；图片在 WebView 本地缩至最长边 320px、JPEG 压缩后写入既有 `after-zero-account-v1`，不上传云端。
- 账户信息中的昵称改为可编辑输入，失焦或按 Enter 保存，最多 24 个字符。头像/昵称仅为当前设备的展示资料，不改变 Apple/微信身份、CloudBase 会话、Premium、本地账本或云端用户资料；现有退出登录行为会一并清除本机账户展示资料。
- 验证：React 45 文件/371 项、TypeScript、React build、Android/iOS sync、主 Web 脚本解析和 `git diff --check` 均通过；开发签名 iPhone Debug 已构建、安装并冷启动。
- 昵称输入框会按中英文字符宽度自动伸缩，并保持最小可点按宽度与单行上限，避免过长昵称挤坏账户信息行；已重新构建、安装并冷启动 iPhone Debug 包。
- 根据真机视觉反馈，昵称框改用 `border-box` 尺寸和居中文本，左右内边距保持对称，消除短昵称时左侧留白明显更宽的观感；已重新构建、安装并冷启动 iPhone Debug 包。
- 试用态的“Premium 会员体验”仅保留在账户页的会员字段；订阅页会员标题与“我的”Premium 入口统一为“Premium 会员”。订阅页的“已开通 Premium”与“恢复购买”放入专用并列容器，移除恢复按钮额外顶部偏移并固定为相同 44px 外框高度。React 45 文件/373 项、TypeScript、React build、Android/iOS sync 和 `git diff --check` 均通过；开发签名 iPhone Debug 已重新构建、安装并启动，待用户目视确认。
- iOS 原生 `UIScreenEdgePanGestureRecognizer` 已接入左侧边缘返回，继续禁用 WebView 网页历史手势。账户、Premium、关于、档案、AI 等最上层全屏 subpage 会随手指实时右移；松手超过 35% 或快速右甩时，沿既有 `__handleBackButton()` 链关闭，未达到阈值则回弹。首页、登录门、确认框和底部 sheet 不响应此手势，避免绕过层级或与表单/横滑冲突。React 45 文件/373 项、TypeScript、React build、Android/iOS sync、`git diff --check` 以及开发签名 iPhone 构建/安装/启动均通过；仍待用户真机手势验收。
- iOS 26 的底栏使用原生 `UIGlassEffect` 作为悬浮玻璃外壳，但没有采用 SF Symbols 或系统选中胶囊：四个图标按原 Web SVG 的形状重绘，选中态仍仅为原来的实心/强调色。触点经 WK 消息桥调用原 Web tab 按钮，因此 Premium 门禁、既有切换逻辑和“我的”的实际 `data` 路由保持不变；登录门、全屏 subpage、sheet、确认框打开时原生栏自动隐藏。栏体每侧比此前 Web 样式收窄 8pt。iOS 25 及以下继续使用 Web 浮动玻璃降级样式，Android/浏览器也保留该样式并去除选中态色块。React 45 文件/373 项、TypeScript、React build、iOS sync、`git diff --check`与开发签名 iPhone 构建、安装、启动通过，待用户真机目视确认。
- 设备构建首次暴露 `StoreKitPremiumPlugin.swift` 对 StoreKit 验证结果 JWS 的错误读取及可选缓存参数处理；已改为从验证结果传递 JWS，并正确解包缓存字典。已用开发签名构建并安装到连接的 iPhone；冷启动命令因设备锁屏被系统拒绝，需解锁后由用户打开确认。

## 2026-08-20：步骤 8 App Store Server Notifications V2 接入与外部配置

- 新增独立的公开 HTTP 云函数 `appStoreNotifications`，不公开 `premiumEntitlement`。它使用 Apple App Store Server Library 验证通知的 JWS、校验 Bundle ID `io.github.jenkjyu.afterzero` 和商品 ID `io.github.jenkjyu.afterzero.premium`，并用 `premiumNotificationEvents` 的通知 UUID 去重。
- `REFUND`/`REVOKE` 会将对应服务端权益标为已撤销；`REFUND_REVERSED` 会恢复已付费权益；测试及无权益变化通知只记录并安全忽略。`premiumEntitlement` 现在会拒绝被撤销的交易重新授予权益；账户合并也不会把已撤销 App Store 权益变成体验权益。
- CloudBase 已创建 `premiumNotificationEvents` 并设为 ADMINONLY；`appStoreNotifications` 和更新后的 `premiumEntitlement` 均以安装函数依赖的方式部署。受控本机部署配置中已设置 `APPLE_APP_STORE_ID=6801229132`，该配置不提交仓库。
- HTTP 网关路由已启用：`https://after-zero-d7gub5p5f09c8cc2d-1454845992.ap-shanghai.app.tcloudbase.com/apple/storekit/notifications` → `appStoreNotifications`。路由关闭跨域、路径透传和网关身份认证，外部空 POST 返回预期 `400 SIGNED_PAYLOAD_REQUIRED`，说明路径已连通而不会接受伪造通知。
- App Store Connect 已为生产和沙盒环境设置上述同一 URL。非消耗型商品 `io.github.jenkjyu.afterzero.premium` 的中国大陆价格为 ¥28，仍处于“准备提交”，尚未随新 App 版本送审。
- 代码验证：`npm test` 136/136 通过，`git diff --check` 通过；云函数直调分别返回预期的 `LOGIN_REQUIRED`（`premiumEntitlement`）和 `405 METHOD_NOT_ALLOWED`（`appStoreNotifications`）。
- 当前阻塞：用户暂时没有 iPhone，尚未用 Sandbox 完成真实购买、取消/失败、恢复购买、换机与退款/撤销通知验收。步骤 8 保持进行中，步骤 9 未开始且未获授权。

## 2026-08-20：步骤 9 例外授权与本地发布准备

- 用户明确例外授权：在步骤 8 的 iPhone StoreKit 真机验收完成前，提前开始步骤 9；该授权不进入步骤 10，不代表步骤 8 已完成。
- 新增 App target 的 `ios/App/App/PrivacyInfo.xcprivacy`，声明 App 自己的 `UserDefaults` 使用理由 `CA92.1`、无追踪及实际云端账户/用户内容/Premium 购买历史类别；将原先作为 App 资源复制的微信 SDK 同名清单移出 Resources phase，避免两个 `PrivacyInfo.xcprivacy` 产物冲突。
- `ios/App/App/Info.plist` 增加 `ITSAppUsesNonExemptEncryption=false`。这是基于当前代码只发现系统 HTTPS/TLS、Keychain、StoreKit、SHA-256 身份校验和第三方登录 SDK 的暂定判断；上传前必须由账号持有人结合最终依赖在 App Store Connect 再确认。
- 新增 [`release-readiness.md`](release-readiness.md)，记录 Bundle ID/Team ID、entitlements、隐私清单、出口合规、App Store Connect 元数据和 TestFlight 候选状态；README 已同步步骤 9 已完成、步骤 8 未闭环。
- 验证：四份 plist/entitlements 清单 lint 通过，`git diff --check` 通过；iOS `Release`、`iphoneos`、`CODE_SIGNING_ALLOWED=NO` generic device 构建成功，产物包含单一 `PrivacyInfo.xcprivacy`、图标、启动资源和 `io.github.jenkjyu.afterzero` Bundle ID。Simulator 构建不能使用仅真机架构的微信静态库，未将该环境限制误报为工程失败。
- 本机已创建带私钥的 Apple Distribution 证书；Xcode 已成功 Archive、以 App Store Connect 分发方式导出并上传多个 TestFlight 候选，规范版本 `1.0.0 (4)` 已完成处理、构建关联和 TestFlight 回归。自动化 shell 的 `security find-identity` 仍无钥匙串读取权限，不能覆盖 Xcode 实际签名结果。App Store Connect 的隐私标签、年龄/分类、截图、支持 URL、隐私政策 URL、出口合规确认和审核材料均已完成；账号持有人已手动提交 `1.0.0` 首次审核，当前等待 Apple 审核，尚未公开上架。
- Git：步骤 10 文档收尾的提交与推送已获用户授权；现有 `ios/App/App/WeChatLoginPlugin.swift` 等无关工作树改动仍不得纳入本次提交。
