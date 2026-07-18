# CLAUDE.md

这个文件给 Claude Code 看，记录这个项目非显而易见的技术细节和雷区。给人看的项目介绍在 `README.md`。

**如果项目根目录下有 `PROGRESS.md`，先看那个文件。** 那是不进git、按时间记录"哪天做了什么、现在卡在哪一步"的进度日志（这份CLAUDE.md记的是相对稳定的技术细节，不记当前进度）——不是每个clone/checkout都会有这个文件（它是gitignored、因机器而异的本地文件），没有的话说明是全新环境，忽略这条即可。

## 项目是什么

**After Zero**——一个记债务的个人工具，用 [Capacitor](https://capacitorjs.com/) 把一个自包含的HTML app（`www/index.html`）包成安卓原生app。

**源代码 = `www/index.html`，永远改这个文件。** `android/` 目录绝大部分是Capacitor根据`www/`自动生成的原生工程，改完`www/index.html`后要跑 `npx cap sync android` 才会同步进去，不要直接改`android/app/src/main/assets/public/index.html`（会被下次sync覆盖）。

**例外：`android/app/src/main/java/io/github/jenkjyu/afterzero/` 下有手写的原生插件代码，不是sync产物。** 目前有 `SaveFilePlugin.java` 和 `WeChatLoginPlugin.java`（+ `wxapi/WXEntryActivity.java` + `MainActivity.java` 里几行注册代码），`npx cap sync android` 不会碰这些文件，是真正的项目源码，要跟着走版本控制，不要当成自动生成的东西误删或忽略。详见下面"原生插件"一节。

## 原生插件：`SaveFile`

档案库的"下载"按钮存文件到设备"下载"目录，用的是这个自定义原生插件（`android/app/src/main/java/io/github/jenkjyu/afterzero/SaveFilePlugin.java`），不是网页标准的`<a download>`。

**为什么需要一个原生插件**：`<a download>` + `blob:` URL 这种纯网页写法在桌面浏览器没问题，但在安卓WebView里基本不生效（点了没反应）。要让文件真正落到用户手机能在"下载"App/文件管理器里看到的地方，安卓10+（API 29+）必须用 `MediaStore.Downloads` 这套系统API——好处是这样写完全不需要在`AndroidManifest.xml`里申请任何存储权限（app只操作自己创建的MediaStore条目，不受分区存储限制）。

**已知边界**：这个插件只支持安卓10+（`Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q`），低于这个版本会直接`reject`一个提示文案，不会崩溃。这个项目`minSdkVersion = 24`（安卓7），所以理论上安卓7-9的机器装得上app，但点"下载"会拿到一条"此安卓版本暂不支持"的提示——这是有意的取舍（第一阶段只做10+），不是遗漏，以后要补安卓9及以下的兼容需要另外写`Environment.getExternalStoragePublicDirectory` + 运行时权限申请那一套老API。

**JS这边怎么调用**：`www/index.html` 里的 `saveToDeviceDownloads(blob, filename, mime)` 函数会检测 `window.Capacitor.Plugins.SaveFile` 是否存在——存在（真机原生环境）就转base64调用原生插件；不存在（比如本地`python3 -m http.server`桌面浏览器测试）就退回到旧的`<a download>`写法。**这意味着"下载"功能本身没法在桌面浏览器里完整测出真实效果，必须编译APK装真机验证。**

**凡是"往手机存文件"的按钮都必须走 `saveToDeviceDownloads()`，别再直接用 `<a download>`**：除了档案库单个文件的"下载"，"我的"→数据备份里的"下载备份文件"按钮也是这一类。曾经踩过坑——"下载备份文件"当初直接用了裸的 `<a download>` + blob URL，桌面浏览器测着没问题，真机上点了完全没反应（就是上面说的安卓WebView不支持这种写法），后来才改成同样走 `saveToDeviceDownloads()`。以后再加任何"导出/保存到本地"的入口，第一反应就该是复用这个函数，而不是 `<a download>`。

## 原生插件：`WeChatLogin`（账号登录基础设施）

"我的"标签页里的"微信登录"入口，用的是这个自定义原生插件（`android/app/src/main/java/io/github/jenkjyu/afterzero/WeChatLoginPlugin.java` + `wxapi/WXEntryActivity.java`）。**登录现在是全局强制的，不再是可选的基础设施**——`www/index.html`里的`#loginGate`是一个不可关闭的全屏浮层，`account`（localStorage的`ACCOUNT_KEY`）为空时会盖住整个App（含底部tabbar），四个标签页（债务列表/待还提醒/档案库/我的）全部进不去，必须先微信登录成功才能看到任何内容。这是一次明确的架构决定（不是回归/bug）：原本能完全离线使用的四个标签页，现在都需要联网+装微信+登录成功才能用。

**登录门是"默认可见、fail-closed"设计，别改回"默认隐藏、靠JS显示"**：`.login-gate` 的 CSS 默认就是 `display:flex`（可见），只有确认已登录后才用 `.authed` 类把它 `display:none` 隐藏。这是踩过"一闪而过"坑之后刻意反过来的——早期是默认 `display:none`、靠 JS 判断未登录再显示，但那几个 CloudBase CDN `<script src>` 是阻塞解析的，首屏 JS 要等它们跑完才执行，这段空档里登录门还没显示、底下的 App 内容会闪出来一帧。现在反过来：默认永远盖着，哪怕 JS 完全没执行也不会露馅。两个地方负责加 `.authed`：`<body>` 顶部一段极早的内联脚本（在那几个 CDN script 之前、同步读一次 localStorage 就决定），以及主脚本里的 `renderAccountUI()`（冷启动、登录成功、退出登录、注销账户后都会调，`account`有值就加`.authed`隐藏、没有就去掉并加`.open`触发手写动画）。

**为什么需要原生插件（不只是JS调API）**：微信登录在原生App里官方要求走"移动应用"OAuth流程——拉起手机上装的微信App本身走授权，不是网页扫码，这个交互没法用纯JS实现，必须靠微信官方Android SDK（`com.tencent.mm.opensdk`，Maven Central发布，见`android/app/build.gradle`）。

**几个容易踩坑、且微信SDK硬编码写死不能改的地方**：
- 回调Activity必须叫 `wxapi.WXEntryActivity`，包路径必须是 `<applicationId>.wxapi.WXEntryActivity`（也就是 `io.github.jenkjyu.afterzero.wxapi.WXEntryActivity`）——这是微信SDK自己去找这个类的硬编码路径，改名字/挪包会导致回调收不到，不是能自由重构的普通类。
- `AndroidManifest.xml` 里必须有 `<queries><package android:name="com.tencent.mm" /></queries>`——本项目`targetSdkVersion 36`，安卓11+的包可见性限制下，没有这行`isWXAppInstalled()`/`sendReq()`会静默失效（不报错，就是不工作），排查起来容易摸不着头脑。
- 微信登录**要求提交App的release签名证书SHA1指纹**去微信开放平台注册，debug签名注册不了——这是这个项目第一次真正生成release keystore的直接原因（见下面"硬性铁律"第4条的更新）。

**JS这边怎么调用**：`www/index.html` 里点击"微信登录"按钮，跟`SaveFile`同样的模式检测 `window.Capacitor.Plugins.WeChatLogin` 是否存在，不存在（桌面浏览器测试）就提示"仅支持安卓App内使用"。存在的话调用原生插件的`login()`拉起微信，真正的授权结果是异步的，通过 `wechatAuthResult` 事件回传（因为微信App拉起和用户授权跨越了Activity生命周期，`PluginCall`没法跨这段存活，只能用事件而不是直接resolve这次调用）。拿到微信返回的`code`后，调用腾讯云开发（CloudBase）的云函数换取自定义登录票据完成登录——**AppSecret绝不出现在客户端代码里**，只存在云函数的环境变量中，客户端只带AppID（AppID本身不是秘密）。

**目前的完成状态**：微信登录已经端到端跑通验证成功（真机测试，"我的"tab顶部正确显示头像+昵称）。`WeChatLoginPlugin.java`里的`APP_ID`已填真实值，云函数`WX_APPID`/`WX_APPSECRET`已配置。CloudBase环境`after-zero-d7gub5p5f09c8cc2d`，`wxLogin`云函数已部署，"自定义登录"已启用并配好私钥。

**跑通这条链路过程中踩过的坑，全部是一次性的环境/配置问题，不是代码逻辑问题，但极其隐蔽，按顺序记录供以后类似场景排查参考**：

1. **CDN引入CloudBase JS SDK时，`cloudbase.js`只是"内核"，登录(auth)和云函数(functions)模块必须单独再引入两个`<script>`标签**（`cloudbase.auth.js`、`cloudbase.functions.js`，同版本号），漏引会导致`app.auth()`返回的对象没有`.auth`方法（`cbApp().auth is not a function`）。`www/index.html`里这三行script标签必须一起出现，别只看到一行`cloudbase.js`就以为够了。
2. **CloudBase JS SDK（至少2.28.6这个版本）有个内部bug**：`auth._getCredentials()`内部先读`t.scope`再判断`t`是否为`null`，全新设备/App从没建立过任何登录态时`t`就是`null`，直接抛`TypeError: Cannot read properties of null (reading 'scope')`，会连带搞挂`callFunction()`（云函数调用内部也会走鉴权凭证检查）。**规避方法**：在真正走自定义票据登录流程之前，先调一次`auth.signInAnonymously()`（失败就忽略，不阻塞主流程）垫底写入一份本地凭证，绕开这个先用后判的bug。`handleWxAuthResult`函数开头那段`auth.signInAnonymously ? auth.signInAnonymously().catch(...) : null`就是干这个的，别以为是多余代码删掉。
3. **CloudBase控制台"身份认证→登录方式"里，"匿名登录"必须单独开启**，不开的话上面第2条的`signInAnonymously()`会直接被拒（400，报错信息里会明确写"当前调用的signInAnonymously()所需的登录方式尚未在云开发控制台启用"，这条SDK自己的报错信息其实写得很清楚，不用瞎猜）。
4. **`wxLogin`云函数默认的"安全规则"（权限控制）是`auth != null && auth.loginType != 'ANONYMOUS'`**——这条规则专门排除了匿名登录调用者，而`wxLogin`恰恰是给"还没真正登录、只靠匿名身份垫底"的客户端用来换取正式登录票据的入口函数，会被这条默认规则直接403拒绝，报`[PERMISSION_DENIED] Permission denied`。**这条规则必须手动放开**，改的位置是云开发控制台"云函数/函数管理"页面顶部工具栏的"权限控制"按钮（不是某个函数详情页里的tab，也不是每个函数各自一个按钮）。

   **⚠️ 重要：这个"权限控制"弹窗改的是整个环境共用的一份配置文件，不是单个函数独立的设置**（已对照当前官方文档`docs.cloudbase.net/cloud-function/security-rules`核实）。格式是 `{ "函数名或*": { "invoke": "表达式或布尔值" } }`，匹配优先级"具体函数名 > `*`通配"。**正确做法是给`wxLogin`单独加一条具名例外，`*`通配规则保持/恢复成安全默认值，不要把`*`整条改成`{"invoke": true}`**（那样会让环境里以后新加的任何云函数都默认对所有人开放，包括不该开放的）：
   ```json
   {
     "*": { "invoke": "auth.loginType != 'ANONYMOUS' && auth != null" },
     "wxLogin": { "invoke": true }
   }
   ```
   这个函数本身也靠"必须有真实微信code才能换到东西"这层业务逻辑兜底安全性，不依赖CloudBase登录态门槛——但控制台这层权限规则依然应该按"具名例外+安全通配"来配，不要图省事直接把`*`开放。
5. **`wxLogin/index.js`里查询/写入的`users`集合，CloudBase不会自动建**：文档型数据库里没有这个集合的话，`db.collection("users").where(...).get()`会报`[ResourceNotFound] Db or Table not exist: users`。**注意：用CLI（`tcb db nosql execute`）查询一个不存在的集合不会报错，只会返回空数组`[]`**（MongoDB语义下`find`对不存在的集合本来就不报错），所以不能靠CLI查询来验证集合是否真的建好了，只能去控制台"文档型数据库"页面肉眼确认集合列表里有没有`users`。集合权限选"无权限[ADMINONLY]"就够（这个集合只被云函数用管理员身份访问，客户端永远不直接读写它）。
6. **Capacitor默认只有debug构建才会打开WebView远程调试**（`android.webContentsDebuggingEnabled`默认跟着`isDebug`走），release包默认关闭，而微信登录又必须用release签名才能过微信那边的签名校验——导致"必须用release包测试，但release包默认没法用`chrome://inspect`/`edge://inspect`远程调试"这个死结。**排查这类release包专属问题时，临时在`capacitor.config.json`里加`"android": {"webContentsDebuggingEnabled": true}`，重新编译release包调试，调完记得改回去删掉这个临时开关**，不要把这个当成正式配置长期留着（默认关闭是有意的安全考虑）。

**CloudBase自定义登录的两处API调用，已对照当前官方文档（`docs.cloudbase.net/authentication-v2/method/custom-login`）核实过，不是凭记忆写的**：
- 云函数端：`app.auth().createTicket(openid)`——只接受一个参数（自定义用户唯一标识），不支持`refresh`/`expire`这类选项，传第二个参数会导致票据签发行为跟文档不符。
- 客户端：不是直接`signInWithTicket(ticket)`，而是先用`auth.setCustomSignFunc(fn)`注册一个"怎么去拿ticket"的回调（这个回调内部调云函数换票据），再调用**不带参数**的`auth.signInWithCustomTicket()`，SDK内部会自己回调注册的函数取票据完成登录。方法名和调用方式如果以后又要改，务必重新核实这个链接，CloudBase的Node SDK在这块API上有过大版本调整。

**`app.auth().createTicket()`必须用启用了"自定义登录"后下载的私钥初始化的app实例调用**，不能直接用云函数默认那个`cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })`初始化的`app`（那个实例没有签发登录票据的权限，调用会报权限错误）。`wxLogin/index.js`里专门用`getAuthApp()`函数单独初始化了一个带`credentials`的app实例来做这件事，跟处理数据库操作的默认`app`分开。

**CloudBase控制台里内置的"微信开放平台登录"这个登录方式，不是我们用的东西，别被名字搞混去启用它**——那个走的是网站应用的网页跳转授权流程（`genProviderRedirectUri`生成URL→重定向→拿code），是给网站/网页场景设计的；这个项目走的是原生App直接拉起微信App的SDK授权流程，两者不通用，官方文档自己都没写清楚原生App怎么接这个内置选项。继续用现在这套"自己的`wxLogin`云函数 + 自定义登录"就好。

**部署云函数要用CloudBase CLI（没有全局装，用`npx -p @cloudbase/cli tcb ...`调用），且必须在`cloudbase/`目录下跑**（CLI靠当前目录找`cloudbaserc.json`，在repo根目录跑会读不到配置转成交互式问答卡住）：

```bash
cd cloudbase
npx --yes -p @cloudbase/cli tcb fn deploy wxLogin --force
```

`cloudbase/cloudbaserc.json`（**已gitignore，不进git**）是这次新加的部署配置文件，性质跟`android/keystore.properties`/`android/local.properties`一样——因机器而异、装真实密钥，每次要重新部署得先确认这个文件存在且内容对（`envId`、`functions[0].envVariables`里的`TCB_CUSTOM_LOGIN_*`三个变量）。**这个文件不存在的话，云函数部署会失败或者把配置搞错，不是`npm install`能自动补出来的东西**，得重新从CloudBase控制台下载私钥JSON手动配。

**踩过的坑**：私钥JSON如果直接整个塞进一个环境变量的值，`tcb fn deploy`会报`Environment.Variables.0.Value`类型应为`string`的错误（怀疑是CLI/API把"长得像JSON"的字符串值自动解析成了对象）。解决办法是拆成三个独立的纯字符串环境变量（`TCB_CUSTOM_LOGIN_PRIVATE_KEY_ID`/`TCB_CUSTOM_LOGIN_PRIVATE_KEY`/`TCB_CUSTOM_LOGIN_ENV_ID`），`wxLogin/index.js`里的`getAuthApp()`再把这三个拼回`credentials`对象——以后不管是这个云函数还是别的云函数，只要要往CloudBase环境变量里塞"一整块JSON"，先想到这个坑，别重复踩。

### 云函数：`deleteAccount`（注销账户）

"我的"标签页→账户详情页里的"注销账户"按钮，调用这个云函数（`cloudbase/functions/deleteAccount/index.js`）在服务端真删除`users`集合里对应的文档——不是只清客户端本地登录态那种"假注销"。

**身份来源，不信任客户端参数**：跟`wxLogin`"绝不信任客户端输入"的原则一致，这个函数**不接受、也不该信任**客户端传来的openid参数，而是用`app.auth().getUserInfo()`读已认证会话的`customUserId`——`wxLogin`当初签发`createTicket(openid)`时，把openid设成了这个用户的自定义登录标识，客户端`signInWithCustomTicket()`登录成功后，这个`customUserId`就应该等于当初的openid。这个函数只需要默认的admin app（`cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })`），不需要`wxLogin`里那个专门为`createTicket()`准备的`getAuthApp()`私钥实例。

**⚠️ 待真机核实的地方**：`customUserId`是否真的原样等于openid字符串（没有额外前缀/包装）是查官方文档得出的结论，这个项目里还没实测验证过。第一次真机走通注销流程时，建议临时在函数里加一行`console.log(JSON.stringify(auth.getUserInfo()))`，走一次真实注销，去云开发控制台"云函数日志"确认`customUserId`确实等于预期的openid，再决定要不要删掉这行log——这跟上面"CloudBase自定义登录的两处API调用"那条"别凭记忆写、要核对当前文档"是同一类风险。

**权限控制，不需要给它单独配规则**：上面第4条已经改正过来了——"权限控制"是整个环境共用一份配置文件，不是每个函数各自独立。只要`*`通配规则保持在安全默认值（`auth.loginType != 'ANONYMOUS' && auth != null`），`deleteAccount`不用任何具名配置就自动吃到这条安全规则（只允许真实登录、非匿名的调用者调用）。**踩过的坑**：这个项目第一次配`wxLogin`权限时图省事直接把`*`整条改成了`{"invoke": true}`（对所有人开放），当时没意识到这会同时影响`deleteAccount`（和以后任何新加的函数）——后来对照文档发现`*`是共享兜底规则，才改成"给`wxLogin`单独加具名例外，`*`收紧回安全默认值"这种正确写法（见上面第4条的JSON示例）。**即使当时`*`一度是开放的，`deleteAccount`本身也没有实际风险**：它从不信任客户端参数，身份完全来自已认证会话的`customUserId`，查不到就直接拒绝、且只会操作调用者自己的数据，删不了别人的账号——控制台这层"谁能调用"的门槛和函数内部"删谁的数据"的门槛是两件独立的事，后者才是这个函数真正的安全边界。

这个函数不需要任何`envVariables`（不用微信API密钥，也不用`createTicket`的私钥，只需要默认admin DB权限+`getUserInfo()`），`cloudbase/cloudbaserc.json`里的条目比`wxLogin`简单。部署方式跟`wxLogin`一样，必须在`cloudbase/`目录下跑：

```bash
cd cloudbase
npx --yes -p @cloudbase/cli tcb fn deploy deleteAccount --force
```

## 返回键处理（安卓硬件/手势返回）

弹窗关闭 + 退出App这两件事，走的是"原生问JS，JS说了算"的桥接，两头都有各自的坑：

**原生这边（`MainActivity.java`）覆写的不是 `onBackPressed()`，而是用 `getOnBackPressedDispatcher().addCallback(...)`。** 这不是随手选的写法——这个项目 `targetSdkVersion = 36`（`android/variables.gradle`），高版本安卓的手势/预测性返回走的是新的 `OnBackPressedDispatcher` 机制，直接覆写老式的 `Activity.onBackPressed()` 在这个targetSdk下**不可靠触发**（踩过这个坑：第一版就是覆写 `onBackPressed()`，编译没问题，真机上按返回键完全没反应，跟没写一样，排查半天才发现是这个）。**以后不管加什么返回键相关的逻辑，都用 `OnBackPressedDispatcher`，别用 `onBackPressed()`。**

**JS这边（`www/index.html`）**：每次按返回键，原生层用 `evaluateJavascript` 问挂在 `window` 上的 `window.__handleBackButton()`（业务代码整体是IIFE包起来的，这个入口函数必须显式挂到 `window` 才能被原生层拿到）——返回 `true` 表示"我自己关掉了一层东西"，原生层什么都不做；返回 `false` 表示"没什么可关的"，原生层才 `finish()` 退出App。

**这个函数内部按"最上层的先关"的顺序逐层判断**（在还债务的抖动编辑模式 `jiggleMode` → 居中确认弹窗 `#modalScrim` → 账户详情页 `#accountScreen` → 编辑窗 `#editSheet` → 详情窗 `#detailSheet`），实现的是"一层一层退"而不是一键全退到桌面。**以后新增别的弹窗/浮层，如果也想让返回键能关掉它，得手动把它的判断加进这个函数的优先级链——这是JS和Java两边靠一个字符串名字"约定"起来的隐性契约，编译器不会提醒你漏加，加漏了也不报错，只是那个新弹窗按返回键没反应、直接退出App，很容易漏测出来。**`#accountScreen`和`jiggleMode`都是这条警告的具体例子：都是新增的浮层/模式，被显式加进了这条链。

**`#loginGate`（登录门）反而故意不加进这条链**——它没有关闭函数，设计上就是不可关闭的。登录门显示时，上面几个`if`全部为false，自然落到`return false`，原生层`finish()`退出App，这正是想要的"没什么可关的，直接退出"效果，不是漏加。

**`.subpage`是这个项目第一个"整页推入"型浮层**（账户详情页`#accountScreen`用的就是这个class），跟原有的`.scrim`/`.sheet`底部弹出模式不同——从右侧滑入、覆盖满屏（含tabbar）、带返回箭头+标题的头部，不是从底部弹出的卡片。z-index分层：`.tabbar`=20 < `.scrim`=30 < `.sheet`=31 < `.subpage`=35 < `.login-gate`=40 < `.modal-scrim`=50 < `.flash`(toast)=60。以后再加类似的整页浮层，按这个顺序找自己的位置插进去，不用重新摸索。

## 在还债务自定义排序：长按拖拽 + 抖动编辑模式

"在还债务"列表除了10种预设排序（利率/借款金额/剩余待还/月供/剩余期数），还有第11种"自定义"——长按任意债务卡片进入iOS桌面图标式的抖动编辑模式（`jiggleMode`），此时卡片可以按住拖动重新排序，松手后如果新顺序恰好跟某个预设排序完全一致会自动切回那个预设名，否则自动切到"自定义"。退出编辑模式靠排序框左边的"保存"按钮（`#jiggleDoneBtn`，只在编辑模式显示）。相关状态/函数集中在`renderDebts()`后面那一整块（`jiggleMode`/`dragCtx`/`onCardTouchStart`/`onCardPointerDown`/`beginDrag`/`applyDragFrame`/`autoScrollTick`/`finishDrag`/`commitReorder`/`detectMatchingSort`）。

**没有id字段，靠"稳定分区"重排`debts`数组本身**：这个项目里债务对象一直是用数组下标寻址（`openDetail(i)`等），没有单独的id或顺序字段。拖拽提交时`commitReorder()`按原数组顺序走一遍，凡是"在还"的槽位依次填入新顺序，凡是"已结清"的槽位原样不动——已结清债务在数组里的相对位置完全不受这次拖拽影响，也不需要给`debts`加任何新字段。

**拖拽全程用文档坐标（`clientY + window.scrollY`），不是纯视口坐标**——这是为了让"拖到屏幕边缘自动滚动页面"不需要额外的重新测量：`beginDrag()`一次性测好每张卡片在文档坐标下的自然位置（`naturalTop[]`），之后无论页面怎么滚动，两张卡片位置的差值都不变，`applyDragFrame()`每次都是从`naturalTop[]`重新算全部卡片该挪多少像素，不是在上一帧基础上累加——这样来回快速拖拽也不会产生漂移误差，卡片回到原位时自动得到位移为0。

**⚠️ 触摸手势必须用 Touch Events，不能用 Pointer Events——这是踩了很多轮才定位到的架构级坑，改这块前务必看懂**：需求是"同一张卡片：平时手指按上去能滚动列表，长按后能拖动排序"。这两件事在触摸设备上没法用 Pointer Events 兼顾，根本原因是——**用 Pointer Events 时，`pointermove` 上的 `preventDefault()` 不能阻止浏览器滚动**，滚不滚只由 CSS 的 `touch-action` 决定，而 `touch-action` 在手指刚触屏那一刻就锁定了、手势中途改它对当前这次触摸无效。于是 Pointer Events 只能二选一：`touch-action:none`→拖得动但卡片上没法滚动；`touch-action:pan-y`→能滚动但一竖着拖就被浏览器抢去当滚动、发`pointercancel`把拖拽杀掉。**之前反复"要么拖不动、要么只能在卡片间隙滚动"，全是因为在 Pointer Events 这条注定二选一的路上来回调参数。**

  最终方案（`onCardTouchStart`）：**触摸设备走 Touch Events（`touchstart`/`touchmove`/`touchend`），且 `touchmove` 监听器必须 `{passive:false}`**——只有 touch 事件的 `touchmove.preventDefault()` 能"逐次"动态否决原生滚动。平时（等待长按、或判定为滑动/滚动）完全不 `preventDefault`，原生滚动照常、手感跟卡片间隙完全一致；一旦长按判定成功、确认进入拖拽，之后每一次 `touchmove` 都 `preventDefault` 挡掉滚动、由 JS 接管定位。因为长按判定期间手指是静止的（移动超过10px就取消长按、判定为滚动），拖拽激活时原生滚动根本没启动，第一次 `preventDefault` 就能干净挡下。卡片 `touch-action` 保持默认（`auto`），不要再设 `none`/`pan-y`。**桌面鼠标**才走 Pointer Events（`onCardPointerDown`，`pointerType==='mouse'` 时才处理，纯为桌面浏览器可测；真机上 touchstart 和 pointerdown 都会触发，靠这个判断避免两边重复处理）。

  **长按还会触发 WebView 自带的系统级触感反馈（马达震动）**，这是内容层的手势识别，网页层的 `user-select:none`/`preventDefault` 都管不住——已在 `MainActivity.java` 里用 `bridge.getWebView().setHapticFeedbackEnabled(false)` 从原生层关掉。配合全局的 `user-select:none`（body 上关、只 input/textarea 放开）+ 全局阻止 `contextmenu`，一起压掉长按的选中/菜单/震动这几个原生副作用。

  **拖拽期间故意不复用现有的`lockScroll()`/`unlockScroll()`**（`initGripDrag`用的那套refcounted滚动锁，靠`document.body.style.overflow = "hidden"`实现）——如果拖拽时也锁滚动，会跟"边缘自动滚动"里的`window.scrollBy()`打架（`overflow:hidden`在不同浏览器引擎下对程序化滚动的影响不一致，不值得赌）。拖拽时靠上面说的 `touchmove.preventDefault()` 挡原生滚动就够，不需要再叠一层滚动锁。

**排序方式（含自定义）现在会跨App重启记住**——`debtSort`存在独立的`SORT_KEY`（`debt-manager-sort-v1`）里，通过`setDebtSort()`这一个函数统一读写，不要绕过它直接改`debtSort`变量（会漏掉持久化）。

**编辑模式期间`#addBtn`（新增一笔）、已结清区域的"恢复"按钮、`#debtSortSel`下拉框都会被禁用**（CSS靠`#view-debts.jiggling`这个类切换），目的是保证编辑模式期间不会有别的sheet被同时打开——这也是为什么`window.__handleBackButton`里`jiggleMode`的判断可以放在最前面、跟其余判断互斥（见上面"返回键处理"一节）。

## 字体：`www/fonts/`

`www/fonts/Inter-Variable-Latin.woff2`（+ `OFL.txt`许可证文本）不是随手丢进去的孤立文件，是`www/index.html`里`@font-face`引用的本地字体资源，`npx cap sync`会把整个`www/`文件夹（不只是`index.html`一个文件）打包进APK，所以这样引用没问题。**只包含拉丁字母/数字（`unicode-range`限定），不含中文字形**——这是故意的：完整内嵌一个覆盖几千汉字的中文字体体积会到几MB到十几MB，塞进这个项目不现实。中文文字会自动落到`--font-ui`变量里排在后面的系统字体（`"PingFang SC"`等），不受这个字体文件影响。别看着这个目录只有两个文件就以为是没清理干净的临时产物。

## 登录门："After Zero"手写字样：`www/img/app-icon.png` + `#loginGate`里的`.gate-hw` SVG

登录门（`#loginGate`）顶部是App图标原图（`www/img/app-icon.png`，从`resources/icon-only.png`原样复制、缩小到320×320），下方"After Zero"是手写笔迹逐字画出来的动画（`www/index.html`里`class="gate-hw"`的那段SVG）。

**这段SVG里每个字母的`<path d="...">`坐标不是手画的，是用`fontTools`从开源手写字体`Caveat`（Google Fonts，OFL协议，跟`www/fonts/`那个Inter同协议）精确提取出来的真实字形轮廓**——这是吸取了之前"手绘火柴人走路动画"失败的教训后改的路线：手绘/AI生成的图形效果不可控，字体文件里的矢量数据是精确、可复现的。每个`<path>`的`style="--i:N;--len:X"`里，`--i`是这个字母的顺序（用来做逐字错开的`animation-delay`），`--len`是这条路径的**真实几何长度**（用`svgpathtools`算出来的，不是`pathLength`标准化值——踩过一个坑：本机用来验证效果的`resvg`渲染工具不支持SVG的`pathLength`属性对`stroke-dasharray`/`stroke-dashoffset`计算的归一化效果，导致一开始怎么调都看不出动画在动，改成用真实长度才验证通过）。CSS部分是标准的"描边逐笔画出"技法：`stroke-dasharray:var(--len); stroke-dashoffset:var(--len)` → 动画到`stroke-dashoffset:0`。

**以后如果要改这行文字（换成别的文案）或者换字体，不能直接手改这些`d`坐标**——那样跟手绘瞎猜没区别。正确做法是重新走一遍提取流程：`pip3 install fonttools svgpathtools`，下载目标字体文件，写一个小脚本用`fontTools.pens.svgPathPen.SVGPathPen`重新提取新文字每个字符的路径+用`hmtx`表算前进宽度排版，再用`svgpathtools`的`parse_path(d).length()`算每条路径的真实长度填到`--len`——这套流程本身不难，但没有这几个库/这个思路的话，容易掉回"手画字形"这个老坑。

**"微信登录"按钮里的图标同理，不是手画的**：用的是开源图标库[Simple Icons](https://simpleicons.org)里收录的官方微信图形矢量数据（`https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/wechat.svg`，CC0协议，可自由使用），`viewBox="0 0 24 24"`配合`fill="currentColor"`直接抄进`.btn-ic`（这个项目已有的"按钮内图标"通用class，别的按钮比如"编辑"也在用），颜色自动跟着`.btn.primary`的白色文字走，不用单独指定。

**登录门的按钮不是一直显示的——延迟到"After Zero"手写完才淡入出现**：`.login-gate .data-actions`默认`opacity:0`+`pointer-events:none`，`.login-gate.open`时播放`gateBtnIn`动画，`animation-delay: 1.45s`。**这个1.45s是手算出来的，不是自动跟着手写动画走的**：手写动画9个字母，`animation-delay: calc(var(--i) * 90ms + 150ms)`，最后一个字母（`--i:8`）结束于 8×90+150+500=1370ms，按钮延迟在这基础上多留约80ms（1450ms）。**以后如果改了"After Zero"这几个字（字母数变了）或者改了逐字延迟/动画时长这些参数，这个1.45s要跟着手动重新算，不会自动同步**——这是两段独立CSS动画靠一个手算的时间常数耦合起来的，编译器/浏览器都不会提醒你算错了，只会导致按钮出现得太早（手写还没画完）或太晚（凭空停顿一截）。

## App图标：`resources/`

`resources/icon-only.png`、`icon-foreground.png`、`icon-background.png` 是App启动图标的设计源文件（1254×1254），不是随手放的孤立图片。`icon-background.png` 是纯黑白左右对半分的通栏底色，`icon-foreground.png` 是透明底的"门/0 + 走路的人"图形（黑白根据所在半边跟随反转，只留描边保证两边都看得清）。

真正编译进APK的是 `android/app/src/main/res/mipmap-*/` 下那一整套图标文件——那些是用 [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets) 从 `resources/` 这三个源文件生成的（`npx @capacitor/assets generate --android`），不要手动改mipmap下的PNG，改了下次重新生成会被覆盖；要调整图标，改 `resources/` 里的源文件后重新跑生成命令。

**踩过一个坑**：`@capacitor/assets` 默认会给 `mipmap-anydpi-v26/ic_launcher.xml`（自适应图标配置）里的 `<background>` 和 `<foreground>` 都套一层 `16.7%` 的内缩（`<inset>`）。这对本项目不对——`icon-background.png` 设计上就是要通栏铺满到边缘的（黑白对半分），内缩之后四周会露出一圈透明，实机上大概率透出桌面壁纸/系统默认色，很难看。所以 `<background>` 这层的inset已经手动去掉了（保留 `<foreground>` 的inset，因为 `icon-foreground.png` 里的图形本身上下几乎顶到画布边缘，需要靠内缩才不会被圆形/方形等不同launcher遮罩裁掉）——**以后如果重新跑 `@capacitor/assets generate`，它会把 `<background>` 的inset加回去，记得再删一次。**

## 云函数源码：`cloudbase/`

`cloudbase/functions/wxLogin/`是腾讯云开发（CloudBase）云函数的源码，服务端代码，负责微信登录时用`code`换`openid`、签发自定义登录票据（详见上面"原生插件：`WeChatLogin`"一节）。`cloudbase/functions/deleteAccount/`是配套的注销账户云函数，负责真正删除`users`集合里的用户文档（详见上面"云函数：`deleteAccount`"一节）。**这个目录不属于Capacitor/Android那套构建流程，`npx cap sync android`不会碰它，也不会自动部署**——改完要手动同步到CloudBase控制台或用他们的CLI工具部署。AppSecret等敏感配置只存在CloudBase云函数的环境变量里，不存在这个目录任何文件里，也不能加进来。

## 构建

```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
```

产出：`android/app/build/outputs/apk/debug/app-debug.apk`

**要测微信登录必须编译release包**（debug签名过不了微信的签名校验，见上面"原生插件：`WeChatLogin`"一节）——前提是这台机器上已经有`android/app/after-zero-release.keystore`+`android/keystore.properties`（见"硬性铁律"第4条，两个都因机器而异、已gitignore，不是每台机器天生就有）：

```bash
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleRelease
```

产出：`android/app/build/outputs/apk/release/app-release.apk`

## 本地网页测试（不用编译安卓包）

`www/index.html` 是纯前端文件，改完想快速验证效果，不必每次都走完整的 `npx cap sync android` + Gradle编译流程。用 `cd www && python3 -m http.server 8765`，然后浏览器打开 `http://localhost:8765` 就能测（Chrome桌面版即可）。

**别用 `file://` 直接双击打开来测。** `localStorage`/`IndexedDB` 是按协议+域名+端口（origin）隔离存储的，`file://` 协议下各浏览器对这两个存储API的限制不统一（尤其Chrome限制较多），行为跟安卓WebView里跑的真实情况不一致，容易测出假结果。用 `http://localhost` 这种标准origin更接近Capacitor WebView的真实环境。

**登录现在是强制的，桌面浏览器测试想跳过`#loginGate`（比如只是想测债务/档案库这些跟登录无关的功能），在devtools console手动执行一次即可**（`window.Capacitor.Plugins.WeChatLogin`在桌面浏览器里不存在，登录门里的按钮点了只会提示"仅支持安卓App内使用"，没法真正走通登录）：

```js
localStorage.setItem("after-zero-account-v1", JSON.stringify({openid:"test",nickname:"测试昵称",avatarUrl:"<任意https图片url>",loggedInAt:Date.now()}))
```

执行完刷新页面，登录门就会消失。

## 环境要求 & 已知坑

- **必须 JDK 21**，JDK 17 编译会报 `无效的源发行版：21`（Capacitor这个版本要求的）。
- **macOS + Homebrew装的`openjdk@21`默认不会链接到`java`命令**（Homebrew的openjdk是keg-only，不进`/usr/bin`，不改`JAVA_HOME`）。`java -version`可能直接报"Unable to locate a Java Runtime"，就算`brew install openjdk@21`已经装过了。跑Gradle时要显式指定：`JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug`（Apple Silicon路径；Intel Mac是`/usr/local/opt/openjdk@21`）。
- 需要安卓SDK的 `platform-tools` + `platforms;android-34` + `build-tools;34.0.0`。
- `android/local.properties` 要写 `sdk.dir=<SDK路径>`，这个文件因机器而异、已被gitignore，每台机器自己建。
- **如果在配了网络代理的 Claude Code session 里跑构建，或者 `git push`/`git pull` 到GitHub**：`sdkmanager` 装SDK组件、Gradle编译需要连 `dl.google.com` / `maven.google.com`，`git push` 需要连 `github.com`；这个session之前用的一个住宅代理连这些域名会失败（`dl.google.com`/`maven.google.com` 报连接重置 Recv failure，`github.com` 报 `Proxy CONNECT aborted`）。遇到这种情况，把要用到网络的命令加上 `env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy` 前缀去掉代理再跑，能直接连通。

## 硬性铁律，改代码前必看

1. **`localStorage` 的 KEY（在`www/index.html`里搜 `debt-manager-v5`）永远不能改。** 这是用户设备上保存真实数据的键名，改了等于让已经装过的app找不到自己原来存的数据，直接清零。同理，`DKEY`（`debt-manager-docs-v5`）、账号登录状态用的`ACCOUNT_KEY`（`after-zero-account-v1`）、在还债务排序方式用的`SORT_KEY`（`debt-manager-sort-v1`）以后也不能改——四者是各自独立的键，不要以为加新功能可以复用或合并。
2. **新安装必须是空数据。** `www/index.html` 里 `SEED`（债务种子数据）、`DOCS_SEED`（文档种子数据）这两个常量现在都是空值——这是故意的，因为这个app的定位是要发给别人用，任何人第一次打开都不能预装开发者自己的私人财务数据。**改代码时如果要放测试数据，改完记得清空再提交，别把私人内容（真实债务数字、个人反思文档、任何带真实姓名/金额的东西）带回默认值里。**
   **私人数据不止藏在这三个常量里。** 之前排查发现过一次：一个叫`cliff`的调试用标记字段，虽然完全没有UI能设置它（不是SEED、不是表单字段），但代码里直接写死了具体的还款日期和金额字符串（`"2027-05 起还本，月供跳至 ¥2,182"`这类）挂在渲染逻辑里，跟SEED是否清空无关。改代码时留意：不只是搜`SEED`/`DOCS_SEED`这两个变量名，任何看着像真实日期/金额/人名的硬编码字符串都要多看一眼是不是该删。（补：曾经还有个`POSTER`"愿景海报"常量，因为没有任何UI入口能往里填内容、属于永远激活不了的死代码，已整体删除，包括`fileItems()`/`renderDocContent()`里对应的分支，别再找它。）
   **"新安装=空数据"这个假设依赖 `AndroidManifest.xml` 里 `android:allowBackup="false"`。** 安卓系统默认（`allowBackup="true"`，Capacitor脚手架生成时的默认值）会把App数据自动云备份到用户的Google账号，卸载重装或者换新手机登录同一个Google账号时可能会自动把旧数据（包括`ACCOUNT_KEY`存的登录态）恢复回来，让"重装"变得不再可靠地等于"空白状态"。这个项目已经手动改成`allowBackup="false"`彻底关掉自动备份——以后如果看到这个值被改回`true`（比如重新跑`npx cap add android`之类的脚手架命令覆盖了手改的manifest），要记得改回`false`。
3. **包名 `io.github.jenkjyu.afterzero` 是这个app的永久身份，不要随便改。** 安卓系统靠包名判断"新装的这个APK是不是我认识的那个app的新版本"——包名一样+签名一致才会被当成"更新"（原地覆盖、保留数据）；包名一变，系统当成完全不相关的新app，跟原来的app和它的数据没有任何关系，装出来是第二个图标、全新空数据。这个项目早期开发阶段（曾用过 `com.jenkjyu.debtmanager` 这个包名做过几版debug包）就是因为这个原因废弃重来的——开发者自己手机上可能还留着那个旧包名、带真实数据的旧版本，跟现在这个 `io.github.jenkjyu.afterzero` 是两个互不相通的独立app，别搞混、别以为它们共享数据。
4. **release签名密钥已经生成（因为微信登录要求提交release签名SHA1去微信开放平台注册），但目前还没有任何正式发布用过它。** Keystore文件在 `android/app/after-zero-release.keystore`，密码等配置在 `android/keystore.properties`——两个都已gitignore，不在git历史里。`android/app/build.gradle` 里 `signingConfigs.release` 检测到 `keystore.properties` 存在才生效（没有这个文件时`buildTypes.release`不带签名配置，仍然能正常debug构建，克隆仓库的人不受影响）。**`./gradlew assembleDebug`（README默认的构建命令）产出的还是debug包，不受这次改动影响；只有显式跑 `assembleRelease` 才会用到这个release签名。** 这个keystore一旦真正拿去发布过一个版本，丢了 = 以后再也没法用同一个身份更新这个app，需要跟`localStorage`那条铁律同等严重地对待——离线、异地备份好。
5. **License 是 PolyForm Noncommercial 1.0.0，不是MIT/ISC这类常见的宽松协议，是刻意选的。** 开发者规划未来要在这个app上加付费功能，选这个协议是为了禁止别人白嫖代码去做商业竞品（发到应用商店卖钱、内置广告等）；别人依然可以自由fork/学习/个人非商业使用。改动licensing相关内容（`LICENSE`文件、`package.json`里的`license`字段、README里的License说明）前要确认这个前提没变。
6. **`AndroidManifest.xml` 里的 `INTERNET` 权限当初是为未来付费功能预留的，现在已经真正用上了**——`www/index.html` 里的微信登录功能会加载CloudBase CDN脚本、调用腾讯云开发的云函数，是这个app第一次真正发出网络请求（`WeChatLogin`原生插件本身走的是Intent/AIDL跟微信App通信，不占用这条权限）。这条权限不要删。
