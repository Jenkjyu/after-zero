// 债务类型占比——单条堆叠横条+图例，直译自vanilla renderTypeStack(data)（www/index.html）。
// 颜色循环var(--series-1)..var(--series-8)（typeList最多6项，见calc.js computeReportData），
// 这几个CSS变量定义在.viz-root作用域下（www/index.html <style>），容器套上这个类名即可复用。
import type { ReportData } from "../types";

export interface TypeStackProps {
  data: ReportData;
}

export function TypeStack({ data }: TypeStackProps) {
  if (!data.typeList.length) return null;
  const total = data.typeList.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="viz-block">
      <div className="viz-title">债务类型占比</div>
      <div className="viz-stack">
        {data.typeList.map((x, i) => (
          <div key={i} className="viz-stack-seg" style={{ width: ((x.value / total) * 100).toFixed(2) + "%", background: `var(--series-${i + 1})` }} />
        ))}
      </div>
      <div className="viz-legend">
        {data.typeList.map((x, i) => (
          <div key={i} className="viz-legend-item">
            <span className="viz-legend-swatch" style={{ background: `var(--series-${i + 1})` }} />
            {x.name} {Math.round((x.value / total) * 100)}%
          </div>
        ))}
      </div>
    </div>
  );
}
