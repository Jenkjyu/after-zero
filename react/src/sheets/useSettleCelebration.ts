// 付费触发时机——2026-08-04新增。现有的Premium入口全部是"用户主动点"（"我的"页、
// AI banner、多策略对比/历程里的按钮），没有一个是App在"价值已经被证明的那一刻"主动
// 提起的。刚还清一笔债务是这个App里最强的"价值已证明"时刻——用户刚亲眼看着这个App
// 帮自己把一笔债务追到了零，这时候提一句"要不要支持一下"，比任何时候都更有说服力，
// 也不是硬广告(不是"你还没买"这种缺失感框架，是紧跟着一次真实成就的邀请)。
//
// 复用confirmAsync这个全App共用的确认弹窗(不新建"精美灵动"的专属UI)——AI额度弹窗那次
// 花心思做视觉是因为用户明确要求"类似Telegram"的观感；这里没有类似要求，是一个低频
// (每笔债务一生只会真正结清一次)、低强度的邀请，用现成基础设施更合适，不是每个提示
// 都要建一套新组件。
//
// 挂在react/src/sheets/App.tsx(常驻挂载、所有tab共用)，不是某个具体tab——债务可能从
// "债务"tab的左滑/DetailSheet的"结清"按钮/"提前结清"任意一条路径变成已结清，这个hook
// 只关心debts数组本身的变化，不关心是谁触发的。
import { useEffect, useRef } from "react";
import { openPremiumScreen, useDebts, usePremium } from "../shared/state";

export function useSettleCelebration() {
  const debts = useDebts();
  const premium = usePremium();
  // null表示"还没有基准快照"——只在挂载后第一次运行时把当前已结清的债务id记下来当基准，
  // 不对它们触发庆祝(那些不是"刚刚发生"的，是这次打开App之前就已经结清的)。
  const seenSettledRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const currentSettled = new Set(debts.filter((d) => d.settled).map((d) => d.id));
    if (seenSettledRef.current === null) {
      seenSettledRef.current = currentSettled;
      return;
    }
    const prev = seenSettledRef.current;
    seenSettledRef.current = currentSettled;
    if (window.hasPremium(premium)) return; // 已经是会员，不需要再邀请

    const justSettled = debts.find((d) => d.settled && !prev.has(d.id));
    if (!justSettled) return;
    window.__azBridge.confirmAsync(
      "🎉 还清一笔了！",
      `「${justSettled.name}」已经还清，你又往"归零"走近了一步。如果 After Zero 帮到了你，可以看看 Premium——解锁云备份、AI 分析和更多功能。`
    ).then((ok) => { if (ok) openPremiumScreen(); });
  }, [debts, premium]);
}
