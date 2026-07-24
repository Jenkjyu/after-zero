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

export function useDebts(): Debt[] {
  return useSyncExternalStore(subscribe, () => window.__azBridge.getDebts());
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
