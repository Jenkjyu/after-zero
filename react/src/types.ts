// 债务对象的形状——跟 www/index.html 里 saveForm()/openEdit()/calc.js 的 recompute() 保持一致。
// gen/plan 的具体字段这里没有细化(公式生成器/表格逐行编辑是vanilla编辑表单#editSheet的地盘，
// 这次迁移不碰，故这两个字段只声明成宽松的形状，够用即可，不为了"更完整的类型"过度建模)。
export interface PlanRow {
  date: string;
  amount: number;
  principal: number;
  interest: number;
  paid: boolean;
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
  gen?: unknown;
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
  openDetail(i: number): void;
  openEdit(i: number): void;
  payInstallment(i: number): void;
  unsettle(i: number): void;
  commitReorder(newOrder: Debt[]): void;
  saveAll(): void;
  renderAll(): void;
  openPremiumScreen(): void;
  openAiScreen(): void;
  openAccountScreen(): void;
  // 还款日tab新增：#notifySheet本身继续100%vanilla(跟#detailSheet/#editSheet同一类处理)，
  // React只需要读通知设置(铃铛图标的.on状态)+能打开这个sheet。
  getNotify(): NotifySettings;
  openNotifySheet(): void;
  // 统计tab新增：两个导出函数本身零DOM依赖(只读debts造Blob)，继续100%vanilla，
  // 只是入口桥接给React的导出按钮调用，premium门禁判断在React这边原样复刻。
  exportReportXlsx(): void;
  exportReportPdf(): void;
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
