---
name: cloud-backup-design
description: Use this skill when modifying or debugging After Zero's manual cloud backup UI, bridge, `backups` collection, Storage files, quotas, restore/delete ownership checks, account-deletion cleanup, or the five `backupCreate|backupList|backupRestore|backupDelete|backupUploadFile` cloud functions.
---

# 云备份

维护“手动创建多条独立记录”模型。不要恢复自动同步、单文档覆盖或冲突检测。

## 边界与数据流

- `react/src/sheets/BackupScreen.tsx` 负责页面、列表状态和二次确认；CloudBase 认证与五个函数调用保留在 `www/index.html` bridge。
- “我的”页用 Premium 门禁打开页面；权益归 `account-premium-design`。云函数本身不做 Premium 校验。
- 每次打开页面实时调用 `backupList`；本地 `BACKUP_KEY = "after-zero-backup-meta-v1"` 只保存 `{lastBackupAt}`，不缓存云端记录。
- 创建时从 IndexedDB 读取档案文件，逐个调用 `backupUploadFile`，再把成功文件元数据连同 `debts/docs/notify/premium` 一次性交给 `backupCreate` 新增文档。
- 恢复是整体覆盖：替换 debts/docs/notify/premium，先清空本机上传文件库，再按临时 URL 铺回文件，最后重新加载并派发状态变化；不要做字段级合并。

## 配额与五个云函数

- 客户端单文件上限是 8 MB；超限文件被跳过，不参与该次云备份。不要把它误写成整次备份必然失败。
- `backupCreate` 每用户最多保留 20 条记录、总大小最多 300 MB。写入新记录后按时间从最老开始删除超额记录及其 Storage 文件；单条内容本身超过 300 MB 时拒绝。
- `backupUploadFile` 只做代理上传，不写数据库；云路径按已认证用户、客户端生成的临时 backup id 和 file id 组织。
- `backupList` 只投影列表轻量字段并按创建时间倒序返回，不带完整 debts/docs/premium。
- `backupRestore` 和 `backupDelete` 必须先取文档并验证 `record.openid === customUserId`；记录 id 不是访问凭证。恢复时再把 fileID 换成临时 URL。
- `backupDelete` 对不存在记录幂等成功，并删除记录关联 Storage 文件。

## 身份、权限与注销

- 五个函数只信任 `app.auth().getUserInfo().customUserId`，不接受客户端 openid 作为身份。
- `backups` 是“一用户多文档”：openid 是普通字段，用 `.where()` 查询；集合需在控制台创建为 ADMINONLY，Storage 也保持私有。
- 函数调用依赖持久化的自定义登录会话。`ensureCbAuthReady()`对本地模式直接拒绝，五个备份调用都不得建立匿名会话或发出云请求；匿名垫底只允许发生在微信换取自定义票据的登录流程。
- `deleteAccount` 必须先删除用户全部备份文档和 Storage 文件，再删 `users` 文档。账户语义归 `account-premium-design`。
- 部署、集合、环境权限或 `@cloudbase/node-sdk` 问题加载 `cloudbase-deploy`。

## 已知边界与验证

- 客户端文件先以 base64 经云函数上传，体积会膨胀；不要描述成客户端直传 Storage。
- 文件上传发生在 `backupCreate` 前；后续创建失败时，当前实现没有回收本轮已上传但尚未入记录的文件。修改失败补偿时需同时设计 Storage 清理，不要只改 UI。
- 伪造`ACCOUNT_KEY`只能伪装React账户展示，不能建立CloudBase自定义会话；真实创建/列表/恢复/删除必须在真机或等价已认证环境验证。入口提示通过不代表会话可用，服务端仍以`customUserId`为准。
- 修改 React 页面运行 `npm run test:react` 的 `BackupScreen` 测试；修改云函数逐一核对未登录、归属拒绝、轻量列表、配额清理、文件删除和整体恢复。
