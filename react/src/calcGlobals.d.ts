// www/js/calc.js 里的39个纯函数是普通顶层function声明(不在任何IIFE里)，加载后会挂到window上——
// 这份文件只是给它们补一层环境类型声明，方便React代码里用 window.recompute(d) 这种显式写法调用时
// 有类型提示。calc.js本身不需要、也不应该改成TS/ESM——它继续是index.html那套"经典script、全局
// 作用域共享"的既有约定的一部分，这里只是"从React这一侧看过去，这些全局函数长什么样"的说明。
//
// 只声明已迁移的React页面实际会调用的几个，不是calc.js全部39个——够用即可，见CLAUDE.md
// "React 迁移"一节。
import type { Debt, DebtSummary, GenSpec, PlanRow, Premium, ReportData, SortKey } from "./types";

declare global {
  interface Window {
    __azBridge: import("./types").AzBridge;
    recompute(d: Debt): void;
    summarizeDebts(debts: Debt[]): DebtSummary;
    hasPremium(premium: Premium): boolean;
    premiumLabel(premium: Premium): string | null;
    // sorts是{排序名: 取值函数}的映射——calc.js的detectMatchingSort()对键名不关心具体是哪个
    // SortKey子集，只是Object.keys()遍历，用Record<string,...>而不是Record<SortKey,...>，
    // 这样调用方传"不含custom"的DEBT_SORTS(见useDebtSort.ts)不需要额外补一个"custom"键。
    detectMatchingSort(activeInOrder: Debt[], sorts: Record<string, (d: Debt) => number>): SortKey;
    isActive(d: Debt): boolean;
    rateClass(r: number): string;
    fmt(n: number): string;
    // detailSheet用：money是还款计划表格专用的2位小数格式化(fmt是0位小数、千分位分组，
    // 两者不是同一个函数，见calc.js)。
    money(n: number): string;
    // 还款日tab用：dueBucket是互斥分段(给"全部"视图分组用)，urgencyTier/relLabel是hero卡+
    // 列表卡片的严重度/相对时间文案，offsetLabel是通知规则列表里"提前N天"这种文案，
    // parseDate/today0是日期计算。
    dueBucket(diff: number): "overdue" | "week" | "month" | "later";
    urgencyTier(diff: number): "overdue" | "crit" | "warn" | "dim";
    relLabel(diff: number): string;
    offsetLabel(n: number): string;
    parseDate(s: string): Date | null;
    today0(): Date;
    // 统计tab用：computeReportData是2/3/4/5四张图表+KPI共同的数据源，truncateLabel给
    // 余额对比条形图的债务名做截断。
    computeReportData(debts: Debt[]): ReportData;
    truncateLabel(s: string, n: number): string;
    // editSheet(react/src/sheets/EditSheet.tsx等)用：genPlan是公式生成器4种计息方式共用的
    // 生成函数，impliedAPR从还款计划反推年化利率(#planSum摘要用)，isBadRepeatDay拒绝
    // 29/30/31号(批量设置还款日/公式生成器首期还款日都要拒)，r2是两位小数四舍五入
    // (逐行编辑本金/利息联动金额时用)，clone是深拷贝(openEditSheet时复制debts[i].plan，
    // 保存时复制editingPlan写回debts，避免引用共享)，addMonths/fmtDate是"加一期"按钮
    // 推算下一期默认日期用。
    genPlan(spec: GenSpec): PlanRow[];
    impliedAPR(plan: PlanRow[]): number;
    // simScreen(react/src/sheets/SimScreen.tsx)用：按标准等额本息模型模拟"多还一笔"的效果，
    // 月供不足以覆盖利息(无法收敛)时返回null，UI层需要单独toast提示。
    simulatePrepay(
      d: Debt,
      mode: "once" | "recurring",
      atPeriod: number,
      extra: number
    ): { monthsSaved: number; interestSaved: number; newMonths: number; baseMonths: number } | null;
    isBadRepeatDay(day: number): boolean;
    r2(x: number): number;
    clone<T>(x: T): T;
    addMonths(d: Date, m: number): Date;
    fmtDate(d: Date): string;
    // 反向桥接：vanilla的__handleBackButton硬件返回键"最上层先关"优先级链第一条检查这个——
    // React挂载"在还债务"页时注册，卸载时删除，见 react/src/debts/DebtList.tsx。
    __azDebtsBack?: () => boolean;
    // 同上，detailSheet迁移React后新增的一条——见 react/src/sheets/DetailSheet.tsx，
    // 硬件/手势返回键"最上层先关"链里排在最后一项(detailSheet优先级最低)。
    __azDetailSheetBack?: () => boolean;
    // 同上，editSheet(第六步)新增的一条——见 react/src/sheets/EditSheet.tsx，链里排在
    // notifySheet和detailSheet之间(沿用原来#editSheet在DOM里的位置)。
    __azEditSheetBack?: () => boolean;
    // 同上，第七步(accountScreen/premiumScreen/termsScreen)新增的三条——各自的React组件
    // 挂载时注册，卸载时删除，见 react/src/sheets/AccountScreen.tsx、PremiumScreen.tsx、
    // TermsScreen.tsx。vanilla的__handleBackButton链里按原来DOM顺序排：termsScreen在
    // aiHistorySheet和aiScreen之后、premiumScreen在accountScreen之前。
    __azAccountScreenBack?: () => boolean;
    __azPremiumScreenBack?: () => boolean;
    __azTermsScreenBack?: () => boolean;
    // 同上，第八步(simScreen/notifySheet)新增的两条——见 react/src/sheets/SimScreen.tsx、
    // NotifySheet.tsx。链里按原来DOM顺序排：simScreen在backupScreen和premiumScreen之间、
    // notifySheet排在accountScreen之后(沿用原来#notifySheet在DOM里的位置)。
    __azSimScreenBack?: () => boolean;
    __azNotifySheetBack?: () => boolean;
  }
}

export {};
