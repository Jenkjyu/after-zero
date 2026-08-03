// 账户详情页——第七步(React迁移收尾)从vanilla的#accountScreen原样复刻。原来的
// renderAccountDetail()整段搬进这里，直接读useAccount()/usePremium()而不是vanilla手动写
// #acctDetailAvatar等DOM节点。"退出登录"没有确认弹窗(照抄vanilla wxLogoutBtn原来的行为，
// 没有ask())，"注销账户"走confirmAsync确认后调用桥接的deleteAccount()。
// confirmAsync这个弹窗额外带了第三个按钮(opts.thirdLabel，全App第一次用到，渲染在标题行
// 右上角、纯文字弱化样式——见www/index.html里#mThird的CSS注释，真机验证过"跟取消同款
// 灰底按钮"视觉权重太重、容易让人低估破坏性，改成了这个更轻的角落链接样式)——"重置本地
// 数据"，不删服务器账户，不走deleteAccount()那条云函数路径。三个分支靠result的值
// 区分："third"→重置本地，true→继续注销，false/null→取消，什么都不做。选"重置本地数据"
// 之后还要再过一层独立的二次确认（同样是confirmAsync，普通两按钮）才真正调用
// resetLocalData()——这一步跟"注销账户"本身同等破坏性（清空本机全部数据且不可撤销），
// 不能因为已经点过一次弹窗里的按钮就跳过再问一遍。
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
    const result = await window.__azBridge.confirmAsync(
      "注销账户",
      "注销后账号数据将从服务器永久删除，且需要重新微信登录才能再次使用，此操作不可撤销。如果只是想清空本地数据、保留账户，可以点右上角「重置本地数据」。确定继续注销吗？",
      { thirdLabel: "重置本地数据" }
    );
    if (result === "third") {
      const reallyReset = await window.__azBridge.confirmAsync(
        "确定重置本地数据？",
        "这会清空手机上保存的全部数据（债务记录、文档等），且无法恢复，需要重新登录才能继续使用。账户本身不会被删除，云备份数据依然保留。"
      );
      if (reallyReset) window.__azBridge.resetLocalData();
      return;
    }
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
