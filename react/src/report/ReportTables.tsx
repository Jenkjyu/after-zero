// 数据明细表（各债务余额/债务类型占比/负债预测走势），直译自vanilla renderReportTables(data)
// （www/index.html）。默认直接展开，不用<details>折叠——这个项目已经明确弃用过原生
// <details>/<summary>（见CLAUDE.md"统计"一节），延续同一偏好。
import type { ReportData } from "../types";

export interface ReportTablesProps {
  data: ReportData;
}

export function ReportTables({ data }: ReportTablesProps) {
  return (
    <div className="viz-block">
      <div className="viz-title">数据明细表</div>
      <div className="preview-label" style={{ margin: "10px 2px 4px" }}>各债务余额</div>
      <table><tbody>
        {data.byName.map((x, i) => (
          <tr key={i}><td>{x.name}</td><td className="num">¥{window.fmt(x.balance)}</td></tr>
        ))}
      </tbody></table>
      <div className="preview-label" style={{ margin: "14px 2px 4px" }}>债务类型占比</div>
      <table><tbody>
        {data.typeList.map((x, i) => (
          <tr key={i}><td>{x.name}</td><td className="num">¥{window.fmt(x.value)}</td></tr>
        ))}
      </tbody></table>
      <div className="preview-label" style={{ margin: "14px 2px 4px" }}>负债预测走势</div>
      <table><tbody>
        {data.timeline.map((p, i) => (
          <tr key={i}><td>{p.date}</td><td className="num">¥{window.fmt(p.balance)}</td></tr>
        ))}
      </tbody></table>
    </div>
  );
}
