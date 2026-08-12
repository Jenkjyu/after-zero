// "在还债务"页顶层组件——订阅vanilla共享的debts/premium/account(见useDebts.ts的
// useSyncExternalStore桥接)，组合Header/Summary(hero+KPI+AI banner+口径说明)/DebtList
// (排序+卡片列表+新增按钮+已结清列表)。详情窗/编辑表单/账户页/订阅页全部继续是vanilla
// 的sheet/subpage，这里只通过window.__azBridge桥接调用，不重新实现。
import { Header } from "./Header";
import { Summary } from "./Summary";
import { DebtList } from "./DebtList";
import { openAccountScreen, openAiScreen, openPremiumScreen, useAccount, useDebts, usePremium } from "../shared/state";

export function App() {
  const debts = useDebts();
  const premium = usePremium();
  const account = useAccount();

  async function onAiBannerClick() {
    if (!window.hasPremium(premium)) { openPremiumScreen(); return; }
    if (!account) {
      const loggedIn = await window.__azBridge.requestCloudLogin("AI 债务助手会把本次问题和债务摘要发送到云端生成回复；登录提示可取消，本地账本不会自动上传。");
      if (!loggedIn) return;
    }
    openAiScreen();
  }

  return (
    <>
      <Header avatarUrl={account ? account.avatarUrl : null} onAvatarClick={openAccountScreen} />
      <Summary debts={debts} premium={premium} onAiBannerClick={onAiBannerClick} />
      <DebtList debts={debts} />
    </>
  );
}
