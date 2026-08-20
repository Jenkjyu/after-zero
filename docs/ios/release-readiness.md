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

## 外部配置仍需账号持有人完成

- App Store Connect 需要补齐隐私标签、年龄分级、分类、截图、支持 URL、隐私政策 URL、审核备注和测试账号/演示路径。
- 需要确认 `afterzero.tech` 上实际可访问的隐私政策与支持页面；仓库目前只有 App 内隐私政策和 Universal Link 配置，不能凭域名推断 URL 已上线。
- 需要在 App Store Connect 回答该构建的出口合规问题，并确认 `ITSAppUsesNonExemptEncryption=NO` 与最终依赖一致。
- `1.0 (1)` 已分配内部测试者并在 Apple 芯片 Mac 的 TestFlight 安装；Sandbox 首次购买和注销后恢复购买均已通过。`1.0 (3)` 正在等待 Apple 处理，供验证不带句号的直接购买旧账号交易提示。步骤 8 的 iPhone Sandbox 购买、恢复、退款/撤销验收仍未完成。

## 本地验证入口

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' \
  -archivePath /private/tmp/after-zero/App.xcarchive archive
```

该命令已在 2026-08-20 成功完成归档；后续必须经 App Store Connect 分发导出并确认 Apple Distribution 签名，不能用无签名模拟器构建替代 TestFlight 候选。
