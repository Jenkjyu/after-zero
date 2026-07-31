// "三件值得注意的事" + "最该先动手的地方" 两段的渲染。规则本身在 findings.tsx，
// 这里只负责把算出来的结论画出来——两者分开是为了规则能脱离 React 单独测。
//
// ⚠️文件名不叫 Findings.tsx：macOS 默认文件系统大小写不敏感，那个名字会跟同目录的
// findings.tsx 撞成同一个文件（Write 时会直接报"文件已存在但没读过"）。
//
// 条数是**算出来的**，不是固定 3 条：候选池里只有 2 条成立就只显示 2 条，标题跟着从
// "三件"变"两件"。写死"三件"然后凑数是这一版专门要避免的事。
import type { Finding } from "./findings";

const CN_NUM = ["", "一", "两", "三"];

export function FindingList({ items }: { items: Finding[] }) {
  if (!items.length) return null;
  return (
    <div className="sec">
      <div className="sec-q">这段时间发生了什么</div>
      <h2 className="sec-a">{CN_NUM[items.length] ?? items.length}件值得注意的事</h2>
      <div style={{ marginTop: 12 }}>
        {items.map((f) => (
          <div className="finding" key={f.id}>
            <div className={"finding-ic " + f.tone}>{f.icon}</div>
            <div>
              <div className="finding-t">{f.title}</div>
              <div className="finding-s">{f.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// "最该先动手的地方"：展开 severity 最高的**可行动**结论。展开内容（标题/正文/条形列表）
// 由那条结论自己提供（findings.tsx 里的 detail()），所以这个组件不需要知道当前展开的
// 到底是"峰值月"还是"高息债务"——换了结论，内容自动跟着换，连底色都跟着结论的 tone 走。
export function ActionBox({ lead }: { lead: Finding }) {
  if (!lead.detail || !lead.actionTitle) return null;
  const d = lead.detail();
  return (
    <div className="sec">
      <div className="sec-q">最该先动手的地方</div>
      <h2 className="sec-a">{lead.actionTitle}</h2>
      <div className={"act-box " + lead.tone}>
        <div className="act-top">
          {lead.icon}
          {d.top}
        </div>
        <div className="act-body">{d.body}</div>
        <div className="act-list">
          {d.bars.map((x) => (
            <div className="act-item" key={x.nm}>
              <span className="nm">{x.nm}</span>
              {/* ⚠️.fill 必须是 display:block（CSS 里已声明）：它是个 <span>，默认 inline，
                  而 inline 元素会**静默忽略 width**——条形长度差异和颜色会一起消失，
                  界面上只剩空的灰色底槽。原型阶段真踩过，量出来 6 根填充宽度全是 0。 */}
              <span className="track">
                <span className="fill" style={{ width: Math.max(3, x.pct * 100) + "%" }} />
              </span>
              <span className="rt">{x.rt}</span>
            </div>
          ))}
        </div>
        {d.rest && <div className="act-rest">{d.rest}</div>}
      </div>
    </div>
  );
}
