---
name: release-keystore
description: This skill should be used when building a release APK for this project, asks about "release签名", "assembleRelease", "keystore", "SHA1", or needs the release build command (as opposed to the default debug build).
---

# Release签名 / 构建release包

## 为什么需要release签名

微信登录要求提交App的release签名证书SHA1指纹去微信开放平台注册，debug签名注册不了——这是这个项目第一次真正生成release keystore的直接原因。微信SDK其它硬编码要求见`wechat-login-setup` skill。

## 文件位置（两个都因机器而异、已gitignore，不在git历史里）

- `android/app/after-zero-release.keystore`
- `android/keystore.properties`（密码等配置）

`android/app/build.gradle`里`signingConfigs.release`检测到`keystore.properties`存在才生效——没有这个文件时`buildTypes.release`不带签名配置，仍然能正常debug构建，克隆仓库、没有这两个文件的人不受影响。

## 构建命令

默认（debug，不受release签名影响）：
```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
```
产出：`android/app/build/outputs/apk/debug/app-debug.apk`

要测微信登录，或者要做正式发布，必须显式跑release构建（需要这台机器上已经有上面两个keystore文件）：
```bash
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleRelease
```
产出：`android/app/build/outputs/apk/release/app-release.apk`

`JAVA_HOME`要显式指定是因为macOS+Homebrew装的`openjdk@21`是keg-only、默认不链接到`java`命令（Intel Mac路径是`/usr/local/opt/openjdk@21`）；`JDK`版本必须是21，17编译会报"无效的源发行版：21"。

## ⚠️丢失后果——跟localStorage键名铁律同等严重

这个keystore一旦真正拿去发布过一个版本，丢了 = 以后再也没法用同一个身份更新这个app（安卓靠"包名+签名一致"才认作"同一个app的新版本"）。**离线、异地备份好**，不要只留在这一台机器上。
