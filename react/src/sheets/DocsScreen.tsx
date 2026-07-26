// 档案库——第九步(React迁移收尾)从vanilla的#docsScreen原样复刻。IndexedDB(uploads的blob
// 存储)、docs数组增删、SaveFile/原生分享这几件impure的事全部留在vanilla，桥接给
// getFiles/uploadArchiveFile/deleteArchiveFile/downloadArchiveFile/shareArchiveFile这
// 5个函数(见types.ts里AzBridge新增的注释)。预览选中状态(原vanilla的docSel模块变量)完全
//变成组件本地state，按FileItem.id(稳定标识，不是下标)判断"当前选中的文件是否还在列表里"，
// 避免splice导致的下标顺移误判——跟deleteDebt自动关闭那个坑是同一类解法。
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { closeDocsScreen, useDocsScreenOpen, useFiles } from "../shared/state";
import type { FileItem } from "../types";

const ICON_IMG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 15.5l-5.5-5-9.5 8.5" /></svg>
);
const ICON_PDF = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l5 5v12.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5" /><path d="M8.5 14.5h2M12.5 14.5h3M8.5 17.5h7" /></svg>
);
const ICON_CLIP = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 8.5 9.9 16.1a3 3 0 0 1-4.2-4.2l8-8a4.5 4.5 0 1 1 6.4 6.4l-8.2 8.2a1.5 1.5 0 0 1-2.1-2.1L16.3 9.9" /></svg>
);
const ICON_DOC = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l5 5v12.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5" /><path d="M8.5 13h7M8.5 16.5h7" /></svg>
);

function iconFor(it: FileItem) {
  if (!it.upload) return ICON_DOC;
  if (/^image\//.test(it.mime)) return ICON_IMG;
  if (/pdf/.test(it.mime)) return ICON_PDF;
  return ICON_CLIP;
}

export function DocsScreen() {
  const isOpen = useDocsScreenOpen();
  const files = useFiles();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selected = selectedId ? files.find((f) => f.id === selectedId) : undefined;

  // 选中的文件不在最新列表里了(被删除/备份恢复导入整体替换)：自动清空选中，
  // 对应vanilla原来"docSel===k时顺手清空"以及恢复/导入后强制docSel=-1的效果。
  useEffect(() => {
    if (selectedId && !files.some((f) => f.id === selectedId)) setSelectedId(null);
  }, [files, selectedId]);

  useEffect(() => {
    window.__azDocsScreenBack = () => {
      if (isOpen) { closeDocsScreen(); return true; }
      return false;
    };
    return () => { delete window.__azDocsScreenBack; };
  }, [isOpen]);

  function onRowClick(id: string) {
    setSelectedId((cur) => (cur === id ? null : id));
  }
  function onUploadClick() {
    fileInputRef.current?.click();
  }
  function onUploadChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    window.__azBridge.uploadArchiveFile(file);
  }
  async function onDownload(it: FileItem, e: MouseEvent) {
    e.stopPropagation();
    if (downloadingId) return;
    setDownloadingId(it.id);
    await window.__azBridge.downloadArchiveFile(it.id);
    setDownloadingId(null);
  }
  async function onDelete(it: FileItem, e: MouseEvent) {
    e.stopPropagation();
    const title = it.upload ? "删除文件" : "删除文档";
    const ok = await window.__azBridge.confirmAsync(title, `删除「${it.label}」？此操作不可撤销。`);
    if (!ok) return;
    await window.__azBridge.deleteArchiveFile(it.id);
    window.__azBridge.toast("已删除");
  }

  return (
    <div className={"subpage" + (isOpen ? " open" : "")} id="docsScreen">
      <div className="subpage-header">
        <button type="button" className="subpage-back" aria-label="返回" onClick={closeDocsScreen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="subpage-title">档案库</div>
        <div className="subpage-header-spacer" />
      </div>
      <div className="subpage-body">
        <div className="section-label">文档与文件（图片/PDF等，仅存本设备）</div>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          accept=".jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.bmp,.pdf,.md,.markdown,.doc,.docx,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={onUploadChange}
        />
        <button className="add-btn" type="button" onClick={onUploadClick}>＋ 上传文件</button>
        <div id="fileList">
          {files.map((it) => (
            <div key={it.id} className="file-row" aria-current={it.id === selectedId ? "true" : "false"} onClick={() => onRowClick(it.id)}>
              <span className="file-ic">{iconFor(it)}</span>
              <span className="file-name"><span className="fl">{it.label}</span><small>{it.name}</small></span>
              {it.upload || it.content ? (
                <>
                  <button type="button" className="file-dl file-get" disabled={downloadingId === it.id} onClick={(e) => onDownload(it, e)}>下载</button>
                  <button type="button" className="file-dl file-del" onClick={(e) => onDelete(it, e)}>删除</button>
                </>
              ) : null}
            </div>
          ))}
        </div>
        <div className="preview-label" style={{ display: selected ? "block" : "none" }}>预览</div>
        <div id="docContent">
          {selected ? <PreviewBody it={selected} /> : null}
        </div>
      </div>
    </div>
  );
}

function PreviewBody({ it }: { it: FileItem }) {
  if (it.upload && /^image\//.test(it.mime)) {
    return (
      <>
        <div className="doc-body"><img className="poster" alt={it.label} src={it.url} /></div>
        <div className="footnote" style={{ textAlign: "left", marginTop: 8, padding: 0 }}>长按图片可保存到手机相册。</div>
      </>
    );
  }
  if (it.upload && /pdf/.test(it.mime)) {
    return (
      <div className="doc-body">
        <embed src={it.url} type="application/pdf" style={{ width: "100%", height: "70vh", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)" }} />
        <div className="footnote" style={{ textAlign: "left", marginTop: 8, padding: 0 }}>长按预览区可保存到手机 / 通过分享菜单发送；若空白说明此设备浏览器不支持内嵌 PDF 预览。</div>
      </div>
    );
  }
  if (it.upload) {
    return (
      <div className="doc-body">
        <div className="footnote" style={{ textAlign: "left", padding: 0, marginBottom: 10 }}>此文件类型（{it.mime || "未知"}）不支持内嵌预览。</div>
        <div className="data-actions"><button type="button" className="btn primary" onClick={() => window.__azBridge.shareArchiveFile(it.id)}>分享 / 保存</button></div>
      </div>
    );
  }
  return <div className="doc-body md-body" dangerouslySetInnerHTML={{ __html: window.mdToHtml(it.content || "") }} />;
}
