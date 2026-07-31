// 页尾：结语（"如果只做一件事"）+ 导出入口 + 计算口径说明 + 免责脚注。
//
// "如果只做一件事"的内容跟"最该先动手的地方"取的是**同一条结论**（severity 最高的
// 可行动那条），这是刻意的重复：开头给判断、中间给证据、结尾再落回同一个动作，
// 是报告体的收尾方式，不是复制粘贴。
//
// ⚠️"计算口径说明"必须保留。它解释的六条（在还总负债只算本金 / 已还本金含已结清 /
// 经常性月供不含一次性还清 / 归零进度只按本金 / 预计还清是预测 / 提前结清怎么记账）
// 都是这一页数字的口径前提，删了会让好几个数字变得无法核对。改版把它从顶部
// 挪到页尾，是因为它是"较真的人才会展开"的补充细则，不该占第一屏。
import { useState } from "react";
import type { Premium } from "../types";
import type { Finding } from "./findings";
import { ExportMenu } from "./ExportMenu";

export interface OutroProps {
  lead: Finding | null;
  premium: Premium;
}

export function Outro({ lead, premium }: OutroProps) {
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <>
      <div className="outro">
        <div className="outro-t">如果只做一件事</div>
        <div className="outro-b">
          {lead && lead.actionTitle ? <>{lead.actionTitle}。</> : "保持现在的还款节奏。"}
        </div>
        <div className="outro-act">
          <ExportMenu premium={premium} />
        </div>
      </div>

      <button
        type="button"
        className={"note-toggle" + (noteOpen ? " open" : "")}
        style={{ marginTop: 16 }}
        onClick={() => setNoteOpen((v) => !v)}
      >
        计算口径说明
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {/* ⚠️用专属的 .rpt-note，不复用全局 .footnote——这一页里 Journey 的免责说明也是
          .footnote，两者混在一起会让"按类名找口径说明"这种查询抓到错的那个（写测试时踩到）。 */}
      {noteOpen && (
        <div className="rpt-note">
          在还总负债 = 各未结清债务「未还本金」之和（只算本金，不含未来的利息/手续费）。<br />
          已还本金 = 全部债务（<b>含已结清</b>）已标记为「已还」期次的本金之和；另付利息 = 这些期次对应的利息/手续费之和。<br />
          经常性月供 = 各未结清债务下一期应还金额之和（不含标记为「一次性还清」的借款）。<br />
          归零进度 = 已还本金 ÷（已还本金 + 在还总负债），只按本金计算。<br />
          预计还清日期 = 按现有还款计划里最晚的未还期次推算，<b>是预测不是承诺</b>，没有把提前还款算进去。<br />
          「提前结清」会问你实际付了多少钱，并把剩余期次合并成一条结清记录：剩余本金计入已还本金，实付超出剩余本金的部分计入另付利息（协商减免则记为负数）。未来那些期原本的利息不会被算成你付过——提前结清本来就免掉了它们。
        </div>
      )}

      <div className="rpt-foot">
        利率由每笔债务的还款计划反推（IRR）；剩余待付利息按现有计划算到还清为止，手动录入且没拆分本金/利息的债务会低估。
      </div>
    </>
  );
}
