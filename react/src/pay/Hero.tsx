// "最近还款日"hero卡+通知铃铛——直译自vanilla bellHtml()+renderPayHero()（www/index.html）。
// 铃铛不再需要id+事件委托+updateBellUI()那套incremental toggle，React靠notifyEnabled
// prop声明式驱动.on类，桥接getNotify()经过useNotify()（见shared/state.ts）保证响应式更新。
import type { PayItem } from "./App";

export interface HeroProps {
  soonest: PayItem | null;
  notifyEnabled: boolean;
  onBellClick(): void;
}

function Bell({ on, onClick }: { on: boolean; onClick(): void }) {
  return (
    <button type="button" className={"pay-hero-bell" + (on ? " on" : "")} aria-label="还款提醒通知设置" onClick={onClick}>
      <svg className="ic-outline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <svg className="ic-filled" viewBox="0 0 24 24">
        <path fill="currentColor" d="M12 2a6 6 0 0 0-6 6c0 7-3 9-3 9h18s-3-2-3-9a6 6 0 0 0-6-6z" />
        <path fill="currentColor" d="M9.5 21a2.5 2.5 0 0 0 5 0h-5z" />
      </svg>
    </button>
  );
}

export function Hero({ soonest, notifyEnabled, onBellClick }: HeroProps) {
  if (!soonest) {
    return (
      <div className="pay-hero empty">
        <div className="pay-hero-top">
          <div className="pay-hero-label">最近还款日</div>
          <Bell on={notifyEnabled} onClick={onBellClick} />
        </div>
        <div className="pay-hero-empty">
          <div className="pay-hero-empty-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div className="pay-hero-empty-title">全部结清</div>
          <div className="pay-hero-empty-sub">暂无待还款项</div>
        </div>
      </div>
    );
  }
  const { d, next, diff, amount } = soonest;
  return (
    <div className={"pay-hero " + window.urgencyTier(diff)}>
      <div className="pay-hero-top">
        <div className="pay-hero-label">最近还款日</div>
        <Bell on={notifyEnabled} onClick={onBellClick} />
      </div>
      <div className="pay-hero-row">
        <div className="pay-hero-date">
          <span className="pay-hero-daynum num">{next.getMonth() + 1}月{next.getDate()}日</span>
          <span className="pay-hero-rel">{window.relLabel(diff)}</span>
        </div>
        <div className="pay-hero-amt num">¥{window.fmt(amount)}</div>
      </div>
      <div className="pay-hero-name">{d.name}</div>
    </div>
  );
}
