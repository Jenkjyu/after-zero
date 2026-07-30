// 排序方式选择器——薄封装，实际UI是shared/PickerSheet.tsx。这套底部抽屉最早就是为这里写的
// (替代原生<select>在安卓WebView里弹出系统全屏列表、跟App视觉脱节的问题，长按还会触发文字
// 选中/焦点描边)；后来公式生成器(react/src/sheets/GenPanel.tsx)的"计息方式"选择器有完全
// 相同的需求，抽成了共享组件，这里改成调用它而不是各自维护一份。
//
// 为什么是底部sheet不是贴着按钮的popover(shared/Popover.tsx)：11个选项，贴着按钮弹出的
// 小面板放不下，要么滚动要么溢出屏幕——这是跟用户确认过的形态选择。
import { PickerSheet } from "../shared/PickerSheet";
import type { SortKey } from "../types";

export interface SortOption {
  value: SortKey;
  label: string;
}

export interface SortSheetProps {
  open: boolean;
  value: SortKey;
  options: SortOption[];
  onPick(v: SortKey): void;
  onClose(): void;
}

export function SortSheet({ open, value, options, onPick, onClose }: SortSheetProps) {
  return (
    <PickerSheet
      open={open}
      value={value}
      options={options}
      title="排序方式"
      titleId="sortSheetTitle"
      onPick={onPick}
      onClose={onClose}
    />
  );
}
