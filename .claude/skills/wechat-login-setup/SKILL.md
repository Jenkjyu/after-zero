---
name: wechat-login-setup
description: This skill should be used when debugging or configuring the WeChat login integration in this project (WeChatLoginPlugin.java, WXEntryActivity, wxLogin cloud function), or when the user asks about "微信登录", "WXEntryActivity", "isWXAppInstalled", "signInAnonymously", "匿名登录", "cbApp().auth is not a function", "Cannot read properties of null (reading 'scope')", or CloudBase custom-login API usage (createTicket/signInWithCustomTicket).
---

# 微信登录SDK接线

原生App拉起微信App走OAuth授权（不是网页扫码），必须用微信官方Android SDK（`com.tencent.mm.opensdk`），不能纯JS实现。这几个坑全部是一次性的环境/配置问题，不是代码逻辑问题，但极其隐蔽。

## SDK硬编码写死、不能改的地方

- 回调Activity必须叫`wxapi.WXEntryActivity`，包路径必须是`<applicationId>.wxapi.WXEntryActivity`（这个项目是`io.github.jenkjyu.afterzero.wxapi.WXEntryActivity`）——微信SDK自己去找这个类的硬编码路径，改名字/挪包会导致回调收不到。
- `AndroidManifest.xml`里必须有`<queries><package android:name="com.tencent.mm" /></queries>`——安卓11+的包可见性限制下，没有这行`isWXAppInstalled()`/`sendReq()`会静默失效（不报错，就是不工作）。
- 微信登录要求提交release签名证书SHA1指纹去微信开放平台注册，debug签名注册不了——release keystore的生成/位置/构建命令见`release-keystore` skill。

## CloudBase SDK接线时按顺序会踩到的6个坑

1. **CDN引入CloudBase JS SDK时，`cloudbase.js`只是"内核"，登录(auth)和云函数(functions)模块必须单独再引入两个`<script>`标签**（`cloudbase.auth.js`、`cloudbase.functions.js`，同版本号），漏引会导致`app.auth()`返回的对象没有`.auth`方法（`cbApp().auth is not a function`）。

2. **CloudBase JS SDK（至少2.28.6这个版本）有个内部bug**：`auth._getCredentials()`内部先读`t.scope`再判断`t`是否为`null`，全新设备/App从没建立过任何登录态时`t`就是`null`，直接抛`TypeError: Cannot read properties of null (reading 'scope')`，会连带搞挂`callFunction()`。规避方法：真正走自定义票据登录流程之前，先调一次`auth.signInAnonymously()`（失败就忽略，不阻塞主流程）垫底写入一份本地凭证，绕开这个先用后判的bug。

3. **CloudBase控制台"身份认证→登录方式"里，"匿名登录"必须单独开启**，不开的话第2条的`signInAnonymously()`会直接被拒（400，报错信息会明确写"当前调用的signInAnonymously()所需的登录方式尚未在云开发控制台启用"）。

4. **`wxLogin`云函数默认的权限规则会拒绝匿名调用者，报`[PERMISSION_DENIED]`**——`wxLogin`恰恰是给"还没真正登录、只靠匿名身份垫底"的客户端换正式登录票据的入口，必须手动给它加权限例外。放开权限的具体做法（"权限控制"是环境共享配置，不要把`*`整条打开）见`cloudbase-deploy` skill。

5. **`wxLogin/index.js`查询/写入的`users`集合，CloudBase不会自动建**：没建的话报`[ResourceNotFound] Db or Table not exist: users`。**注意CLI查询不存在的集合不会报错、只返回空数组**，不能靠CLI验证集合是否建好，只能去控制台"文档型数据库"页面肉眼确认。集合权限选"无权限[ADMINONLY]"即可。

6. **release包默认关闭WebView远程调试**（`webContentsDebuggingEnabled`跟着`isDebug`走），而微信登录又必须用release签名测试——排查release包专属问题时，临时在`capacitor.config.json`里加`"android": {"webContentsDebuggingEnabled": true}`，调完记得删掉这个临时开关。

## CloudBase自定义登录API用法（已核对官方文档，别凭记忆写）

- 云函数端：`app.auth().createTicket(openid)`——只接受一个参数，不支持`refresh`/`expire`选项。
- 客户端：不是直接`signInWithTicket(ticket)`，而是先用`auth.setCustomSignFunc(fn)`注册"怎么去拿ticket"的回调，再调用**不带参数**的`auth.signInWithCustomTicket()`。
- `app.auth().createTicket()`必须用启用"自定义登录"后下载的私钥初始化的app实例调用，不能用云函数默认的admin app（那个实例没有签发登录票据的权限）。

## 一个容易被名字搞混的坑

CloudBase控制台内置的"微信开放平台登录"**不是**这个项目用的东西——那个走的是网站应用网页跳转授权流程，是给网页场景设计的；这个项目走的是原生App直接拉起微信App的SDK授权流程，两者不通用。继续用自己的`wxLogin`云函数+自定义登录就好，不要去启用那个内置选项。
