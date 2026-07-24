// "7天内待还/30天内待还"两张小指标卡——直译自vanilla renderPay()里#payStats那段（www/index.html）。
// 累计口径(30天内包含7天内)，都不含逾期(逾期是"已经错过"，跟"即将要还"不是一回事)。
// App.tsx负责套一层.pay-stats外壳div，这个组件只负责渲染里面的.kpi卡片(或空数据时渲染null)。
import type { PayItem } from "./App";

export interface StatsProps {
  items: PayItem[];
}

export function Stats({ items }: StatsProps) {
  if (!items.length) return null;
  let weekN = 0, weekAmt = 0, monthN = 0, monthAmt = 0;
  items.forEach((o) => {
    if (o.diff < 0 || o.diff > 30) return;
    monthN++;
    monthAmt += +o.d.monthly || 0;
    if (o.diff <= 7) { weekN++; weekAmt += +o.d.monthly || 0; }
  });
  return (
    <>
      <div className="kpi">
        <div className="v num">¥{window.fmt(weekAmt)}</div>
        <div className="k">7天内待还</div>
        <div className="kpi-sub num">共 {weekN} 笔</div>
      </div>
      <div className="kpi">
        <div className="v num">¥{window.fmt(monthAmt)}</div>
        <div className="k">30天内待还</div>
        <div className="kpi-sub num">共 {monthN} 笔</div>
      </div>
    </>
  );
}
