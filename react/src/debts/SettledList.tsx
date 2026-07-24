// 已结清列表——纯展示+"恢复"按钮，没有手势，原样搬自renderDebts()末尾那段。
// 日期文字用中性灰(--text-faint)不是蓝色，见CLAUDE.md"在还债务主页视觉改版"一节。
import type { Debt } from "../types";
import { keyFor } from "../shared/state";

export interface SettledListProps {
  items: { d: Debt; i: number }[];
}

export function SettledList({ items }: SettledListProps) {
  if (!items.length) return <div className="settled-wrap" id="settledWrap" />;
  return (
    <div className="settled-wrap" id="settledWrap">
      <div className="section-label">已结清 ✓</div>
      {items.map(({ d, i }) => (
        <div className="settled-item" key={keyFor(d)}>
          <span className="sn">{d.name}</span>
          <span className="sd">已结清 {d.settledDate || ""}</span>
          <button type="button" className="restore" onClick={() => window.__azBridge.unsettle(i)}>恢复</button>
        </div>
      ))}
    </div>
  );
}
