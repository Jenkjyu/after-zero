// 债务对象的形状——跟 www/index.html 里 calc.js 的 recompute()/genPlan() 保持一致。
export interface PlanRow {
  date: string;
  amount: number;
  principal: number;
  interest: number;
  paid: boolean;
}

// 公式生成器4种计息方式共用的spec形状(genPlan(spec)的入参，calc.js里定义)——react/src/sheets/
// GenPanel.tsx用同一份类型。字段按kind分组使用：amort用P/rate/n，equalfee用pp/pf/n，
// interestfirst用P/rate/ni/np，custom只用n。保存债务时(EditSheet.tsx)原样存进Debt.gen，
// 下次编辑时用来回填公式生成器的输入框(即使这条债务当初是手动录入的，也存一份"当前选中的
// 计息方式+参数"，跟vanilla原来saveForm()的做法一致)。
export interface GenSpec {
  kind: "amort" | "equalfee" | "interestfirst" | "custom";
  first: string;
  P?: number;
  rate?: number;
  n?: number;
  pp?: number;
  pf?: number;
  ni?: number;
  np?: number;
}

export interface Debt {
  name: string;
  funder?: string;
  type?: string;
  opened?: string;
  day?: number;
  notes?: string;
  oneTime?: boolean;
  plan: PlanRow[];
  gen?: GenSpec;
  settled?: boolean;
  settledDate?: string;
  // recompute() 派生字段，只读——不要在React这边手写覆盖，一律通过vanilla桥接的commitReorder
  // 之类的写路径改动debts数组本身，再等az:state-changed事件回来重新读。
  original: number | null;
  balance: number;
  paidPrincipal: number;
  paidInterest: number;
  totalTerms: number;
  paidTerms: number;
  terms: number;
  monthly: number;
  nextDate: string | null;
  rate: number;
}

export interface Premium {
  premium: { method: "onetime" | "monthly" | "yearly" | "redeemed"; at: string } | null;
}

export interface Account {
  openid: string;
  nickname: string;
  avatarUrl: string;
  loggedInAt: number;
}

export interface DebtSummary {
  total: number;
  monthly: number;
  active: number;
  settled: number;
  paidPrincipal: number;
  paidInterest: number;
  pct: number;
}

// 还款提醒设置——全局共享、对所有在还债务统一生效，不按债务单独配置(见CLAUDE.md
// "还款提醒页"一节)。offsetDays只允许0|1|2|3(当天到期~提前3天)。
export interface NotifySettings {
  enabled: boolean;
  rules: { offsetDays: 0 | 1 | 2 | 3; time: string }[];
}

// computeReportData(debts)的返回形状(见 www/js/calc.js)——统计tab的KPI/三张图/数据表
// 都是这个对象的纯展示，字段名跟calc.js里的保持一致。
export interface ReportData {
  active: Debt[];
  totalBalance: number;
  avgRate: number;
  payoffDate: string | null;
  byName: { name: string; balance: number }[];
  typeList: { name: string; value: number }[];
  timeline: { date: string; balance: number }[];
}

// vanilla主IIFE暴露出来的桥接对象——见 www/index.html 里 window.__azBridge 的定义和CLAUDE.md
// "React 迁移"一节。只包含已迁移的React页面实际需要调用的这几个，其余(saveForm/公式生成器
// 等)继续留在vanilla私有作用域里，后续阶段迁移到别的页面时才按需加进来。
export interface AzBridge {
  getDebts(): Debt[];
  getPremium(): Premium;
  getAccount(): Account | null;
  // openDetail/openEdit都已删除——detailSheet/editSheet迁移React后，"打开详情窗/编辑表单"
  // 变成纯React侧状态(shared/state.ts的openDetailSheet/closeDetailSheet/openEditSheet/
  // closeEditSheet)，不再经过这个桥接对象，见 react/src/sheets/ 和 CLAUDE.md"React 迁移"一节。
  payInstallment(i: number): void;
  unsettle(i: number): void;
  commitReorder(newOrder: Debt[]): void;
  saveAll(): void;
  renderAll(): void;
  openPremiumScreen(): void;
  openAiScreen(): void;
  openAccountScreen(): void;
  // detailSheet新增：#dSettle(提前结清)/#dSimulate(提前还款模拟，跳转#simScreen)以前只在
  // vanilla内部调用，现在detailSheet的按钮由React渲染，需要显式桥接。
  settleFull(i: number): void;
  openSimScreen(i: number): void;
  // 还款日tab新增：#notifySheet本身继续100%vanilla(跟#editSheet同一类处理，detailSheet
  // 已经迁移React了)，React只需要读通知设置(铃铛图标的.on状态)+能打开这个sheet。
  getNotify(): NotifySettings;
  openNotifySheet(): void;
  // 统计tab新增：两个导出函数本身零DOM依赖(只读debts造Blob)，继续100%vanilla，
  // 只是入口桥接给React的导出按钮调用，premium门禁判断在React这边原样复刻。
  exportReportXlsx(): void;
  exportReportPdf(): void;
  // "我的"tab新增：这4个全部是trigger-only——#accountScreen/#premiumScreen/#backupScreen/
  // #docsScreen这几个subpage、以及备份文件的打包/解析/系统文件选择器，全部继续100%vanilla，
  // React只是调用桥接函数让vanilla去做，不重新实现任何一个。
  openDocsScreen(): void;
  openBackupScreen(): void;
  downloadBackupFile(): void;
  triggerImportFilePicker(): void;
  // editSheet(react/src/sheets/EditSheet.tsx)新增：setDebt是保存写入(i>=0覆盖debts[i]并保留
  // settled/settledDate，i<0是push新增)，故意不在内部调saveAll/renderAll——React保存时自己
  // 依次调setDebt→saveAll→renderAll，跟commitReorder那套细粒度调用惯例一致。deleteDebt是原样
  // 暴露的既有vanilla函数(自带ask()确认+splice+saveAll+renderAll)。toast是#flash单例的简单
  // passthrough。confirmAsync是vanilla共享确认弹窗ask()的Promise外壳——opts.month有值时
  // 确认返回选中的月份字符串、取消返回null；没有opts.month时确认返回true、取消返回false。
  // 特意复用这一份弹窗UI而不是在React里另建一套，见CLAUDE.md"React 迁移"一节"第六步"。
  setDebt(i: number, obj: Debt): void;
  deleteDebt(i: number): void;
  toast(msg: string): void;
  confirmAsync(title: string, body: string, opts?: { month?: string }): Promise<string | boolean | null>;
}

// 排序方式(含"custom")的类型，跟 www/index.html 原来的 DEBT_SORTS 键名保持一致，
// 用来在React这边重建同一份排序函数映射(debtSort的所有权这次迁移整体挪到React，
// 不再经过vanilla的setDebtSort/DEBT_SORTS，见CLAUDE.md"React 迁移"一节)。
export type SortKey =
  | "rate-desc" | "rate-asc"
  | "orig-desc" | "orig-asc"
  | "bal-desc" | "bal-asc"
  | "monthly-desc" | "monthly-asc"
  | "terms-desc" | "terms-asc"
  | "custom";
