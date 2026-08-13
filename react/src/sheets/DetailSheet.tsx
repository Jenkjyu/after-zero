// 债务详情窗——原样照抄vanilla openDetail()拼#dInfo那段HTML的逻辑，改成JSX(esc()不需要了，
// JSX文本插值天然转义，同"统计"tab当年的道理)。这是"React 迁移"第一次把sheet的实际内容
// (不只是容器)搬进React，也是第一个不属于任何tab、常驻挂载的React入口——见AGENTS.md
// "React 迁移"一节detailSheet那部分的完整背景。
//
// 打开/关闭这个sheet不再经过window.__azBridge——openDetailSheet(id)/closeDetailSheet()是纯
// React侧状态(shared/state.ts)，"在还债务"/"还款日"两棵独立的React树都直接调用它们。
// "销这期"/"提前结清"/"编辑"/"提前还款模拟"这几个真正改数据或跳转到别的vanilla浮层的操作，
// 依然通过__azBridge调用vanilla函数——vanilla保留的这几个函数完全没有被重新实现。
import { useEffect, useRef, useState } from "react";
import { closeDetailSheet, openEditSheet, openSimScreen, useDebts, useDetailSheetId } from "../shared/state";
import { makeGripDragState, onGripPointerDown, onGripPointerEnd, onGripPointerMove } from "./gripDrag";
import type { PlanRow } from "../types";

function kv(k: string, v: string) {
  return (
    <div>
      <div className="k">{k}</div>
      <div className="v num">{v}</div>
    </div>
  );
}

export function DetailSheet() {
  const openId = useDetailSheetId();
  const isOpen = openId !== null;
  const debts = useDebts();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const gripRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef(makeGripDragState());

  // 关闭动画(translateY滑出屏幕)播放期间内容不能瞬间清空——冻结在最后一次打开时的债务上，
  // 跟vanilla"关闭时不清#dInfo，只是CSS把sheet挪出屏幕"效果一致。
  const [displayId, setDisplayId] = useState<string | null>(null);
  useEffect(() => {
    if (openId !== null) setDisplayId(openId);
  }, [openId]);

  // 打开时重置上次拖拽调整过的高度——对应vanilla openDetail()开头的
  // $("detailSheet").style.height = ""。
  useEffect(() => {
    if (openId !== null && sheetRef.current) sheetRef.current.style.height = "";
  }, [openId]);

  // 结清(或这笔债务因为被删除/备份恢复/导入等原因从debts数组消失)时自动关闭——这是vanilla
  // payInstallment()里"if (d.settled) closeDetail()"那行逻辑的等效替代，靠React对debts
  // 变化的自动重渲染实现，不需要vanilla显式回调关闭。这个前提依赖shared/state.ts的
  // useDebts()在payInstallment/settleFull这类"原地mutate debts元素、不整体重新赋值"的
  // 操作后依然能正确触发重渲染——这是真实踩过的坑，修法和踩坑细节见useDebts()自己的注释。
  // 按id(不是下标)查找这笔债务是否还在——对splice导致的下标顺移天然免疫，见AGENTS.md
  // "债务对象加了真正的id字段"一节。故意不写[debts, openId]依赖数组、改成每次渲染后都跑：
  // 这个判断很便宜，没有明显开销，不依赖"debts引用一定会变"这个前提也能正确工作，属于双重保险。
  useEffect(() => {
    if (openId !== null) {
      const d = debts.find((x) => x.id === openId);
      if (!d || d.settled) closeDetailSheet();
    }
  });

  // 硬件/手势返回键"最上层先关"优先级链——vanilla的__handleBackButton调用这个函数，
  // 排在链上最后一项(detailSheet优先级最低)，跟react/src/debts/DebtList.tsx注册
  // window.__azDebtsBack是同一个模式。
  useEffect(() => {
    window.__azDetailSheetBack = () => {
      if (openId !== null) {
        closeDetailSheet();
        return true;
      }
      return false;
    };
    return () => {
      delete window.__azDetailSheetBack;
    };
  }, [openId]);

  // iOS WKWebView 不会始终把内层 .sheet-scroll 的 overscroll-behavior 当成根滚动链屏障。
  // 详情的还款计划较长时，滚到边界后不能继续带动下方的债务主页。
  useEffect(() => {
    if (!isOpen) return;
    const root = document.documentElement;
    root.classList.add("az-detail-sheet-open");
    document.body.classList.add("az-detail-sheet-open");
    return () => {
      root.classList.remove("az-detail-sheet-open");
      document.body.classList.remove("az-detail-sheet-open");
    };
  }, [isOpen]);

  useEffect(() => {
    const grip = gripRef.current;
    const sheet = sheetRef.current;
    if (!grip || !sheet) return;
    const state = dragStateRef.current;
    function handleDown(e: PointerEvent) { onGripPointerDown(e, sheet!, grip!, state); }
    function handleMove(e: PointerEvent) { onGripPointerMove(e, sheet!, state, true); }
    function handleEnd(e: PointerEvent) { onGripPointerEnd(e, sheet!, state, closeDetailSheet); }
    grip.addEventListener("pointerdown", handleDown);
    grip.addEventListener("pointermove", handleMove);
    grip.addEventListener("pointerup", handleEnd);
    grip.addEventListener("pointercancel", handleEnd);
    return () => {
      grip.removeEventListener("pointerdown", handleDown);
      grip.removeEventListener("pointermove", handleMove);
      grip.removeEventListener("pointerup", handleEnd);
      grip.removeEventListener("pointercancel", handleEnd);
    };
  }, []);

  const d = displayId !== null ? debts.find((x) => x.id === displayId) : undefined;

  function onEdit() {
    if (displayId === null) return;
    closeDetailSheet();
    openEditSheet(displayId);
  }
  function onSale() {
    if (displayId === null) return;
    window.__azBridge.payInstallment(displayId);
  }
  function onSimulate() {
    if (displayId === null) return;
    closeDetailSheet();
    openSimScreen(displayId);
  }
  function onSettle() {
    if (displayId === null) return;
    window.__azBridge.settleFull(displayId);
  }
  function onWaive() {
    if (displayId === null) return;
    window.__azBridge.waiveInstallment(displayId);
  }

  let nextNo = -1;
  const plan = d && d.plan ? d.plan : [];
  for (let k = 0; k < plan.length; k++) {
    if (!plan[k].paid) { nextNo = k; break; }
  }
  // 部分还款(已知的数据模型缺口④)的小字提示——还没还完但已经攒了钱的行显示"已还/欠"，
  // 被"协商减免"强制关闭的行(paidAmount显式小于amount、且不是提前结清行)显示"实收/减免"。
  // principal/interest这两个字段本身没被这次改动动过(那是原计划)，所以这里单独算一遍
  // 实际收到的钱，不能直接读表格里本金/利息那两列。
  function partialNote(r: PlanRow): string | null {
    if (r.settleRow) return null;
    if (!r.paid && r.paidAmount) return "已还 ¥" + window.money(r.paidAmount) + "，欠 ¥" + window.money(window.rowRemaining(r));
    if (r.paid && r.paidAmount != null && r.paidAmount < r.amount - 0.005) {
      return "实收 ¥" + window.money(r.paidAmount) + "，减免 ¥" + window.money(r.amount - r.paidAmount);
    }
    return null;
  }
  let rembal = (d && d.original) || 0;
  // 原始期数：提前结清过的债务，plan里剩下的是"已还期次 + 一条结清行"，被收走的期次在
  // settleStash里，所以原始期数 = 当前非结清行的条数 + 快照条数。没结清过的就是plan.length。
  const stashLen = (d && d.settleStash && d.settleStash.length) || 0;
  const origTerms = stashLen ? plan.length - 1 + stashLen : plan.length;

  return (
    <>
      <div className={"scrim" + (isOpen ? " open" : "")} onClick={closeDetailSheet} />
      <div ref={sheetRef} className={"sheet" + (isOpen ? " open" : "")} role="dialog" aria-modal="true" aria-labelledby="dTitle">
        <div ref={gripRef} className="grip" />
        {/* 滚动放在这层、不放在.sheet上——.sheet同时有圆角+overflow:auto+transform时
            会被判定成不透明合成滚动层，深色模式下圆角处会露白底(见www/index.html里
            .sheet那段注释)。grip留在这层外面，拖动条永远在顶部不被内容滚走。 */}
        <div className="sheet-scroll">
          <h2 id="dTitle">{d ? d.name : ""}</h2>
          <div className="subh">{d ? (d.funder ? d.funder + " · " : "") + (d.type || "") : ""}</div>
          <div>
            {d ? (
              <>
                <div className="dl-grid">
                  {kv("借款金额", d.original != null ? "¥" + window.fmt(d.original) : "—")}
                  {kv("剩余待还", "¥" + window.fmt(d.balance))}
                  {kv("年化利率(推算)", d.rate ? Number(d.rate).toFixed(2) + "%" : "无息")}
                  {kv(d.oneTime ? "应还" : "下期月供", "¥" + window.fmt(d.monthly))}
                  {kv("下个还款日", d.nextDate || "—")}
                  {kv("借款日", d.opened || "—")}
                  {kv("进度", d.paidTerms + " / " + d.totalTerms + " 期已还")}
                  {kv("出资方", d.funder || "—")}
                  {d.notes ? (
                    <div className="full">
                      <div className="k">备注</div>
                      <div className="v" style={{ fontSize: 13, fontWeight: 400 }}>{d.notes}</div>
                    </div>
                  ) : null}
                </div>
                {plan.length ? (
                  <>
                    <div className="preview-label" style={{ marginTop: 0 }}>完整还款计划（含已还，✓ 为已还）</div>
                    <div className="sch-wrap">
                      <table className="sch">
                        <thead>
                          <tr><th>期次</th><th>日期</th><th>实付日期</th><th>金额</th><th>本金</th><th>利息/费</th><th>剩余本金</th></tr>
                        </thead>
                        <tbody>
                          {plan.map((r, idx) => {
                            rembal -= +r.principal || 0;
                            const cls = r.paid ? "paidrow" : idx === nextNo ? "nextrow" : "";
                            const note = partialNote(r);
                            return (
                              <tr key={idx} className={cls}>
                                {/* 提前结清行不是原计划里的期次，标"结清"不标期次号。其余行的分母用
                                    origTerms(原始期数)而不是plan.length——提前结清会把剩余期次
                                    收进快照、只留一条结清行，plan.length会缩水成"已还期数+1"，
                                    拿它当分母会显示成"✓ 2/3"这种跟原计划对不上的数字。 */}
                                <td className="per">{r.settleRow ? "✓ 结清" : (r.paid ? "✓ " : "") + (idx + 1) + "/" + origTerms}</td>
                                <td className="num">{r.date}</td>
                                {/* 结清行的"日期"本身就是真实付款日(applySettle()把today写进那一行
                                    的date)，这里再重复显示同一个日期没有意义，留空；其余行(普通
                                    已还/部分还款/协商减免)按paidAt(已知的数据模型缺口③)显示。 */}
                                <td className="num">{r.settleRow ? "—" : r.paidAt || "—"}</td>
                                <td className="num">
                                  {window.money(r.amount)}
                                  {note ? <div className="sub" style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 400 }}>{note}</div> : null}
                                </td>
                                <td className="num">{window.money(r.principal)}</td>
                                {/* 结清行的利息可能是负数(协商减免：实付 < 剩余本金)。直接显示
                                    "-100.00"虽然跟本金相加正好等于实付、总账对得上，但在"利息/费"
                                    这一栏里读起来别扭，改成显式的"减免 ¥100"。只对结清行做这个
                                    转换——普通期次的利息不会是负数。 */}
                                <td className="num">
                                  {r.settleRow && r.interest < 0
                                    ? "减免 ¥" + window.money(-r.interest)
                                    : window.money(r.interest)}
                                </td>
                                <td className="num">{window.fmt(Math.max(rembal, 0))}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="sheet-actions">
            <button type="button" className="btn ghost" onClick={onEdit}>
              <svg className="btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              编辑
            </button>
            {d && d.terms > 0 ? (
              <button type="button" className="btn primary" onClick={onSale}>
                <svg className="btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                <span>{d.oneTime ? "一次性结清" : "销这期"}</span>
              </button>
            ) : null}
          </div>
          <div className="sheet-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn ghost" onClick={onSimulate}>提前还款模拟</button>
          </div>
          {d && d.terms > 0 ? (
            <div className="sheet-actions" style={{ marginTop: 10 }}>
              <button type="button" className="btn ghost" onClick={onWaive}>协商减免这一期</button>
            </div>
          ) : null}
          <div className="sheet-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn danger" onClick={onSettle}>提前结清</button>
            <button type="button" className="btn ghost" onClick={closeDetailSheet}>关闭</button>
          </div>
        </div>
      </div>
    </>
  );
}
