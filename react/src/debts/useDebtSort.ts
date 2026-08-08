// 排序方式(含"自定义")的所有权这次迁移整体挪到React——现有代码里没有其它tab读debtSort
// (还款日用dueBucket分组，统计不依赖它)，所以直接读写localStorage["debt-manager-sort-v1"]，
// 不需要经过vanilla的setDebtSort/DEBT_SORTS。vanilla侧对应的debtSort/setDebtSort/SORT_KEY
// 已随本次迁移删除，不留一份不再被使用的死代码。见AGENTS.md"React 迁移"一节。
import { useCallback, useState } from "react";
import type { Debt, SortKey } from "../types";

const SORT_KEY = "debt-manager-sort-v1";
const DEFAULT_SORT: SortKey = "rate-desc";

// 跟vanilla原来的DEBT_SORTS一字不差地照抄——{排序名: 取值函数}的映射，传给calc.js的
// detectMatchingSort()用来判断拖拽重排后的新顺序是不是恰好匹配某个预设。
export const DEBT_SORTS: Record<Exclude<SortKey, "custom">, (d: Debt) => number> = {
  "rate-desc": (d) => -(+d.rate || 0),
  "rate-asc": (d) => +d.rate || 0,
  "orig-desc": (d) => -(+(d.original || 0)),
  "orig-asc": (d) => +(d.original || 0),
  "bal-desc": (d) => -(+d.balance || 0),
  "bal-asc": (d) => +d.balance || 0,
  "monthly-desc": (d) => -(+d.monthly || 0),
  "monthly-asc": (d) => +d.monthly || 0,
  "terms-desc": (d) => -(+d.terms || 0),
  "terms-asc": (d) => +d.terms || 0,
};

function isValidSort(v: string | null): v is SortKey {
  return !!v && (v === "custom" || v in DEBT_SORTS);
}

export function useDebtSort(): [SortKey, (v: SortKey) => void] {
  const [sort, setSort] = useState<SortKey>(() => {
    let v: string | null = null;
    try { v = localStorage.getItem(SORT_KEY); } catch { /* ignore */ }
    return isValidSort(v) ? v : DEFAULT_SORT;
  });
  const update = useCallback((v: SortKey) => {
    const next = isValidSort(v) ? v : DEFAULT_SORT;
    setSort(next);
    try { localStorage.setItem(SORT_KEY, next); } catch { /* ignore */ }
  }, []);
  return [sort, update];
}
