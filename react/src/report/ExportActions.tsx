// 导出Excel/PDF两个按钮——premium门禁判断原样复刻自vanilla（www/index.html里
// reportExportXlsxBtn/reportExportPdfBtn的click监听器），导出逻辑本身继续100%vanilla
// (exportReportXlsx/exportReportPdf零DOM依赖，只读debts造Blob，见CLAUDE.md"统计"一节)，
// 这里只是通过__azBridge触发。
import type { Premium } from "../types";

export interface ExportActionsProps {
  premium: Premium;
}

export function ExportActions({ premium }: ExportActionsProps) {
  function onXlsx() {
    if (!window.hasPremium(premium)) { window.__azBridge.openPremiumScreen(); return; }
    window.__azBridge.exportReportXlsx();
  }
  function onPdf() {
    if (!window.hasPremium(premium)) { window.__azBridge.openPremiumScreen(); return; }
    window.__azBridge.exportReportPdf();
  }
  return (
    <div className="report-actions">
      <button type="button" className="btn ghost" onClick={onXlsx}>导出 Excel</button>
      <button type="button" className="btn ghost" onClick={onPdf}>导出 PDF</button>
    </div>
  );
}
