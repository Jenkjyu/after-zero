// 还款提醒通知设置面板——第八步(React迁移收尾)从vanilla的#notifySheet原样复刻。规则数据
// (notify)仍然通过useNotify()读(见shared/state.ts)，真正的原生权限检查/申请/调度这几件
// impure的事继续留在vanilla，桥接给setNotifyEnabled/addNotifyRule/deleteNotifyRule/
// sendTestNotification这4个新增的__azBridge函数——跟"云备份"这批"UI搬进React、cloud/native
// 调用留vanilla"是同一个原则。
import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { closeNotifySheet, useNotify, useNotifySheetOpen } from "../shared/state";

export function NotifySheet() {
  const isOpen = useNotifySheetOpen();
  const notify = useNotify();
  // 乐观更新：勾选/取消通知开关时先立刻反映在checkbox上，原生权限检查/申请这段异步操作
  // 结束(不管成不成功)后交还给notify.enabled——跟vanilla原来"先勾选、如果被拒再回退"的
  // 未受控checkbox效果一致，避免controlled input在等待系统权限弹窗这段真实耗时里显得卡顿。
  const [pendingChecked, setPendingChecked] = useState<boolean | null>(null);
  const checked = pendingChecked !== null ? pendingChecked : notify.enabled;
  const [offsetDays, setOffsetDays] = useState<0 | 1 | 2 | 3>(0);
  const [time, setTime] = useState("09:00");

  useEffect(() => {
    window.__azNotifySheetBack = () => {
      if (isOpen) { handleClose(); return true; }
      return false;
    };
    return () => { delete window.__azNotifySheetBack; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, notify]);

  function handleClose() {
    // 开了通知但一条规则都没加就退出：兜底成"当天到期 09:00"，不能让用户开了开关却
    // 什么都收不到——原样照抄vanilla closeNotifySheet()里的这条兜底逻辑。
    if (notify.enabled && notify.rules.length === 0) {
      window.__azBridge.addNotifyRule(0, "09:00");
    }
    closeNotifySheet();
  }

  function onToggle(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked;
    setPendingChecked(next);
    window.__azBridge.setNotifyEnabled(next).then(() => setPendingChecked(null));
  }
  function onAddRule() {
    window.__azBridge.addNotifyRule(offsetDays, time || "09:00");
  }

  return (
    <>
      <div className={"scrim" + (isOpen ? " open" : "")} onClick={handleClose} />
      <div className={"sheet" + (isOpen ? " open" : "")} role="dialog" aria-modal="true" aria-labelledby="notifyTitle">
        <div className="grip" />
        {/* 滚动放在这层、不放在.sheet上——.sheet同时有圆角+overflow:auto+transform时
            会被判定成不透明合成滚动层，深色模式下圆角处会露白底(见www/index.html里
            .sheet那段注释)。grip留在这层外面，拖动条永远在顶部不被内容滚走。 */}
        <div className="sheet-scroll">
          <h2 id="notifyTitle">还款提醒通知</h2>
          <label className="switch-row">
            <span>启用通知</span>
            <span className="switch"><input type="checkbox" checked={checked} onChange={onToggle} /><span className="switch-track" /></span>
          </label>
          {checked && (
            <div className="notify-settings">
              <button type="button" className="btn ghost" style={{ width: "100%" }} onClick={() => window.__azBridge.sendTestNotification()}>发送测试通知（10秒后）</button>
              <div className="footnote notify-test-note">若收不到通知，先在系统设置中允许通知。</div>
              <div className="section-label" style={{ marginTop: 14 }}>提醒规则（对所有在还债务统一生效）</div>
              <div>
                {notify.rules.length === 0 ? (
                  <div className="footnote" style={{ margin: "4px 2px 8px", textAlign: "left" }}>还没有提醒规则，添加一条吧</div>
                ) : (
                  notify.rules.map((r, idx) => (
                    <div className="notify-rule" key={idx}>
                      <span className="nr-text">{window.offsetLabel(r.offsetDays)} · {r.time}</span>
                      <button type="button" className="nr-del" onClick={() => window.__azBridge.deleteNotifyRule(idx)}>删除</button>
                    </div>
                  ))
                )}
              </div>
              <div className="section-label" style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>添加新提醒</div>
              <div className="notify-add">
                <select value={offsetDays} onChange={(e) => setOffsetDays(Number(e.target.value) as 0 | 1 | 2 | 3)}>
                  <option value={0}>到期当天</option>
                  <option value={1}>提前1天</option>
                  <option value={2}>提前2天</option>
                  <option value={3}>提前3天</option>
                </select>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                <button type="button" className="btn ghost" onClick={onAddRule}>添加</button>
              </div>
            </div>
          )}
          <div className="sheet-actions" style={{ marginTop: 14 }}>
            <button type="button" className="btn primary" onClick={handleClose}>完成</button>
          </div>
        </div>
      </div>
    </>
  );
}
