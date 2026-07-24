// 筛选条(全部/已逾期/7天内/30天内)——直译自vanilla renderPayFilterBar()（www/index.html）。
// PAY_FILTERS常量搬到这里(单一消费者，不进types.ts)。App.tsx负责套一层.pay-filter外壳div。
export type PayFilter = "all" | "overdue" | "week" | "month";

const PAY_FILTERS: [PayFilter, string][] = [
  ["all", "全部"],
  ["overdue", "已逾期"],
  ["week", "7天内"],
  ["month", "30天内"],
];

export interface FilterBarProps {
  value: PayFilter;
  onChange(f: PayFilter): void;
}

export function FilterBar({ value, onChange }: FilterBarProps) {
  return (
    <>
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
    </>
  );
}
