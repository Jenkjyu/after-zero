// 待还款项列表。**一行=一期**，不是一笔债务(见App.tsx里PayItem的注释)。
//
// 2026-07-29之前这里按dueBucket(diff)分成"已逾期/7天内/30天内/更晚"四段、各插一个
// section-label。那套在窗口固定7~30天时是合理的，但自定义窗口能拉到上百天之后，绝大多数
// 行会全挤进"更晚"这一档，分组反而读不出任何结构。现在改成**整个列表只有一个表头**、
// 内容跟当前筛选一致("100天内 · 23期")，由App.tsx算好label传进来。
//
// key用 d.id + planIdx：债务id是真正永久的身份(不会因"在还债务"页拖拽重排而变)，
// 加上期次下标才能唯一标识展开后的每一行——同一笔债务现在会占多行，光用d.id会撞key。
import type { PayGestureCtx } from "./gestures";
import { PayRow } from "./PayRow";
import type { PayItem } from "./App";

export interface PayListProps {
  visible: PayItem[];
  /** 表头文案，跟当前筛选一致 */
  label: string;
  ctx: PayGestureCtx;
}

export function PayList({ visible, label, ctx }: PayListProps) {
  if (!visible.length) {
    return <div className="footnote">该分类下暂无待还款项</div>;
  }
  return (
    <>
      <div className={"section-label" + (label === "已逾期" ? " overdue" : "")}>
        {label} · {visible.length} 期 · ¥{window.fmt(visible.reduce((sum, o) => sum + o.amount, 0))}
      </div>
      {visible.map((o) => (
        <PayRow
          key={o.d.id + ":" + o.planIdx}
          d={o.d}
          next={o.next}
          diff={o.diff}
          amount={o.amount}
          canSettle={o.isNextUnpaid}
          ctx={ctx}
        />
      ))}
    </>
  );
}
