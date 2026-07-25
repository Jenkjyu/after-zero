// "我的"页顶层组件——四个tab里最后一个迁移的，跟"统计"页(report/App.tsx)同样是纯data→JSX
// 展示，没有任何本地状态。原vanilla #view-data section没有section-label标题，这里也不加。
import { useAccount, usePremium } from "../shared/state";
import { AccountHeader } from "./AccountHeader";
import { PremiumEntryCard } from "./PremiumEntryCard";
import { DataCards } from "./DataCards";

export function App() {
  const account = useAccount();
  const premium = usePremium();

  return (
    <>
      <AccountHeader account={account} />
      <PremiumEntryCard premium={premium} />
      <DataCards premium={premium} />
    </>
  );
}
