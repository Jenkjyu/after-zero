// "统计"tab里"最该先动手的地方"下面的入口——诊断完"哪里有问题"之后，这是"怎么解决"
// 的下一步，放在这个位置是转化率最高的时刻(用户刚读完结论，问题意识最强)。
// 门禁逻辑照抄ExportMenu.tsx：没开通Premium直接跳订阅页，不在这里另写一套判断。
import { openPremiumScreen, openStrategyScreen } from "../shared/state";
import type { Premium } from "../types";

export interface StrategyCtaProps {
  premium: Premium;
}

export function StrategyCta({ premium }: StrategyCtaProps) {
  function onClick() {
    if (!window.hasPremium(premium)) { openPremiumScreen(); return; }
    openStrategyScreen();
  }

  return (
    <div className="strategy-cta sec">
      <div className="sec-q">再往下一步</div>
      <h2 className="sec-a">该按什么顺序还，能省下最多利息？</h2>
      <button type="button" className="btn primary" onClick={onClick}>多策略对比规划</button>
    </div>
  );
}
