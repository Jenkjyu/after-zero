// 云备份——第十步(React迁移收尾)从vanilla的#backupScreen原样复刻。跟"我的"tab当年的云备份
// 入口不同——这次是里面的实际内容(创建/列表/恢复/删除4个cloud函数调用)搬进React，不再只是
// trigger-only。全部cloud函数调用(ensureCbAuthReady/cbApp().callFunction这套认证会话状态)
// 继续100%vanilla，React只拿到调用结果——跟aiAdvisor/wxLogin同一个"认证会话状态是vanilla
// 独占的、不可移植"的原因。
import { useEffect, useState } from "react";
import { closeBackupScreen, useBackupScreenOpen } from "../shared/state";
import type { BackupRecord } from "../types";

type LoadState = "loading" | "ready" | "error";

function sizeText(bytes: number): string {
  const kb = Math.round(bytes / 1024);
  return kb > 1024 ? (kb / 1024).toFixed(1) + " MB" : kb + " KB";
}

export function BackupScreen() {
  const isOpen = useBackupScreenOpen();
  const [state, setState] = useState<LoadState>("loading");
  const [list, setList] = useState<BackupRecord[]>([]);
  const [error, setError] = useState("");
  const [lastBackupAt, setLastBackupAt] = useState(0);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setState("loading");
    try {
      const l = await window.__azBridge.listBackups();
      setList(l);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
      setState("error");
    }
  }

  // 每次打开screen都重新拉一遍(照抄vanilla原来openBackupScreen()里renderBackupMeta()+
  // renderBackupList()的效果)，不是常驻订阅——备份记录列表不是"数据变了自动跟上"这种共享
  // 状态，是这个screen自己私有的、每次打开都值得重新问一遍服务端的东西。
  useEffect(() => {
    if (!isOpen) return;
    setLastBackupAt(window.__azBridge.getBackupMeta().lastBackupAt);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    window.__azBackupScreenBack = () => {
      if (isOpen) { closeBackupScreen(); return true; }
      return false;
    };
    return () => { delete window.__azBackupScreenBack; };
  }, [isOpen]);

  async function onCreate() {
    if (creating) return;
    setCreating(true);
    const ok = await window.__azBridge.createBackup();
    setCreating(false);
    if (ok) {
      setLastBackupAt(window.__azBridge.getBackupMeta().lastBackupAt);
      refresh();
    }
  }
  async function onRestore(rec: BackupRecord) {
    const ok = await window.__azBridge.confirmAsync(
      "恢复这条备份？",
      `创建于 ${new Date(rec.createdAt).toLocaleString()} 的这条备份记录，将覆盖本机当前的全部债务/档案/设置数据。此操作不可撤销，确定继续吗？`
    );
    if (!ok) return;
    await window.__azBridge.restoreBackup(rec.id);
  }
  async function onDelete(rec: BackupRecord) {
    const ok = await window.__azBridge.confirmAsync("删除这条备份记录？", "删除后无法恢复这条备份，确定继续吗？");
    if (!ok) return;
    const success = await window.__azBridge.deleteBackup(rec.id);
    if (success) refresh();
  }

  return (
    <div className={"subpage" + (isOpen ? " open" : "")} id="backupScreen">
      <div className="subpage-header">
        <button type="button" className="subpage-back" aria-label="返回" onClick={closeBackupScreen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="subpage-title">云备份</div>
        <div className="subpage-header-spacer" />
      </div>
      <div className="subpage-body">
        <div className="data-card">
          <p style={{ marginBottom: 0 }}>手动创建云端备份，每一条都是独立记录，可以随时选一条恢复到本机。恢复会覆盖本机当前的全部数据，请谨慎操作。</p>
        </div>
        <div className="data-card">
          <div className="sync-status-row"><span className="sync-status-label">上次备份</span><span className="sync-status-value">{lastBackupAt ? new Date(lastBackupAt).toLocaleString() : "从未备份"}</span></div>
          <div className="data-actions" style={{ marginTop: 8 }}><button type="button" className="btn primary" disabled={creating} onClick={onCreate}>创建备份</button></div>
        </div>
        <div className="section-label" style={{ marginTop: 6 }}>备份记录</div>
        <div id="backupList">
          {state === "loading" ? (
            <div className="footnote" style={{ textAlign: "left" }}>加载中…</div>
          ) : state === "error" ? (
            <div className="footnote" style={{ textAlign: "left" }}>获取备份列表失败：{error}</div>
          ) : list.length === 0 ? (
            <div className="footnote" style={{ textAlign: "left" }}>还没有备份记录，点上面的按钮创建第一条</div>
          ) : (
            list.map((rec) => (
              <div className="backup-row" key={rec.id}>
                <div className="backup-row-main">
                  <div className="backup-row-time">{new Date(rec.createdAt).toLocaleString()}</div>
                  <div className="backup-row-sub">{rec.debtsCount} 笔债务 · {rec.filesCount} 个文件 · {sizeText(rec.totalSizeBytes)}</div>
                </div>
                <div className="backup-row-actions">
                  <button type="button" className="btn ghost" onClick={() => onRestore(rec)}>恢复</button>
                  <button type="button" className="btn danger" onClick={() => onDelete(rec)}>删除</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
