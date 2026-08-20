# iOS 步骤 9 发布就绪清单

更新时间：2026-08-21

本文只记录步骤 9 的签名、隐私、合规和 TestFlight 候选状态；不代表步骤 8 StoreKit 真机闭环或步骤 10 总回归已经完成。

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
- 按 Apple 三段式版本要求，Debug/Release 的 App 版本已改为 `1.0.0`，构建号升为 `4`。`1.0.0 (4)` 已完成 Release Archive，归档内 Bundle ID、版本号和构建号均已核对；以 App Store Connect 分发方式重签并上传成功，Xcode 记录 `Upload succeeded` 与 `EXPORT SUCCEEDED`。当前 Apple 状态为 `PROCESSING`，尚未可在 TestFlight 安装，也未提交审核或公开上架。
- 新增 `website/` 纯静态公网页面源码：`privacy.html` 为隐私政策、`support.html` 为技术支持、`index.html` 为入口。页面已通过 Netlify 部署到公开生产站点，`afterzero.tech` 为主域名，`www.afterzero.tech` 自动跳转到主域名，DNS 验证已完成；可填写的 URL 为 `https://afterzero.tech/privacy.html` 和 `https://afterzero.tech/support.html`。

## 外部配置仍需账号持有人完成

- App Store Connect 需要补齐隐私标签、年龄分级、分类、截图、支持 URL、隐私政策 URL、审核备注和测试账号/演示路径。
- 需要在 App Store Connect 填入并实际打开验证隐私政策 URL `https://afterzero.tech/privacy.html` 和技术支持 URL `https://afterzero.tech/support.html`；站点已公开部署并完成 DNS 验证，但这不等于 App Store Connect 元数据已经填写或保存完成。
- 需要在 App Store Connect 回答该构建的出口合规问题，并确认 `ITSAppUsesNonExemptEncryption=NO` 与最终依赖一致。
- `1.0 (1)` 已分配内部测试者并在 Apple 芯片 Mac 的 TestFlight 安装；Sandbox 首次购买和注销后恢复购买均已通过。`1.0.0 (4)` 正在等待 Apple 处理，处理完成后需在 App Store 版本 `1.0.0` 中选择该构建，再进行 TestFlight 安装和回归。步骤 8 的 iPhone Sandbox 购买、恢复、退款/撤销验收仍未完成。

## 本地验证入口

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' \
  -archivePath /private/tmp/after-zero/App.xcarchive archive
```

该命令已在 2026-08-20 成功完成归档；后续必须经 App Store Connect 分发导出并确认 Apple Distribution 签名，不能用无签名模拟器构建替代 TestFlight 候选。
