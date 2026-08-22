// 订阅页——第七步(React迁移收尾)从vanilla的#premiumScreen原样复刻。2026-08-04去掉了月付/
// 年付两张价卡，只保留买断——面向负债人群的产品判断，一次性买断比按月订阅心理阻力小得多
// (完整理由见PROGRESS.md 2026-08-04那条)。价卡不再有互斥选中态(只有一个选项，没有"选"这个
// 动作)，原来的premiumPlanSel/plan useState一并删除。兑换码输入框每次打开都强制复位收起
// (跟vanilla openPremiumScreen()里的行为一致，避免上次展开残留)。
import { useEffect, useState } from "react";
import { closePremiumScreen, openTermsScreen, usePremium, usePremiumScreenOpen } from "../shared/state";

export function PremiumScreen() {
  const isOpen = usePremiumScreenOpen();
  const premium = usePremium();
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemCode, setRedeemCodeInput] = useState("");

  useEffect(() => {
    if (isOpen) { setRedeemOpen(false); setRedeemCodeInput(""); }
  }, [isOpen]);

  useEffect(() => {
    window.__azPremiumScreenBack = () => {
      if (isOpen) { closePremiumScreen(); return true; }
      return false;
    };
    return () => { delete window.__azPremiumScreenBack; };
  }, [isOpen]);

  async function onSubscribe() {
    await window.__azBridge.buyPremium();
  }
  async function onRestore() {
    await window.__azBridge.restorePremium();
  }
  async function onApplyRedeem() {
    const code = redeemCode.trim();
    if (!code) { window.__azBridge.toast("请输入兑换码"); return; }
    const ok = await window.__azBridge.redeemCode(code);
    if (!ok) return;
    setRedeemCodeInput(""); setRedeemOpen(false);
    window.__azBridge.toast("兑换成功，已解锁 Premium");
  }

  const label = window.premiumLabel(premium);
  const isMember = !!label;
  const isTrial = premium?.premium?.method === "trial";
  const heroSub = isTrial
    ? "当前体验期含 3 次 AI 识图额度"
    : isMember
      ? "已永久解锁全部功能，含 25 次 AI 识图额度"
      : "首次登录可体验 7 天，含 3 次 AI 识图";

  return (
    <div className={"subpage" + (isOpen ? " open" : "")} id="premiumScreen">
      <div className="subpage-header">
        <button type="button" className="subpage-back" aria-label="返回" onClick={closePremiumScreen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="subpage-title">Premium</div>
        <div className="subpage-header-spacer" />
      </div>
      <div className="subpage-body">
        <div className="premium-hero">
          <div className="premium-hero-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.9 6.3L21.5 9l-4.8 4.5 1.3 6.7L12 17l-6 3.2 1.3-6.7L2.5 9l6.6-.7L12 2z" /></svg>
          </div>
          <div className="premium-hero-title">{isMember ? "Premium 会员" : "解锁完整 After Zero"}</div>
          <div className="premium-hero-sub">{heroSub}</div>
        </div>

        <div className="pf-list">
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg></div>
            <div className="pf-text"><div className="pf-title">还款日与提醒</div><div className="pf-desc">每期还款清晰可见，重要日期及时提醒</div></div></div>
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V11M12 19V5M20 19v-7" /></svg></div>
            <div className="pf-text"><div className="pf-title">统计债务报告</div><div className="pf-desc">看清还款进度、未来压力和负债结构</div></div></div>
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19l6-6 4 4 6-8" /><path d="M14 6h6v6" /></svg></div>
            <div className="pf-text"><div className="pf-title">多策略对比规划</div><div className="pf-desc">雪球、雪崩、自定义顺序，一眼看懂差异</div></div></div>
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.5-8.98A5.5 5.5 0 0 1 17 8.06 4 4 0 0 1 17 18H7z" /></svg></div>
            <div className="pf-text"><div className="pf-title">云备份</div><div className="pf-desc">多份备份，换手机也能找回</div></div></div>
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /><path d="M3 7l1.6-3.2A1 1 0 0 1 5.5 3h13a1 1 0 0 1 .9.55L21 7" /><path d="M10 12h4" /></svg></div>
            <div className="pf-text"><div className="pf-title">档案库</div><div className="pf-desc">合同、回执等重要文件随手管理</div></div></div>
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v7M12 14v7M5 10l7-7 7 7M5 14l7 7 7-7" /></svg></div>
            <div className="pf-text"><div className="pf-title">备份文件导入导出</div><div className="pf-desc">完整备份，随时迁移恢复</div></div></div>
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5" /></svg></div>
            <div className="pf-text"><div className="pf-title">AI 识图录入</div><div className="pf-desc">截图识别还款计划，快速生成债务草稿</div></div></div>
        </div>

        <div id="premiumPrice">
          <div className="price-grid">
            <div className="price-card">
              <span className="pc-badge">永久解锁</span>
              <div className="pc-price-row">
                <span className="pc-amt num">¥28</span>
              </div>
              <div className="pc-period">一次性付费，永久解锁；包含 25 次 AI 识图录入额度</div>
            </div>
          </div>
        </div>

        <div className="data-actions premium-actions" style={{ marginTop: 4 }}>
          <button type="button" className="btn primary" onClick={onSubscribe}>{isMember ? "已开通 Premium" : "¥28 永久解锁"}</button>
          <button type="button" className="btn ghost" onClick={onRestore}>恢复购买</button>
        </div>
        <div className="redeem-row">
          <button type="button" className="redeem-toggle" onClick={() => setRedeemOpen((v) => !v)}>我有兑换码</button>
          {redeemOpen ? (
            <div className="redeem-input-wrap" style={{ display: "flex" }}>
              <input type="text" placeholder="输入兑换码" autoComplete="off" value={redeemCode} onChange={(e) => setRedeemCodeInput(e.target.value)} />
              <button type="button" className="btn primary" onClick={onApplyRedeem}>兑换</button>
            </div>
          ) : null}
        </div>
        <div className="footnote">开通即表示你同意我们的<button type="button" className="terms-link" onClick={openTermsScreen}>《会员服务协议》</button>。¥28 为一次性买断价，不会自动续费；其中 AI 识图录入为 25 次额度，多张图组成一笔并成功生成草稿时仅消耗 1 次。已购买可在 iPhone 通过 Apple 恢复购买，Android 入口将在接入 Google Play 后开放。</div>
      </div>
    </div>
  );
}
