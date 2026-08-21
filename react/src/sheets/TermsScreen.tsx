// 会员服务协议——2026-07-31内容替换：这个文件/组件名、内部状态函数(openTermsScreen/
// closeTermsScreen/useTermsScreenOpen)、window.__azTermsScreenBack、DOM id="termsScreen"
// 全部保留原名不改，只换了显示的标题和正文内容——原来这里显示的是一份假设"应用商店计费"的
// 旧占位条款已替换为真正的《会员服务协议》(内容转写自 docs/legal/会员服务协议.md)。之所以
// 不顺手把"Terms"这套内部命名也改成"Membership"，是
// 参照AGENTS.md里renderReportScreen()那条先例——内部名字没跟着改，不影响功能，只是历史
// 遗留，以后大改这块UI时可以顺手改名，这次范围只做内容替换。旧版结尾那句"本文本为初稿，
// 仅用于产品占位与体验展示，不构成最终具有法律约束力的正式条款"已删除——这份文档现在是
// 真正生效的文本，不是占位稿；价格、试用与退款规则与文档副本保持同步。
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
        <div className="subpage-title">会员服务协议</div>
        <div className="subpage-header-spacer" />
      </div>
      <div className="subpage-body terms-body">
        <p>生效日期：2026年07月31日　更新日期：2026年08月21日</p>
        <p>欢迎您了解 After Zero（以下简称"本产品"）的 Premium 会员服务。本会员服务由本产品的开发者余健聪（个人开发者）提供，旨在为用户提供付费的增值权益。</p>
        <p>请您在开通会员前仔细阅读本协议，特别是加粗内容。<strong>未成年人应在监护人陪同下阅读本协议。您通过任何形式开通 Premium 会员资格，即视为您已阅读并同意接受本协议的约束。</strong></p>

        <h3>一、服务内容和会员权益</h3>
        <ol>
          <li>Premium 是本产品目前唯一的付费会员等级，开通后可使用：云备份、AI 债务助手、AI 识图录入债务、高级统计报表导出（Excel/PDF）等功能。具体权益范围以您使用时应用内实际展示为准，我们可能根据产品发展调整全部或部分权益，调整会在应用内公告。</li>
          <li>人民币 28 元买断 Premium 包含 <strong>25 次终身 AI 识图录入额度</strong>。同一笔债务可选择多张还款计划截图组成一组；一次识别成功生成一份可编辑草稿时消耗 1 次额度，多张截图仍只计算 1 次，识别失败或未生成草稿不消耗额度。草稿需由您检查、补齐并确认后才会写入本地账本。</li>
          <li>图表查看、提前还款模拟等功能目前对所有用户免费开放，不属于 Premium 专属权益；是否收费我们可能根据成本情况调整并提前公告。</li>
        </ol>

        <h3>二、服务获取、有效期、中断和终止</h3>
        <ol>
          <li>iOS 版本首次登录后即获得一次 <strong>7 天 Premium 会员体验</strong>，体验资格与登录身份关联；注销、重装或重新登录不会重复赠送。</li>
          <li>兑换码获得的会员资格用于产品体验，我们有权在发现兑换码被不当传播、滥用等情况时收回相应资格，且无需向您提供补偿。</li>
          <li>本产品目前仅提供买断（一次性）购买。iOS 应用内 Premium 的价格为 <strong>人民币 28 元</strong>，通过 Apple App Store 完成支付；购买成功后永久解锁，不会自动续费。已购买用户可通过 Apple 的“恢复购买”机制恢复权益。</li>
          <li>因互联网服务的特殊性，会员服务期限内可能包含系统维护、故障排查、第三方服务（如腾讯云开发）中断等所需的合理时间，我们会尽合理努力将影响降至最低。</li>
          <li>出现以下情况时，我们可能中断或终止向您提供会员服务：您主动申请注销账户；您存在违反法律法规或本协议、损害本产品或其他用户利益的行为；我们收到有权机关的要求；为维护账号与系统安全的紧急需要；不可抗力等我们无法控制的情况。</li>
        </ol>

        <h3>三、费用和退款</h3>
        <ol>
          <li>会员费用以您购买时应用内展示的价格为准，价格可能随时调整，已购买的权益不因价格调整而改变。</li>
          <li>Apple App Store 内购买的退款、撤销和争议处理适用 Apple 的规则及适用法律；购买被退款或撤销后，相应 Premium 权益将停止。</li>
          <li>通过兑换码获得的体验资格不涉及费用，不适用退款条款。</li>
        </ol>

        <h3>四、会员账号管理</h3>
        <ol>
          <li>会员资格与您的登录账号绑定，不得以出借、出租、出售、共享等任何形式提供给第三方使用，不得利用会员资格获取不正当利益。</li>
          <li>未经我们明示授权，任何转售、批量分发本产品会员资格或兑换码的行为均属违规，我们有权取消相应资格并追究相关责任。</li>
          <li>因不可归责于我们的原因（如您自行泄露登录方式）导致的会员权益受损，我们不承担责任；如发现账号异常，请及时联系我们。注销账户会删除账户资料、云端备份和仍存在的识图草稿；为防止重复试用、支持恢复已购权益及防止重置终身识图额度，我们仅保留与登录身份关联的不可逆权益标记、必要交易标识及已使用的识图次数，不保留原始截图、识图草稿、账本、备份、昵称、邮箱或 openid。</li>
        </ol>

        <h3>五、用户行为规范和违约处理</h3>
        <p>在使用会员服务过程中，您不得：</p>
        <ol>
          <li>通过技术手段修改、伪造会员状态、有效期等信息；</li>
          <li>破解、绕过本产品用于验证会员资格的技术措施；</li>
          <li>恶意批量注册账号以异常获取会员权益；</li>
          <li>其他违反法律法规、监管政策或本协议的行为。</li>
        </ol>
        <p>如我们有理由认为您存在上述行为，有权暂停或取消您的会员资格，且已收取的费用（如届时已产生真实收费）不予退还。</p>

        <h3>六、协议修改</h3>
        <p>我们可能根据法律法规变化、业务发展需要修改本协议，修改后的内容将通过应用内公告等方式通知您。如您不同意修改内容，可以停止使用会员服务；继续使用即视为接受修改后的协议。</p>

        <h3>七、适用法律及争议解决</h3>
        <p>本协议的订立、效力、解释及争议解决均适用中华人民共和国大陆地区法律。因本协议产生的争议，双方应友好协商解决；协商不成的，任何一方可向对开发者住所地有管辖权的人民法院提起诉讼。</p>

        <h3>八、其他</h3>
        <ol>
          <li>因不可抗力或其他我们无法控制的原因导致无法正常提供会员服务的，我们将及时公告并合理处理善后事宜，尽量降低您的损失。</li>
          <li>如您对本协议内容有任何疑问，请通过以下方式联系我们。</li>
        </ol>

        <p className="terms-note">联系邮箱：jenkjyu36@outlook.com　开发者：余健聪（个人开发者）</p>
      </div>
    </div>
  );
}
