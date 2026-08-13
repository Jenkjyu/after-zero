// 账户详情页同时承载本地模式和已登录模式。本地数据与云账户生命周期明确分开：登录/退出/
// 注销都不改本地账本；"重置本地数据"始终是独立按钮和独立二次确认。
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
  async function onLogin() {
    await window.__azBridge.requestCloudLogin("登录后可使用 AI 债务助手和云备份；登录不会自动上传、下载或覆盖这台设备上的本地账本。");
  }
  async function onBind(provider: "apple" | "wechat") {
    await window.__azBridge.bindCloudIdentity(provider);
  }
  async function onResetLocalData() {
    const reallyReset = await window.__azBridge.confirmAsync(
      "确定重置本地数据？",
      "这会清空这台设备上保存的债务、档案和设置，且无法恢复。云账号和云备份不会被删除。"
    );
    if (reallyReset) window.__azBridge.resetLocalData();
  }
  async function onDeleteAccount() {
    const result = await window.__azBridge.confirmAsync(
      "注销账户",
      "注销后云端账号及其云备份将从服务器永久删除，此操作不可撤销。为防止重复赠送体验并支持恢复已购权益，系统仅保留不可逆权益标记。当前设备上的本地债务、档案和设置会保留。确定继续注销吗？"
    );
    if (!result) return;
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
          {account?.avatarUrl && <div className="account-detail-row"><span className="account-detail-label">头像</span><img className="account-avatar" alt="" src={account.avatarUrl} /></div>}
          <div className="account-detail-row"><span className="account-detail-label">登录方式</span><span className="account-detail-value">{!account ? "尚未登录" : account.provider === "apple" ? "Apple 登录" : account.provider === "unified" ? "统一账号" : "微信登录"}</span></div>
          {account && <div className="account-detail-row"><span className="account-detail-label">昵称</span><span className="account-detail-value">{account.nickname || "已登录"}</span></div>}
          {account?.email && <div className="account-detail-row"><span className="account-detail-label">邮箱</span><span className="account-detail-value">{account.email}</span></div>}
          <div className="account-detail-row"><span className="account-detail-label">会员</span><span className="account-detail-value">{window.premiumLabel(premium) || "普通用户"}</span></div>
          <div className="account-detail-row"><span className="account-detail-label">本地账本</span><span className="account-detail-value">仅存本机</span></div>
        </div>
        {!account && <p className="account-local-note">iOS 完整账本需要登录并验证体验或购买权益；本地账本仍只保存在本机。</p>}
        {!account && <div className="data-actions" style={{ marginTop: 16 }}><button type="button" className="btn primary" onClick={onLogin}>登录并验证权益</button></div>}
        {account && !account.providers.includes("apple") && <div className="data-actions" style={{ marginTop: 16 }}><button type="button" className="btn ghost" onClick={() => onBind("apple")}>绑定 Apple</button></div>}
        {account && !account.providers.includes("wechat") && <div className="data-actions" style={{ marginTop: 10 }}><button type="button" className="btn ghost" onClick={() => onBind("wechat")}>绑定微信</button></div>}
        {account && <p className="account-local-note">绑定时会分别验证当前账号和待绑定账号；只合并云备份与 AI 用量，不会改变本机账本。</p>}
        {account && <div className="data-actions" style={{ marginTop: 16 }}><button type="button" className="btn ghost" onClick={onLogout}>退出登录</button></div>}
        <div className="data-actions" style={{ marginTop: 10 }}><button type="button" className="btn ghost" onClick={onResetLocalData}>重置本地数据</button></div>
        {account && <div className="data-actions" style={{ marginTop: 10 }}><button type="button" className="btn danger" onClick={onDeleteAccount}>注销云端账户</button></div>}
      </div>
    </div>
  );
}
