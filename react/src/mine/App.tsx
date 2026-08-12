// "我的"页顶层组件——四个tab里最后一个迁移的，跟"统计"页(report/App.tsx)同样是纯data→JSX
// 展示，没有任何本地状态。原vanilla #view-data section没有section-label标题，这里也不加。
import { openAboutScreen, useAccount, usePremium } from "../shared/state";
import { AccountHeader } from "./AccountHeader";
import { PremiumEntryCard } from "./PremiumEntryCard";
import { DataCards, EntryCard } from "./DataCards";

const ICON_ABOUT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

export function App() {
  const account = useAccount();
  const premium = usePremium();

  return (
    <>
      <AccountHeader account={account} />
      <PremiumEntryCard premium={premium} />
      <DataCards premium={premium} account={account} />
      <div className="entry-group">
        <EntryCard hue="brand" icon={ICON_ABOUT} title="关于我们" sub="版本、协议与联系方式" onClick={openAboutScreen} />
      </div>
    </>
  );
}
