// 订阅vanilla那份共享数据——用React 18内置的useSyncExternalStore(专门为"订阅一个React外部
// 的可变数据源"设计的官方API)，不手写容易出错的订阅/取消订阅+强制重渲染逻辑。见CLAUDE.md
// "React 迁移"一节里__azBridge/az:state-changed这套桥接契约的说明。
// 这几个hook本身跟"在还债务"页无关，是所有React tab(在还债务/还款日/统计)共用的通用逻辑，
// 所以放在shared/而不是某个具体tab的目录下。
import { useSyncExternalStore } from "react";
import type { Account, Debt, FileItem, NotifySettings, Premium } from "../types";

function subscribe(callback: () => void) {
  window.addEventListener("az:state-changed", callback);
  return () => window.removeEventListener("az:state-changed", callback);
}

// ⚠️debts数组本身在payInstallment/settleFull/unsettle这几个vanilla函数里是原地mutate的
// (改r.paid/d.settled等字段，不reassign整个debts变量——只有commitReorder/applyBackupData/
// 导入JSON三处才会整体重新赋值，见getDebts那行注释)。这是真实踩过的坑：如果getSnapshot
// 直接返回window.__azBridge.getDebts()这个引用，那么在上述三处mutate路径下，az:state-changed
// 确实被派发了，但getSnapshot前后两次拿到的是同一个数组引用，useSyncExternalStore内部按
// Object.is比较判定"没变"，会直接跳过这次重渲染——不是"渲染了但显示旧值"，是整个组件
// 完全不重渲染，订阅了useDebts()的组件(DetailSheet/DebtList/PayList/ReportApp等全部)在这类
// 操作后会卡在上一次渲染的画面，直到别的原因(比如整体重新赋值debts、或者别的hook触发的
// 渲染)才会连带把这里的新数据带出来。跟下面useNotify()的坑是同一个技术根源，解法也是同一个
// "值变了才生成新引用"思路，但触发时机不同——notify需要按内容(fingerprint)比较，这里更简单：
// 只要订阅回调真的被调用了(意味着at least有什么东西声明"状态变了")，或者底层引用本身确实
// 变了(commitReorder那三处整体重新赋值、或者测试里换了一个全新的window.__azBridge)，就
// 重新生成一份浅拷贝；两者都没发生时重复调用getSnapshot返回同一个缓存引用，不会触发
// useNotify那条注释里说的"每次都返回新引用→无限重渲染"陷阱。
let debtsCache: Debt[] | null = null;
let debtsCacheSource: Debt[] | null = null;
let debtsCacheDirty = true;
function subscribeDebts(callback: () => void) {
  function handler() {
    debtsCacheDirty = true; // 让下一次getDebtsSnapshot()重新浅拷贝，不管底层引用变没变
    callback();
  }
  window.addEventListener("az:state-changed", handler);
  return () => window.removeEventListener("az:state-changed", handler);
}
function getDebtsSnapshot(): Debt[] {
  const source = window.__azBridge.getDebts();
  if (debtsCacheDirty || source !== debtsCacheSource) {
    debtsCache = source.slice();
    debtsCacheSource = source;
    debtsCacheDirty = false;
  }
  return debtsCache as Debt[];
}
export function useDebts(): Debt[] {
  return useSyncExternalStore(subscribeDebts, getDebtsSnapshot);
}

// premium既会被applyRedeemTier()原地写premium.premium，也会在调试切换/备份恢复时整体
// 重新赋值。直接把bridge对象交给useSyncExternalStore会漏掉前一种变化；每次无条件clone又会
// 让React认为snapshot持续变化、陷入无限重渲染。按实际权益字段做fingerprint，只有值变化时
// 才生成新快照，同时把内层对象也clone出来，避免缓存继续被vanilla原地修改。
let premiumCache: Premium | null = null;
let premiumFingerprint = "";
function getPremiumSnapshot(): Premium {
  const source = window.__azBridge.getPremium();
  const fp = source.premium
    ? source.premium.method + "|" + source.premium.at
    : "none";
  if (!premiumCache || fp !== premiumFingerprint) {
    premiumFingerprint = fp;
    premiumCache = {
      premium: source.premium
        ? { method: source.premium.method, at: source.premium.at }
        : null,
    };
  }
  return premiumCache;
}
export function usePremium(): Premium {
  return useSyncExternalStore(subscribe, getPremiumSnapshot);
}

// 头像/昵称来自登录态account，跟debts/premium是完全独立的一份数据，但同样通过
// az:state-changed这一个事件通知(登录/退出登录时vanilla那边会补发这个事件，
// 见CLAUDE.md"React 迁移"一节)，不需要为account单独发明一个事件名。
export function useAccount(): Account | null {
  return useSyncExternalStore(subscribe, () => window.__azBridge.getAccount());
}

// ⚠️notify(vanilla里的模块变量)是原地mutate的，不像debts那样在commitReorder等几处会整体
// 重新赋值——saveNotify()改的是notify.enabled/notify.rules这些字段本身，notify这个对象的
// 引用永远不变。这带来两个各自会踩坑的极端：
// 1) 如果getSnapshot直接返回window.__azBridge.getNotify()这个引用，物件永远===自己，
//    az:state-changed事件就算真的因为notify变化而派发，这个hook也会误判"没变"、不会触发重渲染。
// 2) 如果反过来让getSnapshot每次都返回一个新的浅拷贝对象字面量(想靠"引用总是不同"来强制更新)，
//    会踩上React的另一个已知坑——useSyncExternalStore不只在订阅事件触发时调用getSnapshot，
//    每次渲染/commit后都会再调一次做"有没有撕裂"检查；每次都拿到不同引用会被判定成"还在变"，
//    陷入无限重渲染循环(实测复现过："Maximum update depth exceeded")。
// 正确做法：按值(fingerprint)比较——只有enabled/rules的实际内容变了才生成一个新的缓存对象，
// 没变就返回上一次缓存的同一个引用，两头都满足。
let notifyCache: NotifySettings | null = null;
let notifyFingerprint = "";
function getNotifySnapshot(): NotifySettings {
  const n = window.__azBridge.getNotify();
  const fp = n.enabled + "|" + n.rules.map((r) => r.offsetDays + ":" + r.time).join(",");
  if (fp !== notifyFingerprint || !notifyCache) {
    notifyFingerprint = fp;
    notifyCache = { enabled: n.enabled, rules: n.rules };
  }
  return notifyCache;
}
export function useNotify(): NotifySettings {
  return useSyncExternalStore(subscribe, getNotifySnapshot);
}

// "哪个detail sheet开着"——这份状态从DetailSheet迁移开始不再由vanilla拥有，纯粹是React
// 自己的UI状态(见CLAUDE.md"React 迁移"一节里detailSheet那部分)：openDetailSheet(id)/
// closeDetailSheet()不经过window.__azBridge，是"在还债务"/"还款日"两棵独立React树(各自的
// DebtCard.tsx/PayRow.tsx)跟常驻挂载的第5棵树(react/src/sheets/)之间共享的状态，用独立的
// az:detail-sheet-changed事件通知——故意不复用az:state-changed，因为"哪个sheet开着"和
// "debts/premium/account数据变了"是两件不同的事，混在一起会让不相关的订阅者收到无意义的通知。
// 存的是debt.id(不是下标)——见CLAUDE.md"债务对象加了真正的id字段"一节。
let detailSheetId: string | null = null;
function subscribeDetailSheet(callback: () => void) {
  window.addEventListener("az:detail-sheet-changed", callback);
  return () => window.removeEventListener("az:detail-sheet-changed", callback);
}
export function openDetailSheet(id: string) {
  detailSheetId = id;
  window.dispatchEvent(new CustomEvent("az:detail-sheet-changed"));
}
export function closeDetailSheet() {
  detailSheetId = null;
  window.dispatchEvent(new CustomEvent("az:detail-sheet-changed"));
}
export function useDetailSheetId(): string | null {
  return useSyncExternalStore(subscribeDetailSheet, () => detailSheetId);
}

// "哪个edit sheet开着"——跟上面detailSheetId完全同一个模式(React自己拥有的UI状态，不经过
// window.__azBridge)，独立的az:edit-sheet-changed事件(不复用az:detail-sheet-changed，理由
// 同上："哪个sheet开着"这类状态各自独立成事件，别人不关心的sheet开关不该收到无意义的通知)。
// null=关闭，NEW_DEBT_ID=新增债务模式(对应vanilla原来editIndex=-1的含义，改用字符串哨兵值
// 是因为真实id都是字符串，"-1"这种数字约定没法直接沿用)，其它字符串=编辑对应id的debt。
export const NEW_DEBT_ID = "new";
let editSheetId: string | null = null;
function subscribeEditSheet(callback: () => void) {
  window.addEventListener("az:edit-sheet-changed", callback);
  return () => window.removeEventListener("az:edit-sheet-changed", callback);
}
export function openEditSheet(id: string) {
  editSheetId = id;
  window.dispatchEvent(new CustomEvent("az:edit-sheet-changed"));
}
export function closeEditSheet() {
  editSheetId = null;
  window.dispatchEvent(new CustomEvent("az:edit-sheet-changed"));
}
export function useEditSheetId(): string | null {
  return useSyncExternalStore(subscribeEditSheet, () => editSheetId);
}

// 账户详情/订阅页/条款页——第七步(React迁移收尾)新增的三个always-mounted subpage，跟
// detailSheet/editSheet同一个模式(布尔开关而不是下标，因为这三个screen不需要"打开哪一个"
// 这种参数，全局只有一份)：各自独立的az:x-screen-changed事件("哪个screen开着"跟"debts/
// premium/account数据变了"是两件事，理由跟detail/editSheet当年一致，不复用az:state-changed)。
let accountScreenOpen = false;
function subscribeAccountScreen(callback: () => void) {
  window.addEventListener("az:account-screen-changed", callback);
  return () => window.removeEventListener("az:account-screen-changed", callback);
}
export function openAccountScreen() {
  accountScreenOpen = true;
  window.dispatchEvent(new CustomEvent("az:account-screen-changed"));
}
export function closeAccountScreen() {
  accountScreenOpen = false;
  window.dispatchEvent(new CustomEvent("az:account-screen-changed"));
}
export function useAccountScreenOpen(): boolean {
  return useSyncExternalStore(subscribeAccountScreen, () => accountScreenOpen);
}

let premiumScreenOpen = false;
function subscribePremiumScreen(callback: () => void) {
  window.addEventListener("az:premium-screen-changed", callback);
  return () => window.removeEventListener("az:premium-screen-changed", callback);
}
export function openPremiumScreen() {
  premiumScreenOpen = true;
  window.dispatchEvent(new CustomEvent("az:premium-screen-changed"));
}
export function closePremiumScreen() {
  premiumScreenOpen = false;
  window.dispatchEvent(new CustomEvent("az:premium-screen-changed"));
}
export function usePremiumScreenOpen(): boolean {
  return useSyncExternalStore(subscribePremiumScreen, () => premiumScreenOpen);
}

let termsScreenOpen = false;
function subscribeTermsScreen(callback: () => void) {
  window.addEventListener("az:terms-screen-changed", callback);
  return () => window.removeEventListener("az:terms-screen-changed", callback);
}
export function openTermsScreen() {
  termsScreenOpen = true;
  window.dispatchEvent(new CustomEvent("az:terms-screen-changed"));
}
export function closeTermsScreen() {
  termsScreenOpen = false;
  window.dispatchEvent(new CustomEvent("az:terms-screen-changed"));
}
export function useTermsScreenOpen(): boolean {
  return useSyncExternalStore(subscribeTermsScreen, () => termsScreenOpen);
}

// 提前还款模拟器——第八步(React迁移收尾)新增，跟detailSheet/editSheet同一个模式，但需要
// 债务id参数(模拟哪笔债务)，所以是useDetailSheetId()那种风格而不是布尔开关。
// 关于我们/隐私政策/用户服务协议——2026-07-31新增，跟accountScreen/premiumScreen/termsScreen
// 同一个模式(布尔开关，全局只有一份，不需要"打开哪一个"这种参数)。aboutScreen是"我的"tab新增
// 的入口，privacyScreen/agreementScreen则是从aboutScreen内部再打开的下一层subpage——跟
// premiumScreen到termsScreen(旧#termsScreen，内容已换成《会员服务协议》，见TermsScreen.tsx
// 顶部注释)是同一种"外层screen里链接到另一个独立screen"的关系，不是嵌套渲染，纯粹靠各自
// 独立的布尔状态加返回键优先级链表达"谁盖在谁上面"。
let aboutScreenOpen = false;
function subscribeAboutScreen(callback: () => void) {
  window.addEventListener("az:about-screen-changed", callback);
  return () => window.removeEventListener("az:about-screen-changed", callback);
}
export function openAboutScreen() {
  aboutScreenOpen = true;
  window.dispatchEvent(new CustomEvent("az:about-screen-changed"));
}
export function closeAboutScreen() {
  aboutScreenOpen = false;
  window.dispatchEvent(new CustomEvent("az:about-screen-changed"));
}
export function useAboutScreenOpen(): boolean {
  return useSyncExternalStore(subscribeAboutScreen, () => aboutScreenOpen);
}

let privacyScreenOpen = false;
function subscribePrivacyScreen(callback: () => void) {
  window.addEventListener("az:privacy-screen-changed", callback);
  return () => window.removeEventListener("az:privacy-screen-changed", callback);
}
export function openPrivacyScreen() {
  privacyScreenOpen = true;
  window.dispatchEvent(new CustomEvent("az:privacy-screen-changed"));
}
export function closePrivacyScreen() {
  privacyScreenOpen = false;
  window.dispatchEvent(new CustomEvent("az:privacy-screen-changed"));
}
export function usePrivacyScreenOpen(): boolean {
  return useSyncExternalStore(subscribePrivacyScreen, () => privacyScreenOpen);
}

let agreementScreenOpen = false;
function subscribeAgreementScreen(callback: () => void) {
  window.addEventListener("az:agreement-screen-changed", callback);
  return () => window.removeEventListener("az:agreement-screen-changed", callback);
}
export function openAgreementScreen() {
  agreementScreenOpen = true;
  window.dispatchEvent(new CustomEvent("az:agreement-screen-changed"));
}
export function closeAgreementScreen() {
  agreementScreenOpen = false;
  window.dispatchEvent(new CustomEvent("az:agreement-screen-changed"));
}
export function useAgreementScreenOpen(): boolean {
  return useSyncExternalStore(subscribeAgreementScreen, () => agreementScreenOpen);
}

let simScreenId: string | null = null;
function subscribeSimScreen(callback: () => void) {
  window.addEventListener("az:sim-screen-changed", callback);
  return () => window.removeEventListener("az:sim-screen-changed", callback);
}
export function openSimScreen(id: string) {
  simScreenId = id;
  window.dispatchEvent(new CustomEvent("az:sim-screen-changed"));
}
export function closeSimScreen() {
  simScreenId = null;
  window.dispatchEvent(new CustomEvent("az:sim-screen-changed"));
}
export function useSimScreenId(): string | null {
  return useSyncExternalStore(subscribeSimScreen, () => simScreenId);
}

// 还款提醒通知设置面板——第八步新增，布尔开关，跟accountScreen/premiumScreen/termsScreen
// 同一个模式(第七步)。
let notifySheetOpen = false;
function subscribeNotifySheet(callback: () => void) {
  window.addEventListener("az:notify-sheet-changed", callback);
  return () => window.removeEventListener("az:notify-sheet-changed", callback);
}
export function openNotifySheet() {
  notifySheetOpen = true;
  window.dispatchEvent(new CustomEvent("az:notify-sheet-changed"));
}
export function closeNotifySheet() {
  notifySheetOpen = false;
  window.dispatchEvent(new CustomEvent("az:notify-sheet-changed"));
}
export function useNotifySheetOpen(): boolean {
  return useSyncExternalStore(subscribeNotifySheet, () => notifySheetOpen);
}

// 云备份——第十步(React迁移收尾)新增，布尔开关，跟accountScreen/premiumScreen/termsScreen/
// notifySheet/docsScreen同一个模式。这次不只是trigger-only(容器本身也搬进React)，但"哪个
// screen开着"这份状态归属跟其它screen完全一样，不需要跟docsScreen的useFiles()一样额外做
// 数据缓存——列表数据(BackupRecord[])是每次进screen时组件内部异步拉取的，不经过这里。
let backupScreenOpen = false;
function subscribeBackupScreen(callback: () => void) {
  window.addEventListener("az:backup-screen-changed", callback);
  return () => window.removeEventListener("az:backup-screen-changed", callback);
}
export function openBackupScreen() {
  backupScreenOpen = true;
  window.dispatchEvent(new CustomEvent("az:backup-screen-changed"));
}
export function closeBackupScreen() {
  backupScreenOpen = false;
  window.dispatchEvent(new CustomEvent("az:backup-screen-changed"));
}
export function useBackupScreenOpen(): boolean {
  return useSyncExternalStore(subscribeBackupScreen, () => backupScreenOpen);
}

// AI 债务助手——第十一步(React迁移收尾)新增，布尔开关，跟accountScreen/premiumScreen/
// termsScreen/notifySheet/docsScreen/backupScreen同一个模式。"哪个历史对话开着"这份状态
// (原来的aiHistorySheet)完全是AiScreen自己的组件内部状态，不需要在这里再加一对
// open/close——跟其它几个screen不同的是，历史对话sheet只会从AiScreen自己的header按钮
// 触发，不存在"被多棵独立React树共同触发"这个需要提到共享层的理由。
let aiScreenOpen = false;
function subscribeAiScreen(callback: () => void) {
  window.addEventListener("az:ai-screen-changed", callback);
  return () => window.removeEventListener("az:ai-screen-changed", callback);
}
export function openAiScreen() {
  aiScreenOpen = true;
  window.dispatchEvent(new CustomEvent("az:ai-screen-changed"));
}
export function closeAiScreen() {
  aiScreenOpen = false;
  window.dispatchEvent(new CustomEvent("az:ai-screen-changed"));
}
export function useAiScreenOpen(): boolean {
  return useSyncExternalStore(subscribeAiScreen, () => aiScreenOpen);
}

// 档案库——第九步(React迁移收尾)新增，布尔开关，跟accountScreen/premiumScreen/termsScreen/
// notifySheet同一个模式。
let docsScreenOpen = false;
function subscribeDocsScreen(callback: () => void) {
  window.addEventListener("az:docs-screen-changed", callback);
  return () => window.removeEventListener("az:docs-screen-changed", callback);
}
export function openDocsScreen() {
  docsScreenOpen = true;
  window.dispatchEvent(new CustomEvent("az:docs-screen-changed"));
}
export function closeDocsScreen() {
  docsScreenOpen = false;
  window.dispatchEvent(new CustomEvent("az:docs-screen-changed"));
}
export function useDocsScreenOpen(): boolean {
  return useSyncExternalStore(subscribeDocsScreen, () => docsScreenOpen);
}

// 档案库文件列表——window.__azBridge.getFiles()每次调用都会用.map()合成一份全新数组
// (不像getDebts()那样有同一个底层引用可比较，结构上更像getNotify())，如果直接把它当
// getSnapshot返回值会踩跟useNotify()当年同一个坑——useSyncExternalStore在每次渲染/commit
// 后都会重新调用一次getSnapshot做一致性检查，每次都拿到不同引用会被判定成"还在变"，陷入
// 无限重渲染循环。用跟useNotify()一样的按值(fingerprint)比较：每次都真的调用bridge拿最新
// 数据(这几个数组通常很小，重新算一遍成本可忽略)，只有内容真的变了才生成新的缓存数组，
// 没变就返回上一次缓存的同一个引用。这里特意不采用useDebts()那套"事件触发才标脏"的写法——
// 那套依赖"能比较底层引用是否变化"这个前提，getFiles()没有这个前提，按内容比较更简单可靠、
// 也不会有"事件没触发/漏触发时缓存永久陈旧"这个额外的失效模式。
function subscribeFiles(callback: () => void) {
  window.addEventListener("az:files-changed", callback);
  return () => window.removeEventListener("az:files-changed", callback);
}
let filesCache: FileItem[] | null = null;
let filesFingerprint = "";
function getFilesSnapshot(): FileItem[] {
  const fresh = window.__azBridge.getFiles();
  const fp = fresh.map((f) => [f.id, f.label, f.name, f.content, f.url].join(" ")).join("");
  if (fp !== filesFingerprint || !filesCache) {
    filesFingerprint = fp;
    filesCache = fresh;
  }
  return filesCache;
}
export function useFiles(): FileItem[] {
  return useSyncExternalStore(subscribeFiles, getFilesSnapshot);
}

// 多策略对比规划——2026-08-04新增，布尔开关，跟accountScreen/premiumScreen/termsScreen
// 同一个模式(全局只有一份，不需要"打开哪一个"这种参数——这个工具操作对象是全部在还
// 债务的组合，不是单笔债务，所以不像simScreen那样用id)。从"统计"tab的Conclusions.tsx
// (完全独立的另一棵React树，report入口)触发，跟其它从"我的"tab/AI banner触发进sheets
// 挂载点的screen是同一种"跨树触发"关系。
let strategyScreenOpen = false;
function subscribeStrategyScreen(callback: () => void) {
  window.addEventListener("az:strategy-screen-changed", callback);
  return () => window.removeEventListener("az:strategy-screen-changed", callback);
}
export function openStrategyScreen() {
  strategyScreenOpen = true;
  window.dispatchEvent(new CustomEvent("az:strategy-screen-changed"));
}
export function closeStrategyScreen() {
  strategyScreenOpen = false;
  window.dispatchEvent(new CustomEvent("az:strategy-screen-changed"));
}
export function useStrategyScreenOpen(): boolean {
  return useSyncExternalStore(subscribeStrategyScreen, () => strategyScreenOpen);
}
