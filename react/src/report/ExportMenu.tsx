// 导出菜单——Excel / PDF 二选一。门禁逻辑原样保留自 vanilla
// reportExportXlsxBtn/reportExportPdfBtn 的 click 监听器；导出逻辑本身继续 100% vanilla
// (exportReportXlsx/exportReportPdf 零 DOM 依赖，只读 debts 造 Blob，见 AGENTS.md"统计"一节)，
// 这里只是通过 __azBridge 触发。
//
// ⚠️触发器从"⋮ 三点图标"换成了具名按钮，位置从 hero 右上角挪到页尾的结语块里。
// 理由：⋮ 这个符号在全 App 只有统计页用过一处，是数据后台的方言；而这一版的统计页
// 是一份"报告"，"导出这份报告"放在报告末尾比藏在标题栏的三个点里更符合读完之后的动作。
// Popover 组件本身没变（还是 createPortal 挂 document.body + 视口钳制那套）。
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
      align="start"
      renderTrigger={({ toggle }) => (
        <button type="button" className="btn primary" aria-label="导出报表" onClick={toggle}>
          <svg className="btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" /><path d="M7.5 10.5L12 15l4.5-4.5" />
            <path d="M4 18.5v.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5" />
          </svg>
          导出这份报告
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
