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
            <div key={it.id} className={"file-row" + (it.id === selectedId ? " selected" : "")}>
              <button type="button" className="file-preview-btn" aria-pressed={it.id === selectedId} onClick={() => onRowClick(it.id)}>
                <span className="file-ic">{iconFor(it)}</span>
                <span className="file-name"><span className="fl">{it.label}</span><small>{it.name}</small></span>
              </button>
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
    return <PdfPreview it={it} />;
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

// 安卓WebView没有内置的PDF渲染插件(<embed type="application/pdf">在桌面Chrome能显示是因为桌面
// Chrome自带PDFium插件，安卓WebView从AOSP层面就没有这个东西，不是品牌定制导致的差异)，之前
// 用<embed>只能拿到一片空白。这里改成用pdf.js(见www/index.html里挂到window.pdfjsLib那段
// 注释)把每一页真正解码画到<canvas>上，多页纵向堆叠、页面body本身可滚动，是真正的内嵌预览，
// 不再依赖设备浏览器有没有PDF插件。
function PdfPreview({ it }: { it: FileItem }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let doc: PdfjsDocumentProxy | null = null;
    setStatus("loading");
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib || !it.url) { setStatus("error"); return; }

    fetch(it.url)
      .then((r) => r.arrayBuffer())
      .then((buf) => pdfjsLib.getDocument({ data: buf }).promise)
      .then(async (loadedDoc) => {
        doc = loadedDoc;
        const container = containerRef.current;
        if (cancelled || !container) return;
        container.innerHTML = "";
        const dpr = window.devicePixelRatio || 1;
        const containerWidth = container.clientWidth || 320;
        for (let n = 1; n <= loadedDoc.numPages; n++) {
          if (cancelled) return;
          const page = await loadedDoc.getPage(n);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = (containerWidth / baseViewport.width) * dpr;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.width = "100%";
          canvas.style.display = "block";
          canvas.style.marginBottom = n < loadedDoc.numPages ? "8px" : "0";
          canvas.style.borderRadius = "6px";
          container.appendChild(canvas);
          // jsdom测试环境里getContext("2d")返回null(没有真实canvas实现)，这里判空跳过实际
          // 渲染调用——真机/真实浏览器里ctx永远非空，不影响生产行为，只是让组件在测试里
          // 能安全跑到"渲染出N个canvas"这一步而不报错。
          const ctx = canvas.getContext("2d");
          if (ctx) await page.render({ canvasContext: ctx, viewport }).promise;
        }
      })
      .then(() => { if (!cancelled) setStatus("ready"); })
      .catch(() => { if (!cancelled) setStatus("error"); });

    return () => {
      cancelled = true;
      if (doc) doc.destroy();
    };
  }, [it.url]);

  return (
    <div className="doc-body">
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: status === "ready" ? 8 : 16, minHeight: status === "ready" ? undefined : 80 }}>
        {status === "loading" ? <div className="footnote" style={{ textAlign: "left", padding: 0 }}>正在加载 PDF…</div> : null}
        {/* 这个div永远不由React渲染任何子节点(JSX里从来不给它塞内容)——canvas是effect里
            container.appendChild()直接塞进真实DOM的，跟React的虚拟DOM完全脱节。踩过一次坑：
            最早把"正在加载"文字也塞进这同一个节点里，effect的container.innerHTML=""会把
            React自己渲染的这个子节点也清掉，等status变化触发重渲染、React想去移除它记忆里
            那个子节点时，那个节点早就被我们自己删了，报NotFoundError。分离成兄弟节点后，
            这个div对React来说"子节点列表永远是空的"，React不会再尝试去碰里面任何东西。 */}
        <div ref={containerRef} className="pdf-preview" />
      </div>
      {status === "error" ? (
        <>
          <div className="footnote" style={{ textAlign: "left", marginTop: 8, padding: 0, marginBottom: 10 }}>PDF 预览失败，可点下方按钮分享/保存后用其他应用打开。</div>
          <div className="data-actions"><button type="button" className="btn primary" onClick={() => window.__azBridge.shareArchiveFile(it.id)}>分享 / 保存</button></div>
        </>
      ) : null}
    </div>
  );
}
