// 债务类型占比——单条堆叠横条+图例，直译自vanilla renderTypeStack(data)（www/index.html）。
// 颜色循环var(--series-1)..var(--series-8)（typeList最多6项，见calc.js computeReportData），
// 这几个CSS变量定义在.viz-root作用域下（www/index.html <style>），容器套上这个类名即可复用。
//
// 这轮（统计tab视觉+交互升级）加了轻量点击高亮——离散分类数据，普通onClick就够，理由同
// BalanceBars.tsx。堆叠段和图例项联动同步（点任意一个都会同步高亮另一边），有选中项时
// 非选中的段加.dim视觉隔离出选中的那一类。
//
// 图例带上具体金额：底部4张平铺明细表在"统计tab口径修正"这轮删掉了，那张表是原来唯一能看到
// 各类型"具体多少钱"的地方。dataviz skill的anti-pattern明确禁止"数值只能靠hover/tooltip读到"，
// 所以金额要留在图例里，不能跟着表一起消失。
import { useState } from "react";
import type { ReportData } from "../types";

export interface TypeStackProps {
  data: ReportData;
}

export function TypeStack({ data }: TypeStackProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  if (!data.typeList.length) return null;
  const total = data.typeList.reduce((s, x) => s + x.value, 0) || 1;
  function toggle(i: number) {
    setActiveIdx((cur) => (cur === i ? null : i));
  }
  return (
    <div className="viz-block">
      <div className="viz-title">债务类型占比</div>
      <div className="viz-stack">
        {data.typeList.map((x, i) => (
          <div
            key={i}
            className={"viz-stack-seg" + (activeIdx !== null && activeIdx !== i ? " dim" : "")}
            style={{ width: ((x.value / total) * 100).toFixed(2) + "%", background: `var(--series-${i + 1})` }}
            onClick={() => toggle(i)}
          />
        ))}
      </div>
      <div className="viz-legend">
        {data.typeList.map((x, i) => (
          <div key={i} className={"viz-legend-item" + (activeIdx === i ? " active" : "")} onClick={() => toggle(i)}>
            <span className="viz-legend-swatch" style={{ background: `var(--series-${i + 1})` }} />
            {x.name} {Math.round((x.value / total) * 100)}%
            <span className="viz-legend-amt num">¥{window.fmt(x.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
