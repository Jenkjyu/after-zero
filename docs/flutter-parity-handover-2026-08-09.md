# Flutter 重写对齐工作交接文档（2026-08-09）

> 历史存档：本文是 2026-08-09 写给下一位执行者的旧交接，正文中的“当前状态”“剩余工作”和执行命令不构成恢复授权。Flutter 重写已于 2026-08-10 停止并封存；当前状态与权威入口见 [`flutter-parity/README.md`](flutter-parity/README.md)。

> 本文件写给"接手 After Zero Flutter 重写对齐工作"的视觉能力大模型。用户要求：**和旧版一模一样**（内容/UI/交互/手势/功能全部一致），工作量不计，不允许"近似实现"或"图省事"。唯一验收标准 = 旧版运行表现。

## 1. 项目背景

- **After Zero**：个人债务记账 App。旧版 = Capacitor 套壳 WebView（`www/index.html` vanilla + `react/` 界面），包名 `io.github.jenkjyu.afterzero`，是当前唯一可发布版本。
- **Flutter 重写**（`flutter/` 顶层目录，独立工程）：目标完全替换旧版并支持 iOS。包名 `io.github.jenkjyu.after_zero`（故意不同，两版可同机并存）。
- 用户已决定：**先不做 iOS**（Xcode/CocoaPods 暂缓）；阶段8验收标准 = 以旧版为唯一基准的全量对齐。
- 历史提交：`52e976c`（法律文档/统计页结论引擎/sheet文案/左滑手势）、`df6b810`（我的页五色图标）、`5a8a2fd`（还款日/统计页结构+配色、calc差分探针）。

## 2. 当前状态（阶段0–7完成，阶段8进行中）

- `flutter analyze` 零 issue，`flutter test` 178 条全绿。
- 已完成的对齐修复：三份法律文档全文（`assets/legal/` + 小型 markdown 渲染器）；统计页结论引擎完整移植（`flutter/lib/report/findings.dart`）+ 报告各分区逐字对齐；各 sheet 文案/字段；我的页五色图标徽章；还款日/统计页去掉 AppBar、hero 五档配色、报告从卡片式改回流动文本；左滑"露出 76px 按钮"（`flutter/lib/ui/shared/swipe_reveal.dart`）；长按 jiggle 编辑模式；逻辑层差分探针（`flutter/tool/calc_probe.dart`，JS/Dart 全一致）。
- 完整差异审计记录：`docs/flutter-parity-audit-2026-08-08.md`（含误报修正，接手前必读）。

## 3. 运行与对比环境（接手后按此搭建）

### 模拟器

- Android 14 AVD `flutter_dev`。**必须手动起，不要用 `flutter emulators --launch`**（会静默失败）：
  `/opt/homebrew/share/android-commandlinetools/emulator/emulator -avd flutter_dev -no-window -gpu swiftshader_indirect`
- ADB：`/opt/homebrew/share/android-commandlinetools/platform-tools/adb`。

### 旧版 App（基准）

- 构建：`npx cap sync android` 后 `cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew :app:assembleDebug --no-daemon --console=plain`（产物 `android/app/build/outputs/apk/debug/app-debug.apk`）。
- 登录门绕过（WebView CDP）：装好后 `adb shell am start -n io.github.jenkjyu.afterzero/.MainActivity`，`adb shell "cat /proc/net/unix | grep webview_devtools"` 拿 pid，`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`，`curl http://127.0.0.1:9222/json` 拿 page id，用 WebSocket 执行 `Runtime.evaluate`：`localStorage.setItem("after-zero-account-v1", JSON.stringify({openid:"test",nickname:"测试昵称",avatarUrl:"https://example.com/a.png",loggedInAt:Date.now()}))` 再 `location.reload()`。
- **CDP 会卡死**：连续多次 WebSocket 连接后调试服务无响应，重启旧版 App + 重建 forward 即可。脚本尽量一次连接做完全部操作，结束时 `ws.close()`。
- 旧版内容抽取：所有 sheet/subpage 常驻挂载在 DOM（transform 移出屏幕），一次连接用 `document.querySelector('#react-sheets-root').innerText` + portal sheet 全量导出即可，不需要逐个打开。
- 旧版排版几何：CDP `Runtime.evaluate` 读取 `getBoundingClientRect()` + `getComputedStyle()`（字号/字重/行高/颜色/padding）。
- 旧版数据注入：`localStorage.setItem("debt-manager-v5", JSON.stringify([...]))` + reload。
- 旧版 Premium：`localStorage.setItem("after-zero-premium-v1", JSON.stringify({premium:{method:"onetime",at:"2026-08-01T00:00:00.000Z"}}))`。
- 旧版配色 token 权威来源：`www/index.html` 顶部 `:root` 变量（`--critical/--warning/--good/--accent`、`--ic-brand/blue/violet/rose/amber` 等，明暗各一套；`--ic-*` 两主题共用同一套）。

### Flutter App（被验收方）

- 构建：`cd flutter && flutter build apk --debug --dart-define=AFTER_ZERO_PREVIEW=true`（产物 `flutter/build/app/outputs/flutter-apk/app-debug.apk`，约 239MB）。**登录门只能被带此参数的 debug 包跳过**；release/profile 永远强制登录。
- 语义树导出：启用 TalkBack（`adb shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService` + `accessibility_enabled 1`），重启 App，`adb shell uiautomator dump`，文本在 `content-desc`/`text` 属性，bounds 在 `bounds="[x1,y1][x2,y2]"`。**注意**：只导当前可见区域，滚动后再导；横向/纵向滚动会漏掉屏幕外内容（早期多处误报由此而来）。
- Flutter 数据注入：停 App，`adb push` 一个 SharedPreferences XML 到 `/data/local/tmp`，再 `adb shell run-as io.github.jenkjyu.after_zero cp /data/local/tmp/seed.xml shared_prefs/FlutterSharedPreferences.xml`。key 要加 `flutter.` 前缀（如 `flutter.debt-manager-v5`、`flutter.after-zero-premium-v1`、`flutter.after-zero-account-v1`），值是与旧版相同的 JSON 字符串。旧版 localStorage 与 Flutter shared_preferences **互不共享**。

### 像素/几何对比工具（可重建）

- `/private/tmp/az_diff.py`：ImageChops 差分 + 变化占比 + ASCII 热力图（阈值参数第3个，默认24）。
- `/private/tmp/az_ascii.py`：亮度 ASCII 渲染，用于无视觉时看布局结构。
- 对比前注意两边截图尺寸/状态栏差异（旧版 CDP 截图无系统栏）；比例不同先 resize。

### 测试数据

- 建议用两笔债务（等额本息银行贷 + 信用卡分期，一笔已还一期、其余未还），覆盖：空态/有数据/明暗/Premium 态/非 Premium 态。早期用 `{测试贷款 10000/12%/5期, 测试信用卡 5000/15%/14期}`。

## 4. 剩余工作清单（接手后按此逐项做，全部以旧版为基准）

### 4.1 交互形态对账（最高优先，当前最大的缺口）

- 对**每一个入口**（按钮/列表行/手势）枚举：旧版打开形态 vs Flutter 现状，不一致全部改。
- **已知不一致（必须改）**：
  - `DebtEditorScreen`（编辑/新增债务）→ 旧版是**底部抽屉**（`.sheet`），Flutter 现在是全屏路由，必须改 `showModalBottomSheet`。
  - `DebtDetailScreen`（债务详情）→ 旧版是**底部抽屉**（`.sheet`），Flutter 现在是全屏路由，必须改。
  - `NotifyScreen`（还款提醒通知设置）→ 旧版是**底部抽屉**（`.sheet`），Flutter 现在是全屏路由，必须改。
- **已知一致**：排序面板（`showModalBottomSheet` ✓）；提前还款模拟（底部抽屉 ✓）；Premium/关于/账户/三份协议/档案库/云备份/AI/多策略（旧版 `.subpage` 整页，Flutter 全屏路由 ✓）。
- 还需逐项核对：每个 sheet 的关闭方式（关闭按钮/返回箭头/点遮罩/返回键）、打开时默认状态、确认弹窗（删除/结清/减免的二次确认与文案）、toast 文案。

### 4.2 排版几何对账（逐屏）

- 每屏用"旧版 DOM 计算几何 vs Flutter bounds+源码数值"对比：字号、字重、行高、间距、内边距、对齐、卡片宽高。产出差异表（如"标题 15 vs 16px、区块间距差 8px"）逐项修。
- **已知残余**（暗色）：
  - 统计页 ~31% 像素差、还款日页 ~30%：已定位为字体/行距/间距层。旧版数字用 `ui-monospace` 等宽 + tabular-nums；Flutter 全局未注册打包字体（`assets/fonts/NotoSansSC-wght.ttf` 在 assets 里但没有 pubspec `fonts:` 声明、theme 也没设 fontFamily）。是否注册该字体/是否给数字用等宽——由视觉模型定夺，别盲调。
  - 我的页 ~20%：卡片间距/高度等细节。
- 每屏修完后重截两版对比确认。

### 4.3 视觉观感复核（必须有视觉能力）

- 石墨 hero 卡（渐变/阴影/烟雾动效）、磨砂玻璃（backdrop-filter）、图表配色与描边、深色模式全部页面、按钮层级、启动图标/品牌页眉。逐屏与旧版截图并排确认。

### 4.4 手势

- 左滑（已复刻 76px 露出+半程阈值）；长按 jiggle 编辑（长按进入/抖动/保存退出已做，**"按住 450ms 不点保存退出"未做**）；统计曲线拖动读数（三里程碑已标、读数/光标手感需真机或视觉确认）；饼图旋转阻尼；sheet 拖把；滚动物理感。

### 4.5 内容文案兜底

- 用语义树/DOM 全量再跑一遍所有 tab/sheet × 空态/有数据 × 明暗 × Premium 态，确认与旧版逐字一致（含空格）。已知可能残留：报告正文标点后空格、日期格式、金额符号。

### 4.6 真机/端到端（用户前置条件，列出不阻塞）

- 微信登录：新包名 `io.github.jenkjyu.after_zero` + release 签名 SHA1 需登记微信开放平台（当前 release 用 debug 签名）；真机微信 OAuth、通知精确闹钟/厂商后台限制、SAF 另存为、分享、档案分享/PDF 预览。
- 云端功能（云备份/AI）：代码层已对账一致，端到端验证延后；若想无微信验证，可加 debug 匿名登录（复用 CloudBase 匿名登录 HTTP 接口，方案2，未实现）。

## 5. 执行纪律（用户明确要求）

1. **照抄旧版源码与运行表现，禁止近似重写、禁止自创设计**。
2. 每修一项：改 → 构建 debug 预览包 → 与旧版同屏/同状态对比 → 一致才继续。
3. 交互形态、排版、文案、手势、主题全部入清单，不等用户逐条指出。
4. 完成一批更新 `docs/flutter-parity-audit-2026-08-08.md` 与本机 `PROGRESS.md`，并提交。
5. 真机/iOS 事项按用户决定延后，不要擅自改变包名或登录策略。
