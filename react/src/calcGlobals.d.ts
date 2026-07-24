// www/js/calc.js 里的39个纯函数是普通顶层function声明(不在任何IIFE里)，加载后会挂到window上——
// 这份文件只是给它们补一层环境类型声明，方便React代码里用 window.recompute(d) 这种显式写法调用时
// 有类型提示。calc.js本身不需要、也不应该改成TS/ESM——它继续是index.html那套"经典script、全局
// 作用域共享"的既有约定的一部分，这里只是"从React这一侧看过去，这些全局函数长什么样"的说明。
//
// 只声明"在还债务"React页面实际会调用的几个，不是calc.js全部39个——够用即可，见CLAUDE.md
// "React 迁移"一节。
import type { Debt, DebtSummary, Premium, SortKey } from "./types";

declare global {
  interface Window {
    __azBridge: import("./types").AzBridge;
    recompute(d: Debt): void;
    summarizeDebts(debts: Debt[]): DebtSummary;
    hasPremium(premium: Premium): boolean;
    premiumLabel(premium: Premium): string | null;
    // sorts是{排序名: 取值函数}的映射——calc.js的detectMatchingSort()对键名不关心具体是哪个
    // SortKey子集，只是Object.keys()遍历，用Record<string,...>而不是Record<SortKey,...>，
    // 这样调用方传"不含custom"的DEBT_SORTS(见useDebtSort.ts)不需要额外补一个"custom"键。
    detectMatchingSort(activeInOrder: Debt[], sorts: Record<string, (d: Debt) => number>): SortKey;
    isActive(d: Debt): boolean;
    rateClass(r: number): string;
    fmt(n: number): string;
    // 反向桥接：vanilla的__handleBackButton硬件返回键"最上层先关"优先级链第一条检查这个——
    // React挂载"在还债务"页时注册，卸载时删除，见 react/src/debts/DebtList.tsx。
    __azDebtsBack?: () => boolean;
  }
}

export {};
