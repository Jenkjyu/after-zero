---
name: cloudbase-deploy
description: This skill should be used when the user wants to deploy or debug a CloudBase cloud function in this project (wxLogin, deleteAccount, backupCreate, backupList, backupRestore, backupDelete, backupUploadFile, aiAdvisor), or asks about "部署云函数", "tcb fn deploy", "Cannot find module '@cloudbase/node-sdk'", "cloudbaserc.json", or CloudBase environment variable / permission control errors.
---

# CloudBase 云函数部署

`cloudbase/functions/` 下的云函数不属于Capacitor/Android构建流程，`npx cap sync android`不会碰它，必须用CloudBase CLI手动部署。

## 部署命令

CLI没有全局装，用`npx`调用；必须在`cloudbase/`目录下跑（CLI靠当前目录找`cloudbaserc.json`，在repo根目录跑会读不到配置转成交互式问答卡住）：

```bash
cd cloudbase
npx --yes -p @cloudbase/cli tcb fn deploy <函数名> --force
```

## 前置条件：`cloudbase/cloudbaserc.json`

这个文件已gitignore、不进git，因机器而异、装真实密钥，性质跟`android/keystore.properties`一样。部署前先确认它存在且内容对（`envId`、`functions[].envVariables`）——不存在的话部署会失败或把配置搞错，不是`npm install`能自动补出来的，得重新从CloudBase控制台下载私钥JSON手动配。

## 三个必查的坑

1. **每个函数目录必须有自己的`package.json`声明`@cloudbase/node-sdk`依赖，否则部署能过、一调用就`Cannot find module`。** CloudBase部署时靠函数目录里的`package.json`决定装哪些npm依赖，只有`index.js`没有`package.json`不会自动装依赖。新加任何云函数，第一件事就是照着`wxLogin/package.json`建好`package.json`（`{name, main:"index.js", dependencies:{"@cloudbase/node-sdk":"^3.18.3"}}`）再写`index.js`。

2. **往环境变量塞一整块JSON会报错，必须拆成扁平字符串变量。** `tcb fn deploy`会报`Environment.Variables.0.Value`类型应为`string`的错误（CLI/API把"长得像JSON"的字符串值自动解析成了对象）。解决办法是拆成多个独立的纯字符串环境变量（`wxLogin`把私钥JSON拆成了`TCB_CUSTOM_LOGIN_PRIVATE_KEY_ID`/`TCB_CUSTOM_LOGIN_PRIVATE_KEY`/`TCB_CUSTOM_LOGIN_ENV_ID`三个），函数代码里再拼回对象。

3. **"权限控制"是整个环境共用一份配置，不是每个函数各自独立的设置。** 格式`{ "函数名或*": { "invoke": "表达式或布尔值" } }`，匹配优先级"具体函数名 > `*`通配"。需要放开某个函数（比如`wxLogin`要给未登录客户端调用）时，给它单独加具名例外，`*`通配规则保持在安全默认值（`auth.loginType != 'ANONYMOUS' && auth != null`），不要图省事把`*`整条改成`{"invoke": true}`——那样会让环境里以后新加的任何函数都默认对所有人开放：
   ```json
   {
     "*": { "invoke": "auth.loginType != 'ANONYMOUS' && auth != null" },
     "wxLogin": { "invoke": true }
   }
   ```

## 验证部署是否成功

`tcb fn invoke <函数名>`——以admin身份跑一次，没有终端用户会话。看返回的是不是`Cannot find module`（说明package.json没建对）还是函数自己的业务响应（比如`{"ok":false,"error":"未登录，无法使用..."}`——这种是正常的，invoke本身没有用户会话、拿不到`customUserId`是预期行为，不代表部署失败）。`invoke`日志里出现"缺少依赖 xxx 请 npm install xxx"是CLI自己streaming日志用的提示，跟函数本身无关，忽略即可。

## 当前项目里的云函数一览

| 函数 | 作用 | envVariables |
|---|---|---|
| `wxLogin` | 微信登录换票据 | `TCB_CUSTOM_LOGIN_*` 三个 |
| `deleteAccount` | 注销账户，联动清理云备份 | 无 |
| `backupCreate`/`backupList`/`backupRestore`/`backupDelete`/`backupUploadFile` | 云备份 | 无 |
| `aiAdvisor` | AI债务助手，调CloudBase内置大模型 | 无 |

不信任客户端传参是这些函数共同的安全原则——身份一律来自`app.auth().getUserInfo()`读到的已认证会话`customUserId`，不接受客户端自己传的openid/用户id。
