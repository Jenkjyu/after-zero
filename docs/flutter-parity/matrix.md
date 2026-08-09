# Flutter 全量对齐矩阵

> 本文件由 `flutter/tool/parity/parity_tool.py render` 生成；请修改机器可检查的 JSON 源，不要手改本文件。

- 基准提交：`6fa1712dcdb2ba6e617810dffa8bbe38193140aa`
- 旧版包名：`io.github.jenkjyu.afterzero`
- Flutter 包名：`io.github.jenkjyu.after_zero`
- 矩阵项：280
- Case profile：104
- 可物化 storage seed：11
- 其余 case spec：93
- 完整驱动 profile：0
- 场景：43
- 场景执行状态：`automated` 1，`specified` 42
- 状态：`blocked_external` 4，`difference` 107，`flutter_extra` 10，`mapped_unverified` 137，`missing_in_flutter` 22

状态只表示当前证据结论；`verified` 必须带证据路径。`difference` 不是遗漏，而是已被完整性系统发现、留给后续业务阶段修复。

## AI 顾问

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-CLD-017` | `P1` | shared_legacy_gap | AI quota 并发竞态 | `mapped_unverified` | `SC-AI-03`, `SC-LIFE-01` | 同一云函数先读后写，双端并发请求都可能越过额度；留作共有风险，不误报迁移差异。 |
| `INV-AI-001` | `P0` | behavior_contract | 额度缓存月份与本地快路径 | `missing_in_flutter` | `SC-AI-03` | 旧月份缓存可能被错误展示且必然失败的请求仍会发出。 |
| `INV-AI-002` | `P0` | behavior_contract | 按错误消息保存 RetryCtx | `missing_in_flutter` | `SC-AI-02` | 旧错误后继续提问会让历史错误失去可重试上下文。 |
| `INV-AI-003` | `P0` | behavior_contract | 错误消息不得污染历史与模型上下文 | `difference` | `SC-AI-02` | Flutter 后续成功保存时可能把失败文本作为普通 assistant 内容持久化。 |
| `INV-AI-004` | `P0` | behavior_contract | 删除当前历史会话后清空当前画面 | `missing_in_flutter` | `SC-AI-02` | 下一次成功请求会把已删除会话原 id 复活。 |
| `INV-AI-005` | `P1` | behavior_contract | 追问建议 marker 列表兼容 | `difference` | `SC-AI-01` | 模型不保证只用 '- '，宽容解析是旧版设计。 |
| `INV-AI-006` | `P1` | behavior_contract | 会话 id 与标题生成 | `difference` | `SC-AI-02` | 并发/同毫秒会话可碰撞，标题截断也改变历史列表内容。 |
| `INV-AI-007` | `P0` | behavior_contract | 复制到外部 AI 的任务指令 | `difference` | `SC-AI-01` | 数据全量不代表任务语义一致。 |
| `INV-AI-008` | `P0` | state_contract | summary 压缩与完整复制计划 | `mapped_unverified` | `SC-AI-01` | 只压缩已还期次，未还计划始终逐期完整；需大数据 fixture 逐字段验证。 |
| `SUBPAGE.AI` | `P0` | ui_interaction_contract | AI 主页面全部状态 | `difference` | `SC-UI-AI` | 旧版：Enter 发送/Shift+Enter 换行，空发送 toast，本地额度快路径，used/left 文案和动画固定；Flutter：Enter 只换行、空发送静默、额度条口径与动效不同 |
| `ACTION.AI.NEW_CONVERSATION` | `P1` | ui_interaction_contract | 主页面新对话按钮 | `flutter_extra` | `SC-UI-AI` | 旧版：新对话入口只在历史 sheet 内；Flutter：AppBar 增加常驻入口 |
| `SHEET.AI_HISTORY` | `P0` | ui_interaction_contract | AI 历史底部抽屉 | `difference` | `SC-UI-AI` | 旧版：显示时间+消息数，sheet 内有新对话，scrim/back 层级固定；Flutter：仅显示时间，新对话入口移位，Material sheet |
| `DIALOG.AI_HISTORY_DELETE` | `P0` | ui_interaction_contract | 删除历史会话确认与当前态清理 | `missing_in_flutter` | `SC-AI-02` | 旧版：先确认；删除当前项同步清空当前会话；Flutter：立即删除；当前画面和 id 仍保留 |
| `DIALOG.AI_FIRST_ENTRY_EDUCATION` | `P0` | ui_interaction_contract | 首次进入额度说明 | `missing_in_flutter` | `SC-AI-03` | 旧版：首次进入约 900ms 后展示一次额度与复制退路说明；Flutter：完全没有 |
| `DIALOG.AI_LIMIT_EXHAUSTED` | `P0` | ui_interaction_contract | 额度耗尽说明与复制 | `difference` | `SC-AI-03` | 旧版：专用视觉、完整解释，复制后 modal 保留；Flutter：短 AlertDialog，复制后立即关闭并 Snackbar |
| `CHIPS.AI_SUGGESTIONS` | `P1` | ui_interaction_contract | 欢迎/追问建议 chips | `difference` | `SC-AI-01` | 旧版：只在最后完成回复后显示，动效/排版固定；Flutter：状态大体映射但排版和动画不同 |
| `RENDERER.AI_MESSAGE` | `P1` | ui_interaction_contract | AI 富文本段落/列表/粗体 | `difference` | `SC-AI-01` | 旧版：结构化 p/ul/ol，编号列表语义明确；Flutter：按行拆块并做 bullet/粗体，编号列表语义和间距不同 |
| `SYS.CLIPBOARD.AI_PROMPT` | `P1` | ui_interaction_contract | 复制提示词反馈与弹窗状态 | `difference` | `SC-AI-03` | 旧版：成功后弹窗保留，可继续阅读/再次复制；Flutter：成功后立即关闭并 Snackbar |

## Bridge 与架构映射

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-BRG-001` | `P0` | api_surface | 旧 AzBridge.addNotifyRule 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-NOTIFY-02` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-002` | `P0` | api_surface | 旧 AzBridge.buildAiSummary 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-AI-03` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-003` | `P0` | api_surface | 旧 AzBridge.callAiAdvisor 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-AI-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-004` | `P0` | api_surface | 旧 AzBridge.commitReorder 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-SORT-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-005` | `P0` | api_surface | 旧 AzBridge.confirmAsync 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-UI-DETAIL-EDIT` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-006` | `P0` | api_surface | 旧 AzBridge.createBackup 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-BACKUP-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-007` | `P0` | api_surface | 旧 AzBridge.deleteAccount 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-ACCOUNT-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-008` | `P0` | api_surface | 旧 AzBridge.deleteArchiveFile 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-ARCHIVE-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-009` | `P0` | api_surface | 旧 AzBridge.deleteBackup 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-BACKUP-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-010` | `P0` | api_surface | 旧 AzBridge.deleteDebt 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-DEBT-02` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-011` | `P0` | api_surface | 旧 AzBridge.deleteNotifyRule 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-NOTIFY-02` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-012` | `P0` | api_surface | 旧 AzBridge.downloadArchiveFile 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-FILE-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-013` | `P0` | api_surface | 旧 AzBridge.downloadBackupFile 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-EXPORT-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-014` | `P0` | api_surface | 旧 AzBridge.exportReportPdf 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-EXPORT-02` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-015` | `P0` | api_surface | 旧 AzBridge.exportReportXlsx 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-EXPORT-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-016` | `P0` | api_surface | 旧 AzBridge.getAccount 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-ACCOUNT-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-017` | `P0` | api_surface | 旧 AzBridge.getBackupMeta 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-BACKUP-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-018` | `P0` | api_surface | 旧 AzBridge.getDebts 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-DATA-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-019` | `P0` | api_surface | 旧 AzBridge.getFiles 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-ARCHIVE-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-020` | `P0` | api_surface | 旧 AzBridge.getNotify 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-NOTIFY-02` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-021` | `P0` | api_surface | 旧 AzBridge.getPremium 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-ACCOUNT-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-022` | `P0` | api_surface | 旧 AzBridge.listBackups 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-BACKUP-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-023` | `P0` | api_surface | 旧 AzBridge.payInstallment 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-DEBT-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-024` | `P0` | api_surface | 旧 AzBridge.redeemCode 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-ACCOUNT-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-025` | `P0` | api_surface | 旧 AzBridge.renderAll 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-LIFE-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-026` | `P0` | api_surface | 旧 AzBridge.resetLocalData 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-RESET-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-027` | `P0` | api_surface | 旧 AzBridge.restoreBackup 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-BACKUP-02` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-028` | `P0` | api_surface | 旧 AzBridge.saveAll 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-DATA-03` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-029` | `P0` | api_surface | 旧 AzBridge.sendTestNotification 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-NOTIFY-02` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-030` | `P0` | api_surface | 旧 AzBridge.setDebt 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-DEBT-02` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-031` | `P0` | api_surface | 旧 AzBridge.setNotifyEnabled 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-NOTIFY-02` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-032` | `P0` | api_surface | 旧 AzBridge.settleFull 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-DEBT-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-033` | `P0` | api_surface | 旧 AzBridge.shareArchiveFile 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-FILE-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-034` | `P0` | api_surface | 旧 AzBridge.toast 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-UI-DETAIL-EDIT` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-035` | `P0` | api_surface | 旧 AzBridge.triggerImportFilePicker 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-DATA-02` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-036` | `P0` | api_surface | 旧 AzBridge.unsettle 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-DEBT-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-037` | `P0` | api_surface | 旧 AzBridge.uploadArchiveFile 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-ARCHIVE-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-038` | `P0` | api_surface | 旧 AzBridge.waiveInstallment 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-DEBT-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |
| `INV-BRG-039` | `P0` | api_surface | 旧 AzBridge.wxLogout 能力入口映射 | `mapped_unverified` | `SC-SOURCE-01`, `SC-AUTH-01` | Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。 |

## Premium

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `SUBPAGE.PREMIUM` | `P0` | ui_interaction_contract | Premium 购买/已开通子页 | `difference` | `SC-UI-MINE` | 旧版：已开通仍维持购买页和可点购买；Flutter：改为已解锁并禁用购买，入口/文案/布局不同 |
| `DISCLOSURE.PREMIUM_REDEEM` | `P1` | ui_interaction_contract | 兑换码折叠与反馈 | `difference` | `SC-UI-MINE` | 旧版：展开、错误码、成功与重进有固定状态；Flutter：逻辑相近但布局/反馈不同 |
| `DIALOG.PREMIUM_PAYMENT_NOTICE` | `P1` | ui_interaction_contract | 购买提示弹窗 | `difference` | `SC-UI-MINE` | 旧版：完整购买说明文案；Flutter：提示明显缩短 |

## 云备份

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-CLD-012` | `P2` | behavior_contract | 备份文件上传并发模型 | `difference` | `SC-BACKUP-02` | 功能目标相同，但耗时、失败顺序和多文件体验可观察。 |
| `INV-CLD-013` | `P0` | behavior_contract | 备份上传 namespace 唯一性 | `difference` | `SC-BACKUP-02` | 多设备同毫秒创建存在 Storage 路径碰撞风险。 |
| `INV-CLD-014` | `P0` | behavior_contract | 云恢复失败原子性与顺序 | `difference` | `SC-BACKUP-02` | 下载中途失败会留下完全不同的本地状态。 |
| `INV-CLD-015` | `P2` | shared_legacy_gap | backupCreate 失败后的孤儿 Storage 文件 | `mapped_unverified` | `SC-BACKUP-02` | 两端共有缺口：先上传后 create，后一步失败不回收已上传文件。 |
| `SUBPAGE.BACKUP` | `P0` | ui_interaction_contract | 云备份全部状态 | `difference` | `SC-UI-ARCH-BACKUP` | 旧版：加载/空/列表，恢复删除行内按钮；Flutter：三点菜单，新增 retry，进度和反馈不同 |
| `MENU.BACKUP_ACTIONS` | `P1` | ui_interaction_contract | 备份三点动作菜单 | `flutter_extra` | `SC-BACKUP-01` | 旧版：恢复/删除行内按钮；Flutter：多一步 PopupMenu |
| `DIALOG.BACKUP_RESTORE` | `P0` | ui_interaction_contract | 云恢复确认/进度/反馈 | `difference` | `SC-BACKUP-01` | 旧版：统一确认、固定恢复进度与反馈；Flutter：进度呈现和文案不同 |
| `DIALOG.BACKUP_DELETE` | `P1` | ui_interaction_contract | 云备份删除确认/反馈 | `difference` | `SC-BACKUP-01` | 旧版：成功显示已删除；Flutter：成功无相同反馈 |

## 云端与认证

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-CLD-001` | `P0` | http_contract | CloudBase HTTP 登录与函数调用协议 | `mapped_unverified` | `SC-AUTH-01`, `SC-SESSION-01` | URL/header/body 已静态映射，真实非匿名 session、错误码和续期另列差异。 |
| `INV-CLD-002` | `P0` | cloud_function | 微信 code 换票据与用户资料 | `mapped_unverified` | `SC-AUTH-01`, `SC-LIFE-01` | 服务端函数保持只读；输入、输出、失败与客户端状态仍需网络 transcript 对拍。 |
| `INV-CLD-003` | `P0` | cloud_function | 备份文件上传代理 | `mapped_unverified` | `SC-BACKUP-01`, `SC-LIFE-01` | 服务端函数保持只读；输入、输出、失败与客户端状态仍需网络 transcript 对拍。 |
| `INV-CLD-004` | `P0` | cloud_function | 创建备份与 20条/300MB 配额 | `mapped_unverified` | `SC-BACKUP-01`, `SC-LIFE-01` | 服务端函数保持只读；输入、输出、失败与客户端状态仍需网络 transcript 对拍。 |
| `INV-CLD-005` | `P0` | cloud_function | 备份轻量列表 | `mapped_unverified` | `SC-BACKUP-01`, `SC-LIFE-01` | 服务端函数保持只读；输入、输出、失败与客户端状态仍需网络 transcript 对拍。 |
| `INV-CLD-006` | `P0` | cloud_function | 备份归属校验与恢复载荷 | `mapped_unverified` | `SC-BACKUP-01`, `SC-LIFE-01` | 服务端函数保持只读；输入、输出、失败与客户端状态仍需网络 transcript 对拍。 |
| `INV-CLD-007` | `P0` | cloud_function | 备份归属校验与删除 | `mapped_unverified` | `SC-BACKUP-01`, `SC-LIFE-01` | 服务端函数保持只读；输入、输出、失败与客户端状态仍需网络 transcript 对拍。 |
| `INV-CLD-008` | `P0` | cloud_function | 服务器账户与备份清理 | `mapped_unverified` | `SC-ACCOUNT-01`, `SC-LIFE-01` | 服务端函数保持只读；输入、输出、失败与客户端状态仍需网络 transcript 对拍。 |
| `INV-CLD-009` | `P0` | cloud_function | AI 月额度与模型响应 | `mapped_unverified` | `SC-AI-03`, `SC-LIFE-01` | 服务端函数保持只读；输入、输出、失败与客户端状态仍需网络 transcript 对拍。 |
| `INV-CLD-010` | `P0` | behavior_contract | 非匿名会话静默续期 | `missing_in_flutter` | `SC-SESSION-01` | 正式会话约 2 小时后要求重登，破坏持续使用。 |
| `INV-CLD-011` | `P0` | behavior_contract | 前台驻留跨过 session expiry | `difference` | `SC-SESSION-01` | 客户端可继续携带已过期 Bearer token 发请求。 |

## 债务 Tab

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `TAB.DEBTS` | `P0` | ui_interaction_contract | 债务主页全部状态 | `difference` | `SC-UI-DEBT` | 旧版：空数据仍保留零值 Hero/KPI/AI/口径/列表头；卡片与添加入口固定布局；Flutter：空数据用独立空状态替换主要结构，Hero/KPI/卡片/wordmark/FAB 结构不同 |
| `DISCLOSURE.DEBT_CALC_NOTE` | `P1` | ui_interaction_contract | 债务计算口径折叠 | `difference` | `SC-UI-DEBT` | 旧版：所有状态可展开/收起并保持固定位置；Flutter：位置样式不同，完全空态时不存在 |
| `SHEET.DEBT_SORT` | `P1` | ui_interaction_contract | 排序底部抽屉 | `difference` | `SC-UI-DEBT` | 旧版：自定义 portal picker，当前项/关闭/scrim 语义固定；Flutter：Material bottom sheet，视觉和关闭方式不同 |
| `GESTURE.DEBT_SWIPE` | `P0` | ui_interaction_contract | 债务卡左滑销这期 | `difference` | `SC-UI-DEBT` | 旧版：精细 axis/justDragged 状态机、76px、半阈值、只开一行并随 tab 关闭；Flutter：通用 Flutter 手势，切 tab 状态保留 |
| `MODE.DEBT_REORDER` | `P0` | ui_interaction_contract | jiggle 长按拖拽编辑模式 | `difference` | `SC-UI-DEBT` | 旧版：一次长按进入抖动并继续拖，边缘自动滚、长按退出、tab/back 收口；Flutter：首次长按只进入抖动，需第二次按住才拖；无长按退出且其他动作仍可用 |

## 债务业务动作

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-ACT-001` | `P0` | state_transition | 还款、减免、结清与撤销结清 | `mapped_unverified` | `SC-DEBT-01` | UI 已复用 calc 桥接，但完整前后状态、partial ledger 与异常输入仍需 differential evidence。 |
| `INV-ACT-002` | `P0` | state_transition | 只重排 active 债务并保留 settled 槽位 | `mapped_unverified` | `SC-SORT-01`, `SC-DEBT-02` | 排序 tie、非法 index、恢复预设及杀进程落盘均要覆盖。 |
| `INV-ACT-003` | `P0` | behavior_contract | 编辑已结清债务保留状态 | `difference` | `SC-DEBT-02` | 编辑保存会把 settled 债务重新变成 active。 |
| `INV-ACT-004` | `P2` | shared_legacy_gap | 编辑提前结清债务的 settleStash 生命周期 | `mapped_unverified` | `SC-DEBT-02` | 两端编辑器目前都不保留 settleStash；这是旧版共有缺口，不得误报为 Flutter 独有差异。 |
| `INV-ACT-005` | `P1` | behavior_contract | provider 数据 invariant | `difference` | `SC-DEBT-01`, `SC-DATA-01` | 当前 UI 多数先 recompute，但 provider API 本身允许写入失真的派生字段。 |

## 债务编辑器

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `SHEET.DEBT_EDITOR` | `P0` | ui_interaction_contract | 新增/编辑债务底部抽屉 | `difference` | `SC-UI-DETAIL-EDIT` | 旧版：bottom sheet，scrim/grip/取消/返回、五种生成与批量状态机；Flutter：全屏页面，surface、关闭、字段可操作范围不同 |
| `STATE.EDITOR.PLAN_CONTROLLER_SYNC` | `P0` | ui_interaction_contract | 逐期输入 controller 与模型同步 | `difference` | `SC-EDIT-02` | 旧版：React 受控输入，批量/重新生成后立即显示模型新值；Flutter：controller 只在 initState 初始化、无 didUpdateWidget，可继续显示旧值 |
| `ACTION.EDITOR.ADD_ROW` | `P1` | ui_interaction_contract | 添加一期按钮可见条件 | `difference` | `SC-EDIT-02` | 旧版：只在手工模式或一次性零行时允许；Flutter：始终显示 |
| `DIALOG.EDITOR.BATCH_AMOUNT_WARNING` | `P0` | ui_interaction_contract | 批量金额清空构成警告 | `missing_in_flutter` | `SC-EDIT-02` | 旧版：执行前明确二次警告会清空本金/利息；Flutter：直接执行 |
| `PICKER.EDITOR.DEBT_TYPE` | `P2` | ui_interaction_contract | 债务类型选择器 | `difference` | `SC-EDIT-01` | 旧版：native select；Flutter：Material dropdown，展开/返回/视觉不同 |
| `PICKER.EDITOR.GEN_KIND` | `P1` | ui_interaction_contract | 计息方式选择器 | `difference` | `SC-EDIT-01` | 旧版：带说明的自定义 bottom picker；Flutter：短标签 dropdown |
| `PICKER.EDITOR.BATCH_COLUMN` | `P2` | ui_interaction_contract | 批量列选择与折叠 | `difference` | `SC-EDIT-02` | 旧版：native select 与固定展开语义；Flutter：dropdown + ExpansionTile |
| `PICKER.EDITOR.OPENED_DATE` | `P1` | ui_interaction_contract | 借款日选择 | `difference` | `SC-EDIT-01` | 旧版：系统 date picker，取消/无效值有固定语义；Flutter：纯 YYYY-MM-DD 文本输入 |
| `PICKER.EDITOR.FIRST_DATE` | `P1` | ui_interaction_contract | 首期还款日选择 | `difference` | `SC-EDIT-01` | 旧版：系统 date picker，取消/无效值有固定语义；Flutter：纯 YYYY-MM-DD 文本输入 |
| `PICKER.EDITOR.ROW_DATE` | `P1` | ui_interaction_contract | 逐期日期选择 | `difference` | `SC-EDIT-01` | 旧版：系统 date picker，取消/无效值有固定语义；Flutter：纯 YYYY-MM-DD 文本输入 |
| `DIALOG.EDITOR.BATCH_FIRST_MONTH` | `P1` | ui_interaction_contract | 批量还款日首月选择 | `difference` | `SC-EDIT-02` | 旧版：全局 month picker modal；Flutter：内联文本字段 |
| `DIALOG.DELETE_DEBT` | `P1` | ui_interaction_contract | 删除债务确认与反馈 | `difference` | `SC-DEBT-02` | 旧版：强调不是结清，成功 toast；Flutter：短文案，成功静默 |

## 债务详情

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `SHEET.DEBT_DETAIL` | `P0` | ui_interaction_contract | 债务详情底部抽屉 | `difference` | `SC-UI-DETAIL-EDIT` | 旧版：可拖高/下拉关闭的 bottom sheet，债务变更后自动收口；Flutter：全屏路由，编辑再嵌套路由，债务缺失时停留在不存在页 |
| `DIALOG.INSTALLMENT_PAYMENT` | `P1` | ui_interaction_contract | 销这期/部分还款输入 | `difference` | `SC-DEBT-01` | 旧版：展示本金/利息/剩余提示，非法值关闭后 toast；Flutter：信息更少，错误内联 |
| `DIALOG.WAIVE_PERIOD` | `P0` | ui_interaction_contract | 协商减免输入默认值 | `difference` | `SC-DEBT-01` | 旧版：默认当前期实际欠款，兼容变额与部分还款；Flutter：默认 debt.monthly，可能错误 |
| `DIALOG.SETTLE_FULL` | `P1` | ui_interaction_contract | 提前结清输入与解释 | `difference` | `SC-DEBT-01` | 旧版：解释额外利息/减免的结清结果；Flutter：只有通用金额提示 |
| `DIALOG.PREMIUM_INVITE.SETTLEMENT` | `P0` | ui_interaction_contract | 首次结清后的 Premium 庆祝邀请 | `missing_in_flutter` | `SC-DEBT-01` | 旧版：非 Premium 首次使债务结清后弹庆祝邀请，确认进 Premium；Flutter：完全没有该副作用 |

## 全局系统界面

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `SYS.LOGIN_GATE` | `P0` | ui_interaction_contract | 登录门 | `difference` | `SC-UI-LOGIN` | 旧版：本地 Account 即隐藏，fail-closed，手写动画与 toast 错误；Flutter：同时要求有效正式 session，内联 busy/error，图标与动效不同 |
| `SYS.WECHAT_OAUTH` | `P0` | ui_interaction_contract | 微信 OAuth 可见流程 | `difference` | `SC-UI-LOGIN` | 旧版：显式检查插件/安装、toast 跳转、取消与失败分支；Flutter：不先检查安装，busy/error 内联显示 |
| `SYS.TAB_BAR` | `P0` | ui_interaction_contract | 四 Tab 导航与状态收口 | `difference` | `SC-VISUAL-ALL` | 旧版：切换滚顶、关闭 swipe/jiggle、图标 bounce；Flutter：IndexedStack 保留滚动和局部手势状态 |
| `SYS.BACK_DISPATCH` | `P0` | ui_interaction_contract | Android 系统返回优先链 | `difference` | `SC-LIFE-01` | 旧版：AI history→子页→sheet→jiggle 的显式最上层优先链；Flutter：主要依赖 Navigator，无根级 PopScope，局部模式可残留 |
| `SYS.ROUTE_TRANSITION` | `P0` | ui_interaction_contract | 子页与抽屉 surface/过渡 | `difference` | `SC-VISUAL-ALL` | 旧版：子页统一右滑，sheet 统一底部滑入；Flutter：平台 Material 路由；详情/编辑由抽屉变全屏 |
| `SYS.CONFIRM_HOST` | `P1` | ui_interaction_contract | 统一确认/输入弹窗宿主 | `difference` | `SC-VISUAL-ALL` | 旧版：单一 modal 支持第三动作、month/date/amount 与统一关闭；Flutter：多套 AlertDialog，样式、按钮、输入和关闭不一致 |
| `SYS.TOAST_HOST` | `P1` | ui_interaction_contract | 全局 toast 队列与时长 | `difference` | `SC-VISUAL-ALL` | 旧版：单例绿色 flash，约 1800ms，新消息替换计时器；Flutter：floating Snackbar 可排队，位置/时长/配色不同 |
| `SYS.KEYBOARD_FOCUS_A11Y` | `P0` | ui_interaction_contract | 键盘焦点与无障碍语义 | `difference` | `SC-VISUAL-ALL` | 旧版：主导航与部分图表有明确焦点/键盘契约；Flutter：Pressure 裸 GestureDetector、AI 发送缺统一 label，焦点恢复未定义 |
| `SYS.REDUCED_MOTION` | `P0` | ui_interaction_contract | 减少动态效果 | `missing_in_flutter` | `SC-VISUAL-ALL` | 旧版：登录、Premium、tab、jiggle、AI 等广泛跳过动画；Flutter：未发现 MediaQuery.disableAnimations 等对应分支 |
| `SYS.TEXT_SELECTION_CONTEXT_MENU` | `P1` | ui_interaction_contract | 文本选择与长按菜单 | `difference` | `SC-VISUAL-ALL` | 旧版：全局禁选与 context menu，仅输入框例外；Flutter：AI、法律、档案多处可选择并出现系统长按菜单 |
| `SYS.HAPTICS` | `P1` | ui_interaction_contract | 长按与重排触感反馈 | `difference` | `SC-UI-DEBT` | 旧版：WebView 原生层显式关闭触感；Flutter：Framework 长按/重排可能产生平台触感，未显式抑制 |
| `SYS.RESPONSIVE_SAFE_AREA` | `P0` | ui_interaction_contract | Safe Area 与 560px 最大宽 | `difference` | `SC-VISUAL-ALL` | 旧版：主内容、subpage、sheet 在宽屏最大 560px 居中；Flutter：主 tab 没有统一 560px 约束，平板/横屏会铺满 |
| `SYS.OVERSCROLL` | `P1` | ui_interaction_contract | 列表 overscroll/stretch | `missing_in_flutter` | `SC-VISUAL-ALL` | 旧版：CSS+WebView 双层禁用 stretch；Flutter：没有自定义 ScrollBehavior/OverscrollIndicator |
| `SYS.COLOR_SCHEME` | `P0` | theme_tokens | 明暗主题基础色板 | `mapped_unverified` | `SC-VISUAL-ALL` | 基础 token 已映射；Material 派生色与每个组件状态仍需像素验收。 |
| `SYS.FILE_PICKER.BACKUP` | `P1` | ui_interaction_contract | 本地备份文件选择 | `difference` | `SC-EXPORT-01` | 旧版：按 legacy array/new object 和当前数据量给精确覆盖提示/错误；Flutter：通用覆盖提示并直接显示异常 |
| `SYS.FILE_PICKER.ARCHIVE` | `P1` | ui_interaction_contract | 档案文件选择反馈 | `difference` | `SC-ARCHIVE-01` | 旧版：成功 toast，不自动选中新上传文件；Flutter：自动选中且没有相同成功 toast |
| `SYS.SAVE_AS` | `P1` | ui_interaction_contract | 另存为可见反馈 | `difference` | `SC-FILE-01` | 旧版：统一进度、取消、成功、错误反馈；Flutter：各入口反馈与取消处理不一致 |
| `SYS.SHARE_SHEET` | `P1` | ui_interaction_contract | 分享面板能力检测与取消 | `difference` | `SC-FILE-01` | 旧版：先检查能力，取消不报错并有 fallback；Flutter：异常统一可能显示分享失败 |
| `SYS.EXTERNAL_BROWSER` | `P2` | platform_interop | 法律协议外链 | `mapped_unverified` | `SC-UI-MINE` | 两端均走外部浏览器，待返回 App 与失败分支真机验证。 |
| `SYS.MAILTO` | `P1` | ui_interaction_contract | 关于页联系邮箱 | `missing_in_flutter` | `SC-UI-MINE` | 旧版：点击邮箱打开邮件客户端；Flutter：静态 ListTile，无 onTap |
| `SYS.NOTIFICATION_RESCHEDULE` | `P0` | integration_wiring | 数据动作后的通知重排接线 | `mapped_unverified` | `SC-NOTIFY-03` | 新增/修改/还款/恢复/规则修改都有接线迹象；时序与失败必须真机验证。 |
| `SYS.TYPOGRAPHY` | `P0` | ui_interaction_contract | 应用字体、数字等宽、字号与行距 | `difference` | `SC-VISUAL-ALL` | 旧版：CSS 字体栈、tabular-nums、字号/行距/字距按组件固定；Flutter：Noto 只作为 PDF asset，App 未注册同等字体族，Material typography 参与派生 |

## 原生文件能力

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-NAT-001` | `P0` | native_bridge | Android SAF ACTION_CREATE_DOCUMENT | `mapped_unverified` | `SC-FILE-01` | 核心 intent/流拷贝/临时文件能力已映射，生命周期另列差异。 |
| `INV-NAT-002` | `P0` | behavior_contract | SAF Activity 重建与并发保存 | `missing_in_flutter` | `SC-FILE-01`, `SC-LIFE-01` | Activity 重建/进程回收可丢 callback、Result 和临时文件。 |
| `INV-NAT-007` | `P2` | behavior_contract | iOS 分享面板保存取消语义 | `blocked_external` | `SC-FILE-01` | 用户已决定当前阶段暂缓 iOS；不得把未验证写成完成。 |

## 发布与安装

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-RELEASE-001` | `P0` | behavior_contract | Android release 签名 | `blocked_external` | `SC-RELEASE-01` | 当前所谓 release APK 仍是 debug 签名，不能做正式微信/升级验收。 |
| `INV-RELEASE-002` | `P0` | behavior_contract | Android manifest launchMode/allowBackup | `difference` | `SC-RELEASE-01` | 任务栈、OAuth/SAF 回调、系统备份均可能产生可观察差异。 |
| `INV-IOS-001` | `P1` | behavior_contract | iOS 构建与真机完整验证 | `blocked_external` | `SC-RELEASE-01` | 用户明确当前暂缓 iOS；本阶段只能登记，不能宣称完成。 |

## 基准与完整性

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-SOURCE-LEGACY` | `P0` | source_inventory | 受保护旧版完整源码、文案、事件与测试清单 | `mapped_unverified` | `SC-SOURCE-01` | 逐文件 SHA 使同名函数的内容改动也会触发门禁；旧版始终只读。 |
| `INV-SOURCE-FLUTTER` | `P0` | source_inventory | Flutter 源码、文案、事件、依赖、导航与测试清单 | `mapped_unverified` | `SC-SOURCE-01` | 新增文件、UI 文案、手势回调、依赖或测试都会要求显式刷新与重新映射。 |
| `INV-SURFACE-DEBT` | `P0` | semantic_source_surface | 债务生命周期界面与手势源码面 | `mapped_unverified` | `SC-UI-DETAIL-EDIT`, `SC-SOURCE-01` | 路径范围是显式业务域分类，不是全仓兜底；新增目录或跨域源码不会被本项自动吞掉。 |
| `INV-SURFACE-PAY` | `P0` | semantic_source_surface | 还款日与通知界面源码面 | `mapped_unverified` | `SC-UI-PAY-NOTIFY`, `SC-SOURCE-01` | 路径范围是显式业务域分类，不是全仓兜底；新增目录或跨域源码不会被本项自动吞掉。 |
| `INV-SURFACE-REPORT` | `P0` | semantic_source_surface | 统计、图表与策略界面源码面 | `mapped_unverified` | `SC-UI-REPORT`, `SC-SOURCE-01` | 路径范围是显式业务域分类，不是全仓兜底；新增目录或跨域源码不会被本项自动吞掉。 |
| `INV-SURFACE-MINE` | `P0` | semantic_source_surface | 我的、Premium 与法律界面源码面 | `mapped_unverified` | `SC-UI-MINE`, `SC-SOURCE-01` | 路径范围是显式业务域分类，不是全仓兜底；新增目录或跨域源码不会被本项自动吞掉。 |
| `INV-SURFACE-ARCHIVE` | `P0` | semantic_source_surface | 档案与备份界面源码面 | `mapped_unverified` | `SC-UI-ARCH-BACKUP`, `SC-SOURCE-01` | 路径范围是显式业务域分类，不是全仓兜底；新增目录或跨域源码不会被本项自动吞掉。 |
| `INV-SURFACE-AI` | `P0` | semantic_source_surface | AI 助手界面与状态机源码面 | `mapped_unverified` | `SC-UI-AI`, `SC-SOURCE-01` | 路径范围是显式业务域分类，不是全仓兜底；新增目录或跨域源码不会被本项自动吞掉。 |
| `INV-SURFACE-SHARED` | `P0` | semantic_source_surface | 共享状态、弹层与应用壳源码面 | `mapped_unverified` | `SC-VISUAL-ALL`, `SC-SOURCE-01` | 路径范围是显式业务域分类，不是全仓兜底；新增目录或跨域源码不会被本项自动吞掉。 |
| `INV-SURFACE-LEGACY-RUNTIME` | `P0` | semantic_source_surface | 旧版宿主运行时函数、DOM、事件与动画源码面 | `mapped_unverified` | `SC-SOURCE-01`, `SC-LIFE-01`, `SC-VISUAL-ALL` | 旧版单文件宿主按运行时职责分类；bridge、storage、cloud/native 能力仍必须各自逐项映射，不能依赖本项。 |
| `INV-SURFACE-SERVICES` | `P0` | semantic_source_surface | Flutter 数据、云端、导出、通知与原生服务源码面 | `mapped_unverified` | `SC-SOURCE-01`, `SC-LIFE-01` | 服务层路径显式列举；用户可观察契约继续由 calc、storage、bridge、cloud/native 细项负责。 |
| `INV-DORMANT-INFOTIP` | `P3` | dormant_legacy | 未被调用的 legacy InfoTip | `mapped_unverified` | `SC-SOURCE-01` | 全仓无调用点，不属于运行 surface；保留在静态源码清单中防止未来启用后漏审。 |
| `INV-DEBUG-PREVIEW` | `P3` | debug_only | Debug preview 登录绕过 | `mapped_unverified` | `SC-RELEASE-01` | 只允许 debug 对齐采集使用；release/profile 必须证明该绕过不可达。 |

## 导入与恢复

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-ACT-008` | `P0` | behavior_contract | 本地导入文件失败语义 | `difference` | `SC-DATA-02` | 两端都非事务，但失败后的用户数据状态不同。 |
| `DIALOG.LOCAL_IMPORT_OVERWRITE` | `P1` | ui_interaction_contract | 本地导入覆盖确认 | `difference` | `SC-DATA-02` | 旧版：按 legacy array/new object 与实际覆盖数量动态说明；Flutter：统一写债务和档案 |

## 导出

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-EXP-001` | `P0` | artifact_schema | XLSX 三张表与已结清债务 | `mapped_unverified` | `SC-EXPORT-02` | 表名大体映射；必须逐 cell、类型、空值、顺序和格式比较。 |
| `INV-EXP-002` | `P1` | behavior_contract | XLSX KPI 新增在还债务数 | `flutter_extra` | `SC-EXPORT-02` | 用户目标不允许未经批准增加导出内容。 |
| `INV-EXP-003` | `P1` | behavior_contract | XLSX original 空值 | `difference` | `SC-EXPORT-02` | 空单元格与数值 0 在表格语义上不同。 |
| `INV-EXP-004` | `P0` | behavior_contract | PDF 报告内容结构 | `difference` | `SC-EXPORT-02` | 可选中文字是实现改进，但不能替代旧版缺失的图表与内容。 |
| `INV-EXP-005` | `P1` | artifact_contract | 导出文件名与 MIME | `mapped_unverified` | `SC-EXPORT-01`, `SC-EXPORT-02` | 需固定日期验证 YYMMDD、MIME、SAF 默认文件名及取消反馈。 |

## 微信登录

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-NAT-003` | `P0` | native_bridge | fluwx manifest 与微信回调路由 | `mapped_unverified` | `SC-AUTH-01`, `SC-RELEASE-01` | 插件声明存在不等于新包名、签名和真实回调已验证。 |
| `INV-NAT-004` | `P0` | behavior_contract | OAuth state 随机性与回调校验 | `difference` | `SC-AUTH-02` | 固定/未校验 state 是 OAuth 安全与串话风险。 |
| `INV-NAT-005` | `P1` | behavior_contract | 微信安装检测与错误反馈 | `difference` | `SC-AUTH-02` | Flutter wrapper 有 isInstalled，但登录门未调用。 |
| `INV-NAT-006` | `P0` | behavior_contract | 新包名与 release SHA1 注册 | `blocked_external` | `SC-RELEASE-01` | 必须在装有微信的 Android 真机和微信开放平台登记状态下验证。 |

## 我的 Tab

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `TAB.MINE` | `P0` | ui_interaction_contract | 我的主页全部状态 | `difference` | `SC-UI-MINE` | 旧版：账户/Premium/数据卡固定自定义布局；Flutter：功能入口大体齐，但卡片、标题、间距和图标为 Material 重排 |

## 提前还款模拟

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-ACT-011` | `P1` | behavior_contract | 期次约束与结果内容 | `difference` | `SC-UI-DETAIL-EDIT` | 超出剩余期数时行为和信息展示均不一致。 |
| `SUBPAGE.PREPAY_SIM` | `P0` | ui_interaction_contract | 提前还款模拟页面与状态 | `difference` | `SC-UI-DETAIL-EDIT` | 旧版：先关详情再开全屏，持久化 mode/extra，按剩余期数 clamp，结果完整；Flutter：详情上叠 bottom sheet，每次重置 once/1000，结果字段更少 |

## 数据与持久化

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-STO-001` | `P0` | storage_keys | 债务、档案、账户、通知、会员主键 | `mapped_unverified` | `SC-DATA-01` | 键名映射不意味着 WebView localStorage 会自动迁移到 SharedPreferences。 |
| `INV-STO-002` | `P1` | storage_key | 债务排序偏好 | `mapped_unverified` | `SC-SORT-01`, `SC-DATA-01` | 需覆盖非法值、自定义顺序和冷启动恢复。 |
| `INV-STO-003` | `P0` | storage_keys | AI 用量缓存与会话历史 | `mapped_unverified` | `SC-AI-02`, `SC-AI-03` | 服务端月额度是权威；本地缓存与聊天历史仍要逐状态对齐。 |
| `INV-STO-004` | `P1` | behavior_contract | 提前还款模拟偏好 | `missing_in_flutter` | `SC-DATA-01` | Flutter 每次打开都回到 once/1000，且起始期语义不完整。 |
| `INV-STO-005` | `P1` | behavior_contract | AI 首次额度说明标记 | `missing_in_flutter` | `SC-AI-03` | 这是首次进入教育弹窗的一次性持久化契约。 |
| `INV-STO-006` | `P0` | behavior_contract | 云备份元数据键 | `difference` | `SC-DATA-01`, `SC-BACKUP-01` | 现有清单此前误认为键已对齐。 |
| `INV-STO-007` | `P1` | behavior_contract | 档案二进制持久化形状 | `difference` | `SC-ARCHIVE-01`, `SC-DATA-02` | 底层存储机制可不同，但可观察元数据、文件字节与生命周期必须等价。 |
| `INV-STO-008` | `P1` | behavior_contract | Flutter 自管 device id 与 CloudBase session | `flutter_extra` | `SC-DATA-01`, `SC-SESSION-01` | 架构所需的额外本地状态，但清理、过期与安全语义必须映射旧 SDK。 |
| `INV-STO-009` | `P0` | behavior_contract | 损坏 JSON 容错 | `difference` | `SC-DATA-01` | 损坏偏好可能让 Flutter 冷启动崩溃。 |
| `INV-STO-010` | `P0` | behavior_contract | 异步写盘完成时序 | `difference` | `SC-DATA-03` | UI 成功与真实持久化之间存在杀进程窗口。 |
| `INV-DATA-001` | `P0` | model_shape | PlanRow、GenSpec、Debt 主字段 | `mapped_unverified` | `SC-DATA-01`, `SC-DEBT-01` | 字段静态映射完成，仍需旧形状、缺字段和 round-trip 证据。 |
| `INV-DATA-002` | `P3` | behavior_contract | GenSpec.paid 兼容字段 | `flutter_extra` | `SC-DATA-01` | 有益兼容扩展，暂未发现用户可观察差异。 |
| `INV-DATA-003` | `P0` | model_shape | Account、Premium、Notify、Doc、AI quota 形状 | `mapped_unverified` | `SC-DATA-01`, `SC-AI-03` | 主字段已映射，但容错、历史值和空值仍由 fixture 决定。 |
| `INV-DATA-004` | `P0` | behavior_contract | legacy premiumPlus 迁移 | `missing_in_flutter` | `SC-DATA-01` | 旧备份恢复可能静默丢失会员权益。 |
| `INV-DATA-005` | `P1` | behavior_contract | v6 uploads addedAt 形状 | `difference` | `SC-DATA-02`, `SC-EXPORT-01` | 同为 version 6 但时间字段类型不一致。 |

## 档案库

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-ACT-009` | `P0` | behavior_contract | 内置 Markdown 文档保存与删除 | `missing_in_flutter` | `SC-ARCHIVE-01` | 旧版内置文档与上传文件在统一档案列表中都可操作。 |
| `INV-ACT-010` | `P0` | behavior_contract | HEIC/HEIF/BMP MIME 保留 | `missing_in_flutter` | `SC-ARCHIVE-01` | 选择器允许这些扩展名，但 MIME 映射遗漏会破坏预览和分享。 |
| `SUBPAGE.ARCHIVE` | `P0` | ui_interaction_contract | 档案库全部状态 | `difference` | `SC-UI-ARCH-BACKUP` | 旧版：文档/上传统一列表并点行内联预览，保存/分享/删除入口固定；Flutter：上传在前、内置文档为 ExpansionTile，仅上传项可选 |
| `ACTION.ARCHIVE.BUILTIN_DOC` | `P0` | ui_interaction_contract | 内置文档保存/删除 | `missing_in_flutter` | `SC-ARCHIVE-01` | 旧版：内置 Markdown 可保存和删除；Flutter：没有这些动作 |
| `PREVIEW.ARCHIVE.MARKDOWN` | `P0` | ui_interaction_contract | Markdown 渲染预览 | `difference` | `SC-ARCHIVE-01` | 旧版：渲染 Markdown HTML 结构；Flutter：主要显示原始 SelectableText |
| `PREVIEW.ARCHIVE.IMAGE` | `P0` | ui_interaction_contract | 图片预览与长按提示 | `difference` | `SC-ARCHIVE-01` | 旧版：预览并提示长按保存，保留原 MIME；Flutter：缺长按提示且部分图片 MIME 丢失 |
| `SUBPAGE.ARCHIVE_PDF` | `P1` | ui_interaction_contract | PDF 预览 surface | `flutter_extra` | `SC-ARCHIVE-01` | 旧版：在档案页内联预览全部页；Flutter：另开带页码/加载/错误的路由 |
| `MENU.ARCHIVE_ACTIONS` | `P1` | ui_interaction_contract | 档案三点动作菜单 | `flutter_extra` | `SC-ARCHIVE-01` | 旧版：行内保存/删除，预览区分享；Flutter：上传项新增三点 PopupMenu |
| `DIALOG.ARCHIVE_DELETE` | `P0` | ui_interaction_contract | 档案删除确认与反馈 | `difference` | `SC-ARCHIVE-01` | 旧版：上传和内置文档均支持，成功 toast；Flutter：只支持上传，成功静默 |

## 法律与关于

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `SUBPAGE.ABOUT` | `P1` | ui_interaction_contract | 关于我们子页 | `difference` | `SC-UI-MINE` | 旧版：真实 App 图标、可点邮箱、三协议与账户入口；Flutter：savings 图标，邮箱静态，容器不同 |
| `SUBPAGE.PRIVACY` | `P0` | ui_interaction_contract | 隐私政策 | `difference` | `SC-UI-MINE` | 旧版：旧版自定义 subpage 与原文排版；Flutter：异步 asset loader、Material 容器与排版不同；逐字内容仍需机器比较 |
| `SUBPAGE.USER_AGREEMENT` | `P0` | ui_interaction_contract | 用户协议 | `difference` | `SC-UI-MINE` | 旧版：旧版自定义 subpage 与原文排版；Flutter：异步 asset loader、Material 容器与排版不同；逐字内容仍需机器比较 |
| `SUBPAGE.PREMIUM_TERMS` | `P0` | ui_interaction_contract | 会员服务协议 | `difference` | `SC-UI-MINE` | 旧版：旧版自定义 subpage 与原文排版；Flutter：异步 asset loader、Material 容器与排版不同；逐字内容仍需机器比较 |

## 策略对比

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `SUBPAGE.STRATEGY_COMPARE` | `P0` | ui_interaction_contract | 多策略对比全部状态 | `difference` | `SC-REPORT-02` | 旧版：0/1/2+债务文案准确，含精确日期、节省结论、失败信息、图例/起点；Flutter：0笔也写只有1笔，多个字段和图表语义缺失 |

## 统计 Tab

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `TAB.REPORT` | `P0` | ui_interaction_contract | 统计报告全部状态 | `difference` | `SC-UI-REPORT` | 旧版：在还、仅结清、从未有债都有完整报告/Outro/口径；Flutter：仅结清态少已付利息和完整 Outro，整体版式仍不同 |
| `GESTURE.REPORT_JOURNEY_SCRUB` | `P0` | ui_interaction_contract | 还清路径真实时间轴拖读 | `difference` | `SC-REPORT-02` | 旧版：按真实日期比例绘制/命中，轴仲裁，松手复位；Flutter：按数组等距绘制/命中但标签按真实时间，tap 可能粘住 |
| `MODE.REPORT_PRESSURE` | `P0` | ui_interaction_contract | 未来压力面积/柱形模式 | `difference` | `SC-REPORT-02` | 旧版：默认面积，两种模式都可选月，长时间轴横向滚；Flutter：默认柱形，面积不可交互，长轴压进单屏且标题固定 |
| `DISCLOSURE.REPORT_RANK_REST` | `P1` | ui_interaction_contract | 债务排行其余 N 笔展开 | `missing_in_flutter` | `SC-REPORT-01` | 旧版：可展开/收起完整剩余列表；Flutter：只有静态汇总文字 |
| `GESTURE.REPORT_TYPE_ROTATE` | `P0` | ui_interaction_contract | 类型饼图绕圆心旋转 | `difference` | `SC-REPORT-02` | 旧版：按圆心角度、有阈值和惯性，标签随图转并与纵滚仲裁；Flutter：累加水平 dx、无惯性、legend 静态 |
| `POPOVER.REPORT_EXPORT` | `P1` | ui_interaction_contract | 导出二选一 popover | `missing_in_flutter` | `SC-UI-REPORT` | 旧版：点击导出打开二选一 popover，可点背景关闭；Flutter：Excel/PDF 两按钮常驻 |
| `DISCLOSURE.REPORT_CALC_NOTE` | `P1` | ui_interaction_contract | 统计计算口径折叠 | `difference` | `SC-REPORT-01` | 旧版：主报告及结清状态都可展开/收起；Flutter：仅结清状态完全缺失 |

## 计算核心

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-CALC-CLONE` | `P0` | pure_function | clone | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-R2` | `P0` | pure_function | r2 | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-FMT` | `P0` | pure_function | fmt | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-MONEY` | `P0` | pure_function | money | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-TODAYSTR` | `P0` | pure_function | todayStr | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-BASENAME` | `P0` | pure_function | baseName | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-EXTOF` | `P0` | pure_function | extOf | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-PAD` | `P0` | pure_function | pad | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-PARSEDATE` | `P0` | pure_function | parseDate | `difference` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-ADDMONTHS` | `P0` | pure_function | addMonths | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-FMTDATE` | `P0` | pure_function | fmtDate | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-TODAY0` | `P0` | pure_function | today0 | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-RATECLASS` | `P0` | pure_function | rateClass | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-ISACTIVE` | `P0` | pure_function | isActive | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-GENPLAN` | `P0` | pure_function | genPlan | `mapped_unverified` | `SC-CALC-01`, `SC-CALC-02` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-NPV` | `P0` | pure_function | npv | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-IMPLIEDAPR` | `P0` | pure_function | impliedAPR | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-ROWREMAINING` | `P0` | pure_function | rowRemaining | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-RECOMPUTE` | `P0` | pure_function | recompute | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-SHORTDATEFROMISO` | `P0` | pure_function | shortDateFromISO | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-APPLYSETTLE` | `P0` | pure_function | applySettle | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-UNDOSETTLE` | `P0` | pure_function | undoSettle | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-RECORDPAYMENT` | `P0` | pure_function | recordPayment | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-WAIVEPERIOD` | `P0` | pure_function | waivePeriod | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-MARKPAIDTHROUGH` | `P0` | pure_function | markPaidThrough | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-GENDEBTID` | `P0` | pure_function | genDebtId | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-NORMALIZE` | `P0` | pure_function | normalize | `difference` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-INTERESTCOVERTOLERANCE` | `P0` | pure_function | interestCoverTolerance | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-AMORTFORWARD` | `P0` | pure_function | amortForward | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-SIMULATEPREPAY` | `P0` | pure_function | simulatePrepay | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-SIMULATEREPAYMENTORDER` | `P0` | pure_function | simulateRepaymentOrder | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-SNOWBALLORDER` | `P0` | pure_function | snowballOrder | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-AVALANCHEORDER` | `P0` | pure_function | avalancheOrder | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-DETECTMATCHINGSORT` | `P0` | pure_function | detectMatchingSort | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-ISBADREPEATDAY` | `P0` | pure_function | isBadRepeatDay | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-OFFSETLABEL` | `P0` | pure_function | offsetLabel | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-URGENCYTIER` | `P0` | pure_function | urgencyTier | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-RELLABEL` | `P0` | pure_function | relLabel | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-DUEBUCKET` | `P0` | pure_function | dueBucket | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-COMPUTEREPORTDATA` | `P0` | pure_function | computeReportData | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-ESC` | `P0` | pure_function | esc | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-INLINE` | `P0` | pure_function | inline | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-ISHR` | `P0` | pure_function | isHr | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-MDTOHTML` | `P0` | pure_function | mdToHtml | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-SUMMARIZEDEBTS` | `P0` | pure_function | summarizeDebts | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-COMPUTEMONTHLYREPAYMENT` | `P0` | pure_function | computeMonthlyRepayment | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-COMPUTEUPCOMINGPRESSURE` | `P0` | pure_function | computeUpcomingPressure | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-PRESSUREWINDOWMONTHS` | `P0` | pure_function | pressureWindowMonths | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-COMPUTENOTIFYSCHEDULE` | `P0` | pure_function | computeNotifySchedule | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-REMAININGINTEREST` | `P0` | pure_function | remainingInterest | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-HASPREMIUM` | `P0` | pure_function | hasPremium | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-PREMIUMLABEL` | `P0` | pure_function | premiumLabel | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-FINDAICONV` | `P0` | pure_function | findAiConv | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-BUMPAICONVTOP` | `P0` | pure_function | bumpAiConvTop | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-ESCSVG` | `P0` | pure_function | escSvg | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-NICECEIL` | `P0` | pure_function | niceCeil | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-TRUNCATELABEL` | `P0` | pure_function | truncateLabel | `mapped_unverified` | `SC-CALC-01` | 57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。 |
| `INV-CALC-COERCION` | `P0` | runtime_semantics | JS Number coercion、NaN/Infinity 与 Dart _num 语义 | `difference` | `SC-CALC-01`, `SC-CALC-02` | 合法业务域可能一致，但百分百对齐还必须覆盖 bool、非法数值、NaN/Infinity 和 mutation。 |
| `INV-CALC-DART-EXTRA` | `P3` | api_surface | Dart 公开 splitPaidInterestFirst | `flutter_extra` | `SC-CALC-01` | JS 中为内部函数，Dart 顶层可见；暂未发现用户可观察影响。 |

## 账户

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `SUBPAGE.ACCOUNT` | `P1` | ui_interaction_contract | 账户信息子页 | `difference` | `SC-UI-MINE` | 旧版：从头像/关于进入，退出后 toast；Flutter：信息大体映射，退出成功静默 |
| `DIALOG.ACCOUNT_ACTIONS` | `P1` | ui_interaction_contract | 注销与重置动作选择 | `difference` | `SC-ACCOUNT-01` | 旧版：第三动作是标题右上弱化链接；Flutter：三个普通 action 同列 |
| `DIALOG.ACCOUNT_RESET_CONFIRM` | `P1` | ui_interaction_contract | 仅重置本地数据确认 | `difference` | `SC-RESET-01` | 旧版：统一 ask 宿主、固定文案与 reload；Flutter：AlertDialog 文案和完成表现不同 |
| `DIALOG.ACCOUNT_DELETE_FINAL` | `P1` | ui_interaction_contract | 注销额外最后确认 | `flutter_extra` | `SC-ACCOUNT-01` | 旧版：首次注销确认即最终确认；Flutter：又增加一层最后确认 |

## 账户与隐私

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-ACT-006` | `P0` | behavior_contract | 服务器注销后的本地数据保留 | `difference` | `SC-ACCOUNT-01` | Flutter 当前会在服务器注销成功后额外删除用户全部本地债务与档案。 |
| `INV-ACT-007` | `P0` | state_transition | 仅重置本地数据 | `mapped_unverified` | `SC-RESET-01` | 最终语义接近，但 Flutter 新增 session/device/archive key 后必须核对完整清理集合。 |
| `INV-CLD-016` | `P1` | shared_legacy_gap | 注销后 aiUsage 与认证 principal 残留 | `mapped_unverified` | `SC-ACCOUNT-01` | 两端客户端调用同一云函数，因此共有服务端隐私缺口；不是 Flutter 独有差异。 |

## 还款日 Tab

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `TAB.PAY` | `P0` | ui_interaction_contract | 还款日全部状态 | `difference` | `SC-UI-PAY-NOTIFY` | 旧版：逐期列表，销这期只在左滑后出现；Flutter：每行额外常驻销这期按钮，整体结构/状态不同 |
| `PICKER.PAY_CUSTOM_DATE` | `P2` | ui_interaction_contract | 自定义日期选择器 | `difference` | `SC-PAY-01` | 旧版：全局 native date modal；Flutter：Material showDatePicker |
| `GESTURE.PAY_SWIPE` | `P0` | ui_interaction_contract | 还款行左滑 | `difference` | `SC-PAY-02` | 旧版：轴仲裁、半阈值、只开一行、tab 切换关闭；Flutter：通用手势，tab 切换保留 |

## 通知

| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |
|---|---|---|---|---|---|---|
| `INV-NOT-001` | `P0` | schedule_contract | 6个月/450条全期提醒计算 | `mapped_unverified` | `SC-NOTIFY-01` | 核心纯计算已映射；仍需 tie、450/451、6个月边界和非法规则差分。 |
| `INV-NOT-002` | `P0` | behavior_contract | 冷启动重排提醒 | `missing_in_flutter` | `SC-NOTIFY-03` | 重启后现有债务不会主动恢复未来提醒。 |
| `INV-NOT-003` | `P1` | behavior_contract | 通知开关即时调度 | `difference` | `SC-NOTIFY-02` | Flutter 行为可能更合理，但用户目标要求旧版行为，除非书面批准差异。 |
| `INV-NOT-004` | `P0` | behavior_contract | 测试通知前权限请求 | `missing_in_flutter` | `SC-NOTIFY-02` | 首次点击测试时 Flutter 可能直接失败或无反馈。 |
| `INV-NOT-005` | `P0` | behavior_contract | 测试与正式通知文案/id/日期格式 | `difference` | `SC-NOTIFY-02` | 通知属于用户可见内容，不能以功能存在替代逐字对齐。 |
| `INV-NOT-006` | `P1` | behavior_contract | Android channel 描述与创建时机 | `difference` | `SC-NOTIFY-02` | Android channel 一旦创建后部分字段不可变，必须用干净安装验收。 |
| `INV-NOT-007` | `P1` | behavior_contract | exact alarm 请求与降级 | `flutter_extra` | `SC-NOTIFY-02` | 平台适配可以不同，但用户可观察权限流程和提醒精度须批准。 |
| `INV-NOT-008` | `P0` | behavior_contract | exact alarm 授权冷启动恢复 | `difference` | `SC-NOTIFY-03` | 系统已授权但进程重启后内存标记回 false。 |
| `INV-NOT-009` | `P0` | behavior_contract | 时区识别失败降级 | `difference` | `SC-NOTIFY-03` | 回退 UTC 可让本地提醒整体偏移。 |
| `INV-NOT-010` | `P1` | behavior_contract | reschedule 异步错误处理 | `difference` | `SC-NOTIFY-03` | 原生插件失败可能成为未处理异步错误且 UI 仍显示成功。 |
| `SHEET.NOTIFY_SETTINGS` | `P0` | ui_interaction_contract | 通知设置底部抽屉 | `difference` | `SC-UI-PAY-NOTIFY` | 旧版：bottom sheet，关闭时补默认规则，测试始终可点并自行申请权限；Flutter：全屏/Material 结构，获权后立即加规则，未启用时测试禁用 |
| `PICKER.NOTIFY_OFFSET` | `P2` | ui_interaction_contract | 提前天数选择 | `difference` | `SC-NOTIFY-02` | 旧版：native select；Flutter：ChoiceChip |
| `PICKER.NOTIFY_TIME` | `P2` | ui_interaction_contract | 提醒时间选择 | `difference` | `SC-NOTIFY-02` | 旧版：native time input；Flutter：Material time picker |
| `SYS.NOTIFICATION_PERMISSION` | `P0` | ui_interaction_contract | 通知权限全状态 | `difference` | `SC-NOTIFY-02` | 旧版：启用/测试分别有确定检查、提示与默认规则时机；Flutter：前置条件、提示与永久拒绝分支不同 |
