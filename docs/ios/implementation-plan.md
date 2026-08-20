# After Zero iOS 主线实施计划

状态：步骤 0–2 已批准；步骤 3、5、6、7 的本轮 iPhone 验收已完成；步骤 4 的 Apple→微信绑定已通过，其他 iOS 账户组合仍待补齐。步骤 8 的 CloudBase 与 App Store Connect 通知配置已完成，仍待 iPhone StoreKit 真机验收。用户于 2026-08-20 例外授权提前开始步骤 9；步骤 9 的仓库配置、Apple Distribution 签名及 `1.0 (1)`、`1.0 (2)`、`1.0 (3)`、`1.0.0 (4)` TestFlight 上传已完成，`1.0.0 (4)` 当前等待 Apple 处理；公网页面已通过 Netlify 上线且 `afterzero.tech` DNS 已验证，隐私政策和技术支持 URL 已具备，随后还需在 App Store Connect 填写/保存元数据、关联 App Store 版本并完成 TestFlight 验收。Android 回归降为内部测试事项，不阻塞 iOS 发布主线。

建立日期：2026-08-12

权威交接：[`handoff.md`](handoff.md)

## 目标与已确认决策

本计划把当前 Capacitor + React Android 产品扩展到 iOS，不恢复已封存的 Flutter 重写。

已由用户确认的产品与数据原则：

- App 改为本地优先：首次启动可以直接使用本地债务、还款日、统计、档案、通知和本地导入导出；AI、云备份等真实云功能才要求登录。
- 微信和 Apple 都只是同一个 After Zero 云端账户的登录方式；绑定完成后，任一方式都可独立登录，不要求每次双重验证。
- Android 与 iOS 的债务、档案和通知设置继续保存在各自设备本地，不自动上传、下载、同步或合并。
- 同一云端账号可在两端同时登录，两端本地账本可以不同。用户只有主动创建云备份时才上传，主动恢复某份备份时才覆盖当前设备本地数据。
- 绑定登录方式只合并云端账户归属，不合并两端本地债务。出现两个既有云端账户时，两边的云备份都保留，当前设备本地数据保持不动。
- 现有持久化键名、包名、账本算法和 Flutter 封存门禁继续受 `AGENTS.md` 保护。
- iOS 是正式发布主线；Android 仅供内部测试，不作为 iOS 步骤完成、TestFlight 或 App Store 发布的阻塞项。共享代码仍须保持基础构建健康；改动 Android 原生能力或发放 Android 内测包时再做对应 Android 构建与冒烟。

## 执行协议

### 用户批准门禁

1. 严格按步骤 0～10 顺序执行。
2. 本计划本身只授权完成步骤 0，不授权步骤 1 或后续实现。
3. 每一步开始前必须收到用户对该步骤的明确批准。对上一步的讨论、提问或一般性肯定不视为下一步授权。
4. 每一步达到全部验收门槛后，将状态写为“等待用户检查”，更新 [`handoff.md`](handoff.md)、`PROGRESS.md` 和该步涉及的稳定项目文档，然后立即停止。
5. 用户检查通过只代表该步可标为“已批准”；仍需用户明确指示“开始步骤 N+1”后才能进入下一步。
6. 未经用户改变指令，不执行 `git add`、`git commit`、`git push`、创建 PR 或发布正式版本。

2026-08-20，用户明确例外授权在步骤 8 的 iPhone StoreKit 验收完成前开始步骤 9。该例外只覆盖步骤 9 的签名、隐私、合规和 TestFlight 候选准备，不改变步骤 8 未闭环事实，不授权步骤 10、正式发布或自动 Git 操作。

### 原子步骤规则

- 一项端到端能力不能按“先写一半客户端、下一步补服务端”拆成两个步骤。每一步必须同时完成该能力需要的源码、类型、mock、测试、原生接线、云端部署、真机/模拟器验证和文档同步。
- 外部条件（完整 Xcode、Apple Developer 权限、微信开放平台配置、CloudBase 控制台、真机）缺失时，当前步骤记为“阻塞”，保留在原步骤内等待条件满足；不能把未完成部分挪到下一步，也不能把当前步骤误报为完成。
- 当前步骤内发现的同范围缺陷必须在本步骤闭环；明显属于后续步骤的事项登记到交接的“后续范围”，不得提前实施。
- 每一步只允许一个状态：`未开始`、`进行中`、`阻塞`、`等待用户检查`、`已批准`。只有一个步骤可以是`进行中`或`阻塞`。

### 平台验收优先级

- iOS 的源码、云端、真机和 App Store 验收是本计划的发布门槛。Android 的旧功能回归单独记录为内部测试清单，不再使 iOS 步骤保持“阻塞”。
- 改动共享 React/Web 代码时，仍至少执行受影响的测试、TypeScript、React build 与 iOS sync/build；仅在改动 Android 原生边界或准备发放 Android 内测包时，才要求对应 Android 构建和设备冒烟。

### 每步固定收尾

每一步结束前必须：

1. 运行该步列出的最小充分验证，并记录真实结果，不能用“应该通过”代替。
2. 检查 `git status --short`、`git diff --check`、生成物边界、敏感信息和无关改动。
3. 更新本计划状态、[`handoff.md`](handoff.md)、`PROGRESS.md`，以及被本步事实改变的 `README.md`、`AGENTS.md`、相关 skill 和法律文本。
4. 在交接中列出本步改动、验证证据、人工/控制台操作、未解决事项和下一步尚未授权的范围。
5. 停止等待用户检查，不提交代码，不进入下一步。

## 步骤总览

| 步骤 | 原子交付物 | 状态 |
|---:|---|---|
| 0 | 计划、交接与跨 session 门禁 | 已批准 |
| 1 | iOS 工具链与可运行的 Capacitor 原生壳 | 已批准 |
| 2 | 本地优先模式与云功能登录门 | 已批准 |
| 3 | Apple 登录与统一内部账户端到端闭环 | iOS 验收完成；Android 旧微信账号回归列为内部测试，不阻塞 |
| 4 | iOS 微信登录、身份绑定与既有云账号合并 | 进行中：官方 iOS SDK、CloudBase 函数/私有集合和 iPhone Apple→微信绑定已通过；仍待其余 iOS 账户组合与合并后备份可见性 |
| 5 | iOS 文件保存、分享与导入导出闭环 | iOS 验收完成；当前 UI 未暴露档案分享入口，用户确认本轮不阻塞；Android SAF 回归列为内部测试 |
| 6 | Android/iOS 本地通知双平台闭环 | iOS 验收完成；Android channel、450 条上限与重排列为内部测试 |
| 7 | iOS WebView、布局、键盘与手势全量适配 | iOS 验收完成；Android 交互回归列为内部测试 |
| 8 | StoreKit Premium、恢复购买与服务端权益 | 进行中：CloudBase 权益/通知函数、ADMINONLY 去重集合、HTTP 网关与 App Store Connect 生产/沙盒通知 URL 已配置；Mac TestFlight Sandbox 首购通过，注销后恢复购买的线上回退已部署待复测，仍待 iPhone 真机 StoreKit 验收 |
| 9 | 签名、隐私、合规与 TestFlight 发布候选 | 进行中（例外授权）：仓库隐私/发布配置、Apple Distribution 签名、`1.0 (1)`、`1.0 (2)`、`1.0 (3)`、`1.0.0 (4)` 上传、公网页面上线和 DNS 验证已完成；等待 `1.0.0 (4)` 处理、TestFlight 安装验收、构建关联、App Privacy 和 App Store Connect 其他元数据 |
| 10 | iOS 总回归、Android 内测冒烟与 App Store 首次提交 | 未开始 |

## 步骤 0：计划、交接与跨 session 门禁

### 完整范围

- 建立本计划，记录已确认的本地数据、账号、绑定和手动云备份原则。
- 建立滚动交接文档，保存当前步骤、准确停点、验证、阻塞和下一步授权状态。
- 在 `AGENTS.md` 和 `README.md` 提供计划入口，保证新 session 不会只看到旧 Android 现状而丢失 iOS 计划。
- 在 `PROGRESS.md` 记录本机当前停点。

### 验收门槛

- 两份 iOS 文档之间及根文档入口无断链。
- 计划明确“每步完整闭环、每步停止、用户批准后仍不得自动进入下一步、全程不提交”。
- 不修改任何产品源码、生成物、依赖或原生工程，不运行产品构建。
- `git diff --check` 通过。

### 预计涉及文件

- `docs/ios/implementation-plan.md`
- `docs/ios/handoff.md`
- `AGENTS.md`
- `README.md`
- `PROGRESS.md`（本机忽略文件）

## 步骤 1：iOS 工具链与可运行的 Capacitor 原生壳

### 开始条件

- 用户明确批准开始步骤 1。
- Mac 可安装/使用完整 Xcode 26+；若安装或首次授权需要用户操作，本步骤保持进行中或阻塞。

### 完整范围

- 安装并验证完整 Xcode、iOS Simulator、Command Line Tools 选择和 Xcode license；依赖管理优先使用 Swift Package Manager，只有实际插件不支持 SPM 时才按需安装 CocoaPods。
- 安装与现有 Capacitor `8.4.1` 对齐的 `@capacitor/ios`，不顺带升级整个 Capacitor 栈。
- 运行一次 `npx cap add ios` 创建受版本控制的根 `ios/` 工程；以后只使用 build/sync，不重复 add 重建。
- 配置基础 Bundle ID、App 名称、最低 iOS 版本、基础图标/启动资源和生成物忽略边界。
- 构建 React、同步 iOS，在模拟器冷启动现有 Web App；此步不提前改变登录产品逻辑。
- 将原生 skill、README、AGENTS 和构建说明扩展为 Android/iOS 双平台真实边界。

### 验收门槛

- `xcodebuild -version` 可用，Swift Package 解析成功，Capacitor doctor/等价检查无关键错误；当前工程不得无实际依赖地要求 CocoaPods。
- `npm run build:react`、`npx cap sync ios` 成功。
- iOS Simulator 编译、安装、冷启动成功，WebView 无致命 console 错误。
- Android 现有测试与最小构建链未被新增 iOS 平台破坏。
- 没有提交 DerivedData、Pods 缓存、用户签名文件、密钥或环境专属配置。

### 预计涉及文件

- `package.json`、`package-lock.json`
- `ios/**`、必要的 `.gitignore`
- `capacitor.config.json`（仅确有跨平台基础配置时）
- `README.md`、`AGENTS.md`、`capacitor-native-runtime` skill
- 本计划、交接和 `PROGRESS.md`

## 步骤 2：本地优先模式与云功能登录门

### 完整范围

- 移除“启动即全屏强制微信登录”，让未登录用户直接进入空白本地账本；不改现有持久化键，不迁移或清空已有数据。
- 建立明确的三态账户展示：本地使用、微信登录、Apple 登录/统一账号（Apple 按钮可在步骤 3 才实际可用，本步不得放不可用入口误导用户）。
- 未登录时允许债务、还款日、统计、档案、本地 JSON 导入导出、本地通知和本地模拟。
- AI、云备份及其他真实云调用在实际入口和 bridge 执行层双重 fail-closed；触发时解释登录用途，取消后继续本地使用。
- 登录成功不自动上传或恢复；退出登录保留所有本地数据；重置本地数据与注销云端账户继续分离。
- 同步隐私政策、用户协议、账户页面、测试 mock、bridge 契约和项目控制文档。

### 验收门槛

- 全新安装/清空站点数据后无需账号即可创建、编辑、还款、统计、导入导出并重启保持本地数据。
- 未登录调用 AI/云备份不会发出受保护云请求；登录提示可取消且不破坏当前页面。
- 微信已登录旧用户升级后仍能识别现有 `ACCOUNT_KEY` 与 CloudBase 会话，不丢本地数据。
- 退出后本地账本和本地通知保留；注销/重置路径语义和二次确认正确。
- React、TypeScript、build、Android sync/build、iOS sync/build及必要真机检查全部通过。

### 预计涉及文件

- `www/index.html`
- `react/src/**`、`react/__tests__/**`
- 法律文本双副本及账户/Premium/桥接相关 skills
- `README.md`、`AGENTS.md`、本计划、交接和 `PROGRESS.md`

## 步骤 3：Apple 登录与统一内部账户端到端闭环

### 完整范围

- 建立与登录提供方解耦的内部 `userId` 与身份映射；微信 `openid`、Apple `sub` 只作为 provider identity，不再被新代码当成通用账户概念。
- 兼容已有微信用户：其内部 `userId` 可继续等于旧 `openid`，通过惰性映射避免搬迁既有备份和 AI 用量。
- 完成 iOS “通过 Apple 登录”原生入口、nonce/state、防重放和取消/失败反馈。
- 新增 Apple 登录云函数：在服务端验证 Apple identity token 的签名、issuer、audience、过期时间和 nonce，再查找/创建内部账户并签发 CloudBase 自定义登录票据；绝不信任客户端直接传来的 `sub`。
- 让 Apple 新用户可独立成为完整云端账号，并以内部 `userId` 使用 AI、云备份、注销等现有云功能，不要求验证微信。
- 把账户展示形状从微信专属字段演进为 provider-neutral 兼容形状，同时兼容读取旧 `after-zero-account-v1` 数据。
- 部署涉及的云函数、权限与集合，并完成真实 Apple ID 真机端到端验证。

### 验收门槛

- 新 Apple 用户可登录、冷启动恢复会话、使用 AI/云备份、退出并再次登录、注销账户。
- 已有微信账号和所有 Android 云功能不回归；旧备份/AI 用量仍归原账号。
- 伪造/过期/错误 audience/错误 nonce 的 Apple token 均被服务端拒绝。
- 未经登录的客户端不能调用受保护函数；Apple 登录函数只开放到完成登录所需的最窄权限。
- 云函数单测/本地测试、部署日志、iPhone 真机和项目文档全部闭环；Android 回归按内部测试策略单独记录，不阻塞本步骤。

### 预计涉及文件

- `ios/**`
- `www/index.html`、账户 React/类型/mock/测试
- 新增或调整 `cloudbase/functions/**`
- 隐私政策、账户/微信/CloudBase/云备份/AI skills
- `README.md`、`AGENTS.md`、本计划、交接和 `PROGRESS.md`

## 步骤 4：iOS 微信登录、身份绑定与既有云账号合并

### 完整范围

- 接入微信 iOS OpenSDK、URL Scheme、Universal Link/Associated Domains 和 Swift `WeChatLogin` 插件，保持现有 JS `isInstalled()`、`login()`、`wechatAuthResult` 契约。
- 在 iPhone 真机完成拉起微信、OAuth state 校验、回调和 CloudBase 自定义登录；模拟器结果不能代替真机验收。
- 账户页提供“绑定 Apple”与“绑定微信”；绑定时要求当前会话和待绑定提供方都重新完成真实授权，日常登录不要求双重验证。
- 若待绑定身份未属于其他账户，新增身份映射；若两边已有账户，执行幂等、可恢复的云账号合并流程。
- 云账号合并保留双方备份并标记来源平台/设备/时间；AI 当月用量相加并按限额封顶；注销、旧会话失效、并发重试和部分失败可恢复。
- 不自动合并、上传、下载或覆盖 Android/iOS 本地债务；绑定完成后两端本地账本继续独立。
- 为用户提供准确提示与冲突确认，禁止按昵称、头像、邮箱或设备自动猜测同一人。

### 验收门槛

- “先微信后绑 Apple”“先 Apple 后绑空微信”“Apple 与既有微信账号合并”三条路径真机通过。
- 合并前双方云备份均在合并后账号可见，来源清晰；两台设备本地数据均未变化。
- 任一登录方式在新会话中都进入同一内部 `userId`；被合并账号旧会话不能继续产生分叉云数据。
- 重复请求、网络中断和中途失败不会重复搬迁、丢备份或重置 AI 额度。
- Android 微信登录和旧账户注销回归通过，相关云函数已部署并留有测试/日志证据。

### 预计涉及文件

- `ios/**`
- 账户 UI、bridge、类型、mock 和测试
- `cloudbase/functions/**`、CloudBase 集合/权限配置说明
- 云备份列表与记录形状
- 法律文本和相关 skills
- `README.md`、`AGENTS.md`、本计划、交接和 `PROGRESS.md`

## 步骤 5：iOS 文件保存、分享与导入导出闭环

### 完整范围

- 实现 Swift `SaveFile` 插件，保持现有 `save({data,filename,mimeType})` JS 契约。
- 将大文件先写入 iOS 临时目录，再使用系统 Files 文档选择器保存；成功、取消、失败都清理临时文件。
- 使用系统分享面板分享档案文件；保存和分享职责明确，不依赖 WKWebView 的 `<a download>` 作为原生主路径。
- 验证 JSON 备份、Excel、PDF、Markdown、上传档案的导入、保存、分享、打开和取消流程。
- 保留 Android SAF 的 cache 临时文件与 64 KB 流式复制，不因抽象双平台而退化 Android 实现。

### 验收门槛

- iPhone 真机成功保存并打开 JSON/XLSX/PDF/档案文件，取消不报错、不留错误 0B 文件。
- 较大 PDF/XLSX 和接近档案上限的文件无崩溃、无明显双份内存问题，临时文件可回收。
- 桌面浏览器 fallback 仍可用；Android SAF 成功、取消和大文件回归按内部测试策略单独记录，不阻塞本步骤。
- bridge、类型、测试、法律/隐私说明和原生文档同步完成。

### 预计涉及文件

- `ios/**`
- `www/index.html`（仅平台分流/统一错误语义所需最窄修改）
- 原生/桥接/档案相关测试与 skills
- `README.md`、`AGENTS.md`、本计划、交接和 `PROGRESS.md`

## 步骤 6：Android/iOS 本地通知双平台闭环

### 本轮提前实现状态（2026-08-13）

- 用户明确授权在步骤 3～5 真机验收前提前实现本步骤，但不进行真机验收、不将本步骤标为完成，也不进入步骤 7。
- 本地实现与双平台构建完成；真机验收仍按下方门槛，与步骤 3～5 的 iPhone/Android 真实设备检查集中执行。

### 完整范围

- 继续复用 `calc.js` 唯一通知计算，按平台传入数量上限：Android 450；iOS 正式提醒 63 条，为测试通知保留一个槽位。
- Android 保留 channel、`channelId`、`smallIcon` 和现有非精确提醒策略；iOS 不发送 Android 专属字段，并配置前台 banner/list/sound 表现。
- 修正“仅支持安卓”等平台文案，处理 iOS 权限拒绝、系统设置、取消、重排和 App 重启后的行为。
- 覆盖跨时区、夏令时边界、同日多债务、超过 63 条截断和最近提醒优先顺序。

### 验收门槛

- iPhone 真机权限→测试通知→后台/锁屏到时通知链通过，待处理正式提醒不超过 63。
- Android 真机/模拟器的 channel、测试通知和 450 条策略按内部测试策略单独回归，不阻塞本步骤。
- 两端修改债务/规则后“全清再重排”结果正确；纯计算测试、React测试和双平台构建通过。
- 通知相关文案、skills、README/AGENTS 和交接同步完成。

### 预计涉及文件

- `www/index.html`、`www/js/calc.js`（如需平台参数化）
- 通知 UI、类型/mock/测试
- `capacitor.config.json`、`ios/**`（仅所需配置）
- 原生、UI、债务 skills
- `README.md`、`AGENTS.md`、本计划、交接和 `PROGRESS.md`

## 步骤 7：iOS WebView、布局、键盘与手势全量适配

### 本轮提前实现状态（2026-08-13）

- 用户明确授权在步骤 3～6 真机验收前提前实现本步骤；此授权不改变步骤 3～6 状态，也不授权步骤 8。
- 已完成动态视口/安全区/键盘滚动余量、iOS 表单防自动缩放、WKWebView 交互式键盘收起与禁用 Web 历史侧滑、以及自定义卡片/档案预览/AI 历史项的基础键盘和 VoiceOver 语义。
- 已在 iPhone 17 Pro 与 iPhone 17 Pro Max / iOS 26.5 模拟器验证浅深色主页、iPhone 17 Pro 表单聚焦与交互式收键盘；真机触摸、动态字体、VoiceOver、完整逐页清单和全部手势仍按下方门槛执行，不能标为完成。

### 完整范围

- 对四个 tab、全部 subpage/sheet/modal 做 iPhone 小屏/大屏、刘海/灵动岛、Home Indicator、浅深色和动态字体边界检查。
- 修复 WKWebView 下 safe area、键盘顶起/收起、焦点、滚动链、overscroll、原生表单控件和 PDF 预览差异。
- 验证债务长按排序、左右滑动、还款日销期、图表 scrub/旋转、sheet grip 和弹层层叠；不以桌面鼠标结果代替 iPhone 触摸。
- 明确 iOS 交互式返回手势/导航行为；不把 Android 硬件返回链原样套到 iOS。
- 完成无障碍标签、键盘/VoiceOver 基础检查和 `prefers-reduced-motion`。

### 验收门槛

- 预定 iPhone 模拟器矩阵和至少一台真机的逐页清单全部有证据，无未解释的阻断级布局/手势问题。
- Android 浅深色、手势、硬件返回和 WebView 视觉按内部测试策略单独回归，不阻塞本步骤。
- React/TypeScript/build、双平台 sync/build、截图/触摸证据及 UI 文档同步完成。

### 预计涉及文件

- `react/src/**`、`www/index.html`、测试
- `ios/**`、必要的 Android 对照文件
- UI/桥接/各功能专项 skills
- `README.md`、`AGENTS.md`、本计划、交接和 `PROGRESS.md`

## 步骤 8：StoreKit Premium、恢复购买与服务端权益

### 完整范围

- 将当前不可真实购买的占位流程替换为 iOS StoreKit 非消耗型买断商品；商品、价格和展示以 App Store Connect 实际配置为准。
- 服务端验证 Apple 交易/收据并保存不可伪造的账户级权益与购买来源；本地 Premium 只作为缓存/离线展示，不作为购买证明。
- 实现购买、处理中、失败、取消、恢复购买、换机、退款/撤销后的权益更新。
- 绑定/合并账号时保留合法权益和购买凭证；不得用本地备份中的 `premium: true` 冒充 StoreKit 购买。
- 明确 Android 在尚未接入正式支付时的展示与权益策略，不能让 iOS 实现破坏 Android 现有兑换/测试路径。
- 同步会员协议 App 内副本与 Markdown 源稿、隐私说明、价格文案和审核材料。

### 验收门槛

- StoreKit 测试环境中购买、取消、失败、恢复、换设备和退款/撤销场景通过。
- 未购买用户无法通过改 localStorage 或恢复备份获得服务端 Premium；合法购买在绑定后的任一登录方式下可恢复。
- AI、云备份、报告导出和策略入口权益一致；Android 回归按内部测试策略单独记录，不阻塞本步骤。
- 服务端、客户端、法律文本、App Store Connect 配置和交接全部闭环。

### 预计涉及文件

- `ios/**`
- Premium/账户 React、bridge、calc 状态与测试
- 新增或调整 `cloudbase/functions/**`
- 两份会员协议、隐私政策、相关 skills
- `README.md`、`AGENTS.md`、本计划、交接和 `PROGRESS.md`

## 步骤 9：签名、隐私、合规与 TestFlight 发布候选

### 完整范围

- 配置 Apple Developer Team、App ID、Bundle ID、签名、entitlements、版本/构建号、图标、启动画面和支持设备。
- 完成 App Privacy、Privacy Manifest、权限用途、加密出口合规判断、隐私政策 URL、支持 URL 和审核所需账号/演示说明。
- 配置 App Store Connect 产品页、年龄评级、分类、截图和中国大陆上架所需的 ICP/App 备案信息；外部材料缺失则本步骤保持阻塞。
- Archive 并上传一个发布候选到 TestFlight，完成内部测试安装和核心冒烟。
- 所有证书、私钥、provisioning、控制台密钥和环境配置保持在受控位置，不提交仓库。

### 验收门槛

- Xcode Release Archive、上传处理和 TestFlight 安装成功。
- App Store Connect 无阻止提交的缺失项；签名、Bundle ID、版本、URL、隐私披露与实际功能一致。
- TestFlight 真机完成登录、本地模式、云备份、AI、通知、文件、Premium 核心冒烟。
- Android 内测身份和构建不受影响；发布文档、skills、交接完整。

### 预计涉及文件

- `ios/**`、必要的 `capacitor.config.json`
- 隐私/法律/发布文档与资源
- `README.md`、`AGENTS.md`、相关 skills
- 本计划、交接和 `PROGRESS.md`
- App Store Connect / Apple Developer /备案控制台（仓库外）

## 步骤 10：iOS 总回归、Android 内测冒烟与 App Store 首次提交

### 完整范围

- 按真实空安装、Apple 新用户、微信旧用户、绑定/合并、多设备本地数据独立、手动备份恢复等矩阵完成 iOS 总回归；旧 Android 升级仅做内部测试冒烟，不阻塞提交。
- 复核所有持久化键兼容、新安装空数据、账本单一实现、隐私信息、云函数权限、存储归属、Premium 凭证和 Flutter 零修改。
- 修复总回归中属于 iOS 上线范围的全部阻断问题，并重新生成 TestFlight/Release Candidate；不得把同范围缺陷推成计划外下一步。
- 准备审核备注、演示路径和必要测试账号/说明，提交 App Store 首次审核。

### 验收门槛

- 根测试、React测试、TypeScript、React build、Android/iOS sync 与双平台 release 构建全部通过。
- Android 与 iOS 真机矩阵无未解释阻断差异；本地数据独立和手动云备份语义有明确验证证据。
- CloudBase 生产函数、集合权限、身份映射、备份归属、AI额度和购买权益检查通过。
- App Store Connect 成功进入“等待审核”或当时等价状态；若 Apple 返回技术/元数据问题，本步骤保持进行中直至首次提交闭环。
- 最终更新 README、AGENTS、skills、法律/发布文档、计划、交接和 `PROGRESS.md`，停止等待用户最终检查；仍不自行提交 git。

## 新 session 恢复顺序

新 session 继续本计划时必须：

1. 读取根 `AGENTS.md`。
2. 读取本文的“执行协议”“步骤总览”和当前步骤全文。
3. 完整读取 [`handoff.md`](handoff.md)。
4. 按 `AGENTS.md` 读取 `PROGRESS.md` 最近自然日记录与当前步骤命中的 skills。
5. 检查 `git status --short`，把所有既有差异视为用户工作树，不覆盖、不回滚。
6. 先确认交接中的当前状态和用户是否已经明确批准本步骤；没有批准就只讨论，不实施。
