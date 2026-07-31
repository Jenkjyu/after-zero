// "钱主要压在哪几笔"——替代原来的 BalanceBars.tsx。
//
// 跟被替换掉的那版比：不再无条件平铺全部债务，改成**累计占比达 70% 为止**，其余折叠。
// 阈值是产品判断：这一段回答的是"大头在哪"，不是"逐笔清单"（逐笔清单是"债务"tab 的活，
// 完整明细走导出 Excel/PDF）。规则随数据自适应——债务越集中列得越少，标题里的
// "前 N 笔占了 X%" 两个数都是算出来的。
//
// 原来那个"余额/利率/剩余利息"三档排序切换去掉了：那是看板式的"你自己去筛"，跟这一页
// "先给结论"的立场相反。利率维度已经由结论区的"高息债务"那条覆盖，剩余利息维度由
// "利息集中度"那条覆盖，两者都比一个下拉筛选更直接。
//
// ⚠️展开/收起按钮用 --accent（跟"债务"tab 的"计算口径说明"同色），**不能用蓝色**：
// 这一页的蓝在排行条里是数据色（非高息债务），同一个颜色既当数据编码又当交互控件色，
// 会让人以为这个按钮跟"蓝色那批债务"有关。
import { useState } from "react";
import type { DebtRow } from "./findings";
import { HI_RATE } from "./findings";

/** 累计占比达这个比例就停——改这个数会直接改变列出几笔 */
const COVER = 0.7;

export interface RankProps {
  rows: DebtRow[];
  totalBalance: number;
}

export function Rank({ rows, totalBalance }: RankProps) {
  const [showAll, setShowAll] = useState(false);
  if (!rows.length) return null;

  let cum = 0, cut = 0;
  for (let i = 0; i < rows.length; i++) {
    cum += rows[i].balance;
    cut = i + 1;
    if (totalBalance > 0 && cum / totalBalance >= COVER) break;
  }
  const shown = rows.slice(0, cut);
  const rest = rows.slice(cut);
  const restSum = rest.reduce((t, d) => t + d.balance, 0);
  const cutShare = totalBalance > 0 ? Math.round((cum / totalBalance) * 100) : 100;
  const max = rows[0].balance || 1;

  const row = (d: DebtRow, i: number) => {
    const hi = d.rate >= HI_RATE;
    return (
      <div className="rank-row" key={d.id}>
        <div className="rank-no">{i + 1}</div>
        <div className="rank-main">
          <div className="rank-nm">
            {window.truncateLabel(d.name, 12)}
            {hi && <span className="rank-tag hi">高息</span>}
          </div>
          <div className="rank-bar">
            <i style={{ width: (d.balance / max) * 100 + "%", background: hi ? "var(--risk)" : "var(--calm)" }} />
          </div>
        </div>
        <div className="rank-amt">
          <div className="a">¥{window.fmt(d.balance)}</div>
          <div className="r">{d.rate.toFixed(2)}%</div>
        </div>
      </div>
    );
  };

  return (
    <div className="sec">
      <div className="sec-q">钱主要压在哪几笔</div>
      <h2 className="sec-a">
        前 <span className="n">{cut}</span> 笔占了 <span className="n">{cutShare}</span>%
      </h2>
      <div style={{ marginTop: 10 }}>
        {shown.map(row)}
        {showAll && rest.map((d, i) => row(d, i + cut))}
        {rest.length > 0 && (
          <button type="button" className={"more-btn" + (showAll ? " open" : "")} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "收起" : `其余 ${rest.length} 笔 · ¥${window.fmt(restSum)}`}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
