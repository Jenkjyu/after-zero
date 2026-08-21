# iOS 步骤 9 发布就绪清单

更新时间：2026-08-22

本文只记录步骤 9 的签名、隐私、合规和 TestFlight 候选状态，以及步骤 10 的发布收尾；步骤 9 已完成，步骤 10 的首次审核提交已由账号持有人手动完成，当前等待 Apple 审核。步骤 4/8 的剩余小项按用户决定延后到上架后；App 尚未公开上架。

## 已落地到仓库

- Bundle ID：`io.github.jenkjyu.afterzero`。
- Apple Developer Team：`RYU53AS626`，已写入 Debug/Release Xcode 配置。
- 最低系统：iOS 15；目标设备：iPhone 与 iPad。
- Apple 登录和 Associated Domains entitlements 已存在：`applinks:afterzero.tech`。
- App 图标、启动图、主界面和 `LaunchScreen` 已纳入 iOS target。
- App target 新增 `PrivacyInfo.xcprivacy`，声明：
  - 不用于追踪，且没有追踪域名；
  - 原生 `UserDefaults` 仅用于 App 自身的授权状态，理由为 `CA92.1`；
  - 云端账户身份、账户展示资料、用户内容和 Premium 购买历史仅用于 App 功能，不用于追踪。
- 微信 SDK 目录仍保留其供应方清单源文件，但不再把它作为第二份同名资源复制进 App；App target 的清单已合并本项目原生 `UserDefaults` 理由，避免两个 `PrivacyInfo.xcprivacy` 产生冲突。
- `Info.plist` 的 `ITSAppUsesNonExemptEncryption` 暂设为 `NO`：当前代码只发现 SHA-256 身份校验、系统 HTTPS/TLS、Keychain、StoreKit 和第三方登录 SDK，没有自有非豁免加密算法。上传前仍须由账号持有人结合最终 SDK 版本在 App Store Connect 重新确认；若 Apple 判断需要申报，必须撤回该判断并提交相应材料。
- 2026-08-20 已在本机创建带私钥的 Apple Distribution 证书。Xcode 自动签名归档后，以 App Store Connect 分发方式自动重签，导出的 `1.0 (1)` IPA 已确认使用 Apple Distribution、Bundle ID `io.github.jenkjyu.afterzero` 和 Team `RYU53AS626`。
- `1.0 (2)` 已将直接购买的旧账号交易提示改为“原账号已购买过Premium会员，请点“恢复购买””；归档版本号已校验为 `1.0 (2)`，并于 2026-08-21 以 App Store Connect 分发方式上传成功，Xcode 记录 `Upload succeeded` 与 `EXPORT SUCCEEDED`。上传只产生 TestFlight 候选，不会提交审核或公开上架；仍须等待 Apple 处理完成后才能分配测试者。
- `1.0 (3)` 已去掉上述提示末尾句号；归档版本号已校验为 `1.0 (3)`，并于 2026-08-21 以 App Store Connect 分发方式上传成功，Xcode 记录 `Upload succeeded` 与 `EXPORT SUCCEEDED`。上传只产生 TestFlight 候选，不会提交审核或公开上架；仍须等待 Apple 处理完成后才能分配测试者。
- 按 Apple 三段式版本要求，Debug/Release 的 App 版本已改为 `1.0.0`，构建号升为 `4`。`1.0.0 (4)` 已完成 Release Archive，归档内 Bundle ID、版本号和构建号均已核对；以 App Store Connect 分发方式重签并上传成功，已完成 Apple 处理、版本关联和 TestFlight 回归；尚未提交审核或公开上架。
- `1.0.0 (9)` 将 AI 识图临时图片上传改为已登录云函数代理，避免 iOS WebView 直接写 CloudBase Storage；归档内版本和构建号已核对为 `1.0.0 (9)`，并已按 App Store Connect 分发方式上传成功。AI 识图已完成真实样本识别率与成本验证；未提交审核或公开发布。
- 步骤 10 基线中，当前源码已再次完成 `1.0.0 (9)` 的 iPhoneOS Release Archive 和 App Store Connect 分发导出；`DistributionSummary.plist` 核对为 Apple Distribution、Team `RYU53AS626`、Bundle ID `io.github.jenkjyu.afterzero`、版本 `1.0.0`/构建 `9`，导出包包含 React、CloudBase Storage 和 App Privacy 资源。由于构建号 `9` 已上传，不重复上传相同候选。
- 新增 `website/` 纯静态公网页面源码：`privacy.html` 为隐私政策、`support.html` 为技术支持、`index.html` 为入口。页面已通过 Netlify 部署到公开生产站点，`afterzero.tech` 为主域名，`www.afterzero.tech` 自动跳转到主域名，DNS 验证已完成；可填写的 URL 为 `https://afterzero.tech/privacy.html` 和 `https://afterzero.tech/support.html`。

## 外部配置状态

- App Store Connect 隐私标签、年龄分级、分类、截图、支持 URL、隐私政策 URL、审核备注、测试账号/演示路径和出口合规信息已完成填写与确认。
- `1.0.0 (4)` 已完成 Apple 处理、App Store 版本关联、TestFlight 安装和回归；Sandbox 首次购买和注销后恢复购买已通过。步骤 8 剩余 iPhone StoreKit 购买、恢复、退款/撤销及服务端通知验收按用户决定延后到上架后，不阻塞当前发布。
- 步骤 10 的本地构建与总回归已完成；用户确认沿用既有 iPhone 验收证据，不再因本机 CoreDevice 服务不可用追加真机阻塞。账号持有人已在 App Store Connect 手动修正审核备注中的重复文字并完成 `1.0.0` 首次审核提交，当前等待 Apple 审核结果。

## 本地验证入口

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' \
  -archivePath /private/tmp/after-zero/App.xcarchive archive
```

该命令已在 2026-08-20 成功完成归档；后续必须经 App Store Connect 分发导出并确认 Apple Distribution 签名，不能用无签名模拟器构建替代 TestFlight 候选。
