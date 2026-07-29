// "7天内/15天内/30天内待还"三张小指标卡——原来只有7/30两张，2026-07-29跟着筛选条一起
// 补上了中间的15天(筛选条加了"15天内"，两处的档位要对得上，不然点了筛选找不到对应的总额)。
// 累计口径(30天内包含15天内、15天内又包含7天内)，都不含逾期(逾期是"已经错过"，跟"即将要还"
// 不是一回事)。**2026-07-29起按"期"算不按"笔"算**：列表已经逐期展开，同一个窗口里的期数
// 会多于债务数，两处口径必须一致——否则卡片说13笔、列表列出15行，对不上。App.tsx负责套一层.pay-stats外壳div，这个组件只渲染里面的.kpi卡片。
import type { PayItem } from "./App";

export interface StatsProps {
  items: PayItem[];
}

const BUCKETS: [number, string][] = [[7, "7天内待还"], [15, "15天内待还"], [30, "30天内待还"]];

export function Stats({ items }: StatsProps) {
  if (!items.length) return null;
  const sums = BUCKETS.map(() => ({ n: 0, amt: 0 }));
  items.forEach((o) => {
    if (o.diff < 0) return;
    BUCKETS.forEach(([days], i) => {
      if (o.diff > days) return;
      sums[i].n++;
      sums[i].amt += o.amount;
    });
  });
  return (
    <>
      {BUCKETS.map(([, label], i) => (
        <div className="kpi" key={label}>
          <div className="v num">¥{window.fmt(sums[i].amt)}</div>
          <div className="k">{label}</div>
          <div className="kpi-sub num">共 {sums[i].n} 期</div>
        </div>
      ))}
    </>
  );
}
