// 关于我们——2026-07-31新增，"我的"tab新入口(mine/App.tsx)打开，subpage骨架跟其它已迁移
// screen一致。这里只是三份法律文档(隐私政策/用户服务协议/会员服务协议)加联系方式的展示壳，
// 复用DataCards.tsx里已经存在的EntryCard组件(这次改成了具名导出)，不重新画一遍entry行的
// markup。"账户与登录信息"这一行没有新建页面，直接复用已有的AccountScreen——这是调研过
// 官方对"个人信息收集清单"没有强制要求独立成页之后的设计判断，"我们对你收集了什么"这件事
// 交给隐私政策正文 + 这一行指向真实账户数据自证，不需要再造一层清单UI，详见对话记录/plan。
// 版本号是写死的字符串常量，需要跟android/app/build.gradle的versionName手动保持同步——
// 项目里没有任何"构建时把版本号注入JS"的机制，这不是这次偷懒，是跟现状一致的做法。
import { openAccountScreen, openAgreementScreen, openPrivacyScreen, openTermsScreen } from "../shared/state";
import { closeAboutScreen, useAboutScreenOpen } from "../shared/state";
import { EntryCard } from "../mine/DataCards";
import { useEffect } from "react";

const APP_VERSION = "1.0.0";
const APP_FILING_NUMBER = "粤ICP备2026116914号-1A";
const APP_FILING_URL = "https://beian.miit.gov.cn/";

const ICON_DOC = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M15 3v5h5" /><path d="M9 13h6M9 17h6" />
  </svg>
);
const ICON_CARD = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.9 6.3L21.5 9l-4.8 4.5 1.3 6.7L12 17l-6 3.2 1.3-6.7L2.5 9l6.6-.7L12 2z" />
  </svg>
);
const ICON_ACCOUNT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.5 3.5-6 8-6s8 2.5 8 6" />
  </svg>
);

export function AboutScreen() {
  const isOpen = useAboutScreenOpen();

  useEffect(() => {
    window.__azAboutScreenBack = () => {
      if (isOpen) { closeAboutScreen(); return true; }
      return false;
    };
    return () => { delete window.__azAboutScreenBack; };
  }, [isOpen]);

  return (
    <div className={"subpage" + (isOpen ? " open" : "")} id="aboutScreen">
      <div className="subpage-header">
        <button type="button" className="subpage-back" aria-label="返回" onClick={closeAboutScreen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="subpage-title">关于我们</div>
        <div className="subpage-header-spacer" />
      </div>
      <div className="subpage-body">
        <div className="premium-hero">
          <img className="about-icon" src="img/app-icon.png" alt="" />
          <div className="premium-hero-title">After Zero</div>
          <div className="premium-hero-sub">版本 {APP_VERSION}</div>
        </div>

        <div className="entry-group">
          <EntryCard hue="blue" icon={ICON_CARD} title="联系邮箱" sub="jenkjyu36@outlook.com" onClick={() => { window.location.href = "mailto:jenkjyu36@outlook.com"; }} />
        </div>

        <div className="entry-group">
          <EntryCard hue="violet" icon={ICON_DOC} title="隐私政策" sub="我们如何收集、使用与保护你的信息" onClick={openPrivacyScreen} />
          <EntryCard hue="violet" icon={ICON_DOC} title="用户服务协议" sub="使用本产品前应了解的权利与义务" onClick={openAgreementScreen} />
          <EntryCard hue="amber" icon={ICON_DOC} title="会员服务协议" sub="Premium 购买、退款与账号规则" onClick={openTermsScreen} />
        </div>

        <div className="entry-group">
          <EntryCard hue="rose" icon={ICON_ACCOUNT} title="账户与登录信息" sub="查看本地模式或当前云账号状态" onClick={openAccountScreen} />
        </div>

        <div className="about-filing" aria-label="APP备案信息">
          <div className="about-filing-label">APP备案编号</div>
          <a href={APP_FILING_URL} target="_blank" rel="noreferrer">{APP_FILING_NUMBER}</a>
        </div>
      </div>
    </div>
  );
}
