---
name: capacitor-native-runtime
description: "Use this skill when modifying or debugging After Zero's current Capacitor Android runtime: files under the root `android/` project, `capacitor.config.json`, custom Java plugins, plugin registration, Android manifests/resources, Local Notifications, SAF file saving, WebView/native boundaries, `npx cap sync android`, stale packaged web assets, or debug APK builds. Also use it for native-only failures such as missing plugins, 0-byte exports, notification delivery problems, or Android hardware-back behavior. Route WeChat SDK setup, release signing, CloudBase deployment, React bridge ownership, and WebView UI details to their dedicated skills as described here."
---

# Capacitor 原生运行时与构建边界

## 先判定文件归属

从当前配置和源码建立地图，不按历史阶段推断：

- `capacitor.config.json`：应用身份和 `webDir: "www"`。
- `react/src/**`：React源码；`npm run build:react`生成gitignored的`www/js/react-debts/**`。
- `www/**`：Capacitor要打包的Web目录；`npx cap sync android`复制到gitignored的`android/app/src/main/assets/public/**`。
- `android/app/src/main/java/io/github/jenkjyu/afterzero/**`：四个手写Java类，是真正源码，不是sync产物。
- `android/app/src/main/AndroidManifest.xml`、`android/app/build.gradle`、`android/variables.gradle`和手写资源：受版本控制的Android源码/配置。
- `android/capacitor.settings.gradle`、`android/app/capacitor.build.gradle`：Capacitor按npm插件生成的文件，文件头已标明`DO NOT EDIT`；改插件依赖后重新sync，不直接维护。
- `cloudbase/functions/**`：独立服务端部署单元，不进入APK，也不由sync部署；涉及它时加载`cloudbase-deploy` skill。

不要直接改两层生成物。`npx cap sync android`不会删除手写Java、manifest、`build.gradle`或`res/drawable/ic_stat_notify.xml`，但重新执行`npx cap add android`属于重建平台工程，可能覆盖手改配置，不能当普通sync使用。

## 区分手写插件与npm插件

当前手写Java类只有四个：

| 文件 | 职责 |
|---|---|
| `MainActivity.java` | 注册手写插件、WebView原生设置、硬件返回桥接 |
| `SaveFilePlugin.java` | SAF另存为与大文件传输 |
| `WeChatLoginPlugin.java` | 拉起微信、校验OAuth state、发出`wechatAuthResult` |
| `wxapi/WXEntryActivity.java` | 微信SDK固定路径的授权回调Activity |

保持`MainActivity.onCreate()`里对`SaveFilePlugin`和`WeChatLoginPlugin`的`registerPlugin()`；这两个类不是npm包，Capacitor不会自动发现。`@capacitor/local-notifications`则是`package.json`里的官方npm插件，由sync生成Gradle接线并通过AAR manifest merge注入权限/receiver；不要在`MainActivity`重复注册，也不要把它的生成依赖手写回两个`capacitor*.gradle`文件。

修改微信原生链、`WXEntryActivity`、CloudBase自定义登录或release包调试时，同时加载`wechat-login-setup`；构建签名包或处理keystore/SHA1时加载`release-keystore`。

## 维护 `MainActivity` 的三条边界

- WebView视觉配合：edge-to-edge、状态栏/导航栏透明、关闭WebView触感反馈与原生overscroll。改显示效果时同时加载`capacitor-ui-system`，不要只修Java或只修CSS其中一层。
- 硬件返回：使用`OnBackPressedDispatcher`执行`window.__handleBackButton()`；Web层返回`true`表示已消费，只有`false`才`finish()`。改返回顺序或React surface时同时加载`react-bridge-architecture`。
- 插件注册：手写插件在`super.onCreate()`前注册；官方npm插件不走这里。

当前`applicationId`/namespace/appId都是`io.github.jenkjyu.afterzero`，这是更新、微信回调和签名身份的一部分，不要随意改。保持manifest中的`android:allowBackup="false"`、`INTERNET`权限、微信包可见性`queries`和`.wxapi.WXEntryActivity`声明；新安装为空数据依赖`allowBackup=false`不被平台脚手架覆盖。

## 维护 SAF 文件保存

所有“把文件保存到手机”的Web入口统一调用`www/index.html`的`saveToDeviceDownloads(blob, filename, mime)`：原生环境调用`SaveFile`，桌面浏览器才回退`<a download>`。不要给新的备份、档案或导出按钮直接写`<a download>`，Android WebView里可能没有任何反应。

保持当前SAF架构：

1. `save()`先把base64解码到`getCacheDir()`临时文件。
2. 从`PluginCall.data`移除大字段，只保留短`tmpPath`。
3. 用`ACTION_CREATE_DOCUMENT`让用户选择目标位置；不申请存储权限。
4. 回调中以64KB缓冲从临时文件流式写入`content://`目标。
5. 无论成功、失败或取消都在`finally`删除临时文件；取消保持中性文案“已取消”。

不要退回“整段base64跨Activity边界、回调再一次性decode”的实现。大PDF/XLSX会触发`TransactionTooLargeException`或双份内存OOM，并可能留下0字节目标文件。SAF自API 19可用，低于Android 10不需要另走`MediaStore`分支；项目当前`minSdkVersion`为24。

桌面浏览器只能验证fallback，不能证明SAF、`content://`读写或大文件稳定性。相关修改必须用APK在Android设备/模拟器验证，至少覆盖取消、成功打开文件和较大的PDF/XLSX。

## 维护本地通知

React的`NotifySheet`只拥有UI状态；通知配置持久化、权限和原生调用仍在`www/index.html`的vanilla运行时。`syncNotifications()`使用“全清再重排”：取消当前全部pending，再调用`computeNotifySchedule()`为未来6个月内全部未还期次生成提醒，最多保留最近的450条，不是只排每笔债务的`nextDate`。

保持以下原生约束：

- Android 8+启动时幂等创建`repay` channel。
- 通知使用单色矢量`android/app/src/main/res/drawable/ic_stat_notify.xml`作为`smallIcon`，不要用全彩launcher图标。
- 当前刻意不申请`SCHEDULE_EXACT_ALARM`，接受省电策略造成的分钟级延迟；若改成精确提醒，先重新评估权限和系统设置成本。
- `POST_NOTIFICATIONS`、`RECEIVE_BOOT_COMPLETED`、`WAKE_LOCK`及restore receiver来自Local Notifications AAR的manifest merge；用合并后的manifest验证，不在主manifest机械复制。
- “发送测试通知”在10秒后触发，用它验证权限→channel→schedule链；桌面浏览器无法验证真实通知。

排查“前台能收到、划掉最近任务后收不到”时，先记录手机品牌/系统和用户如何关闭App。华为/荣耀已实测会限制后台唤醒，需要在应用启动管理中允许自启动、关联启动和后台活动；先区分厂商电源策略与调度代码问题。

## 使用正确的构建顺序

首次安装依赖或React源码有改动时：

```bash
npm install
npm run build:react
npx cap sync android
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug
```

Apple Silicon的JDK路径如上；Intel Homebrew通常是`/usr/local/opt/openjdk@21`。以`android/app/capacitor.build.gradle`的Java 21和`android/variables.gradle`的SDK值为准；当前是`minSdk 24`、`compileSdk 36`、`targetSdk 36`。`android/local.properties`保存本机`sdk.dir`且已gitignore。

按改动范围缩短流程：

- 只改`react/src/**`：至少build React，再sync；要产APK再Gradle构建。
- 只改`www/**`且确认React产物最新：可跳过React build，但仍sync。
- 只改手写Java/manifest/resource/非生成Gradle配置：不需要为此重建React或sync，直接Gradle构建；若同时改npm插件依赖或Web内容，再执行对应前置步骤。
- 只改上下文文档/skill：不build、不sync，避免无意义刷新生成物。

Debug APK输出到`android/app/build/outputs/apk/debug/app-debug.apk`。Release构建、签名文件和SHA1全部交给`release-keystore` skill；微信登录必须用注册过签名的release包真机验证。

## 验证工作流

1. 先检查`git status --short`，保留用户改动；确认没有直接修改两层Web生成物或`capacitor*.gradle`生成文件。
2. 改npm插件依赖后运行sync并检查生成Gradle接线；改manifest相关功能后检查合并manifest，而不只看主manifest。
3. 改Web/bridge时按`react-bridge-architecture`运行React测试、TypeScript、build和sync；改纯计算通知排程时另跑`npm test`。
4. 改Android源码时用JDK 21运行对应Gradle构建；必要时检查安装后的包名、插件可用性与WebView console。
5. SAF、微信、系统通知、厂商后台限制、硬件返回和release调试都属于原生验证面，不能用桌面localhost结果替代。
6. 最后运行`git diff --check`，并确认未把`android/local.properties`、keystore、`keystore.properties`或CloudBase密钥加入版本控制。
