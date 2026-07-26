// 账户详情页——第七步(React迁移收尾)从vanilla的#accountScreen原样复刻。原来的
// renderAccountDetail()整段搬进这里，直接读useAccount()/usePremium()而不是vanilla手动写
// #acctDetailAvatar等DOM节点。"退出登录"没有确认弹窗(照抄vanilla wxLogoutBtn原来的行为，
// 没有ask())，"注销账户"走confirmAsync确认后调用桥接的deleteAccount()。
import { closeAccountScreen, useAccount, usePremium, useAccountScreenOpen } from "../shared/state";
import { useEffect } from "react";

export function AccountScreen() {
  const isOpen = useAccountScreenOpen();
  const account = useAccount();
  const premium = usePremium();

  useEffect(() => {
    window.__azAccountScreenBack = () => {
      if (isOpen) { closeAccountScreen(); return true; }
      return false;
    };
    return () => { delete window.__azAccountScreenBack; };
  }, [isOpen]);

  function onLogout() {
    window.__azBridge.wxLogout();
    closeAccountScreen();
  }
  async function onDeleteAccount() {
    const ok = await window.__azBridge.confirmAsync(
      "注销账户",
      "注销后账号数据将从服务器永久删除，且需要重新微信登录才能再次使用。此操作不可撤销，确定继续吗？"
    );
    if (!ok) return;
    const success = await window.__azBridge.deleteAccount();
    if (success) closeAccountScreen();
  }

  return (
    <div className={"subpage" + (isOpen ? " open" : "")} id="accountScreen">
      <div className="subpage-header">
        <button type="button" className="subpage-back" aria-label="返回" onClick={closeAccountScreen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="subpage-title">账户</div>
        <div className="subpage-header-spacer" />
      </div>
      <div className="subpage-body">
        <div className="data-card">
          <div className="account-detail-row"><span className="account-detail-label">头像</span><img className="account-avatar" alt="" src={(account && account.avatarUrl) || ""} /></div>
          <div className="account-detail-row"><span className="account-detail-label">昵称</span><span className="account-detail-value">{(account && account.nickname) || ""}</span></div>
          <div className="account-detail-row"><span className="account-detail-label">会员</span><span className="account-detail-value">{window.premiumLabel(premium) || "普通用户"}</span></div>
          <div className="account-detail-row"><span className="account-detail-label">微信绑定</span><span className="account-detail-value">已绑定</span></div>
        </div>
        <div className="data-actions" style={{ marginTop: 16 }}><button type="button" className="btn ghost" onClick={onLogout}>退出登录</button></div>
        <div className="data-actions" style={{ marginTop: 10 }}><button type="button" className="btn danger" onClick={onDeleteAccount}>注销账户</button></div>
      </div>
    </div>
  );
}
