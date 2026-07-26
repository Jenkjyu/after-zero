// 订阅vanilla那份共享数据——用React 18内置的useSyncExternalStore(专门为"订阅一个React外部
// 的可变数据源"设计的官方API)，不手写容易出错的订阅/取消订阅+强制重渲染逻辑。见CLAUDE.md
// "React 迁移"一节里__azBridge/az:state-changed这套桥接契约的说明。
// 这几个hook本身跟"在还债务"页无关，是所有React tab(在还债务/还款日/统计)共用的通用逻辑，
// 所以放在shared/而不是某个具体tab的目录下。
import { useSyncExternalStore } from "react";
import type { Account, Debt, NotifySettings, Premium } from "../types";

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

export function usePremium(): Premium {
  return useSyncExternalStore(subscribe, () => window.__azBridge.getPremium());
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
// 自己的UI状态(见CLAUDE.md"React 迁移"一节里detailSheet那部分)：openDetailSheet(i)/
// closeDetailSheet()不经过window.__azBridge，是"在还债务"/"还款日"两棵独立React树(各自的
// DebtCard.tsx/PayRow.tsx)跟常驻挂载的第5棵树(react/src/sheets/)之间共享的状态，用独立的
// az:detail-sheet-changed事件通知——故意不复用az:state-changed，因为"哪个sheet开着"和
// "debts/premium/account数据变了"是两件不同的事，混在一起会让不相关的订阅者收到无意义的通知。
let detailSheetIndex: number | null = null;
function subscribeDetailSheet(callback: () => void) {
  window.addEventListener("az:detail-sheet-changed", callback);
  return () => window.removeEventListener("az:detail-sheet-changed", callback);
}
export function openDetailSheet(i: number) {
  detailSheetIndex = i;
  window.dispatchEvent(new CustomEvent("az:detail-sheet-changed"));
}
export function closeDetailSheet() {
  detailSheetIndex = null;
  window.dispatchEvent(new CustomEvent("az:detail-sheet-changed"));
}
export function useDetailSheetIndex(): number | null {
  return useSyncExternalStore(subscribeDetailSheet, () => detailSheetIndex);
}

// "哪个edit sheet开着"——跟上面detailSheetIndex完全同一个模式(React自己拥有的UI状态，不经过
// window.__azBridge)，独立的az:edit-sheet-changed事件(不复用az:detail-sheet-changed，理由
// 同上："哪个sheet开着"这类状态各自独立成事件，别人不关心的sheet开关不该收到无意义的通知)。
// null=关闭，-1=新增债务模式(对应vanilla原来editIndex=-1的含义)，>=0=编辑debts[i]。
let editSheetIndex: number | null = null;
function subscribeEditSheet(callback: () => void) {
  window.addEventListener("az:edit-sheet-changed", callback);
  return () => window.removeEventListener("az:edit-sheet-changed", callback);
}
export function openEditSheet(i: number) {
  editSheetIndex = i;
  window.dispatchEvent(new CustomEvent("az:edit-sheet-changed"));
}
export function closeEditSheet() {
  editSheetIndex = null;
  window.dispatchEvent(new CustomEvent("az:edit-sheet-changed"));
}
export function useEditSheetIndex(): number | null {
  return useSyncExternalStore(subscribeEditSheet, () => editSheetIndex);
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

// WeakMap给每个debt对象懒生成一个稳定的React key——commitReorder只是重排同一批对象引用的
// 顺序(不克隆)，只要对象引用不变(拖拽重排属于这种情况)，key就稳定；debts被整体替换成新对象时
// (备份恢复/导入JSON)，WeakMap查不到旧key，自然生成新key——这正是这种情况下应有的行为，不需要
// 给debt数据模型加真正的id字段(那是一个更大的架构决定，不在这次范围内)。
const keyMap = new WeakMap<Debt, string>();
let nextKeyId = 0;
export function keyFor(d: Debt): string {
  let k = keyMap.get(d);
  if (!k) { k = "d" + nextKeyId++; keyMap.set(d, k); }
  return k;
}
