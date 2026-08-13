// "升级 Premium"入口卡——文案/class逻辑原样复刻自vanilla已删除的renderPremiumEntryCard()
// （www/index.html曾经的实现，见AGENTS.md"React 迁移"一节"我的"tab那部分）。无门禁，
// 点击直接进#premiumScreen，未开通/已开通都能进（已开通显示的是会员详情）。
import type { Premium } from "../types";
import { openPremiumScreen } from "../shared/state";

export interface PremiumEntryCardProps {
  premium: Premium;
}

export function PremiumEntryCard({ premium }: PremiumEntryCardProps) {
  const isMember = window.hasPremium(premium);

  return (
    <div className={"data-card entry-card premium-entry-card" + (isMember ? " is-member" : "")}>
      <button type="button" className="entry-row" onClick={openPremiumScreen}>
        <div className="entry-ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l2.9 6.3L21.5 9l-4.8 4.5 1.3 6.7L12 17l-6 3.2 1.3-6.7L2.5 9l6.6-.7L12 2z" />
          </svg>
        </div>
        <div className="entry-text">
          <div className="entry-title">{isMember ? "Premium 会员" : "升级 Premium"}</div>
          <div className="entry-sub">{isMember ? "查看会员详情" : "云备份 · 报表导出 · AI 债务助手"}</div>
        </div>
        <svg className="account-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
