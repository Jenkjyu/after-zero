# After Zero

一个记债务的个人工具，打包成了能真正安装的安卓app。名字的寓意：对债务归零之后生活的期待。

这个app用 [Capacitor](https://capacitorjs.com/) 包成了原生安卓壳。`www/index.html`是纯HTML/CSS/JS写的vanilla胶水层——数据模型、localStorage/IndexedDB读写、cloud函数调用、native插件调用都在这里，改这一层本身不需要构建步骤；实际界面（四个tab和全部子页面/弹窗）现在都由React实现，见下一段。另外有几段手写的原生插件代码：一段用于把档案库/备份文件真正存到用户自选的位置（点"下载"会弹系统"另存为"选择器，网页标准的下载方式在安卓WebView里不可靠），一段用于接入微信登录；还款提醒页支持本地推送通知（到期前提醒），用的是官方Capacitor插件。**打开App需要先微信登录**——账号体系目前是这个App唯一的准入方式。

**底部"债务"/"还款日"/"统计"/"我的"四个tab、以及债务详情窗、新增/编辑债务表单、账户详情页、订阅页、购买者服务条款页、提前还款模拟器、通知设置面板、档案库、云备份、AI债务助手这10个不属于任何tab的常驻React入口，已经全部由React接管（绞杀者模式，逐页面替换，全部完成）**：`react/`下是这5个Vite入口（四个tab各一个 + 上述10个常驻入口共用的`sheets`入口）的React+TypeScript源码，构建成`www/js/react-debts/{debts,pay,report,mine,sheets}.js`五个文件各自嵌入`index.html`，跟vanilla那份共享同一份数据（细节见`CLAUDE.md`"React 迁移"一节）。vanilla主脚本现在只剩数据模型/localStorage/IndexedDB读写/cloud函数/native插件调用这类逻辑，不再有任何界面渲染代码。这部分需要额外的构建步骤（`npm run build:react`）。

"还款日"tab把每一期待还款项按日期排成一条清单，可以按"下一期/已逾期/7天内/15天内/30天内"筛选，也可以点日历图标自由选一个未来的日期、看"到那天为止一共要还哪些钱"——窗口拉长时同一笔债务的多期会各自成行。左滑可以直接销掉一期（只有每笔债务当前最早的那一期能销——还款计划是按顺序走的，跳期销不成立）。

"销这期"支持部分还款——点一次会问这次还多少钱（默认是这期还欠的全部，全款用户体验不变），少还一点也可以，这期会继续留在待还里、欠款相应减少，之后可以再点一次继续补齐。债务详情窗还多了一个"协商减免这一期"按钮，不管实付多少都能直接把这一期结清（差额算作减免）。每一期真正被还清的日期（区别于计划日期）会记在"实付日期"里，详情窗计划表和Excel导出都能看到。

底部"统计"tab不是一张常规的数据看板，是一份自动生成的"债务报告"：开头用一句判断句总结当前状况，接着列出几条规则算出来的结论（比如"哪一笔债务实际吃掉了最多利息"——这跟"哪一笔利率最高"经常不是同一个答案，因为剩余利息取决于金额和期限、不只是利率）、点出最该优先处理的那一件事，然后是还清进度走势图（三个关键节点直接标在图上、可以按住拖动看任意时间点的余额）、未来几个月的还款压力（面积图/柱状图可切换，点某个月能展开当月要还哪些债务）、按欠款金额排的债务清单（只列到累计占大头的那几笔）、一个能用手指拖拽旋转的债务类型占比图，最后是导出报告和口径说明。

**⚠️`flutter/`目录是一次正在进行的全量重写，目标是彻底替换掉本节描述的Capacitor架构（安卓+iOS双端），详见下面"Flutter重写"一节——现在描述的这套Capacitor/React架构仍是当前唯一可用、可发布的版本，重写完成前不受影响。**

"我的"页有一个**单一 Premium** 订阅入口，只提供一次性买断这一种购买方式（¥15，没有按月/按年订阅），目前只是UI占位（App还没上架应用商店，暂时接不了真实支付），为未来的付费功能铺路。免费/付费的边界是按"这个功能有没有真实服务器/算力成本"划的：统计报告本身、提前还款收益模拟器、多策略对比规划（雪球法/雪崩法/自定义顺序对比总利息和还清时间），完全免费；报告页**导出**PDF/Excel、云备份（手动创建备份记录，可随时恢复）、**AI债务助手**（雪球/雪崩法分析生成分析报告 + 针对自己债务数据的多轮问答，服务端调用腾讯云开发内置大模型，每月限量50次，超限后可以一键复制包含全部债务信息的完整提示词去问其他AI助手），是Premium会员专属功能。

## 环境要求

- Node.js + npm
- JDK 21（JDK 17 不够用——会报 `无效的源发行版：21` 编译错误）
- 安卓SDK命令行工具，需要装这几个组件：
  - `platform-tools`
  - `platforms;android-34`
  - `build-tools;34.0.0`

macOS上可以用Homebrew装：`brew install --cask android-commandlinetools`，然后用 `sdkmanager` 装上面几个组件。

用Homebrew装的`openjdk@21`默认不会链接到`java`命令（keg-only），跑Gradle前可能要显式指定：`JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug`（Apple Silicon路径；Intel Mac是`/usr/local/opt/openjdk@21`）。

## 首次配置

```bash
npm install
```

新建 `android/local.properties`（不提交进git，因人因机器而异），写上你的SDK路径：

```
sdk.dir=/path/to/your/android-sdk
```

## 编译

```bash
npm run build:react           # 如果改了 react/ 下的代码——构建到 www/js/react-debts/
npx cap sync android          # 把 www/ 同步进原生工程
cd android
./gradlew assembleDebug       # 产出 android/app/build/outputs/apk/debug/app-debug.apk
```

第一步只在改了`react/`下的源码时才需要重新跑——四个tab和全部子页面/弹窗的界面代码现在都在`react/`里，改这些必须先跑这一步。只改`www/index.html`本身（数据模型、localStorage/IndexedDB读写、cloud函数调用、native插件调用这类vanilla逻辑，不涉及界面）不需要这一步，直接`npx cap sync android`即可。

编译出来的 `app-debug.apk` 可以直接传到安卓手机上装（装的时候允许"安装未知来源应用"），或者用数据线 `adb install app-debug.apk`。这是debug包，自己装没问题，不是能直接上架应用商店的格式。

## 项目结构

- `www/index.html` —— vanilla胶水层（数据模型、localStorage/IndexedDB读写、cloud函数调用、native插件调用；界面渲染已经全部由`react/`接管，见下一条），`www/fonts/` 是它引用的本地字体文件，`www/img/` 是登录门用到的图标图片，`www/js/` 是本地打包/拆分出去的 JS：`jspdf.umd.min.js`/`xlsx.full.min.js` 是第三方库（用于"统计"页导出 PDF/Excel，放本地是因为国内移动网络下相关 CDN 常加载失败），`pdf.min.mjs`/`pdf.worker.min.mjs` 是 pdf.js（用于档案库预览 PDF 文件——安卓 WebView 没有内置 PDF 渲染插件，改用 pdf.js 把每页画到 canvas 上），`calc.js` 是从 `index.html` 拆出来的纯计算函数（`recompute`/`genPlan`/`amortForward` 等，不碰 DOM），配 `test/` 下的 `node:test` 单元测试（`npm test` 运行），`react-debts/` 是下面`react/`目录构建出来的产物（不进git，`npm run build:react` 生成，多入口产出`debts.js`/`pay.js`/`report.js`/`mine.js`/`sheets.js`五个文件），细节见 `CLAUDE.md`
- `react/` —— "债务"/"还款日"/"统计"/"我的"四个tab（全部tab）+ 债务详情窗/编辑表单/账户详情页/订阅页/购买者服务条款页/提前还款模拟器/通知设置面板/档案库/云备份/AI债务助手（10个不属于任何tab、常驻挂载的入口，全部共用同一个`sheets`入口）的React+TypeScript源码（`src/debts/`/`src/pay/`/`src/report/`/`src/mine/`/`src/sheets/`，`src/shared/`是这几者共用的状态订阅hook），Vite多入口库模式构建（`npm run build:react`）成 `www/js/react-debts/{debts,pay,report,mine,sheets}.js` 五个文件各自嵌入`index.html`；组件测试用Vitest+React Testing Library（`__tests__/`，`npm run test:react` 运行，跟`test/`下`calc.js`的`node:test`套件完全独立），细节（vanilla↔React怎么桥接共享数据、手势怎么移植过来）见 `CLAUDE.md`"React 迁移"一节
- `android/` —— Capacitor/Gradle自动生成的原生工程，绝大部分别手动改，改完 `www/` 后重新跑 `npx cap sync android`；例外是 `android/app/src/main/java/io/github/jenkjyu/afterzero/` 下有手写的原生插件（`SaveFile` 负责把档案库/备份文件存到用户自选的位置；`WeChatLogin` 负责账号登录），这部分不会被sync覆盖，是真实源码
- `cloudbase/` —— 腾讯云开发（CloudBase）云函数的服务端代码，配合微信登录（`wxLogin`换取登录票据、`deleteAccount`处理注销账户）、Premium会员的云备份功能（`backupCreate`/`backupList`/`backupRestore`/`backupDelete`/`backupUploadFile`）、以及AI债务助手（`aiAdvisor`，调用CloudBase内置大模型）使用，不属于Capacitor/Android那套构建流程，需要单独部署，细节见 `CLAUDE.md`
- `resources/` —— App图标的设计源文件，改图标时改这里，然后跑 `npx @capacitor/assets generate --android` 重新生成 `android/app/src/main/res/mipmap-*/` 下的实际图标文件（细节和一个工具默认值的坑见 `CLAUDE.md`）
- `capacitor.config.json` —— 包名、显示名、web目录配置
- `flutter/` —— 进行中的Flutter全量重写（安卓+iOS），跟以上Capacitor相关目录完全独立，见上面"Flutter重写"一节
- `.github/workflows/ci.yml` —— GitHub Actions，每次push/PR自动跑`npm test`/`npm run test:react`/`tsc --noEmit`/`npm run build:react`这几条纯命令行的检查（Android编译和真机验证不在CI里，仍需手动做）

## Flutter重写（进行中，安卓+iOS双端）

Capacitor套壳系统WebView这套架构强依赖各手机厂商WebView行为，且不支持iOS。正在`flutter/`（独立顶层目录，自带`lib/`/`android/`/`ios/`/`pubspec.yaml`，跟`www/`/`android/`/`react/`不冲突）里用Flutter+Dart把整个App重写一遍，目标是彻底摆脱WebView依赖、同时支持iOS。开发期间两边共存，现有Capacitor版本不受影响；等Flutter版本做到功能完全对等，才会一次性删除`www/`/旧`android/`/`react/`等Capacitor专属文件，`flutter/`转正。状态管理用Riverpod，本地持久化第一版用`shared_preferences`（按现有localStorage的key对应，先求行为对齐）。腾讯云开发没有能用的官方Flutter SDK，云端接入层要绕开SDK直接用HTTP调用。

目前已完成阶段 0–5：计算层、数据/本地持久化、CloudBase HTTP 与微信登录编排，以及“债务”“还款日”“统计”三个 tab。还款日页按未还**期次**展开、支持累计时间窗和左滑还款；统计页复用既有报告/压力计算，展示还清路径、未来压力、月还款、余额排行与类型构成。“我的”和其余子页面仍在后续阶段。详细阶段划分和当前进度见`CLAUDE.md`"Flutter重写"一节。

## 备注

- **全新安装默认是空的数据，这是故意的**——这个app是打算给别人用的，不能预装任何人的私人债务数据。**但要先微信登录才能看到这份空数据**——打开App会先看到登录门，登录成功后才能进四个标签页。
- 包名是 `io.github.jenkjyu.afterzero`。安卓系统靠包名判断"是不是同一个app"——以后改包名，现有装机不会被认成"同一个app的更新"（细节见 `CLAUDE.md`）。

## License

本项目使用 [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)（完整正式文本见 `LICENSE` 文件，以英文原文为准）。

大白话说明（不具有法律效力，仅帮助理解）：
- 你可以自由地查看、学习、fork、修改这份代码，用于个人、非商业目的（比如自己改一份自用、研究代码怎么写的）。
- **不可以**用于任何商业用途——包括但不限于把它（或改过的版本）发布到应用商店销售、内置广告变现、作为商业产品/服务的一部分。
- 如果你想商用，请联系作者获得单独授权。
