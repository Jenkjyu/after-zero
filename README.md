# After Zero

一个记录和规划个人债务的 App。名字的寓意，是对债务归零之后的期待。

## 当前产品

当前正式发布主线是 **Capacitor + React 的 iOS App**，包名为 `io.github.jenkjyu.afterzero`。Android 保留为内部测试包，暂不作为正式发布渠道。全新安装默认没有任何债务或档案数据，可直接在本地使用；AI 债务助手、云备份，以及 Premium 的购买、恢复购买和兑换等服务端权益操作才要求登录。

iOS 已建立同一套 Web 产品的 Capacitor 原生壳，并已完成 Apple/微信登录、文件保存、通知和主要交互的 iPhone 验收。StoreKit 真实支付、TestFlight 与 App Store 上架仍未闭环，因此当前不能视为可发布 iOS 产品。

- `react/src/**` 负责“债务”“还款日”“统计”“我的”四个 tab，以及不属于 tab 的 subpage、sheet 和 screen。Vite 使用 `debts`、`pay`、`report`、`mine`、`sheets` 五个入口。
- `www/index.html` 是唯一 Web 宿主，保留全局 CSS、tabbar、登录门、共享确认框、隐藏导入 input、localStorage/IndexedDB、CloudBase 和原生能力编排；财务计算集中在 `www/js/calc.js`。
- 根 `android/` 是现行 Capacitor 原生工程，包含手写的 WebView/返回链、SAF 文件保存、微信登录和回调代码；本地提醒使用 Capacitor Local Notifications。
- `cloudbase/functions/**` 是独立部署的服务端单元，涵盖 Apple/微信登录、账户绑定、Premium 权益、账户注销、云备份和 AI 顾问；不会随原生包构建或 Capacitor sync 自动部署。

“还款日”按期次列出待还项目，支持时间窗口筛选、部分还款、协商减免和按顺序销期。“统计”是一份基于当前账本生成的债务报告，包含结论、还清走势、未来压力、余额排行和类型构成。

当前只有一个 Premium 等级。iOS 登录身份首次经服务端确认后可体验全部功能 7 天；体验结束后为 ¥28 一次性买断，不自动续费。StoreKit 购买、恢复购买和服务端权益验证已经实现，但 App Store 配置与真机支付验收尚未完成，因此不能视为已经对外开通支付。最近一次服务端确认后的 Premium 权益可离线使用 3 天。

iOS 体验结束且未购买时，仍可使用“债务”tab 的本地功能；AI、“还款日”“统计”，以及云备份、档案库、备份文件导入导出入口会引导至 Premium 页面。提前还款模拟仍可用。AI 额度由服务端按北京时间自然月计数，每月最多 50 次。

更细的开发边界、硬规则和按任务加载的知识入口见 [`AGENTS.md`](AGENTS.md) 与 [`.agents/skills/`](.agents/skills/)。

## iOS 发布主线（步骤 8 未闭环；步骤 9 例外进行中）

当前以 iOS 为发布主线，仍不恢复 Flutter。根 `ios/` 已使用 Capacitor 8.4.1 与 Swift Package Manager 创建，Bundle ID 为 `io.github.jenkjyu.afterzero`、最低 iOS 15，并已换用项目图标和启动图。步骤 3～7 的 iPhone 验收已完成；步骤 8 正在完成 StoreKit、恢复购买与服务端权益，步骤 9 已按例外授权开始进行签名、隐私、合规和 TestFlight 候选准备。

Android 的登录、文件、通知和交互回归改为内部测试清单，不再阻塞 iOS 的 TestFlight 或 App Store 发布；共享代码仍保持基础构建验证。当前 iOS 的剩余关键项是 StoreKit 真机购买/恢复等场景、签名合规、App Store Connect 配置和上架材料。步骤 9 的当前检查见 [`docs/ios/release-readiness.md`](docs/ios/release-readiness.md)，权威范围与恢复动作见 [`docs/ios/implementation-plan.md`](docs/ios/implementation-plan.md) 和 [`docs/ios/handoff.md`](docs/ios/handoff.md)。

## Flutter 重写（已停止并封存）

`flutter/` 是一套曾经并行开发的全量重写成果，已于 **2026-08-10** 按用户要求停止并封存。阶段 0～7 已实现；阶段 8 未完成，只留下阶段 8.1 的静态完整性门禁 WIP；Flutter 阶段 9 从未开始。它不是当前产品主线、不是已验收的替代版本，也不能据此宣称 iOS 已支持。

未经用户在当前任务中重新明确授权，不得恢复阶段 8.1、继续 8.2～8.10、开始 Flutter 阶段 9，或修改 Flutter 产品和 parity 工具。封存状态、历史文档入口和精确停点见 [`docs/flutter-parity/README.md`](docs/flutter-parity/README.md)。

## 环境要求

### iOS 发布主线

- Node.js + npm
- 完整 Xcode 26+ 与 iOS Simulator Runtime
- 项目使用 Swift Package Manager，不预装 CocoaPods；只有原生依赖明确不支持 SPM 时才按需引入 CocoaPods。

### Android 内测（按需）

- JDK 21
- Android SDK command-line tools、`platform-tools`、Android 36 platform 及匹配 build tools

macOS 可用 Homebrew 安装 Android command-line tools。Homebrew 的 `openjdk@21` 通常是 keg-only；Apple Silicon 构建时可显式设置 `JAVA_HOME=/opt/homebrew/opt/openjdk@21`，Intel Mac 通常使用 `/usr/local/opt/openjdk@21`。仅构建 iOS 时不需要 Android SDK 或 JDK。

首次安装依赖：

```bash
npm install
```

仅在构建 Android 内测包时，才需创建已被 gitignore 的 `android/local.properties`：

```properties
sdk.dir=/path/to/your/android-sdk
```

## 构建与验证

### iOS 主线构建

```bash
npm run build:react
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,id=<device-id>' \
  CODE_SIGNING_ALLOWED=NO build
```

也可以用 `npx cap open ios` 打开 Xcode 工程。真实 iPhone 安装、Apple 登录和 StoreKit 验收需要有效开发签名与描述文件；模拟器构建不能替代真机验收。

### Android 内测包（按需）

```bash
npm run build:react
npx cap sync android
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew :app:assembleDebug --no-daemon --console=plain
```

Debug APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。

- 只改 `react/src/**`：先 `npm run build:react`，再 `npx cap sync ios`；准备 Android 内测包时才额外 sync 和构建 Android。
- 只改 `www/**` 且 React 产物已是最新：可以跳过 React build，但仍需 `npx cap sync ios`；Android 内测同理按需 sync。
- 不要直接编辑 `www/js/react-debts/**`、`ios/App/App/public/**`、`android/app/src/main/assets/public/**` 或 Capacitor 生成的原生接线。
- CloudBase 函数必须单独部署；Apple/微信登录都必须使用真实提供方账号和已正确签名的真机包做端到端验证。

常用检查：

```bash
npm test
npm run test:react
npx tsc --noEmit --project react/tsconfig.json
npm run build:react
git diff --check
```

## 项目结构

- `react/`：当前 React + TypeScript 产品界面、共享状态和组件测试。
- `www/`：Capacitor Web 宿主、持久化/云端/原生编排、纯计算和本地静态库。
- `android/`：内部测试用 Android 原生工程；同时包含生成接线和必须长期维护的手写源码。
- `ios/`：正式发布主线的 iOS 原生工程；使用 Swift Package Manager，正完成 StoreKit 与上架收尾。
- `cloudbase/`：Apple/微信登录、账户绑定、Premium 权益、账户注销、云备份和 AI 顾问云函数。
- `resources/`：App 图标设计源。
- `flutter/`：已停止并封存的 Flutter 重写成果，不是当前产品主线。
- `docs/`：法律文本、iOS 主线计划与交接、Flutter 历史存档和上下文工程计划。
- `.agents/skills/`：按任务加载的项目知识；这是项目 skill 的唯一来源。
- `AGENTS.md`：每次任务读取的精简常驻控制面。

## 备注

- 全新安装必须为空数据；测试数据只能存在于测试或临时环境。
- `io.github.jenkjyu.afterzero` 是 Android/iOS 的包身份，也是更新、微信回调和签名配置的一部分，不能随意修改。
- Release keystore 不提交、不移动、不重建替换。

## License

本项目使用 [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)（完整正式文本见 [`LICENSE`](LICENSE)，以英文原文为准）。

说明（仅帮助理解）：

- 可以查看、学习、fork 和修改代码，用于个人、非商业目的。
- 不可以用于商业用途，包括销售、广告变现或作为商业产品/服务的一部分。
- 商业使用需要另行获得作者授权。
