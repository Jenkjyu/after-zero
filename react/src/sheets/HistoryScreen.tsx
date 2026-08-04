// 还债历程——2026-08-04新增，全局布尔开关，跟StrategyCompareScreen同一个模式(操作对象是
// 全部债务的历史，不是单笔，不需要id参数)。入口在"统计"tab(见 react/src/report/HistoryTeaser.tsx)。
//
// 基础时间线完全免费(任何人点进来都能看全部)，只有"生成分享卡片"这一个按钮是Premium专属——
// 门禁逻辑照抄ExportMenu.tsx/StrategyCta.tsx那套，见CLAUDE.md"多策略对比规划"一节旁边
// 新增的"还债历程"小节：这是刻意维持"零成本功能免费"这条原则的做法，付费的不是"看到
// 自己的历程"这件事本身，是"生成一张能分享出去的精致呈现"这个增量价值——跟"报表导出"
// (数据免费，导出成PDF/Excel收费)是同一类边界划法。
import { useEffect, useMemo, useState } from "react";
import { closeHistoryScreen, useDebts, useHistoryScreenOpen, usePremium, openPremiumScreen } from "../shared/state";

export function HistoryScreen() {
  const isOpen = useHistoryScreenOpen();
  const debts = useDebts();
  const premium = usePremium();
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    window.__azHistoryScreenBack = () => {
      if (isOpen) { closeHistoryScreen(); return true; }
      return false;
    };
    return () => { delete window.__azHistoryScreenBack; };
  }, [isOpen]);

  // 最近的事件排最上面(倒序)——跟分享卡片(www/index.html的buildHistoryShareSvg)显示顺序一致。
  const events = useMemo(() => window.buildHistoryEvents(debts).slice().reverse(), [debts]);

  async function onGenerate() {
    if (generating) return;
    // ⚠️没开通时先关掉自己再跳订阅页，不是叠在上面——两者都是.subpage(同一z-index)，
    // "从已打开的subpage内部再打开另一个subpage"需要额外的JSX挂载顺序+返回键链顺序
    // 才能正确叠放(见App.tsx顶部注释里About→Account那条先例)，这里判断这层复杂度不
    // 值得为一个次要按钮引入，直接切换更简单也更不容易出返回键顺序的错。
    if (!window.hasPremium(premium)) { closeHistoryScreen(); openPremiumScreen(); return; }
    setGenerating(true);
    try {
      await window.__azBridge.generateHistoryShareCard();
    } catch {
      window.__azBridge.toast("生成失败，请重试");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className={"subpage" + (isOpen ? " open" : "")} id="historyScreen">
      <div className="subpage-header">
        <button type="button" className="subpage-back" aria-label="返回" onClick={closeHistoryScreen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="subpage-title">还债历程</div>
        <div className="subpage-header-spacer" />
      </div>
      <div className="subpage-body">
        <button type="button" className="btn primary" style={{ width: "100%", marginBottom: 16 }} onClick={onGenerate} disabled={generating}>
          {generating ? "生成中…" : "生成分享卡片"}
        </button>

        {events.length === 0 ? (
          <div className="history-empty">还没有可回顾的记录——每还完一笔钱，这里就会多一条。</div>
        ) : (
          <div>
            {events.map((ev, i) => (
              <div className="history-event-row" key={i}>
                {ev.type === "settled" ? (
                  <span className="history-event-ic settled" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  </span>
                ) : (
                  <span className="history-event-ic milestone" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3L21.5 9l-4.8 4.5 1.3 6.7L12 17l-6 3.2 1.3-6.7L2.5 9l6.6-.7L12 2z" /></svg>
                  </span>
                )}
                <div className="history-event-text">
                  <div className="history-event-title">
                    {ev.type === "settled" ? `${ev.name} 已还清` : `累计已还突破 ¥${window.fmt(ev.amount)}`}
                  </div>
                  <div className="history-event-date">{ev.date}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="footnote" style={{ textAlign: "left", marginTop: 16 }}>
          只记录两类事件：一笔债务被还清的那一刻，和累计已还金额跨过整数关口（1万/3万/5万/10万…）的那一刻——不是逐期流水账。
        </div>
      </div>
    </div>
  );
}
