// 常驻挂载的第5个React入口——不属于任何tab，服务的是被多棵独立React树共同触发的
// subpage/sheet。DetailSheet(第五步)+EditSheet(第六步)+AccountScreen/PremiumScreen/
// TermsScreen(第七步，React迁移收尾)都挂在这一层，不需要为后续每一批新开一个入口。
import { AccountScreen } from "./AccountScreen";
import { DetailSheet } from "./DetailSheet";
import { DocsScreen } from "./DocsScreen";
import { EditSheet } from "./EditSheet";
import { NotifySheet } from "./NotifySheet";
import { PremiumScreen } from "./PremiumScreen";
import { SimScreen } from "./SimScreen";
import { TermsScreen } from "./TermsScreen";

export function App() {
  return (
    <>
      <DetailSheet />
      <EditSheet />
      <AccountScreen />
      <PremiumScreen />
      <TermsScreen />
      <SimScreen />
      <NotifySheet />
      <DocsScreen />
    </>
  );
}
