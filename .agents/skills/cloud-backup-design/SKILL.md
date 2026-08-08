---
name: cloud-backup-design
description: This skill should be used when working on the cloud backup feature (`react/src/sheets/BackupScreen.tsx`, `cloudbase/functions/backupCreate|backupList|backupRestore|backupDelete|backupUploadFile`), or debugging backup quota/collection/permission issues.
---

# 云备份（Premium）设计细节

**产品模型是"完全手动、每次创建一条独立备份记录"，不是自动同步**——第一版做的是自动同步/单一文档覆盖，用户自己用下来发现担心手滑/多设备冲突，推翻重做成现在这套。整个App只保留"云备份"这个说法，不再提"云同步"。

"我的"页入口打开`#backupScreen`：上次备份时间+"创建备份"按钮（新建一条记录，不覆盖已有）+备份记录列表（各带"恢复"/"删除"，均有二次确认）。**没有任何自动触发的推送/拉取**，一切靠用户手动点。

## 架构：全部走云函数代理，不做客户端直传云存储

复用`deleteAccount`"身份来自服务端已认证会话，不信任客户端参数"的原则。代价：文件走base64体积膨胀~33%，单文件上限`BACKUP_MAX_FILE_BYTES`（8MB），超过的文件打包时跳过（不参与这次备份，仍可走本地JSON导出兜底）。

## 配额（写在`backupCreate`云函数里，不是客户端校验）

最多保留20条备份记录、总大小上限300MB——单文件已封顶8MB，20条留够历史版本，300MB对个人使用绰绰有余同时给存储成本设硬顶。每次成功写入新记录后按创建时间正序查全部记录，超过配额从最老的开始删（连带删Storage文件）。单次备份内容自己超过300MB直接拒绝写入，不会"删了半天把自己删了"。**`MAX_BACKUPS`/`MAX_TOTAL_BYTES`是`backupCreate/index.js`顶部的常量**，调整额度直接改这两个数重新部署。

## 5个云函数

- `backupUploadFile`：纯Storage上传代理，不碰数据库，客户端传完所有文件拿到`fileID`后自己组装成`files`数组交给`backupCreate`。
- `backupCreate`：`db.collection("backups").add(...)`写入**一条新文档**（不是覆盖），负责配额清理。
- `backupList`：查这个用户名下所有记录，`.field()`投影只取轻量字段，不带完整`debts`/`docs`，完整数据留到"恢复"才取。
- `backupRestore`：取出记录后**显式核对`record.openid === customUserId`**——`backupId`本身不是私密凭证，必须服务端二次确认归属。核对通过后对每个`fileID`换临时直链。
- `backupDelete`：同样先核对归属，再删Storage文件+文档。

这5个函数不需要碰"权限控制"具名例外——安全默认值`auth.loginType != 'ANONYMOUS' && auth != null`正好是它们需要的门槛。

## `backups`集合寻址：一个用户多个文档，不是`doc(openid)`一对一

因为一个用户可以有多条备份记录，用`openid`作普通字段配合`.where()`查。集合要手动去控制台建（CLI查不存在的集合会静默返回`[]`，骗不出真相），权限选无权限[ADMINONLY]。Storage存储桶权限也要去控制台确认设成最严格的私有选项（跟云函数"权限控制"是完全独立的配置面板）。

## 客户端恢复逻辑

`applyBackupData()`先`upClear()`清空本机档案库文件，再按备份记录的`files`清单重新铺回来——"恢复"语义是整体覆盖，不先清空会导致本机新文件和恢复回来的文件混在一起。`debts`/`docs`/`notify`/`premium`直接整体替换，不做字段级合并。本地只留极简的`BACKUP_KEY`存`{lastBackupAt}`（旧版`lastPushedAt`/`pushDirty`这类冲突检测字段已整体删除，手动模型下不存在"谁更新"的比较需求）。

## 注销账户联动清理

`deleteAccount`云函数删`users`文档前，先查出该用户名下**全部**备份记录逐条删除（Storage文件+文档）——不这样做会在注销后留下孤儿文件，是隐私缺口。

## 桌面浏览器测试的边界

伪造`ACCOUNT_KEY`localStorage跳过登录门的老技巧，对云备份**不适用**——那只是隐藏`#loginGate`，从没跑通`signInWithCustomTicket()`，`ensureCbAuthReady()`用`if (account) return`判断"是否已登录"（见AGENTS.md的auth修复说明），伪造account会让它误判已登录、跳过`signInAnonymously()`兜底，连匿名会话都没有。真正的ticket只能来自真实微信OAuth的`code`，云备份的真实端到端往返必须真机验证。
