// "统计"tab结语区附近的小卡片——"还债历程"(react/src/sheets/HistoryScreen.tsx)的入口。
// 不放在报告主流程(结论/走势/压力/排行/类型)里，是刻意的：那条流程是"先给判断，再给
// 证据"的分析体，历程是叙事/回顾体，两种内容模式混在一起会打断报告的节奏。这里只露
// 一两个高光数字，完整时间线在点开之后的screen里。
// 打开HistoryScreen本身不需要门禁——免费/付费的边界在里面"生成分享卡片"这一个按钮，
// 不在"能不能看到自己的历程"这件事上(呼应CLAUDE.md新增小节的判断：零成本的东西不该
// 收费，这是这个App一直在坚持的原则)。
import { openHistoryScreen } from "../shared/state";
import type { DebtSummary } from "../types";

export interface HistoryTeaserProps {
  s: DebtSummary;
}

export function HistoryTeaser({ s }: HistoryTeaserProps) {
  // 一笔都没还清、也没攒够第一个里程碑(1万)时，这张卡片还没什么可回顾的，不展示——
  // 跟"至少2笔在还债务才有顺序可比"(StrategyCta)是同一类"功能还没到能用的时候就不露出"判断。
  if (s.settled === 0 && s.paidPrincipal < 10000) return null;

  return (
    <div className="data-card history-teaser">
      <h3>还债历程</h3>
      <div className="history-teaser-nums">
        <div className="history-teaser-num"><div className="v num">{s.settled}</div><div className="k">笔已还清</div></div>
        <div className="history-teaser-num"><div className="v num">¥{window.fmt(s.paidPrincipal)}</div><div className="k">累计已还本金</div></div>
      </div>
      <button type="button" className="btn ghost" onClick={openHistoryScreen}>查看完整历程</button>
    </div>
  );
}
