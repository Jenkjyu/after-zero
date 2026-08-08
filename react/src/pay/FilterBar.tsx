// 还款日页的筛选条。2026-07-29改版：加了"15天内"、整条改成可横向滑动、最右侧钉一个
// 日历图标做"自定义天数"。
//
// 布局是"可滚动的一排芯片 + 固定不滚的日历按钮"两段：芯片多了之后(现在5个)在390px宽的
// 手机上一行放不下，等分挤压会让每个芯片的字都换行；改成横向滚动之后，"30天内"要往右滑
// 一点才露出来，这是跟用户确认过的取舍。日历按钮**不能**放进滚动区——它是常驻入口，
// 滑走了就等于没有。
//
// ⚠️筛选口径是**累计**的(15天内包含7天内的，30天内又包含15天内的)，跟列表分组用的
// dueBucket(互斥分段)不是一回事——同名不同义这件事AGENTS.md"还款提醒页"一节专门写过：
// 点"30天内"时用户想看的是"接下来30天要还的全部"，不是"只看第16~30天那一段"。
export type PayFilter = "next" | "overdue" | "d7" | "d15" | "d30" | "custom";

const PAY_FILTERS: [PayFilter, string][] = [
  // "下一期"是唯一一档**按笔**看的(每笔债务只显示最早的未还期)，其余各档都是按期看。
  // 原来叫"全部"——列表改成逐期展开之后这个叫法有歧义("全部"听起来像"所有期次全列出来"，
  // 实际是"每笔只看下一期")，改成直说它显示什么。
  ["next", "下一期"],
  ["overdue", "已逾期"],
  ["d7", "7天内"],
  ["d15", "15天内"],
  ["d30", "30天内"],
];

export interface FilterBarProps {
  value: PayFilter;
  /** 自定义筛选的天数，value==="custom"时才有意义 */
  customDays: number | null;
  onChange(f: PayFilter): void;
  /** 点日历图标：由App负责弹日期选择、算出天数后再回来设置filter */
  onPickCustom(): void;
}

export function FilterBar({ value, customDays, onChange, onPickCustom }: FilterBarProps) {
  const customActive = value === "custom" && customDays !== null;
  return (
    <>
      <div className="pf-scroll">
        {PAY_FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={"pf-btn" + (value === key ? " active" : "")}
            onClick={() => { if (value !== key) onChange(key); }}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={"pf-cal" + (customActive ? " active" : "")}
        aria-label={customActive ? `自定义筛选：${customDays}天内` : "按日期筛选"}
        onClick={onPickCustom}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
        {customActive && <span>{customDays}天内</span>}
      </button>
    </>
  );
}
