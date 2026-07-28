// "⋮"导出菜单——替代原来独立的两个按钮(ExportActions.tsx，本轮删除)，门禁逻辑原样保留自
// vanilla reportExportXlsxBtn/reportExportPdfBtn的click监听器，导出逻辑本身继续100%vanilla
// (exportReportXlsx/exportReportPdf零DOM依赖，只读debts造Blob，见CLAUDE.md"统计"一节)，
// 这里只是通过__azBridge触发。挂在Hero.tsx的hero-top右上角，视觉上跟"还款日"hero的铃铛
// 占同一个槽位(.report-hero-menu照抄.pay-hero-bell的图标按钮定位模式)。
import { Popover } from "../shared/Popover";
import type { Premium } from "../types";
import { openPremiumScreen } from "../shared/state";

export interface ExportMenuProps {
  premium: Premium;
}

export function ExportMenu({ premium }: ExportMenuProps) {
  function onXlsx(close: () => void) {
    close();
    if (!window.hasPremium(premium)) { openPremiumScreen(); return; }
    window.__azBridge.exportReportXlsx();
  }
  function onPdf(close: () => void) {
    close();
    if (!window.hasPremium(premium)) { openPremiumScreen(); return; }
    window.__azBridge.exportReportPdf();
  }

  return (
    <Popover
      align="end"
      renderTrigger={({ open, toggle }) => (
        <button type="button" className={"report-hero-menu" + (open ? " on" : "")} aria-label="导出报表" onClick={toggle}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>
      )}
      renderContent={({ close }) => (
        <div className="popover-menu-list">
          <button type="button" className="popover-menu-item" onClick={() => onXlsx(close)}>导出 Excel</button>
          <button type="button" className="popover-menu-item" onClick={() => onPdf(close)}>导出 PDF</button>
        </div>
      )}
    />
  );
}
