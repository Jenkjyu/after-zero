// 各债务对比——横向条形图，可切换排序维度（余额/利率/剩余利息）。
//
// ⚠️切换排序时**横条长度代表的量必须跟着换**，不能只换顺序。"标题说按利率排序、横条还是按
// 余额画"是一个会直接误导人的经典错误：读者以为最长的那条利率最高，实际它只是余额最大。
// 所以这里三个维度各自有自己的 value/format/unit，条长永远 = 当前维度的值 ÷ 当前维度的最大值。
//
// 数据用 data.active（Debt[]）而不是 data.byName（只有 {name, balance}）——利率在 d.rate，
// 剩余利息要用 window.remainingInterest(d) 现算。**故意不去动 computeReportData 的返回形状**：
// byName 被 exportReportPdf 的 buildReportTableRows 按字段名解构，加字段风险不值得冒
// （见 CLAUDE.md"纯计算函数"一节里 computeMonthlyRepayment 不并入 computeReportData 的先例）。
//
// 点击高亮是普通onClick——离散分类数据，每行本来就是完整的一个值，不需要chartScrub那套
// Touch Events重手势基础设施（那是给连续时间序列图准备的）。
import { useMemo, useState } from "react";
import type { Debt, ReportData } from "../types";

export interface BalanceBarsProps {
  data: ReportData;
}

type Metric = "balance" | "rate" | "interest";

const METRICS: { key: Metric; label: string; title: string; of: (d: Debt) => number; fmt: (v: number) => string }[] = [
  { key: "balance", label: "余额", title: "各债务剩余待还", of: (d) => +d.balance || 0, fmt: (v) => "¥" + window.fmt(v) },
  { key: "rate", label: "利率", title: "各债务年化利率", of: (d) => +d.rate || 0, fmt: (v) => v.toFixed(2) + "%" },
  { key: "interest", label: "剩余利息", title: "各债务剩余待付利息", of: (d) => window.remainingInterest(d), fmt: (v) => "¥" + window.fmt(v) },
];

export function BalanceBars({ data }: BalanceBarsProps) {
  const [metric, setMetric] = useState<Metric>("balance");
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const m = METRICS.find((x) => x.key === metric)!;

  const rows = useMemo(
    () => data.active.map((d) => ({ id: d.id, name: d.name, value: m.of(d) })).sort((a, b) => b.value - a.value),
    [data.active, m]
  );

  if (!rows.length) {
    return (
      <div className="viz-block">
        <div className="viz-title">各债务剩余待还</div>
        <div className="footnote" style={{ textAlign: "left" }}>暂无在还债务</div>
      </div>
    );
  }
  const max = Math.max(...rows.map((x) => x.value)) || 1;

  return (
    <div className="viz-block">
      <div className="viz-title-row">
        <div className="viz-title">{m.title}</div>
        <div className="viz-mode-toggle">
          {METRICS.map((x) => (
            <button
              key={x.key}
              type="button"
              className={"viz-mode-btn" + (metric === x.key ? " active" : "")}
              onClick={() => { setMetric(x.key); setActiveIdx(null); }}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {rows.map((x, i) => {
        const pct = x.value > 0 ? Math.max(2, Math.round((x.value / max) * 100)) : 0;
        return (
          <div
            className={"viz-bar-row" + (activeIdx === i ? " active" : "")}
            key={x.id}
            onClick={() => setActiveIdx((cur) => (cur === i ? null : i))}
          >
            <div className="viz-bar-name">{window.truncateLabel(x.name, 10)}</div>
            <div className="viz-bar-track"><div className="viz-bar-fill" style={{ width: pct + "%" }} /></div>
            <div className="viz-bar-val num">{m.fmt(x.value)}</div>
          </div>
        );
      })}
      {metric === "interest" && (
        <div className="footnote" style={{ textAlign: "left", marginTop: 8, padding: 0 }}>
          按现有还款计划算到还清为止。手动录入且没拆分本金/利息的债务会显示为 ¥0。
        </div>
      )}
    </div>
  );
}
