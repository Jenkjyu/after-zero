// 多策略对比规划的压力曲线图——3条"剩余总余额随时间下降"的曲线叠在一起，纯视觉印证，
// 不做scrub手势(理由见www/index.html里.strat-chart-wrap的注释：3条长度不同的线做逐帧
// 命中判定成本明显更高，且核心数字(总利息/还清月份)已经在结果卡片里说清楚了)。
// 不画坐标轴——跟Journey.tsx同一个判断，这里甚至更彻底：连里程碑文字标注都没有，因为
// 3条线要是各自都标一遍"起点/终点"文字会互相打架，那些数字已经在图表上方的结果卡片里。
export interface StrategyChartSeries {
  key: string;
  dotClass: string;
  points: { month: number; balance: number }[];
}
export interface StrategyChartProps {
  series: StrategyChartSeries[];
  labels: Record<string, string>;
}

const CH = 160, PAD = 10;
const PLOT_W = 300, PLOT_H = CH - PAD * 2;

export function StrategyChart({ series, labels }: StrategyChartProps) {
  const maxMonth = Math.max(1, ...series.map((s) => s.points[s.points.length - 1]?.month || 0));
  const maxBalance = Math.max(1, ...series.map((s) => s.points[0]?.balance || 0));
  const px = (m: number) => PAD + (m / maxMonth) * PLOT_W;
  const py = (b: number) => PAD + PLOT_H - (b / maxBalance) * PLOT_H;

  return (
    <div className="strat-chart-wrap">
      <svg viewBox={`0 0 ${PLOT_W + PAD * 2} ${CH}`} preserveAspectRatio="none" aria-hidden="true">
        {series.map((s) => {
          if (!s.points.length) return null;
          const d = "M " + s.points.map((p) => `${px(p.month)},${py(p.balance)}`).join(" L ");
          const last = s.points[s.points.length - 1];
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={`var(--${cssVar(s.dotClass)})`} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={px(last.month)} cy={py(last.balance)} r={3.5} fill={`var(--${cssVar(s.dotClass)})`} />
            </g>
          );
        })}
      </svg>
      <div className="strat-legend">
        {series.map((s) => (
          <div className="strat-legend-item" key={s.key}>
            <span className={"strat-dot " + s.dotClass} aria-hidden="true" />
            {labels[s.key]}
          </div>
        ))}
      </div>
    </div>
  );
}

// dotClass是"s1"/"s2"/"s3"，对应CSS变量--strat-1/2/3——这里只是把.strat-dot.s1那套
// class命名规则转换成SVG stroke/fill能直接用的var(--strat-1)这种形式，两边共用同一份
// 数字后缀，不需要维护两份映射。
function cssVar(dotClass: string): string {
  const n = dotClass.replace("s", "");
  return "strat-" + n;
}
