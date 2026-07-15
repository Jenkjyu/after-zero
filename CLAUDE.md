# CLAUDE.md

这个文件给 Claude Code 看，记录这个项目非显而易见的技术细节和雷区。给人看的项目介绍在 `README.md`。

## 项目是什么

**After Zero**——一个记债务的个人工具，用 [Capacitor](https://capacitorjs.com/) 把一个自包含的HTML app（`www/index.html`）包成安卓原生app。

**源代码 = `www/index.html`，永远改这个文件。** `android/` 目录绝大部分是Capacitor根据`www/`自动生成的原生工程，改完`www/index.html`后要跑 `npx cap sync android` 才会同步进去，不要直接改`android/app/src/main/assets/public/index.html`（会被下次sync覆盖）。

**例外：`android/app/src/main/java/io/github/jenkjyu/afterzero/` 下有手写的原生插件代码，不是sync产物。** 目前有 `SaveFilePlugin.java`（+ `MainActivity.java` 里几行注册代码），`npx cap sync android` 不会碰这两个文件，是真正的项目源码，要跟着走版本控制，不要当成自动生成的东西误删或忽略。详见下面"原生插件"一节。

## 原生插件：`SaveFile`

档案库的"下载"按钮存文件到设备"下载"目录，用的是这个自定义原生插件（`android/app/src/main/java/io/github/jenkjyu/afterzero/SaveFilePlugin.java`），不是网页标准的`<a download>`。

**为什么需要一个原生插件**：`<a download>` + `blob:` URL 这种纯网页写法在桌面浏览器没问题，但在安卓WebView里基本不生效（点了没反应）。要让文件真正落到用户手机能在"下载"App/文件管理器里看到的地方，安卓10+（API 29+）必须用 `MediaStore.Downloads` 这套系统API——好处是这样写完全不需要在`AndroidManifest.xml`里申请任何存储权限（app只操作自己创建的MediaStore条目，不受分区存储限制）。

**已知边界**：这个插件只支持安卓10+（`Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q`），低于这个版本会直接`reject`一个提示文案，不会崩溃。这个项目`minSdkVersion = 24`（安卓7），所以理论上安卓7-9的机器装得上app，但点"下载"会拿到一条"此安卓版本暂不支持"的提示——这是有意的取舍（第一阶段只做10+），不是遗漏，以后要补安卓9及以下的兼容需要另外写`Environment.getExternalStoragePublicDirectory` + 运行时权限申请那一套老API。

**JS这边怎么调用**：`www/index.html` 里的 `saveToDeviceDownloads(blob, filename, mime)` 函数会检测 `window.Capacitor.Plugins.SaveFile` 是否存在——存在（真机原生环境）就转base64调用原生插件；不存在（比如本地`python3 -m http.server`桌面浏览器测试）就退回到旧的`<a download>`写法。**这意味着"下载"功能本身没法在桌面浏览器里完整测出真实效果，必须编译APK装真机验证。**

## 字体：`www/fonts/`

`www/fonts/Inter-Variable-Latin.woff2`（+ `OFL.txt`许可证文本）不是随手丢进去的孤立文件，是`www/index.html`里`@font-face`引用的本地字体资源，`npx cap sync`会把整个`www/`文件夹（不只是`index.html`一个文件）打包进APK，所以这样引用没问题。**只包含拉丁字母/数字（`unicode-range`限定），不含中文字形**——这是故意的：完整内嵌一个覆盖几千汉字的中文字体体积会到几MB到十几MB，塞进这个项目不现实。中文文字会自动落到`--font-ui`变量里排在后面的系统字体（`"PingFang SC"`等），不受这个字体文件影响。别看着这个目录只有两个文件就以为是没清理干净的临时产物。

## 构建

```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
```

产出：`android/app/build/outputs/apk/debug/app-debug.apk`

## 本地网页测试（不用编译安卓包）

`www/index.html` 是纯前端文件，改完想快速验证效果，不必每次都走完整的 `npx cap sync android` + Gradle编译流程。用 `cd www && python3 -m http.server 8765`，然后浏览器打开 `http://localhost:8765` 就能测（Chrome桌面版即可）。

**别用 `file://` 直接双击打开来测。** `localStorage`/`IndexedDB` 是按协议+域名+端口（origin）隔离存储的，`file://` 协议下各浏览器对这两个存储API的限制不统一（尤其Chrome限制较多），行为跟安卓WebView里跑的真实情况不一致，容易测出假结果。用 `http://localhost` 这种标准origin更接近Capacitor WebView的真实环境。

## 环境要求 & 已知坑

- **必须 JDK 21**，JDK 17 编译会报 `无效的源发行版：21`（Capacitor这个版本要求的）。
- **macOS + Homebrew装的`openjdk@21`默认不会链接到`java`命令**（Homebrew的openjdk是keg-only，不进`/usr/bin`，不改`JAVA_HOME`）。`java -version`可能直接报"Unable to locate a Java Runtime"，就算`brew install openjdk@21`已经装过了。跑Gradle时要显式指定：`JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug`（Apple Silicon路径；Intel Mac是`/usr/local/opt/openjdk@21`）。
- 需要安卓SDK的 `platform-tools` + `platforms;android-34` + `build-tools;34.0.0`。
- `android/local.properties` 要写 `sdk.dir=<SDK路径>`，这个文件因机器而异、已被gitignore，每台机器自己建。
- **如果在配了网络代理的 Claude Code session 里跑构建，或者 `git push`/`git pull` 到GitHub**：`sdkmanager` 装SDK组件、Gradle编译需要连 `dl.google.com` / `maven.google.com`，`git push` 需要连 `github.com`；这个session之前用的一个住宅代理连这些域名会失败（`dl.google.com`/`maven.google.com` 报连接重置 Recv failure，`github.com` 报 `Proxy CONNECT aborted`）。遇到这种情况，把要用到网络的命令加上 `env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy` 前缀去掉代理再跑，能直接连通。

## 硬性铁律，改代码前必看

1. **`localStorage` 的 KEY（在`www/index.html`里搜 `debt-manager-v5`）永远不能改。** 这是用户设备上保存真实数据的键名，改了等于让已经装过的app找不到自己原来存的数据，直接清零。
2. **新安装必须是空数据。** `www/index.html` 里 `SEED`（债务种子数据）、`DOCS_SEED`（文档种子数据）、`POSTER`（海报图）这三个常量现在都是空值——这是故意的，因为这个app的定位是要发给别人用，任何人第一次打开都不能预装开发者自己的私人财务数据。**改代码时如果要放测试数据，改完记得清空再提交，别把私人内容（真实债务数字、个人反思文档、任何带真实姓名/金额的东西）带回默认值里。**
   **私人数据不止藏在这三个常量里。** 之前排查发现过一次：一个叫`cliff`的调试用标记字段，虽然完全没有UI能设置它（不是SEED、不是表单字段），但代码里直接写死了具体的还款日期和金额字符串（`"2027-05 起还本，月供跳至 ¥2,182"`这类）挂在渲染逻辑里，跟SEED是否清空无关。改代码时留意：不只是搜`SEED`/`DOCS_SEED`/`POSTER`这三个变量名，任何看着像真实日期/金额/人名的硬编码字符串都要多看一眼是不是该删。
3. **包名 `io.github.jenkjyu.afterzero` 是这个app的永久身份，不要随便改。** 安卓系统靠包名判断"新装的这个APK是不是我认识的那个app的新版本"——包名一样+签名一致才会被当成"更新"（原地覆盖、保留数据）；包名一变，系统当成完全不相关的新app，跟原来的app和它的数据没有任何关系，装出来是第二个图标、全新空数据。这个项目早期开发阶段（曾用过 `com.jenkjyu.debtmanager` 这个包名做过几版debug包）就是因为这个原因废弃重来的——开发者自己手机上可能还留着那个旧包名、带真实数据的旧版本，跟现在这个 `io.github.jenkjyu.afterzero` 是两个互不相通的独立app，别搞混、别以为它们共享数据。
4. **这是debug包，不是release签名包。** 装自己手机没问题；真要上架应用商店，需要另外生成release签名密钥（这个密钥一旦用来发布，必须永久保管，弄丢了以后没法再更新同一个app）——现在没做这步，先不用管。
5. **License 是 PolyForm Noncommercial 1.0.0，不是MIT/ISC这类常见的宽松协议，是刻意选的。** 开发者规划未来要在这个app上加付费功能，选这个协议是为了禁止别人白嫖代码去做商业竞品（发到应用商店卖钱、内置广告等）；别人依然可以自由fork/学习/个人非商业使用。改动licensing相关内容（`LICENSE`文件、`package.json`里的`license`字段、README里的License说明）前要确认这个前提没变。
6. **`AndroidManifest.xml` 里的 `INTERNET` 权限是故意留着的，虽然目前`www/index.html`没有任何网络请求代码。** 是为未来付费功能可能需要的联网校验/云同步预留，不是清理疏漏，不要"顺手"删掉。
