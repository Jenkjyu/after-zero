// "每日额度用完了/首次进入AI页面"的说明弹窗——两个触发时机(AiScreen.tsx里的isOpen effect
// 首次进入、composeAndSend/onRetry真撞到20次/天上限)共用同一个组件，内容不用按触发原因区分：
// 首次是提前告知，撞上限是真正用得上退路的时刻，两者都想让用户看到同一份"额度用完了可以
// 复制提示词去问别的AI"的信息。

export interface AiLimitModalProps {
  open: boolean;
  onClose(): void;
  onCopy(): void;
}

export function AiLimitModal({ open, onClose, onCopy }: AiLimitModalProps) {
  if (!open) return null;
  return (
    <>
      <div className="ai-limit-scrim" onClick={onClose} />
      <div className="ai-limit-modal" role="dialog" aria-modal="true" aria-labelledby="aiLimitText1">
        <div className="ai-limit-emoji" aria-hidden="true">😭😭</div>
        <p className="ai-limit-text" id="aiLimitText1">
          After Zero 现在是完全免费的 app，AI 分析对开发者来说是有真实成本的——为了不让这个功能被无限次调用拖垮，每天最多能问 20 次。
        </p>
        <p className="ai-limit-text">
          如果这 20 次不够用，可以把包含你全部债务信息的完整提示词复制下来，粘贴给豆包、文心一言等其他 AI 助手，同样能得到精准分析。
        </p>
        <button type="button" className="btn primary ai-limit-copy" onClick={onCopy}>复制完整分析提示词</button>
        <button type="button" className="ai-limit-dismiss" onClick={onClose}>知道了</button>
      </div>
    </>
  );
}
