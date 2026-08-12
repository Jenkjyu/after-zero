// "我的"页4张数据卡：云备份/档案库/下载备份/上传备份。云备份是唯一带门禁的
// （hasPremium(premium)未过先跳订阅页）。"打开档案库"/"打开云备份"（第九步/第十步，
// React迁移收尾）后都调用shared/state.ts的纯React状态开关（#docsScreen/#backupScreen
// 整体已经是React自己的sheet，不再经过bridge）；其余2张继续无条件触发vanilla桥接函数——
// 备份文件的打包/解析、系统文件选择器这几件事继续100%vanilla。
//
// 注意：这个组件不渲染<input type="file">——原来的#importFileInput连同它的change监听器
// 整个留在vanilla（挪到了折叠后的挂载点外面），"上传备份文件"按钮只是调用桥接函数
// triggerImportFilePicker()去点击那个还留在vanilla DOM里的隐藏input。
//
// 卡片形态在2026-07-30改过一轮：从"标题 + 一整段说明 + 一个按钮"改成跟会员入口卡一致的
// "图标徽章 + 标题 + 副标题、整行可点"。按钮文案原来把标题又重复了一遍（"云备份"卡里
// 放一个"打开云备份"按钮），说明文字也过长；现在高度差不多减半，靠彩色徽章可扫视。
// 四张卡按语义分两组（存储入口 / 数据搬运），组内靠紧、组间留空，用间距表达结构。
import type { ReactNode } from "react";
import type { Account, Premium } from "../types";
import { openBackupScreen, openDocsScreen, openPremiumScreen } from "../shared/state";

const ICON_CLOUD = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97 6 6 0 0 0-11.66-1.6A4.25 4.25 0 0 0 6.5 19h11z" />
  </svg>
);
const ICON_ARCHIVE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /><path d="M3 7l1.6-3.2A1 1 0 0 1 5.5 3h13a1 1 0 0 1 .9.55L21 7" /><path d="M10 12h4" />
  </svg>
);
const ICON_DOWNLOAD = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12" /><path d="M7.5 10.5L12 15l4.5-4.5" /><path d="M4 18.5v.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5" />
  </svg>
);
const ICON_UPLOAD = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15V3" /><path d="M7.5 7.5L12 3l4.5 4.5" /><path d="M4 18.5v.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5" />
  </svg>
);

interface EntryCardProps {
  hue: "brand" | "blue" | "violet" | "rose" | "amber";
  icon: ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}

export function EntryCard({ hue, icon, title, sub, onClick }: EntryCardProps) {
  return (
    <div className="data-card entry-card">
      <button type="button" className="entry-row" onClick={onClick}>
        <div className={"entry-ic ic-" + hue} aria-hidden="true">{icon}</div>
        <div className="entry-text">
          <div className="entry-title">{title}</div>
          <div className="entry-sub">{sub}</div>
        </div>
        <svg className="account-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}

export interface DataCardsProps {
  premium: Premium;
  account: Account | null;
}

export function DataCards({ premium, account }: DataCardsProps) {
  async function onBackup() {
    if (!window.hasPremium(premium)) {
      openPremiumScreen();
      return;
    }
    if (!account) {
      const loggedIn = await window.__azBridge.requestCloudLogin("云备份会在你主动创建时把当前债务、档案和设置上传到云端；登录提示可取消，本地数据不会自动同步。");
      if (!loggedIn) return;
    }
    openBackupScreen();
  }
  function onDocs() {
    openDocsScreen();
  }
  function onDownload() {
    window.__azBridge.downloadBackupFile();
  }
  function onImport() {
    window.__azBridge.triggerImportFilePicker();
  }

  return (
    <>
      {/* 第一组：存储入口——东西存在哪儿 */}
      <div className="entry-group">
        <EntryCard hue="blue" icon={ICON_CLOUD} title="云备份"
          sub="Premium · 云端多份记录，换手机也能找回" onClick={onBackup} />
        <EntryCard hue="violet" icon={ICON_ARCHIVE} title="档案库"
          sub="合同、还款回执等文档，仅存本机" onClick={onDocs} />
      </div>
      {/* 第二组：数据搬运——把数据倒进倒出 */}
      <div className="entry-group">
        <EntryCard hue="rose" icon={ICON_DOWNLOAD} title="下载备份文件"
          sub="导出全部债务和档案，存到本地" onClick={onDownload} />
        <EntryCard hue="amber" icon={ICON_UPLOAD} title="上传备份文件"
          sub="从备份文件恢复，会覆盖当前数据" onClick={onImport} />
      </div>
    </>
  );
}
