// www/js/calc.js 里的39个纯函数是普通顶层function声明(不在任何IIFE里)，加载后会挂到window上——
// 这份文件只是给它们补一层环境类型声明，方便React代码里用 window.recompute(d) 这种显式写法调用时
// 有类型提示。calc.js本身不需要、也不应该改成TS/ESM——它继续是index.html那套"经典script、全局
// 作用域共享"的既有约定的一部分，这里只是"从React这一侧看过去，这些全局函数长什么样"的说明。
//
// 只声明已迁移的React页面实际会调用的几个，不是calc.js全部39个——够用即可，见CLAUDE.md
// "React 迁移"一节。
import type { AiConversation, Debt, DebtSummary, GenSpec, MonthlyRepayment, PlanRow, Premium, ReportData, SortKey, UpcomingPressure } from "./types";

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
    // 统计tab"月还款统计"图(MonthlyChart.tsx)+第4张明细表(ReportTables.tsx)用：按月聚合
    // 已还(actual)/待还(scheduled)金额，不按active过滤、月份连续补0，见calc.js注释。
    computeMonthlyRepayment(debts: Debt[]): MonthlyRepayment[];
    // 统计tab"未来N个月还款压力"柱状图(PressureChart.tsx)用——按active过滤、逾期单独成桶、
    // 窗口从当前月起固定N个月、拆本金/利息两段，见calc.js注释。today参数只为可测，正常不传。
    computeUpcomingPressure(debts: Debt[], monthsAhead?: number, today?: Date): UpcomingPressure;
    pressureWindowMonths(debts: Debt[], today?: Date): number;
    // 一笔债务按现有计划还到底还要再付多少利息/手续费(未还期次的interest之和)——BalanceBars的
    // "按剩余利息排序"和总结卡的合计用。自定义计划没拆本息时会低估成0，见calc.js注释。
    remainingInterest(d: Debt): number;
    // 图表Y轴刻度取整到"好看数字"(档位表 1/1.5/2/2.5/3/4/5/6/8/10 ×10^n)——PressureChart和
    // PayoffLine共用，见calc.js注释里"为什么档位不能只有1/2/2.5/5/10"。
    niceCeil(v: number): number;
    // editSheet(react/src/sheets/EditSheet.tsx等)用：genPlan是公式生成器4种计息方式共用的
    // 生成函数，impliedAPR从还款计划反推年化利率(#planSum摘要用)，isBadRepeatDay拒绝
    // 29/30/31号(批量设置还款日/公式生成器首期还款日都要拒)，r2是两位小数四舍五入
    // (逐行编辑本金/利息联动金额时用)，clone是深拷贝(openEditSheet时复制debts[i].plan，
    // 保存时复制editingPlan写回debts，避免引用共享)，addMonths/fmtDate是"加一期"按钮
    // 推算下一期默认日期用。
    genPlan(spec: GenSpec): PlanRow[];
    impliedAPR(plan: PlanRow[]): number;
    // detailSheet(react/src/sheets/DetailSheet.tsx)用：已知的数据模型缺口④(部分还款)——
    // 这一期还欠多少钱=amount减去已经攒的paidAmount，没还过就是全额。
    rowRemaining(r: PlanRow): number;
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
    // docsScreen(react/src/sheets/DocsScreen.tsx)用：markdown文档预览渲染成HTML字符串
    // (极简手写markdown解析器，见calc.js"纯计算函数"一节)。
    mdToHtml(src: string): string;
    // aiScreen(react/src/sheets/AiScreen.tsx)用：findAiConv按id查历史对话，找不到返回null；
    // bumpAiConvTop把命中的记录挪到数组最前面(原地mutate传入的数组，不是纯函数，见calc.js
    // "纯计算函数"一节)——回复成功后用它把这条对话顶到列表最上面，不需要在React这边重新
    // 实现同一段逻辑。
    findAiConv(convos: AiConversation[], id: string): AiConversation | null;
    bumpAiConvTop(convos: AiConversation[], rec: AiConversation): void;
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
    // 同上，2026-07-31新增的三条(关于我们/隐私政策/用户服务协议)——见
    // react/src/sheets/AboutScreen.tsx、PrivacyScreen.tsx、AgreementScreen.tsx。
    // vanilla的__handleBackButton链里privacy/agreement/terms排在about前面("最上层先关"：
    // 这三个是从about内部再打开的下一层)。
    __azAboutScreenBack?: () => boolean;
    __azPrivacyScreenBack?: () => boolean;
    __azAgreementScreenBack?: () => boolean;
    // 同上，第八步(simScreen/notifySheet)新增的两条——见 react/src/sheets/SimScreen.tsx、
    // NotifySheet.tsx。链里按原来DOM顺序排：simScreen在backupScreen和premiumScreen之间、
    // notifySheet排在accountScreen之后(沿用原来#notifySheet在DOM里的位置)。
    __azSimScreenBack?: () => boolean;
    __azNotifySheetBack?: () => boolean;
    // 同上，第九步(docsScreen)新增——见 react/src/sheets/DocsScreen.tsx。
    __azDocsScreenBack?: () => boolean;
    // 同上，第十步(backupScreen，React迁移收尾)新增——见 react/src/sheets/BackupScreen.tsx。
    // 链里沿用原来#backupScreen在DOM里的位置：排在aiScreen之后、simScreen之前。
    __azBackupScreenBack?: () => boolean;
    // 同上，第十一步(aiScreen+aiHistorySheet，React迁移收尾)新增——见
    // react/src/sheets/AiScreen.tsx。__azAiHistorySheetBack必须排在__azAiScreenBack
    // 之前判断("最上层先关"：历史对话sheet的z-index=36比aiScreen所在的.subpage(35)更高，
    // 视觉上盖在aiScreen上层，是这个原则第一次出现在"sheet挂在subpage内部"场景时定下的
    // 顺序，这次迁移沿用同一个顺序不变)。链里位置沿用原来#aiScreen在DOM里的位置：
    // 排在backupScreen之前、termsScreen之后。
    __azAiScreenBack?: () => boolean;
    __azAiHistorySheetBack?: () => boolean;
    // 档案库PDF预览(react/src/sheets/DocsScreen.tsx)用：pdf.js的legacy构建，通过
    // www/index.html里一段行内type="module"脚本挂到window上(不是npm依赖，不参与
    // Vite打包，见index.html里那段注释)——这里只声明DocsScreen.tsx实际用到的
    // getDocument/PDFPageProxy这几个方法，不是pdf.js完整API表面。可能不存在
    // (旧安装/加载失败)，所以是可选属性，调用前要判空。
    pdfjsLib?: {
      getDocument(src: { data: ArrayBuffer }): {
        promise: Promise<PdfjsDocumentProxy>;
      };
    };
  }

  interface PdfjsDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfjsPageProxy>;
    destroy(): Promise<void>;
  }

  interface PdfjsPageProxy {
    getViewport(params: { scale: number }): { width: number; height: number };
    render(params: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void> };
  }
}

export {};
