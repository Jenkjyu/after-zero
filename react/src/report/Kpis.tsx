// 两张KPI卡：加权平均利率 + 预计全部还清日期。直译自vanilla renderReportScreen()里
// 拼#reportKpis innerHTML的那两行(www/index.html)，复用既有的.summary/.kpi.half类名。
import type { ReportData } from "../types";

export interface KpisProps {
  data: ReportData;
}

export function Kpis({ data }: KpisProps) {
  return (
    <div className="summary" style={{ marginBottom: 18 }}>
      <div className="kpi half">
        <div className="v num">{data.avgRate ? data.avgRate.toFixed(2) : "0.00"}%</div>
        <div className="k">加权平均利率</div>
      </div>
      <div className="kpi half">
        <div className="v num">{data.payoffDate || "—"}</div>
        <div className="k">预计全部还清日期</div>
      </div>
    </div>
  );
}
