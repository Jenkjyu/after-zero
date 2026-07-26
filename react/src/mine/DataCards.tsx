// "我的"页4张纯操作卡：云备份/档案库/下载备份/上传备份。云备份是唯一带门禁的
// （hasPremium(premium)未过先跳订阅页），其余3张都是无条件触发对应的vanilla桥接函数——
// 这4张卡背后的真实逻辑（云备份的创建/恢复列表、档案库上传预览、备份文件的打包/解析、
// 系统文件选择器）全部继续100%vanilla，React这里只是入口按钮，跟CLAUDE.md"React 迁移"
// 一节里"sheet/subpage不重新实现"的原则一致。
//
// 注意：这个组件不渲染<input type="file">——原来的#importFileInput连同它的change监听器
// 整个留在vanilla（挪到了折叠后的挂载点外面），"上传备份文件"按钮只是调用桥接函数
// triggerImportFilePicker()去点击那个还留在vanilla DOM里的隐藏input。
import type { Premium } from "../types";
import { openPremiumScreen } from "../shared/state";

export interface DataCardsProps {
  premium: Premium;
}

export function DataCards({ premium }: DataCardsProps) {
  function onBackup() {
    if (!window.hasPremium(premium)) {
      openPremiumScreen();
      return;
    }
    window.__azBridge.openBackupScreen();
  }
  function onDocs() {
    window.__azBridge.openDocsScreen();
  }
  function onDownload() {
    window.__azBridge.downloadBackupFile();
  }
  function onImport() {
    window.__azBridge.triggerImportFilePicker();
  }

  return (
    <>
      <div className="data-card">
        <h3>云备份</h3>
        <p>Premium 会员专属：手动创建云端备份，每条记录都能单独恢复，换手机也能找回数据。</p>
        <div className="data-actions">
          <button type="button" className="btn ghost" onClick={onBackup}>打开云备份</button>
        </div>
      </div>
      <div className="data-card">
        <h3>档案库</h3>
        <p>保存借款合同、还款回执等文档和图片，仅存本设备。</p>
        <div className="data-actions">
          <button type="button" className="btn ghost" onClick={onDocs}>打开档案库</button>
        </div>
      </div>
      <div className="data-card">
        <h3>全部数据（债务 + 档案，导出/备份）</h3>
        <p>换手机、清缓存前，下载这份备份存好。含全部债务计划、档案文档和上传的文件。</p>
        <div className="data-actions">
          <button type="button" className="btn primary" onClick={onDownload}>下载备份文件</button>
        </div>
      </div>
      <div className="data-card">
        <h3>导入数据（覆盖当前）</h3>
        <p>选一份之前下载的备份文件，恢复债务、档案和上传的文件。</p>
        <div className="data-actions">
          <button type="button" className="btn ghost" onClick={onImport}>上传备份文件</button>
        </div>
      </div>
    </>
  );
}
