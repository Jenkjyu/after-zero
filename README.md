# After Zero

一个记债务的个人工具，打包成了能真正安装的安卓app。名字的寓意：对债务归零之后生活的期待。

这个app用 [Capacitor](https://capacitorjs.com/) 包成了原生安卓壳。`www/index.html`是纯HTML/CSS/JS写的vanilla胶水层——数据模型、localStorage/IndexedDB读写、cloud函数调用、native插件调用都在这里，改这一层本身不需要构建步骤；实际界面（四个tab和全部子页面/弹窗）现在都由React实现，见下一段。另外有几段手写的原生插件代码：一段用于把档案库/备份文件真正存到用户自选的位置（点"下载"会弹系统"另存为"选择器，网页标准的下载方式在安卓WebView里不可靠），一段用于接入微信登录；还款提醒页支持本地推送通知（到期前提醒），用的是官方Capacitor插件。**打开App需要先微信登录**——账号体系目前是这个App唯一的准入方式。

**底部"债务"/"还款日"/"统计"/"我的"四个tab、以及债务详情窗、新增/编辑债务表单、账户详情页、订阅页、购买者服务条款页、提前还款模拟器、通知设置面板、档案库、云备份、AI债务顾问这10个不属于任何tab的常驻React入口，已经全部由React接管（绞杀者模式，逐页面替换，全部完成）**：`react/`下是这5个Vite入口（四个tab各一个 + 上述10个常驻入口共用的`sheets`入口）的React+TypeScript源码，构建成`www/js/react-debts/{debts,pay,report,mine,sheets}.js`五个文件各自嵌入`index.html`，跟vanilla那份共享同一份数据（细节见`CLAUDE.md`"React 迁移"一节）。vanilla主脚本现在只剩数据模型/localStorage/IndexedDB读写/cloud函数/native插件调用这类逻辑，不再有任何界面渲染代码。这部分需要额外的构建步骤（`npm run build:react`）。

"我的"页有一个**单一 Premium** 订阅入口，同时提供一次性买断和按月/按年订阅两种购买方式，目前只是UI占位（App还没上架应用商店，暂时接不了真实支付），为未来的付费功能铺路。免费/付费的边界是按"这个功能有没有真实服务器/算力成本"划的：底部"统计"tab查看图表、提前还款收益模拟器完全免费；统计页面**导出**PDF/Excel、云备份（手动创建备份记录，可随时恢复）、**AI债务顾问**（雪球/雪崩法分析生成优化报告 + 针对自己债务数据的多轮问答，服务端调用腾讯云开发内置大模型）是Premium会员专属功能。

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

- `www/index.html` —— vanilla胶水层（数据模型、localStorage/IndexedDB读写、cloud函数调用、native插件调用；界面渲染已经全部由`react/`接管，见下一条），`www/fonts/` 是它引用的本地字体文件，`www/img/` 是登录门用到的图标图片，`www/js/` 是本地打包/拆分出去的 JS：`jspdf.umd.min.js`/`xlsx.full.min.js` 是第三方库（用于"统计"页导出 PDF/Excel，放本地是因为国内移动网络下相关 CDN 常加载失败），`calc.js` 是从 `index.html` 拆出来的纯计算函数（`recompute`/`genPlan`/`amortForward` 等，不碰 DOM），配 `test/` 下的 `node:test` 单元测试（`npm test` 运行），`react-debts/` 是下面`react/`目录构建出来的产物（不进git，`npm run build:react` 生成，多入口产出`debts.js`/`pay.js`/`report.js`/`mine.js`/`sheets.js`五个文件），细节见 `CLAUDE.md`
- `react/` —— "债务"/"还款日"/"统计"/"我的"四个tab（全部tab）+ 债务详情窗/编辑表单/账户详情页/订阅页/购买者服务条款页/提前还款模拟器/通知设置面板/档案库/云备份/AI债务顾问（10个不属于任何tab、常驻挂载的入口，全部共用同一个`sheets`入口）的React+TypeScript源码（`src/debts/`/`src/pay/`/`src/report/`/`src/mine/`/`src/sheets/`，`src/shared/`是这几者共用的状态订阅hook），Vite多入口库模式构建（`npm run build:react`）成 `www/js/react-debts/{debts,pay,report,mine,sheets}.js` 五个文件各自嵌入`index.html`；组件测试用Vitest+React Testing Library（`__tests__/`，`npm run test:react` 运行，跟`test/`下`calc.js`的`node:test`套件完全独立），细节（vanilla↔React怎么桥接共享数据、手势怎么移植过来）见 `CLAUDE.md`"React 迁移"一节
- `android/` —— Capacitor/Gradle自动生成的原生工程，绝大部分别手动改，改完 `www/` 后重新跑 `npx cap sync android`；例外是 `android/app/src/main/java/io/github/jenkjyu/afterzero/` 下有手写的原生插件（`SaveFile` 负责把档案库/备份文件存到用户自选的位置；`WeChatLogin` 负责账号登录），这部分不会被sync覆盖，是真实源码
- `cloudbase/` —— 腾讯云开发（CloudBase）云函数的服务端代码，配合微信登录（`wxLogin`换取登录票据、`deleteAccount`处理注销账户）、Premium会员的云备份功能（`backupCreate`/`backupList`/`backupRestore`/`backupDelete`/`backupUploadFile`）、以及AI债务顾问（`aiAdvisor`，调用CloudBase内置大模型）使用，不属于Capacitor/Android那套构建流程，需要单独部署，细节见 `CLAUDE.md`
- `resources/` —— App图标的设计源文件，改图标时改这里，然后跑 `npx @capacitor/assets generate --android` 重新生成 `android/app/src/main/res/mipmap-*/` 下的实际图标文件（细节和一个工具默认值的坑见 `CLAUDE.md`）
- `capacitor.config.json` —— 包名、显示名、web目录配置

## 备注

- **全新安装默认是空的数据，这是故意的**——这个app是打算给别人用的，不能预装任何人的私人债务数据。**但要先微信登录才能看到这份空数据**——打开App会先看到登录门，登录成功后才能进四个标签页。
- 包名是 `io.github.jenkjyu.afterzero`。安卓系统靠包名判断"是不是同一个app"——以后改包名，现有装机不会被认成"同一个app的更新"（细节见 `CLAUDE.md`）。

## License

本项目使用 [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)（完整正式文本见 `LICENSE` 文件，以英文原文为准）。

大白话说明（不具有法律效力，仅帮助理解）：
- 你可以自由地查看、学习、fork、修改这份代码，用于个人、非商业目的（比如自己改一份自用、研究代码怎么写的）。
- **不可以**用于任何商业用途——包括但不限于把它（或改过的版本）发布到应用商店销售、内置广告变现、作为商业产品/服务的一部分。
- 如果你想商用，请联系作者获得单独授权。