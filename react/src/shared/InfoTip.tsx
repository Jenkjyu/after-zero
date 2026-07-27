// "?"说明弹窗——给"加权平均利率"这类看不懂的指标配一段说明文字，用户明确要的可复用组件，
// 第一个消费者是report/Hero.tsx，以后其它指标要加说明可以直接复用，不用各写一套。
import { Popover } from "./Popover";

export interface InfoTipProps {
  text: string;
  label?: string; // aria-label，默认"说明"
}

export function InfoTip({ text, label = "说明" }: InfoTipProps) {
  return (
    <Popover
      align="start"
      renderTrigger={({ toggle }) => (
        <button type="button" className="info-tip-btn" aria-label={label} onClick={toggle}>
          ?
        </button>
      )}
      renderContent={() => <div className="popover-tip">{text}</div>}
    />
  );
}
