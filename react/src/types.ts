// 债务对象的形状——跟 www/index.html 里 calc.js 的 recompute()/genPlan() 保持一致。
export interface PlanRow {
  date: string;
  amount: number;
  principal: number;
  interest: number;
  paid: boolean;
  // 提前结清时追加的那一条"真实结清记录"(calc.js applySettle())，不是原计划里的期次：
  // principal=当时的剩余本金、interest=实付金额减剩余本金(多付记正、协商减免记负)。
  // 详情页的还款计划表靠这个标记把期次号显示成"结清"而不是"n/m"。
  settleRow?: boolean;
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
  // 稳定id——calc.js的genDebtId()创建时生成一次，往后不变(normalize()给老数据惰性补发)。
  // 拖拽重排/编辑/备份恢复/JSON导入导出全程保持不变，是这个项目里唯一可靠的"这是同一笔
  // 债务"判断依据，不要再用数组下标或对象引用寻址单笔债务。
  id: string;
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
  // 提前结清时被整体收走的剩余未还期次(calc.js applySettle())。点"恢复"时原样放回
  // (undoSettle())，所以撤销结清能精确回到结清前那一刻。没提前结清过的债务没有这个字段。
  settleStash?: PlanRow[];
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

// 档案库(react/src/sheets/DocsScreen.tsx)用——window.__azBridge.getFiles()把vanilla的
// docs(markdown文档)+uploads(IndexedDB存的图片/PDF/Word等)合并成一份统一的展示数据。
// id是稳定标识("doc:<key>"或"up:<IndexedDB的id>")，用于删除/下载/分享这几个桥接调用按
// id反查目标，不需要把原始Blob传过桥接边界。upload为false时是markdown文档，content
// 是正文(过mdToHtml()渲染)；upload为true时url是objectURL(图片/PDF预览用)。
export interface FileItem {
  id: string;
  upload: boolean;
  name: string;
  mime: string;
  label: string;
  content?: string;
  url?: string;
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

// computeMonthlyRepayment(debts)的返回形状(见 www/js/calc.js)——"月还款统计"图(MonthlyChart.tsx)+
// ReportTables第4张表用。故意不并入 ReportData，因为 ReportData 被 exportReportXlsx/exportReportPdf
// 按字段名精确解构，新维度必须独立成型。
export interface MonthlyRepayment {
  month: string;
  actual: number;
  scheduled: number;
}

// computeUpcomingPressure(debts, monthsAhead?, today?)的返回形状(见 www/js/calc.js)——统计tab
// "未来N个月还款压力"柱状图(PressureChart.tsx)用。跟 MonthlyRepayment 的关键区别：只算在还债务
// (已结清债务的剩余期次不再被当成"待还")、逾期单独成桶不混进未来月份、窗口从当前月起固定N个月、
// 金额拆本金/利息两段。手续费没有独立字段(equalfee的手续费直接写进PlanRow.interest)，所以只有
// 两段、没有第三段——宁可少一个维度也不制造不可信数据。
export interface UpcomingPressureMonth {
  month: string;
  principal: number;
  interest: number;
  total: number;
  // 这个月每笔债务各要还多少(同一笔债务同月多期已合并)，按金额降序——点击某根柱子时展开用。
  items: { id: string; name: string; amount: number }[];
}
export interface UpcomingPressure {
  // 已逾期未销的期次汇总(date < 今天 且 !paid)——"已经错过"跟"即将要还"是两件事，图上单独一根柱。
  overdue: { amount: number; principal: number; interest: number; count: number };
  months: UpcomingPressureMonth[];
  currentMonth: string;
  totalAhead: number;
  monthlyAvg: number;
  // 窗口内金额最高的月份；全部为0时是null(不返回一个total为0的假峰值)。
  peak: { month: string; total: number } | null;
}

// AI 债务顾问历史对话记录（react/src/sheets/AiScreen.tsx用）——第十一步(React迁移收尾)后
// AI_CHATLOG_KEY整体移交React所有权，直接读写localStorage(不经过bridge，跟SIM_KEY当年
// 的先例一致)。messages里的role只有"user"/"assistant"两种(跟发给aiAdvisor云函数的history
// 参数、以及calc.js的findAiConv/bumpAiConvTop操作的形状完全一致)，UI渲染时按
// role==="user"?"user":"bot"映射成CSS class。
export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}
export interface AiConversation {
  id: string;
  title: string;
  isReport: boolean;
  updatedAt: number;
  messages: AiChatMessage[];
}

// 云备份记录（react/src/sheets/BackupScreen.tsx用）——window.__azBridge.listBackups()的
// 单条元素形状，跟backupList云函数`.field({...})`投影出来的轻量字段一致（不含完整debts/docs，
// 那些要等真正"恢复"时才通过restoreBackup(id)取回）。
export interface BackupRecord {
  id: string;
  createdAt: number;
  debtsCount: number;
  filesCount: number;
  totalSizeBytes: number;
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
  // 这几个都按id(不是下标)寻址——见CLAUDE.md"债务对象加了真正的id字段"一节。
  payInstallment(id: string): void;
  unsettle(id: string): void;
  commitReorder(newOrder: Debt[]): void;
  saveAll(): void;
  renderAll(): void;
  // openPremiumScreen/openAccountScreen/openAiScreen已删除——第七步(accountScreen/
  // premiumScreen/termsScreen)/第十一步(aiScreen)迁移React后，打开这几个screen不再经过
  // bridge，改成shared/state.ts的openAccountScreen/openPremiumScreen/openTermsScreen/
  // openAiScreen(纯React状态，模式同openDetailSheet/openEditSheet)。
  // detailSheet新增：#dSettle(提前结清)以前只在vanilla内部调用，现在detailSheet的按钮由
  // React渲染，需要显式桥接。openSimScreen已删除——第八步(simScreen)迁移React后，打开
  // 这个screen不再经过bridge，改成shared/state.ts的openSimScreen(i)(模式同openDetailSheet)。
  settleFull(id: string): void;
  // 还款日tab新增：getNotify()仍然是bridge——notify这份数据的调度(syncNotifications)
  // 依赖vanilla的debts/renderAll()管线，必须留在vanilla，React只读它。openNotifySheet已
  // 删除——第八步(notifySheet)迁移React后，打开这个sheet不再经过bridge。
  getNotify(): NotifySettings;
  // 统计tab新增：两个导出函数本身零DOM依赖(只读debts造Blob)，继续100%vanilla，
  // 只是入口桥接给React的导出按钮调用，premium门禁判断在React这边原样复刻。
  exportReportXlsx(): void;
  exportReportPdf(): void;
  // "我的"tab新增：备份文件的打包/解析、系统文件选择器，继续100%vanilla。openDocsScreen/
  // openBackupScreen已删除——docsScreen(第九步)/backupScreen(第十步)迁移React后不再经过
  // bridge，改成shared/state.ts的openDocsScreen/openBackupScreen(纯React状态)。
  downloadBackupFile(): void;
  triggerImportFilePicker(): void;
  // editSheet(react/src/sheets/EditSheet.tsx)新增：setDebt是保存写入(id非空覆盖对应debt并
  // 保留settled/settledDate，id为null是新增)，故意不在内部调saveAll/renderAll——React保存时
  // 自己依次调setDebt→saveAll→renderAll，跟commitReorder那套细粒度调用惯例一致。obj参数用
  // Omit<Debt,"id">——id永远由vanilla赋值/保留，React这边保存时不该也不需要造一个id出来。
  // deleteDebt是原样暴露的既有vanilla函数(自带ask()确认+splice+saveAll+renderAll)。toast是
  // #flash单例的简单passthrough。confirmAsync是vanilla共享确认弹窗ask()的Promise外壳——
  // 带输入控件时(month日期月份/date日期/amount金额，三者互斥)确认返回输入框的字符串值、
  // 取消返回null；不带输入控件时确认返回true、取消返回false。特意复用这一份弹窗UI而不是在React里另建一套，见CLAUDE.md"React 迁移"
  // 一节"第六步"。
  setDebt(id: string | null, obj: Omit<Debt, "id">): void;
  deleteDebt(id: string): void;
  toast(msg: string): void;
  confirmAsync(title: string, body: string, opts?: { month?: string; date?: string; dateMin?: string; amount?: number; amountHint?: string }): Promise<string | boolean | null>;
  // 第七步(accountScreen/premiumScreen)新增：这三个都是真实的cloud/native调用或者共享状态
  // 变更，不能重写成纯React——wxLogout()清本地账号态+CloudBase signOut；deleteAccount()调
  // deleteAccount云函数(不信任客户端参数，身份来自已认证会话)；redeemCode(code)查
  // REDEEM_CODES表、命中就写premium并返回tier，没命中返回null让React决定toast文案。
  wxLogout(): void;
  // 返回是否真的注销成功——vanilla内部会自己toast成功/失败文案(保持跟原doDeleteAccount()
  // 一致的用户反馈)，React只需要这个布尔值来决定要不要顺带关闭accountScreen。
  deleteAccount(): Promise<boolean>;
  redeemCode(code: string): string | null;
  // 第八步(notifySheet)新增：这几个都要调用@capacitor/local-notifications原生插件
  // (权限检查/申请/调度)，不能重写成纯React。setNotifyEnabled返回最终生效的状态(权限被拒时
  // 会是false，React据此把checkbox退回未勾选)；addNotifyRule/deleteNotifyRule/
  // sendTestNotification内部都会自己调saveNotify()(已派发az:state-changed，useNotify()
  // 自动跟上)+syncNotifications()重新排程，不需要React再手动触发。
  setNotifyEnabled(enabled: boolean): Promise<boolean>;
  addNotifyRule(offsetDays: 0 | 1 | 2 | 3, time: string): void;
  deleteNotifyRule(idx: number): void;
  sendTestNotification(): void;
  // 第九步(docsScreen)新增：IndexedDB(uploads的blob存储)+docs数组增删+SaveFile/分享原生
  // 调用全部留vanilla，React只拿到不含原始Blob的展示数据(FileItem)+按id操作的几个函数。
  // getFiles()每次调用都合成一份新数组(不是同一个底层引用)，配合shared/state.ts的
  // useFiles()做"事件触发才重新计算"的缓存，避免每次都返回新引用导致无限重渲染。
  getFiles(): FileItem[];
  uploadArchiveFile(file: File): Promise<void>;
  deleteArchiveFile(id: string): Promise<void>;
  downloadArchiveFile(id: string): Promise<void>;
  shareArchiveFile(id: string): void;
  // 第十步(backupScreen)新增：全部cloud函数调用(ensureCbAuthReady/cbApp().callFunction这套
  // 认证会话状态)继续100%vanilla，React只拿到调用结果。createBackup/restoreBackup/
  // deleteBackup内部照旧toast成功/失败文案(跟deleteAccount()同一个先例)，返回布尔值让React
  // 决定要不要刷新列表；listBackups()没有布尔判断需要做，失败直接throw，React用try/catch
  // 显示错误文案(跟原来renderBackupList()的catch分支效果一致)。getBackupMeta()是同步读取
  // (lastBackupMeta本来就是常驻内存的模块变量，不需要额外的loading态)。
  createBackup(): Promise<boolean>;
  listBackups(): Promise<BackupRecord[]>;
  restoreBackup(id: string): Promise<boolean>;
  deleteBackup(id: string): Promise<boolean>;
  getBackupMeta(): { lastBackupAt: number };
  // 第十一步(aiScreen)新增，且是这一步唯一的新增：callAiAdvisor原样保留现有vanilla函数
  // (内部继续用vanilla自己的debts调buildAiSummary())，因为它依赖ensureCbAuthReady/
  // cbApp().callFunction这套认证会话状态，不可移植。AI_USAGE_KEY/AI_CHATLOG_KEY整体移交
  // React所有权(跟SIM_KEY当年同一个先例)，不经过bridge。history是"这次提问之前的上下文"，
  // 不含这次提问本身(服务端会把question接在最后)；report模式不需要history，传空数组。
  callAiAdvisor(mode: "report" | "chat", question: string, history: AiChatMessage[]): Promise<string>;
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
