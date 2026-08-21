import { useEffect, useMemo, useRef, useState } from "react";
import type { AiImportCredits } from "../types";
import {
  closeAiImportScreen,
  NEW_DEBT_ID,
  openEditSheet,
  setAiImportDraft,
  useAiImportScreenOpen,
} from "../shared/state";

type SelectedImage = { id: string; file: File; url: string };

function makeTaskKey(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "aiimp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

export function AiImportScreen() {
  const isOpen = useAiImportScreenOpen();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imagesRef = useRef<SelectedImage[]>([]);
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [credits, setCredits] = useState<AiImportCredits | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<"idle" | "uploading" | "recognizing">("idle");
  const [completed, setCompleted] = useState(0);
  const [taskKey, setTaskKey] = useState(makeTaskKey);

  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => () => { imagesRef.current.forEach((item) => URL.revokeObjectURL(item.url)); }, []);
  useEffect(() => {
    function resetWorkspace() {
      imagesRef.current.forEach((item) => URL.revokeObjectURL(item.url));
      setImages([]); setTaskKey(makeTaskKey()); setError(""); setStage("idle"); setCompleted(0);
    }
    window.addEventListener("az:ai-import-workspace-reset", resetWorkspace);
    return () => window.removeEventListener("az:ai-import-workspace-reset", resetWorkspace);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    window.__azBridge.getAiDebtImportStatus().then((result) => setCredits(result.credits)).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "暂时无法读取识图额度");
    });
  }, [isOpen]);

  useEffect(() => {
    window.__azAiImportScreenBack = () => {
      if (isOpen && !busy) { closeAiImportScreen(); return true; }
      return isOpen;
    };
    return () => { delete window.__azAiImportScreenBack; };
  }, [busy, isOpen]);

  const statusText = useMemo(() => {
    if (stage === "uploading") return `正在上传 ${completed}/${images.length}`;
    if (stage === "recognizing") return "正在识别并合并还款计划…";
    return "";
  }, [completed, images.length, stage]);

  function resetTask() {
    setTaskKey(makeTaskKey());
    setError("");
    setStage("idle");
    setCompleted(0);
  }

  function selectFiles(files: FileList | null) {
    if (!files) return;
    const nextFiles = Array.from(files).filter((file) => file.type.startsWith("image/")).slice(0, 20 - images.length);
    if (!nextFiles.length) { window.__azBridge.toast("请选择图片文件"); return; }
    const next = nextFiles.map((file, index) => ({
      id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      url: URL.createObjectURL(file),
    }));
    setImages((current) => current.concat(next));
    resetTask();
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeImage(id: string) {
    setImages((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
    resetTask();
  }

  function moveImage(index: number, offset: number) {
    setImages((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = current.slice();
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
    resetTask();
  }

  async function recognize() {
    if (!images.length || busy) return;
    setBusy(true); setError(""); setStage("uploading"); setCompleted(0);
    try {
      const result = await window.__azBridge.startAiDebtImport(
        images.map((item) => item.file),
        taskKey,
        (nextStage, done) => { setStage(nextStage); setCompleted(done); },
      );
      if (!result.draft) throw new Error("识别成功但没有生成可编辑草稿");
      setCredits(result.credits);
      setAiImportDraft({ sessionId: result.sessionId, draft: result.draft });
      closeAiImportScreen();
      openEditSheet(NEW_DEBT_ID);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "识别失败，请稍后重试");
      setStage("idle");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={"subpage ai-import-screen" + (isOpen ? " open" : "")} id="aiImportScreen">
      <div className="subpage-header">
        <button type="button" className="subpage-back" aria-label="返回" disabled={busy} onClick={closeAiImportScreen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="subpage-title">AI 识图录入</div>
        <div className="subpage-header-spacer" />
      </div>
      <div className="subpage-body ai-import-body">
        <div className="ai-import-steps" aria-label="录入步骤">
          <span className="active"><b>1</b>上传截图</span><i>→</i><span><b>2</b>识别草稿</span><i>→</i><span><b>3</b>补齐确认</span>
        </div>
        <section className="ai-import-intro">
          <h2>上传同一笔债务的还款计划截图</h2>
          <p>多张截图会按当前顺序合并成一份可编辑草稿。草稿不会自动写入账本。</p>
          <div className="ai-import-credit">
            {credits ? `剩余 ${credits.remaining}/${credits.limit} 次` : "正在读取额度…"}
          </div>
        </section>

        <input ref={inputRef} className="ai-import-file-input" type="file" accept="image/*" multiple onChange={(event) => selectFiles(event.target.files)} />
        <button type="button" className="ai-import-add" disabled={busy || images.length >= 20} onClick={() => inputRef.current?.click()}>
          <span aria-hidden="true">＋</span>{images.length ? "继续添加截图" : "选择还款计划截图"}
        </button>

        {images.length ? <div className="ai-import-grid" aria-label="已选截图">
          {images.map((item, index) => <article className="ai-import-image" key={item.id}>
            <img src={item.url} alt={`第 ${index + 1} 张截图`} />
            <div className="ai-import-image-index">{index + 1}</div>
            <div className="ai-import-image-actions">
              <button type="button" aria-label={`第 ${index + 1} 张前移`} disabled={busy || index === 0} onClick={() => moveImage(index, -1)}>↑</button>
              <button type="button" aria-label={`第 ${index + 1} 张后移`} disabled={busy || index === images.length - 1} onClick={() => moveImage(index, 1)}>↓</button>
              <button type="button" aria-label={`删除第 ${index + 1} 张`} disabled={busy} onClick={() => removeImage(item.id)}>×</button>
            </div>
          </article>)}
        </div> : null}

        {statusText ? <div className="ai-import-progress" role="status"><span className="ai-import-spinner" />{statusText}</div> : null}
        {error ? <div className="ai-import-error" role="alert">{error}</div> : null}

        <div className="ai-import-rules">
          <strong>识别规则</strong>
          <p>同一笔债务可上传多张截图，点击一次“开始识别”后合并生成一份草稿，仅消耗 1 次额度；识别失败不扣次数。</p>
        </div>
        <button type="button" className="btn primary ai-import-start" disabled={busy || !images.length} onClick={recognize}>
          {busy ? "识别中…" : "开始识别"}
        </button>
      </div>
    </div>
  );
}
