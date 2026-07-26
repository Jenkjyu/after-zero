// 购买者服务条款——第七步(React迁移收尾)从vanilla的#termsScreen原样复刻，纯静态文本，
// 没有任何状态/桥接需求，只需要开关。条款正文本身是初稿(见文末note)，逐字照抄，
// 没有借这次迁移顺手改动措辞。
import { useEffect } from "react";
import { closeTermsScreen, useTermsScreenOpen } from "../shared/state";

export function TermsScreen() {
  const isOpen = useTermsScreenOpen();

  useEffect(() => {
    window.__azTermsScreenBack = () => {
      if (isOpen) { closeTermsScreen(); return true; }
      return false;
    };
    return () => { delete window.__azTermsScreenBack; };
  }, [isOpen]);

  return (
    <div className={"subpage" + (isOpen ? " open" : "")} id="termsScreen">
      <div className="subpage-header">
        <button type="button" className="subpage-back" aria-label="返回" onClick={closeTermsScreen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="subpage-title">购买者服务条款</div>
        <div className="subpage-header-spacer" />
      </div>
      <div className="subpage-body terms-body">
        <p>本条款为《购买者服务条款》初稿，用于说明你在 After Zero 中购买或订阅 Premium 会员服务时双方的权利与义务。在你完成任何付费购买前，请仔细阅读。一旦付费购买或使用会员功能，即视为你已阅读、理解并同意本条款。</p>

        <h3>一、服务提供者与适用范围</h3>
        <p>本条款适用于 After Zero 应用内提供的一切收费项目，即 Premium 会员（含一次性买断与按周期订阅两种购买方式）。本条款不适用于应用内免费提供的功能。</p>

        <h3>二、会员类型与内容</h3>
        <p>Premium 会员提供两种购买方式：一次性买断（付费后长期解锁，不涉及到期或续费）与周期性订阅（月付或年付，在订阅有效期内可用）。两种方式解锁的功能完全一致，包括云备份、高级统计报表导出、AI 债务顾问等。具体功能以应用内当时展示的说明为准，我们可能会随版本更新调整功能范围。</p>

        <h3>三、价格与支付</h3>
        <p>应用内展示的价格当前为占位示意，最终实际价格、货币与计费商品以正式上架应用商店后、你在下单页面看到并确认的金额为准。付款将通过你所使用的应用商店账户完成，具体扣款、发票与账单由相应应用商店提供。</p>

        <h3>四、自动续订与取消</h3>
        <p>以订阅方式（月付/年付）购买的 Premium，在每个计费周期结束时默认自动续订，费用将从你的应用商店账户扣除。你可以随时在应用商店的订阅管理中关闭自动续订；关闭后当前周期到期前仍可继续使用，到期后不再续费。一次性买断不涉及自动续订。</p>

        <h3>五、退款</h3>
        <p>退款申请及处理依据你所使用的应用商店的退款政策执行。对于因你个人原因（如误购、不再需要）提出的退款请求，我们将在应用商店政策允许的范围内协助处理，但不保证一定获得退款。</p>

        <h3>六、兑换码</h3>
        <p>我们可能不定期提供兑换码用于解锁相应会员权益。兑换码不可兑换现金、不可转售，且可能设有使用期限或次数限制。通过非官方渠道获取的兑换码可能无效，由此产生的损失由使用者自行承担。</p>

        <h3>七、服务的变更、中断与终止</h3>
        <p>我们可能因产品迭代、技术维护或不可抗力等原因，对会员功能进行调整、暂停或终止。若发生对你已购买权益产生重大不利影响的变更，我们将尽合理努力事先告知，并在适用商店政策允许时提供相应补偿方案。</p>

        <h3>八、数据与免责</h3>
        <p>会员功能（如云备份）会按你的操作处理你的数据。我们会采取合理措施保护数据安全，但在法律允许的最大范围内，不对因网络故障、设备问题、不可抗力或你自身操作导致的数据丢失或损坏承担责任。请你自行做好重要数据的多重备份。</p>

        <h3>九、条款更新</h3>
        <p>我们可能不时更新本条款。更新后的条款将在应用内公示，你继续使用付费服务即视为接受更新后的条款。</p>

        <p className="terms-note">本文本为初稿，仅用于产品占位与体验展示，不构成最终具有法律约束力的正式条款；正式上架收费前将由我们发布最终版本。如对本条款有任何疑问，可通过应用商店的开发者联系方式与我们联系。</p>
      </div>
    </div>
  );
}
