// 按dueBucket(diff)分组的列表——直译自vanilla renderPay()末尾那段分组+插section-label逻辑
// （www/index.html）。DUE_BUCKET_LABEL常量搬到这里(单一消费者，不进types.ts)。
// PayRow用keyFor(o.d)（而不是o.i）当React key——debts数组下标会因为"在还债务"页的拖拽重排
// 变化，用WeakMap稳定key避免重排时把某一行的滑动状态错误地"传"给另一笔债务，
// 跟"在还债务"页DebtCard列表同一个理由（见CLAUDE.md"在还债务"React迁移一节）。
import type { ReactNode } from "react";
import { keyFor } from "../shared/state";
import type { PayGestureCtx } from "./gestures";
import { PayRow } from "./PayRow";
import type { PayItem } from "./App";

const DUE_BUCKET_LABEL: Record<string, string> = { overdue: "已逾期", week: "7天内", month: "30天内", later: "更晚" };

export interface PayListProps {
  visible: PayItem[];
  ctx: PayGestureCtx;
}

export function PayList({ visible, ctx }: PayListProps) {
  if (!visible.length) {
    return <div className="footnote">该分类下暂无待还款项</div>;
  }
  const bucketCounts: Record<string, number> = {};
  visible.forEach((o) => {
    const b = window.dueBucket(o.diff);
    bucketCounts[b] = (bucketCounts[b] || 0) + 1;
  });
  const nodes: ReactNode[] = [];
  let lastBucket: string | null = null;
  visible.forEach((o) => {
    const bucket = window.dueBucket(o.diff);
    if (bucket !== lastBucket) {
      nodes.push(
        <div key={"label-" + bucket} className={"section-label" + (bucket === "overdue" ? " overdue" : "")}>
          {DUE_BUCKET_LABEL[bucket]} · {bucketCounts[bucket]} 笔
        </div>
      );
      lastBucket = bucket;
    }
    nodes.push(<PayRow key={keyFor(o.d)} d={o.d} i={o.i} next={o.next} diff={o.diff} ctx={ctx} />);
  });
  return <>{nodes}</>;
}
