// 订阅vanilla那份共享数据——用React 18内置的useSyncExternalStore(专门为"订阅一个React外部
// 的可变数据源"设计的官方API)，不手写容易出错的订阅/取消订阅+强制重渲染逻辑。见CLAUDE.md
// "React 迁移"一节里__azBridge/az:state-changed这套桥接契约的说明。
import { useSyncExternalStore } from "react";
import type { Account, Debt, Premium } from "../types";

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
