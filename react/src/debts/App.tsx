// "在还债务"页顶层组件——订阅vanilla共享的debts/premium/account(见useDebts.ts的
// useSyncExternalStore桥接)，组合Header/Summary(hero+KPI+AI banner+口径说明)/DebtList
// (排序+卡片列表+新增按钮+已结清列表)。详情窗/编辑表单/账户页/订阅页全部继续是vanilla
// 的sheet/subpage，这里只通过window.__azBridge桥接调用，不重新实现。
import { Header } from "./Header";
import { Summary } from "./Summary";
import { DebtList } from "./DebtList";
import { useAccount, useDebts, usePremium } from "../shared/state";

export function App() {
  const debts = useDebts();
  const premium = usePremium();
  const account = useAccount();

  function onAiBannerClick() {
    if (window.hasPremium(premium)) window.__azBridge.openAiScreen();
    else window.__azBridge.openPremiumScreen();
  }

  return (
    <>
      <Header avatarUrl={account ? account.avatarUrl : null} onAvatarClick={() => window.__azBridge.openAccountScreen()} />
      <Summary debts={debts} premium={premium} onAiBannerClick={onAiBannerClick} />
      <DebtList debts={debts} />
    </>
  );
}
