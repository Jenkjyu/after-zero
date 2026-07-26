// 订阅页——第七步(React迁移收尾)从vanilla的#premiumScreen原样复刻。三张价卡的互斥选中态
// (premiumPlanSel)改成组件本地useState(不需要跨open持久化，vanilla原来也是每次打开都可能
// 停留在上次选中的那张，这里效果一致，因为组件是常驻挂载不会卸载重建)。兑换码输入框每次
// 打开都强制复位收起(跟vanilla openPremiumScreen()里的行为一致，避免上次展开残留)。
import { useEffect, useState } from "react";
import { closePremiumScreen, openTermsScreen, usePremium, usePremiumScreenOpen } from "../shared/state";

type Plan = "onetime" | "monthly" | "yearly";

export function PremiumScreen() {
  const isOpen = usePremiumScreenOpen();
  const premium = usePremium();
  const [plan, setPlan] = useState<Plan>("onetime");
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
          <div className="premium-hero-sub">解锁云备份、报表导出与 AI 债务顾问</div>
        </div>

        <div className="pf-list">
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.5-8.98A5.5 5.5 0 0 1 17 8.06 4 4 0 0 1 17 18H7z" /></svg></div>
            <div className="pf-text"><div className="pf-title">云备份</div><div className="pf-desc">手动创建云端备份，每条记录都能单独恢复，换手机也能找回数据</div></div></div>
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z" /></svg></div>
            <div className="pf-text"><div className="pf-title">AI 债务优化报告</div><div className="pf-desc">雪球法 / 雪崩法分析，告诉你优先还哪笔最省钱</div></div></div>
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v11H8l-4 4z" /></svg></div>
            <div className="pf-text"><div className="pf-title">AI 智能问答</div><div className="pf-desc">针对你自己的债务数据直接提问，随问随答</div></div></div>
          <div className="pf-row"><div className="pf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M11 20V4M18 20v-7" /></svg></div>
            <div className="pf-text"><div className="pf-title">高级统计报表导出</div><div className="pf-desc">把报表导出成 PDF / Excel，方便存档与分享（图表查看免费）</div></div></div>
        </div>

        <div id="premiumPrice">
          <div className="price-grid">
            <button type="button" className={"price-card" + (plan === "onetime" ? " selected" : "")} onClick={() => setPlan("onetime")}>
              <span className="pc-badge">永久解锁</span>
              <div className="pc-amt num">¥98</div>
              <div className="pc-period">一次性付费，永久使用</div>
            </button>
          </div>
          <div className="price-grid two">
            <button type="button" className={"price-card" + (plan === "monthly" ? " selected" : "")} onClick={() => setPlan("monthly")}>
              <div className="pc-amt num">¥5.9</div>
              <div className="pc-period">/ 月</div>
              <div className="pc-note">按月订阅，随时可取消</div>
            </button>
            <button type="button" className={"price-card" + (plan === "yearly" ? " selected" : "")} onClick={() => setPlan("yearly")}>
              <span className="pc-badge">省 29%</span>
              <div className="pc-amt num">¥50</div>
              <div className="pc-period">/ 年</div>
              <div className="pc-note">折合 ¥4.2/月</div>
            </button>
          </div>
        </div>

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
        <div className="footnote">开通即表示你同意我们的<button type="button" className="terms-link" onClick={openTermsScreen}>《购买者服务条款》</button>。永久买断一次付费、长期使用；月付/年付为订阅，除非提前取消否则到期自动续订，费用从你的应用商店账户中扣除，可随时在应用商店的订阅管理中取消。</div>
      </div>
    </div>
  );
}
