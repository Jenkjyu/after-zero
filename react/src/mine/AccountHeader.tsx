// "我的"页顶部头像+昵称——原样复刻vanilla renderAccountUI()里写accountAvatarImg/accountNameText
// 那两行的逻辑（account为空时头像无src、昵称空文本，跟vanilla的if(account){...}守卫一致）。
// 点头像走__azBridge.openAccountScreen()，#accountScreen subpage继续100%vanilla不重新实现。
import type { Account } from "../types";

export interface AccountHeaderProps {
  account: Account | null;
}

export function AccountHeader({ account }: AccountHeaderProps) {
  function onClick() {
    window.__azBridge.openAccountScreen();
  }
  return (
    <div className="account-head">
      <button type="button" className="account-avatar-btn" onClick={onClick} aria-label="账户">
        <img className="account-avatar-lg" src={account && account.avatarUrl ? account.avatarUrl : undefined} alt="" />
      </button>
      <div className="account-name-c">{account ? account.nickname || "" : ""}</div>
    </div>
  );
}
