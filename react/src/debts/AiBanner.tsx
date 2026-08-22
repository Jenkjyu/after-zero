// AI banner："灵动胶囊"入口，未开通Premium时发光效果全部关掉、图标降级成静态灰色——
// 见AGENTS.md"在还债务主页视觉改版"一节。这里只是把renderAIBanner()的判断逻辑搬过来，
// 图标/描边扫光/呼吸光晕全部是既有CSS(.ai-banner/.is-ai/.wand等)驱动，不需要新写样式。
import type { Premium } from "../types";

export interface AiBannerProps {
  premium: Premium;
  onClick: () => void;
}

export function AiBanner({ premium, onClick }: AiBannerProps) {
  const ai = window.hasPremium(premium);
  return (
    <button type="button" className={"ai-banner" + (ai ? " is-ai" : "")} id="aiBannerBtn" onClick={onClick}>
      <div className="ai-banner-ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M3 8A2.3 2.3 0 0 1 5.3 5.7h7A2.3 2.3 0 0 1 14.6 8v5.5A2.3 2.3 0 0 1 12.3 15.8H8.3l-3.6 2.7a.45.45 0 0 1-.72-.36V15.8A2.3 2.3 0 0 1 1.7 13.5"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <g className="wand" fill="currentColor">
            <path d="M21 7L10 0" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            <path d="M10 -3.15L11.05 -1.05L13.15 0L11.05 1.05L10 3.15L8.95 1.05L6.85 0L8.95 -1.05Z" />
            <circle cx={12.6} cy={-2.4} r={0.75} />
            <circle cx={7.2} cy={1.8} r={0.6} />
          </g>
        </svg>
      </div>
      <div className="ai-banner-text">
        <div className="ai-banner-title" id="aiBannerTitle">AI 识图录入</div>
        <div className="ai-banner-sub" id="aiBannerSub">
          {ai ? "多张还款计划截图生成一份可编辑草稿" : "Premium 买断包含 25 次识图录入额度"}
        </div>
      </div>
      <svg className="account-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}
