// www/js/calc.js 里的39个纯函数是普通顶层function声明(不在任何IIFE里)，加载后会挂到window上——
// 这份文件只是给它们补一层环境类型声明，方便React代码里用 window.recompute(d) 这种显式写法调用时
// 有类型提示。calc.js本身不需要、也不应该改成TS/ESM——它继续是index.html那套"经典script、全局
// 作用域共享"的既有约定的一部分，这里只是"从React这一侧看过去，这些全局函数长什么样"的说明。
//
// 只声明已迁移的React页面实际会调用的几个，不是calc.js全部39个——够用即可，见CLAUDE.md
// "React 迁移"一节。
import type { Debt, DebtSummary, Premium, ReportData, SortKey } from "./types";

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
    // 还款日tab用：dueBucket是互斥分段(给"全部"视图分组用)，urgencyTier/relLabel是hero卡+
    // 列表卡片的严重度/相对时间文案，offsetLabel是通知规则列表里"提前N天"这种文案，
    // parseDate/today0是日期计算。
    dueBucket(diff: number): "overdue" | "week" | "month" | "later";
    urgencyTier(diff: number): "overdue" | "crit" | "warn" | "dim";
    relLabel(diff: number): string;
    offsetLabel(n: number): string;
    parseDate(s: string): Date | null;
    today0(): Date;
    // 统计tab用：computeReportData是2/3/4/5四张图表+KPI共同的数据源，truncateLabel给
    // 余额对比条形图的债务名做截断。
    computeReportData(debts: Debt[]): ReportData;
    truncateLabel(s: string, n: number): string;
    // 反向桥接：vanilla的__handleBackButton硬件返回键"最上层先关"优先级链第一条检查这个——
    // React挂载"在还债务"页时注册，卸载时删除，见 react/src/debts/DebtList.tsx。
    __azDebtsBack?: () => boolean;
  }
}

export {};
