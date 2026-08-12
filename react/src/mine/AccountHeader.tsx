// "我的"页顶部头像+昵称——原样复刻vanilla renderAccountUI()里写accountAvatarImg/accountNameText
// 那两行的逻辑（account为空时头像无src、昵称空文本，跟vanilla的if(account){...}守卫一致）。
// 点头像走shared/state.ts的openAccountScreen()——第七步(React迁移收尾)后accountScreen
// 已经是React自己拥有的sheet，不再经过__azBridge，见AGENTS.md"React 迁移"一节。
import type { Account } from "../types";
import { openAccountScreen } from "../shared/state";

export interface AccountHeaderProps {
  account: Account | null;
}

export function AccountHeader({ account }: AccountHeaderProps) {
  return (
    <div className="account-head">
      <button type="button" className="account-avatar-btn" onClick={openAccountScreen} aria-label="账户">
        <img className="account-avatar-lg" src={account && account.avatarUrl ? account.avatarUrl : undefined} alt="" />
      </button>
      <div className="account-name-c">{account ? account.nickname || "已登录" : "本地使用"}</div>
    </div>
  );
}
