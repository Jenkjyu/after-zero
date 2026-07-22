# After Zero

一个记债务的个人工具，打包成了能真正安装的安卓app。名字的寓意：对债务归零之后生活的期待。

app的主体是一个自包含的HTML文件（`www/index.html`——纯HTML/CSS/JS，不依赖任何框架，也不需要构建步骤），用 [Capacitor](https://capacitorjs.com/) 包成了原生安卓壳；另外有几段手写的原生插件代码：一段用于把档案库/备份文件真正存到用户自选的位置（点"下载"会弹系统"另存为"选择器，网页标准的下载方式在安卓WebView里不可靠），一段用于接入微信登录；还款提醒页支持本地推送通知（到期前提醒），用的是官方Capacitor插件。**打开App需要先微信登录**——账号体系目前是这个App唯一的准入方式。"我的"页有一个Premium/AI订阅入口，目前只是UI占位（App还没上架应用商店，暂时接不了真实支付），为未来的付费功能铺路。

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
npx cap sync android          # 把 www/ 同步进原生工程
cd android
./gradlew assembleDebug       # 产出 android/app/build/outputs/apk/debug/app-debug.apk
```

编译出来的 `app-debug.apk` 可以直接传到安卓手机上装（装的时候允许"安装未知来源应用"），或者用数据线 `adb install app-debug.apk`。这是debug包，自己装没问题，不是能直接上架应用商店的格式。

## 项目结构

- `www/index.html` —— app真身（改这个），`www/fonts/` 是它引用的本地字体文件，`www/img/` 是登录门用到的图标图片
- `android/` —— Capacitor/Gradle自动生成的原生工程，绝大部分别手动改，改完 `www/` 后重新跑 `npx cap sync android`；例外是 `android/app/src/main/java/io/github/jenkjyu/afterzero/` 下有手写的原生插件（`SaveFile` 负责把档案库/备份文件存到用户自选的位置；`WeChatLogin` 负责账号登录），这部分不会被sync覆盖，是真实源码
- `cloudbase/` —— 腾讯云开发（CloudBase）云函数的服务端代码，配合微信登录用（`wxLogin`换取登录票据、`deleteAccount`处理注销账户），不属于Capacitor/Android那套构建流程，需要单独部署，细节见 `CLAUDE.md`
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