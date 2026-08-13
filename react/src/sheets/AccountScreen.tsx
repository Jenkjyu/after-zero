// 账户详情页同时承载本地模式和已登录模式。本地数据与云账户生命周期明确分开：登录/退出/
// 注销都不改本地账本；"重置本地数据"始终是独立按钮和独立二次确认。
import { closeAccountScreen, useAccount, usePremium, useAccountScreenOpen } from "../shared/state";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

const MAX_AVATAR_SOURCE_BYTES = 12 * 1024 * 1024;
const AVATAR_SIZE = 320;

function displayName(nickname: string | undefined, provider: string | undefined) {
  return nickname?.trim() || (provider === "apple" ? "Apple 用户" : "已登录");
}

function nicknameInputWidth(value: string) {
  const units = Array.from(value).reduce((total, character) => total + (/[^\x00-\xff]/.test(character) ? 1 : 0.62), 0);
  return `${Math.min(18, Math.max(6, units + 2))}em`;
}

function compressAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) return Promise.reject(new Error("请选择图片文件"));
  if (file.size > MAX_AVATAR_SOURCE_BYTES) return Promise.reject(new Error("图片不能超过 12MB"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("这张图片暂不支持"));
      image.onload = () => {
        const scale = Math.min(1, AVATAR_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) { reject(new Error("图片处理失败")); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

export function AccountScreen() {
  const isOpen = useAccountScreenOpen();
  const account = useAccount();
  const premium = usePremium();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [nickname, setNickname] = useState(account?.nickname || "");

  useEffect(() => { setNickname(account?.nickname || ""); }, [account]);

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
    await window.__azBridge.requestCloudLogin("");
  }
  async function onBind(provider: "apple" | "wechat") {
    await window.__azBridge.bindCloudIdentity(provider);
  }
  function saveNickname() {
    if (!account) return;
    const next = nickname.trim();
    if (next === account.nickname) return;
    if (!window.__azBridge.updateAccountProfile({ nickname: next })) {
      setNickname(account.nickname || "");
    }
  }
  async function onAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !account) return;
    try {
      const avatarUrl = await compressAvatar(file);
      window.__azBridge.updateAccountProfile({ avatarUrl });
    } catch (error) {
      window.__azBridge.toast(error instanceof Error ? error.message : "头像设置失败");
    }
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
        <div className="account-head">
          <button type="button" className="account-avatar-btn" aria-label="更换头像" onClick={() => {
            if (!account) { window.__azBridge.toast("请先登录后再编辑资料"); return; }
            avatarInputRef.current?.click();
          }}>
            {account?.avatarUrl
              ? <img className="account-avatar-lg" alt="" src={account.avatarUrl} />
              : <span className="account-avatar-lg account-avatar-placeholder" aria-hidden="true" />}
          </button>
          <div className="account-name-c">{account ? displayName(account.nickname, account.provider) : "本地使用"}</div>
          {account && <span className="account-avatar-hint">点击头像更换</span>}
          <input ref={avatarInputRef} className="account-avatar-input" type="file" accept="image/*" onChange={onAvatarChange} />
        </div>
        <div className="data-card">
          <div className="account-detail-row"><span className="account-detail-label">登录方式</span><span className="account-detail-value">{!account ? "尚未登录" : account.provider === "apple" ? "Apple 登录" : account.provider === "unified" ? "统一账号" : "微信登录"}</span></div>
          {account && <div className="account-detail-row account-detail-row-edit"><label className="account-detail-label" htmlFor="accountNickname">昵称</label><input id="accountNickname" className="account-nickname-input" value={nickname} maxLength={24} style={{ width: nicknameInputWidth(nickname) }} onChange={(event) => setNickname(event.target.value)} onBlur={saveNickname} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div>}
          {account?.email && <div className="account-detail-row"><span className="account-detail-label">邮箱</span><span className="account-detail-value">{account.email}</span></div>}
          <div className="account-detail-row"><span className="account-detail-label">会员</span><span className="account-detail-value">{window.premiumLabel(premium) || "普通用户"}</span></div>
          <div className="account-detail-row"><span className="account-detail-label">本地账本</span><span className="account-detail-value">仅存本机</span></div>
        </div>
        {!account && <p className="account-local-note">登录后可使用云端功能；本地账本仍只保存在本机。</p>}
        {!account && <div className="data-actions" style={{ marginTop: 16 }}><button type="button" className="btn primary" onClick={onLogin}>登录</button></div>}
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
