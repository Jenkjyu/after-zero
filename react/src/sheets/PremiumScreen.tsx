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

  function onSubscribe() {
    window.__azBridge.confirmAsync("暂未开放真实支付", "After Zero 还未上架应用商店，支付功能尚未接入。上架后即可在此完成开通——敬请期待。");
  }
  function onApplyRedeem() {
    const code = redeemCode.trim();
    if (!code) { window.__azBridge.toast("请输入兑换码"); return; }
    const tier = window.__azBridge.redeemCode(code);
    if (!tier) { window.__azBridge.toast("兑换码无效"); return; }
    setRedeemCodeInput(""); setRedeemOpen(false);
    window.__azBridge.toast("兑换成功，已解锁 Premium");
  }

  void premium; // 目前订阅页本身不需要按premium状态改变展示(未来如"已开通"态可以在这里加)

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
          <div className="premium-hero-title">升级你的 After Zero</div>
          <div className="premium-hero-sub">解锁云备份、AI 债务助手与更多功能</div>
        </div>

        <div className="pf-list">
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.5-8.98A5.5 5.5 0 0 1 17 8.06 4 4 0 0 1 17 18H7z" /></svg></div>
            <div className="pf-text"><div className="pf-title">云备份</div><div className="pf-desc">手动创建云端备份，每条记录都能单独恢复，换手机也能找回数据</div></div></div>
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z" /></svg></div>
            <div className="pf-text"><div className="pf-title">AI 债务分析报告</div><div className="pf-desc">雪球法 / 雪崩法分析，告诉你优先还哪笔最省钱</div></div></div>
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v11H8l-4 4z" /></svg></div>
            <div className="pf-text"><div className="pf-title">AI 智能问答</div><div className="pf-desc">针对你自己的债务数据直接提问，随问随答</div></div></div>
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19l6-6 4 4 6-8" /><path d="M14 6h6v6" /></svg></div>
            <div className="pf-text"><div className="pf-title">多策略对比规划</div><div className="pf-desc">雪球法/雪崩法/自定义顺序并排对比，哪种最省利息一眼看出</div></div></div>
        </div>

        <div id="premiumPrice">
          <div className="price-grid">
            <div className="price-card">
              <span className="pc-badge">永久解锁</span>
              <div className="pc-price-row">
                <span className="pc-amt num">¥49</span>
              </div>
              <div className="pc-period">一次性付费，永久使用，不再另外收费</div>
            </div>
          </div>
        </div>
        {/* 朴素陈述"为什么收这个钱"，不做营销话术——这个App的AI额度弹窗已经在用同一套
            "坦诚说清楚成本"的口吻跟用户说话，订阅页不该是App里唯一还在打折促销的地方。
            云备份/AI是真实服务器成本，其余(多策略对比/历程等)是纯客户端计算、零服务器
            成本，诚实起见不笼统说"这些功能都很贵"，只说云备份/AI是真花钱的、其余是花
            时间做的——跟"限时优惠"这种永不过期的假锚点相比，这句话经得起用户反复回来看。 */}
        <p className="footnote" style={{ textAlign: "left" }}>
          云备份和 AI 分析对我们来说有真实的服务器成本，其余功能是我们花时间做出来的——一次性 ¥49，全部解锁，用多久都不用再付。
        </p>

        <div className="data-actions" style={{ marginTop: 4 }}>
          <button type="button" className="btn primary" onClick={onSubscribe}>开通 Premium</button>
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
        <div className="footnote">开通即表示你同意我们的<button type="button" className="terms-link" onClick={openTermsScreen}>《会员服务协议》</button>。目前应用内价格为占位展示，尚未开通真实支付渠道；正式开通后，扣款、续订与取消方式将以届时接入的支付渠道为准。</div>
      </div>
    </div>
  );
}
