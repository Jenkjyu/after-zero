// 常驻挂载的第5个React入口——不属于任何tab，服务的是被多棵独立React树共同触发的
// subpage/sheet。DetailSheet(第五步)+EditSheet(第六步)+AccountScreen/PremiumScreen/
// TermsScreen(第七步，React迁移收尾)都挂在这一层，不需要为后续每一批新开一个入口。
// AboutScreen/PrivacyScreen/AgreementScreen(2026-07-31新增)同理，"关于我们"入口是从
// "我的"tab打开，Privacy/Agreement/Terms再从About内部打开，是同一种"外层触发独立screen"关系。
//
// ⚠️这几个<XScreen />的JSX书写顺序不是随手排的，直接决定了谁盖在谁上面——所有`.subpage`
// 共享同一个z-index(35，见www/index.html)，层叠顺序纯靠DOM顺序决定(同z-index下后出现
// 的元素画在上层)。真机/Playwright验证时踩过一次：AboutScreen一开始写在TermsScreen后面，
// 导致"关于我们→会员服务协议"这条路径点开TermsScreen后，返回箭头的点击被后渲染、
// 仍然open着的AboutScreen截胡(intercepts pointer events)，返回箭头完全点不动。
// 规则：凡是"screen X会从screen Y内部被打开"，X必须排在Y后面。这次的约束不止Terms/
// Privacy/Agreement三个——About的"账户与登录信息"入口也会打开AccountScreen，所以
// AccountScreen同样要排在About后面(不能沿用它原来在Premium/Terms前面那个位置)。Terms
// 依然是Premium原有的下一层(购买页里"《会员服务协议》"链接)，Premium排在About前面，
// 传递关系保证Terms依然在Premium之后，三条路径互不冲突。
import { AboutScreen } from "./AboutScreen";
import { AccountScreen } from "./AccountScreen";
import { AgreementScreen } from "./AgreementScreen";
import { AiScreen } from "./AiScreen";
import { BackupScreen } from "./BackupScreen";
import { DetailSheet } from "./DetailSheet";
import { DocsScreen } from "./DocsScreen";
import { EditSheet } from "./EditSheet";
import { NotifySheet } from "./NotifySheet";
import { PremiumScreen } from "./PremiumScreen";
import { PrivacyScreen } from "./PrivacyScreen";
import { SimScreen } from "./SimScreen";
import { TermsScreen } from "./TermsScreen";

export function App() {
  return (
    <>
      <DetailSheet />
      <EditSheet />
      <PremiumScreen />
      <AboutScreen />
      <AccountScreen />
      <TermsScreen />
      <PrivacyScreen />
      <AgreementScreen />
      <SimScreen />
      <NotifySheet />
      <DocsScreen />
      <BackupScreen />
      <AiScreen />
    </>
  );
}
