---
name: account-premium-design
description: Use this skill when modifying or debugging After Zero account screens and account lifecycle, logout/reset/delete behavior, Premium state and gates, redemption codes, pricing or purchase placeholders, settle-time Premium invitations, or the duplicated membership agreement in `docs/legal/会员服务协议.md` and `TermsScreen.tsx`.
---

# 账户与 Premium

以当前代码中的单一 Premium 模型为准。不要恢复 Premium/Premium+、月付/年付或已删除的促销历史。

## 代码归属

- React 页面与入口：`react/src/mine/**`、`AccountScreen.tsx`、`PremiumScreen.tsx`、`TermsScreen.tsx`、`useSettleCelebration.ts`。
- React 只负责展示、确认和 screen 状态；登录会话、localStorage、CloudBase 调用、兑换写入、退出/注销/重置仍由 `www/index.html` 经 `window.__azBridge` 执行。
- `hasPremium(premium)` / `premiumLabel(premium)` 的权威实现位于 `www/js/calc.js`。
- 微信登录接线加载 `wechat-login-setup`；Apple 登录叠加 `capacitor-native-runtime` 与 `cloudbase-deploy`；`deleteAccount` 云函数部署加载 `cloudbase-deploy`；React 外部状态和返回链加载 `react-bridge-architecture`。

## 账户生命周期

- App是本地优先模式：`ACCOUNT_KEY = "after-zero-account-v1"`为空时仍可使用本地债务、还款、统计、档案、通知、导入导出和模拟。该键只保存provider-neutral账户展示资料；CloudBase自定义登录会话中的内部`userId`才是云函数身份来源。旧`{openid,nickname,...}`数据在不改键名的前提下惰性补成兼容形状。
- AI、云备份等真实云功能在React入口调用`requestCloudLogin(purpose)`，提示必须说明用途并可取消；bridge执行函数还要独立拒绝无account的调用，不能只依赖按钮门禁。
- “退出登录”清`ACCOUNT_KEY`并调用CloudBase `signOut()`，随后继续本地使用；不删除本地债务、档案、通知或服务器账户，也不自动上传/恢复。
- “重置本地数据”是账户页独立操作，二次确认后执行`localStorage.clear()`、删除IndexedDB `debtManagerFiles`并reload；它不调用云函数、不删除账户或云备份。
- “注销账户”只在已登录状态展示并调用`deleteAccount`。服务端只信任`app.auth().getUserInfo().customUserId`，先删除该用户全部`backups`文档和Storage文件，再删除`users`、`identities`和Apple nonce记录；客户端成功后清账户展示资料并退出CloudBase会话，本机账本继续保留。
- 不把客户端传入的openid、Apple sub或userId当身份，也不要把重置本地数据和注销账户合并成一个动作。

## Premium 当前模型

- `PREMIUM_KEY = "after-zero-premium-v1"`，形状为 `{ premium: { method: "onetime" | "redeemed", at: ISO } | null }`。
- `hasPremium()` 只判断 `premium.premium` 是否存在，不按 `method` 分权益。加载时把旧 `premiumPlus` 兼容迁成 `redeemed` 后删除旧字段。
- 当前只有一个 Premium 等级和一张 ¥15 买断价卡。真实支付尚未接入；“开通 Premium”只显示占位说明，不能描述成可完成真实购买。
- 当前可实际写入资格的最小调试入口是硬编码兑换码 `0000 → premium`；它不是生产兑换核销系统。`__debugPremium("premium"|"none")` 只用于开发测试。
- 当前代码中的门禁包括 AI 助手、云备份、报告 Excel/PDF 导出和 `StrategyCta` 的多策略对比入口。图表查看、档案库、本地 JSON 备份导入导出和提前还款模拟没有 Premium 门禁。
- `StrategyCompareScreen`和云备份执行函数本身没有第二层Premium校验，当前依赖入口门禁；云备份的登录门不同，执行层必须二次检查account。调整权益时先全仓搜索`hasPremium(`、`openPremiumScreen`和Premium页权益文案。

## 付费邀请

- `useSettleCelebration` 常驻挂在 sheets 根，只根据 debts 变化判断“刚结清”，不绑定具体还款入口。
- 首次挂载把已有结清债务当基线，不弹；非会员债务从未结清变为结清时复用 `confirmAsync` 邀请查看 Premium。
- 撤销结清会把 id 移出基线，重新结清可以再次触发；会员不触发。

## 法律副本与已知边界

- 购买方式、价格状态、权益或退款事实变化时，同时核对 `docs/legal/会员服务协议.md` 与 `react/src/sheets/TermsScreen.tsx`。前者是源稿，后者是 App 内硬编码副本，不能只改一处。
- 当前协议必须继续如实说明：仅买断、价格为占位、未接真实支付、兑换资格不涉及退款；正式支付接入时必须重写相关条款。
- `usePremium()` 已用稳定fingerprint快照兼容原地mutation和整体替换，具体模式归 `react-bridge-architecture`。Premium数据形状增加会影响展示或门禁的新字段时，要同步更新snapshot fingerprint/clone与回归测试。

## 验证

- 修改账户/Premium React 时运行 `npm run test:react`，重点覆盖 `AccountScreen`、`PremiumScreen`、`PremiumEntryCard`、`DataCards`、`AiBanner`、`TermsScreen`、`useSettleCelebration` 以及受影响门禁测试。
- 修改 `hasPremium`、迁移或兑换逻辑时同时运行 `npm test`，并核对 `PREMIUM_KEY` 兼容读取、事件派发和 bridge 契约。
- 注销、真实 CloudBase 身份、备份联动删除和微信会话只能在已认证环境做端到端验证；不要用伪造 `ACCOUNT_KEY` 代替。
