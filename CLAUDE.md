# CLAUDE.md

这个文件给 Claude Code 看，记录这个项目非显而易见的技术细节和雷区。给人看的项目介绍在 `README.md`。

**如果项目根目录下有 `PROGRESS.md`，先看那个文件。** 那是不进git、按时间记录"哪天做了什么、现在卡在哪一步"的进度日志（这份CLAUDE.md记的是相对稳定的技术细节，不记当前进度）——不是每个clone/checkout都会有这个文件（它是gitignored、因机器而异的本地文件），没有的话说明是全新环境，忽略这条即可。

**⚠️`PROGRESS.md`只需要读最近的部分，不要整份读完**——它是按时间顺序累加的日志，早期条目的结论基本都已经沉淀进了这份CLAUDE.md，继续留着只是为了给"哪天做过什么"提供可追溯的存档，不是每次都要重新加载的上下文。**按"最近的自然日"定边界，不是按`## `标题数——同一天常常有好几个"续/再续/三续..."编号的子条目（活跃的日子一天能有七八个甚至十几个），数标题个数会跟"最近几天"对不上。** 做法：`grep -n "^## 20" PROGRESS.md | tail -20` 看最近这些标题都是哪天的，找到最近这个日期第一次出现的那一行，从那里读到文件末尾（通常就是最后1~2个自然日，含当天全部"续"条目）；如果这天内容明显偏短，往前再带一天。只有明确要追溯更早某次具体决策的完整经过时，才按关键词/日期搜更早的部分，不要因为"先看那个文件"这条规则就默认从头读到尾。

**⚠️`.claude/skills/`下有几个项目专属skill，装的是"只有动到那块功能才用得上"的详细参考资料**（2026-08-01这轮从CLAUDE.md搬出去的，是为了不让这些低频细节每次session都占上下文）——`cloudbase-deploy`（云函数部署命令+三个坑）、`wechat-login-setup`（微信登录SDK接线的6个坑+自定义登录API用法）、`release-keystore`（release签名文件位置+构建命令）、`debt-model-history`（6条已修复数据模型缺口的完整前后经过）、`pay-tab-design`（还款日tab的急迫程度分档/筛选分组语义/左滑手势）、`edit-sheet-design`（新增编辑表单的oneTimeStash等状态机+genPlan四舍五入bug排查史）、`cloud-backup-design`（云备份5个云函数+配额规则）、`ai-advisor-design`（AI顾问的模型选型/用量上限/历史对话状态机）。CLAUDE.md正文里凡是写"见`xxx` skill"的地方，都是指这些——不需要手动去读那个文件，Claude Code会在做相关任务时自动判断要不要加载，正文里留的是压缩过的摘要/当前状态，不是要点开才能懂的残缺信息。

## 项目是什么

**After Zero**——一个记债务的个人工具，用 [Capacitor](https://capacitorjs.com/) 把一个自包含的HTML app（`www/index.html`）包成安卓原生app。

**源代码 = `www/index.html`，永远改这个文件。** `android/` 目录绝大部分是Capacitor根据`www/`自动生成的原生工程，改完`www/index.html`后要跑 `npx cap sync android` 才会同步进去，不要直接改`android/app/src/main/assets/public/index.html`（会被下次sync覆盖）。

**例外：`android/app/src/main/java/io/github/jenkjyu/afterzero/` 下有手写的原生插件代码，不是sync产物。** 目前有 `SaveFilePlugin.java` 和 `WeChatLoginPlugin.java`（+ `wxapi/WXEntryActivity.java` + `MainActivity.java` 里几行注册代码），`npx cap sync android` 不会碰这些文件，是真正的项目源码，要跟着走版本控制，不要当成自动生成的东西误删或忽略。详见下面"原生插件"一节。

## 纯计算函数：`www/js/calc.js` + `test/calc.test.js`

这是"单文件无构建步骤"原则下第一次真正拆出去的一份代码——**39个函数**从`www/index.html`主`<script>`里搬到了独立文件`www/js/calc.js`。这是2026-07-24"六续"那轮讨论定的长期方向（React迁移+测试优先，三步走）的第一步，分三轮做完：第一轮先搬了`recompute`/`genPlan`/`impliedAPR`/`amortForward`/`simulatePrepay`/`detectMatchingSort`/`urgencyTier`/`relLabel`/`dueBucket`/`isActive`/`rateClass`/`r2`/`pad`/`parseDate`/`addMonths`/`fmtDate`/`today0`/`npv`/`markPaidThrough`/`normalize`这20个明确点名的核心计息/日期函数；用户追问"是不是还是第一步"确认后，第二轮扫描全文件把剩下没碰DOM/localStorage的纯函数也一并搬完：`isBadRepeatDay`/`offsetLabel`/`computeReportData`（统计报表的数据计算）、`clone`/`fmt`/`money`/`todayStr`/`baseName`/`extOf`（通用格式化/工具函数）、`esc`/`inline`/`isHr`/`mdToHtml`/`escSvg`/`truncateLabel`（HTML转义+极简markdown渲染器，档案库预览用）；第三轮用户追问"剩下没搬的是不是都在等React迁移"，藉此机会把"等迁移"和"低价值/有状态暂不搬"这两类原因拆清楚后，又补搬了`hasPremium`/`premiumLabel`/`findAiConv`/`bumpAiConvTop`这4个——它们原本被跟"等迁移"那批混着说，其实跟迁移完全无关，只是需要参数化改造，评估后发现值得现在就搬。这批函数全部不碰DOM/localStorage，纯粹是"给定输入算出确定输出"，不管以后切不切React都不受影响，现在拆、现在测，都不会是白费功夫。

**拆分手法是`www/index.html`自己的原有原则的延伸，不是引入新范式**：`calc.js`是普通的`<script src="js/calc.js"></script>`（在主`<script>`之前引入），文件里的函数就是最普通的顶层`function`声明，**不是**ES module的`export`/也不是挂在某个命名空间对象下（比如`window.AZCalc={...}`）。经典的（非`type="module"`）`<script>`标签，不管有没有各自的`"use strict"`，彼此的顶层`function`声明天然共享同一个全局作用域——这一点这个项目其实早就在依赖（CloudBase那三个CDN脚本声明的全局`cloudbase`就是同样的机制），`calc.js`只是把这个既有机制又用了一次。**结果是`index.html`主脚本里调用`recompute(d)`/`dueBucket(diff)`这些的地方绝大多数一行都不用改**，只是把函数定义本身搬走、原地留一句注释指向`calc.js`——JS作用域链会自动从IIFE内部找到全局的同名函数。

**几处不是"原样搬走"、动了函数签名的地方，都是同一类原因——原来直接读IIFE内部闭包变量，搬到独立的全局脚本里就看不到那个闭包了，只能改成显式传参**：
- `detectMatchingSort`：原来读闭包变量`DEBT_SORTS`（`{排序名: 取值函数}`的映射），改成`detectMatchingSort(activeInOrder, sorts)`，调用处（`www/index.html`里`commitReorder`后面那行）加了`, DEBT_SORTS`第二个参数。
- `computeReportData`：原来读闭包变量`debts`，改成`computeReportData(debts)`，4处调用处（`buildAiSummary`/`renderReportScreen`/`exportReportXlsx`/`exportReportPdf`附近）都加了这个参数。
- `hasPremium`/`premiumLabel`：原来读闭包变量`premium`，改成`hasPremium(premium)`/`premiumLabel(premium)`，7+2处调用处都加了这个参数（"我的"页会员行、AI banner、报表导出按钮、云备份入口等所有判会员的地方）。
- `findAiConv`/`bumpAiConvTop`：原来读/改闭包变量`aiConvos`，改成`findAiConv(aiConvos, id)`/`bumpAiConvTop(aiConvos, rec)`，2处调用处（`loadAiConversation`附近）都加了这个参数。**`bumpAiConvTop`会原地修改传入的数组**（`splice`+`unshift`），不是没有副作用的纯函数，但副作用只作用于传入的参数本身、不碰任何模块级/DOM状态，跟`Array.prototype.sort`这类原地方法是同一类，一样能用"调用后检查数组"的方式单测，不影响它归入这批"纯函数"。

其余31个函数调用方式一个字符都没变。**`esc`跟`escSvg`现在实现内容完全相同**（都是转义`&`/`<`/`>`），但故意保留成两个独立的名字没有合并——一个给markdown渲染用、一个给PDF导出的SVG图表文字用，这次纯粹是"原样搬运"不做行为之外的重构，合并成一个是以后如果要做的话再单独决定的事，不在这轮里顺手做掉。

**没有搬、且理由分两类，别混为一谈**：
- **真的是"等React迁移"**：`renderBalanceBars`/`renderTypeStack`/`renderPayoffLine`/`renderReportTables`这些拼HTML字符串的展示函数——虽然本身也不碰DOM（只是拼字符串），但拼出来的结构是跟当前手写渲染方式绑死的，以后切JSX组件会整个重写，现在写测试锁定输出结构，切了框架就作废，白费功夫。这是六续讨论里明确划过的线，属于"跟着框架迁移到哪个页面就补到哪个页面"那一类。
- **跟迁移完全无关，是别的原因**：`aiUsageToday`/`aiUsageLeft`——`aiUsageToday()`内部会在跨天时**重新赋值**闭包变量`aiUsage`（`aiUsage = {date:t, count:0}`），这是真实的状态变更（不是读一下就完事），要参数化成纯函数得改成"返回新值、调用方自己重新赋值"这种模式，属于状态更新方式的小重构，不是简单加个参数就行，评估后判断更适合等这个项目哪天要理清状态管理方式时一起处理，不是"因为要等框架"。

**Node测试环境靠文件末尾的`module.exports`兼容，浏览器里这段代码不会执行**：`calc.js`末尾有一段`if (typeof module !== "undefined" && module.exports) { module.exports = {...} }`——`test/calc.test.js`用`node:test`（Node自带，不用额外装包，`package.json`的`"type":"commonjs"`决定了这里用`require`不是`import`）直接`require("../www/js/calc.js")`跑单元测试；浏览器加载这个文件时是普通`<script src>`，`typeof module`是`"undefined"`，这段代码整个跳过，不会往全局塞一个多余的`module`变量。**以后这批纯函数还要再增补的话**，加到`calc.js`时记得同步把新函数名加进这段`module.exports`，忘记加的话`require`拿到的对象里会缺这个函数，`test/calc.test.js`里`calc.xxx is not a function`会立刻暴露出来，不难查。

**CI（`.github/workflows/ci.yml`）会在每次push/PR时自动跑`npm test`/`npm run test:react`/`npx tsc --noEmit`（`react/`目录）/`npm run build:react`这4条命令**——都是纯命令行、不依赖Android SDK/真机的部分，天生适合搬进CI。安卓Gradle编译和Playwright真机手势验证这两块因为需要Android SDK或真实设备，继续保持手动做，没有搬进CI。

跑测试：`npm test`（`package.json`的`"test"`脚本是`node --test 'test/*.test.js'`，**注意这个glob是显式写死的，不是裸的`node --test`**——见下面"React 迁移"一节的坑：`react/__tests__/`目录下也有`*.test.ts`文件是给Vitest用的，Node自带的`node:test`默认会递归扫描整个项目找测试文件，连`react/__tests__/`里那些`.ts`/`.tsx`都会被当成自己的测试用例尝试去跑（失败），显式限定glob只看根目录`test/`下的`.js`文件，两套测试工具（`node --test`测`calc.js`，`vitest`测React组件）才能互不干扰）。**这批测试完全不需要真机/浏览器**——不像这个项目里大多数"必须真机验证"的功能（原生插件、云函数、WebView专属行为），纯计算函数是这个项目里少数能在CI/命令行里可靠验证、桌面和真机行为保证一致的部分，以后改这些函数、或者再往`calc.js`里加新函数，先把对应的`node:test`补上再改代码，比每次都指望真机走一遍划算得多。

**`summarizeDebts(debts)`是2026-07-24"React 迁移第二步"落地"在还债务"页时新增的第40个函数**：从vanilla`renderSummary()`内联的聚合逻辑（`total`/`monthly`/`paidPrincipal`/`paidInterest`/`active`/`settled`/`pct`）抽出来的纯函数——vanilla那份`renderSummary()`本身已经在这次迁移里整个删除（改由React调用这个函数），抽出来纯粹是为了同一份聚合数学被React组件复用，不是"这次批量整理31个函数"那一轮的产物，详见下面"React 迁移"一节。

**`computeMonthlyRepayment(debts)`是"统计tab视觉+交互升级"这轮（"月还款统计"图，详见下面"React 迁移"一节）新增的第41个函数**：按`plan`里每一期的`date`所在月份分组，拆已还(`actual`)/待还(`scheduled`)两条金额序列，月份在数据范围内按月连续补0（不留稀疏空洞）。**故意不塞进`computeReportData()`的返回对象**——那个对象被`exportReportXlsx`/`exportReportPdf`（100% vanilla）按字段名精确解构，改形状会同时打断两个导出功能，任何要给统计tab加的新数据维度都应该照这个先例独立成新函数，不要往被解构的对象里加字段。**不按`active`过滤**——已结清债务的历史已还记录仍要计入对应月份，否则一笔债务结清的瞬间会让过去月份的柱子突然变矮，是会让用户困惑的倒退。用`amount`（本金+利息合计）不是`principal`，这张图回答"当月要还多少钱"而不是负债本金变化。

**⚠️`summarizeDebts`的口径在2026-07-29"统计tab口径修正"这轮改过一次，改的是既有函数本身不是新增**：已还本金/已还利息现在算**全量（含已结清债务）**，其余字段（在还总负债/经常性月供/笔数）仍只算在还债务。原来"已还本金也只算在还债务"是一个真实的、用户报过的bug——销掉最后一期→债务自动变成已结清→它已还的那部分本金被整个踢出统计，表现为"刚还完一笔钱，已还金额纹丝不动，过一会儿点了'恢复'它自己又涨回来了"；`pct`（归零进度条）用同一份数字，意味着**每还清一笔债务进度条会往回缩**。当时"债务"tab的footnote里写着"两者都不含已结清的债务"试图解释这个行为，**但文档解释不了的反直觉行为就是bug，不是特性**——真实用户不会读footnote，只会看到数字往回跳。这一轮里曾经短暂存在过一个只给"统计"tab用的`summarizeAllTime()`（当时判断"债务"tab有footnote所以不该动它），用户在真机上撞到这个现象并报上来之后，确认两个tab都该用累计口径，就合并回`summarizeDebts`一个函数了，不留两份只差一点的实现。**教训：判断"某个反直觉口径要不要修"时，"它有文档说明"不构成保留的理由。**

**`computeUpcomingPressure(debts, monthsAhead, today)`（第42个）是"统计tab口径修正+压力图"这轮（2026-07-29）新增的**，也是为了修掉已确认的真实口径bug，不是新功能包装（完整背景见下面"统计"一节的"统计tab口径修正"子节）：
- ~~⚠️口径细节（`summarizeDebts`同样适用）：提前结清（`settleFull`）只写`settled=true`、不标记plan为已还，所以那笔债务的剩余本金**既不在`total`也不在`paidPrincipal`**——它是"用一笔金额未知的钱结掉了"，两边都不计是诚实的处理。~~ **这段已作废（2026-07-29）**：提前结清现在会问用户实付金额、把剩余期次合并成一条结清记录，剩余本金**计入**`paidPrincipal`，实付超出的部分计入`paidInterest`（减免记负数）。详见"提前结清 = 记一次真实的还款事件"一节。
- **`computeUpcomingPressure`跟`computeMonthlyRepayment`有三处关键区别**，每一处都对应一个已确认问题：①**按`active`过滤**——历史上`settleFull()`不标记plan为已还、那些剩余期次仍是`{paid:false}`，`computeMonthlyRepayment`不过滤会把它们算成"待还"，表现为"已经结清的债务，未来几个月还显示要还钱"（2026-07-29重做后剩余期次被收进`settleStash`、不再留在plan里，这个具体成因不复存在，但**按`active`过滤这条依然必须保留**——已结清就是不该出现在未来还款压力里，跟plan长什么样无关）；②**逾期未销的期次（`date < 今天`）单独进`overdue`桶**，不混进未来月份（"已经错过"和"即将要还"是两件事，混在一起会让"本月待还"虚高，跟"还款日"tab把逾期单独分档是同一个判断）；③**窗口从当前月起固定N个月**（默认12），不是从数据最早月铺到最晚月。金额**拆`principal`/`interest`两段**——这两个字段对amort/equalfee/interestfirst三种生成方式都可靠；**手续费没有独立字段**（`equalfee`的手续费`pf`直接写进`interest`），所以只做两段、不做"本金/利息/手续费"三段，宁可少一个维度也不为了图表复杂度制造不可信数据。`today`参数只为可测（默认取`today0()`），调用方正常不传。

**"零散bug修复轮"（2026-07-29）又加了3个，`calc.js`现在共48个导出函数**（`node -e "console.log(Object.keys(require('./www/js/calc.js')).length)"` 可以随时核对，别再靠数注释里的序号）：
- **`applySettle(d, paidAmount, todayString)` / `undoSettle(d)`**——提前结清/撤销结清的完整数据变换。这两个不是"给定输入算出确定输出"那种严格纯函数（会原地mutate传入的`d`），但副作用只作用于参数本身、不碰任何模块级/DOM状态，跟`bumpAiConvTop`是同一类，一样能用"调用后检查对象"的方式单测。详见"提前结清 = 记一次真实的还款事件"一节。
- **`pressureWindowMonths(debts, today)`**——"未来还款压力"图铺多少个月（铺到最后一笔未还且未逾期的期次所在月份，下限12上限60）。详见"统计"一节。

**同一轮还修了`computeReportData()`的`timeline`一个真实bug**：`timeline`第一个点固定是"今天"、随后按未还行日期升序追加，**逾期未销的期次日期在今天之前，会让第二个点的日期早于第一个点**，折线图上表现为"今天→过去→未来"的时间倒流。修法是把逾期未销（以及日期缺失/格式不对）的期次归到"今天"这个桶里——语义上也对，逾期的钱今天就该还，投影上按"立即偿还"处理，图上表现为起点处的一个陡降（此时会有两个日期同为今天的点，一个是起始余额、一个是扣掉逾期后的余额，这是刻意的，保证"起点=当前总余额""终点归零"两个不变量都不破）。**⚠️这个修复会连带改变PDF导出**——`exportReportPdf`通过`buildReportTableRows`/`buildExportChartsSVG`两处都读`timeline`（`exportReportXlsx`和`buildAiSummary`只读`totalBalance`/`avgRate`/`payoffDate`，不受影响）；这是刻意接受的：只修屏幕不修导出会造成"屏幕上对了、导出还是错的"这种更糟的不一致。

## ⚠️已知的数据模型缺口（2026-07-29/07-30盘点，全部已修）——完整历史见`debt-model-history` skill

`plan`数组一直有逐期数据，但曾经的消费者习惯性只读"第一期"或"只读active那部分"——产品意图往前走了、读取方式没跟上，2026-07-29盘点出6条，全部已修完。**当前数据模型**（不用看历史也该知道）：

- `PlanRow` = `{date, amount, principal, interest, paid, paidAt?, paidAmount?, settleRow?}`。`paidAt`只在真实还款事件时写（`recordPayment`/`waivePeriod`/`applySettle`结清行），手动编辑器勾选"已还"不会盖章。`paidAmount`是这期累计收到多少钱，`principal`/`interest`永远是原计划、不因部分还款改变，已还本金/利息由`recompute()`按`paidAmount`利息优先分摊算出。
- `rowRemaining(r)` = `amount - (paidAmount||0)`，UI和`computeUpcomingPressure()`都用它。
- `recordPayment(d, amount, todayString)`/`waivePeriod(d, amount, todayString)`（calc.js纯函数）——前者是"还多少算多少、不够继续留在未还列表"，后者是"协商减免，不管填多少都强制关闭这期"。
- `EditSheet.tsx`保存时校验`amount === principal + interest`（容差0.015，即1.5分钱，覆盖`genPlan()`边界情况下的四舍五入噪声），只堵"手动改金额输入框"这一条路径。
- `Debt.day`字段已删除（2026-07-30）——`#f-day`只读输入框现算自`editingPlan[0].date`，不再持久化。

**每一条当年具体怎么坏的、怎么修的、验证了多少用例，见`debt-model-history` skill**（`.claude/skills/debt-model-history/SKILL.md`）——通知调度窗口、导出含已结清债务、还款流水`paidAt`、部分还款分摊逻辑、amount一致性校验的0.015容差怎么算出来的、`d.day`死字段清理，都在里面。

## React 迁移：`react/` + "在还债务"页（绞杀者模式第一站）→ "还款日"+"统计"（第三步）→ "我的"（第四步，四个tab全部完成）→ `#detailSheet`（第五步，第一个非tab入口）→ `#editSheet`（第六步，全项目最复杂的一块UI）→ 收尾（第七~十一步，剩余全部subpage/sheet，已全部完成）——vanilla主`<script>`现在只剩数据模型+localStorage/IndexedDB读写+cloud函数/native插件调用这类impure逻辑，不再有任何JSX/DOM渲染代码

"六续"定的三步走方向（React迁移+测试优先）第二步：**"在还债务" tab（app最核心、交互最复杂的页面——长按拖拽排序、左滑手势、玻璃卡片）整体由React接管**，走的是绞杀者模式（逐页面替换），这是第一站——之所以先啃最难的页面，是因为它风险和调试成本最高，但也是用户使用最频繁、出问题影响最大的页面，先做完这个，后面的页面都不算难。

**第三步：判断"还款日"（repayment reminders）和"统计"（stats/report）这两个tab都足够简单、且第二步已经把基础设施（桥接契约/构建工具/测试约定）搭好了，合并成一轮一起迁移。** 当时剩"我的"tab和所有subpage/sheet（详情窗、编辑窗、账户页、通知设置面板等）继续是现有vanilla JS，其余三个tab（在还债务/还款日/统计）全部由React接管，两边共享同一份`localStorage`数据。

**第四步（绞杀者模式最后一站）：把"我的"tab本身也迁移到React，四个tab至此全部由React接管。** "我的"tab跟"统计"一样属于风险最低的一类——纯data→JSX展示，没有手势、没有tab内部状态，唯一的"逻辑"是Premium入口卡的文案/class计算（原样复刻自vanilla已删除的`renderPremiumEntryCard()`）。**这次迁移的边界卡得很清楚：只搬"我的"tab本身这层展示壳，它链接到的subpage（`#accountScreen`/`#premiumScreen`/`#backupScreen`/`#docsScreen`等）一个都没有重新实现**，React新增的4个桥接函数（`openDocsScreen`/`openBackupScreen`/`downloadBackupFile`/`triggerImportFilePicker`）全部是"trigger-only"——点击后调用vanilla函数打开对应subpage/触发对应流程，跟`openDetail`/`openEdit`当年的处理方式完全一致，**"我的"tab现在是最后一处能干净套用这条模式的地方了，往后如果再有subpage/sheet要迁移（比如账户页/订阅页本身），会是完全不同、量级更大的一批工作，不能照搬这次的轻量套路**。

`react/src/mine/`4个文件：`AccountHeader.tsx`（头像+昵称，读`useAccount()`）、`PremiumEntryCard.tsx`（Premium入口卡，读`usePremium()`，文案逻辑原样复刻`renderPremiumEntryCard()`）、`DataCards.tsx`（云备份/档案库/下载备份/上传备份4张纯操作卡，云备份是唯一带`hasPremium()`门禁的）、`App.tsx`（组合以上三个，无`section-label`——原vanilla `#view-data`就没有标题）。

**"下载备份文件"/"上传备份文件"这两个按钮背后的真实逻辑，处理方式分别对应"React 迁移"契约里的两种既有模式**：
- **"下载备份文件"**：原来是`dlBackupBtn`的inline click handler（`toast+uploadsForBackup().then(...)+saveToDeviceDownloads(...)`），零DOM依赖，直接抽成具名函数`downloadBackupFile()`桥接给React——跟`exportReportXlsx`/`exportReportPdf`当年的处理是同一类。
- **"上传备份文件"**：这个按钮背后是一个隐藏的`<input type="file" id="importFileInput">`+它的`change`监听器（`FileReader`→`JSON.parse`→`ask()`确认弹窗→覆盖`debts`/`docs`→`saveAll()`/`renderAll()`→`restoreUploads()`），逻辑不是零DOM依赖（依赖`ask()`这个vanilla专属的确认弹窗组件），**这个`<input>`元素和它的`change`监听器完整保留在vanilla**，只是从原来"挂在`#view-data`里面"变成"挂在折叠后的挂载点外面、跟`#uploadInput`同一类'游离在具体卡片外的隐藏文件输入'"。React这边新增的`triggerImportFilePicker()`桥接函数就一行：`$("importFileInput").click()`，只负责间接点开这个还留在vanilla DOM里的input，不碰它背后的任何业务逻辑。

**这次顺带删除了两处vanilla死代码**：`renderPremiumEntryCard()`整个函数（DOM目标`#premiumEntryCard`/`#premiumEntryTitle`/`#premiumEntrySub`全部随HTML折叠消失，逻辑原样搬进了`PremiumEntryCard.tsx`）+ 它的4处调用点（`applyRedeemTier`、`__debugPremium`、备份恢复流程、初始加载）；`renderAccountUI()`只删了`if(account){...}`那个写`#accountAvatarImg`/`#accountNameText`的DOM块，函数本身保留（`#loginGate`的`.authed`/`.open`切换+`az:state-changed`派发这两个职责跟"我的"tab无关，不能连函数一起删）。这4处`renderPremiumEntryCard()`调用点删除后没有功能缺口——它们所在的语句本来就已经各自独立派发`az:state-changed`（或者紧邻的`renderAll()`已经会派发），React的`usePremium()`能自动跟上。

**第五步：`#detailSheet`（债务详情窗）——第一个不属于任何tab、常驻挂载的React入口，也是第一次把sheet的实际内容（不只是容器）搬进React。** 用户明确选择只做`#detailSheet`，`#editSheet`（新增/编辑表单，全项目最复杂的一块UI——公式生成器、批量设置还款日、`oneTimeStash`等状态机分散在DOM里，见"新增/编辑债务表单"一节）留作独立的后续任务，这次完全不碰，`openEdit`继续保持是vanilla函数、被React按索引调用（`#editSheet`本身在下面"第六步"完成迁移，`openEdit`这个桥接函数也随之整个删除）。

**架构上的核心新问题**：`#detailSheet`被"在还债务"（`react-debts-root`）和"还款日"（`react-pay-root`）**两棵独立的React树**通过命令式调用触发打开，不属于任一个tab——不能再用"tab自己的挂载点+自己的React树"这套已经跑通4次的模式。解法是新增第5个Vite入口`react/src/sheets/`，产出`www/js/react-debts/sheets.js`，挂到一个**不放在任何`.view`里、跟四个`react-*-root`平级、全程常驻**的`<div id="react-sheets-root">`（原来`#scrimDetail`+`#detailSheet`所在的那个位置，直接原地替换）。"打开/关闭这个sheet"这件事本身也不再经过`window.__azBridge`——`react/src/shared/state.ts`新增`openDetailSheet(i)`/`closeDetailSheet()`/`useDetailSheetIndex()`，模块级变量+独立的`az:detail-sheet-changed`事件（不复用`az:state-changed`，两者服务的是不同的问题：一个是"哪个sheet开着"，一个是"debts/premium/account数据变了"），`DebtCard.tsx`/`PayRow.tsx`两棵树都直接`import`调用这两个函数，不再桥接给vanilla。`window.__azBridge`里`openDetail`这一项整个删除（vanilla的`openDetail(i)`/`closeDetail()`函数体连同`kv()`辅助函数一起删掉，逻辑原样复刻进`DetailSheet.tsx`），新增`settleFull`/`openSimScreen`两个trigger-only桥接（`#dSettle`"提前结清"、`#dSimulate`"提前还款模拟"这两个按钮以前只在vanilla内部调用，现在按钮由React渲染，需要显式暴露）。

vanilla这边`payInstallment(i)`/`settleFull(i)`都被精简过：原来末尾`if (d.settled) closeDetail(); else if (detailIndex === i) openDetail(i);`（结清就关、没结清就原地刷新）这行整个删除——React的`DetailSheet`组件订阅同一份`debts`，`renderAll()`派发的`az:state-changed`会让它自动重渲染，没结清时天然原地刷新，结清时靠组件自己的一个effect（`if (openIndex !== null && (!debts[openIndex] || debts[openIndex].settled)) closeDetailSheet();`）自动关闭，vanilla不需要再显式回调；`detailIndex`模块变量本身也整个删除（`editIndex`/`docSel`还在同一行，只删这一个）。返回键链最后一项换成反向桥接`window.__azDetailSheetBack`（照抄`DebtList.tsx`注册`__azDebtsBack`的模式），`deleteDebt(i)`里原来防御性调用的`closeDetail()`也顺手删了（这个入口只能从editSheet内部触发，而editSheet只能从detailSheet的"编辑"按钮打开，那一步已经调用过`closeDetailSheet()`，走到删除这一步时detailSheet早就关了）。

**⚠️真机会真实踩到、这次也确实踩到的一个坑：`useDebts()`在`debts`数组被原地mutate（不整体重新赋值）时完全不会触发重渲染，不是"渲染了但显示旧值"，是整个组件根本不重渲染。** `payInstallment`/`settleFull`/`unsettle`改的都是`debts`数组*里的元素*（`r.paid=true`/`d.settled=true`），不是`debts`这个变量本身（只有`commitReorder`/`applyBackupData`/导入JSON三处会整体重新赋值，见下面`getDebts`那条注释）——`renderAll()`确实照常派发了`az:state-changed`，但`useSyncExternalStore`拿到的`getSnapshot()`返回值（`window.__azBridge.getDebts()`）前后是**同一个数组引用**，React按`Object.is`判定"没变"，直接跳过这次重渲染。这次开发`DetailSheet.tsx`时先写了"结清自动关闭"的effect，用Playwright一测发现代码逻辑上完全正确却死活不生效，最后是从`shared/state.ts`层面单独写一个最小复现（一个只用`useDebts()`的`Probe`组件）才定位到问题不在`DetailSheet`，而在这个被4个tab+现在的sheet共同依赖的底层hook——**这个bug理论上从"在还债务"tab迁移那一刻就存在，只是之前的测试都没有精确到"改一个字段后立刻用exact value断言"这个粒度，被"看起来数据早晚会因为别的原因也跟着刷新一次"的巧合掩盖过去了**。

修法：`useDebts()`的`getSnapshot`不再直接返回`window.__azBridge.getDebts()`的原始引用，改成维护一个浅拷贝缓存——`az:state-changed`触发的订阅回调里把缓存标记为"脏"（不管是不是debts真的变了，这个事件本来就是通用的"有什么变了"信号，标脏成本可忽略）；`getSnapshot`发现缓存是脏的**或者**底层引用本身变了（覆盖`commitReorder`那三处整体重新赋值的场景，也顺带覆盖了"测试里换了个全新mock bridge"这种引用变化）就重新`.slice()`一份新数组返回，两者都没发生时返回上一次缓存的同一个引用——跟`useNotify()`那条"按fingerprint比较、别每次都返回新引用"的坑是同一个技术根源（都是"值变了才生成新引用"），但触发条件更简单，不需要像notify那样按内容算fingerprint。**这是这个hook自身的改动，不是detailSheet专属的——`DebtList`/`PayList`/`ReportApp`等所有用`useDebts()`的地方全部受益，以后如果再遇到"数据明明改了、UI却卡在旧画面"这类反馈，先怀疑是不是又在哪加了一处"原地mutate debts、不整体重新赋值"的新代码，而不是重新怀疑`az:state-changed`有没有正确派发。**

**第六步：`#editSheet`（新增/编辑债务表单）——detailSheet那轮明确留到独立后续任务的那块"全项目最复杂的一块UI"，公式生成器+批量设置还款日+`oneTimeStash`状态机全部原样搬进React。** 挂载点复用detailSheet已经建好的`#react-sheets-root`/`sheets`这个Vite entry（`App.tsx`当年的注释就写着"editSheet迁移时会加进来"），不新开第6个entry。开关状态同一个模式：`shared/state.ts`新增`openEditSheet(i)`/`closeEditSheet()`/`useEditSheetIndex()`，独立的`az:edit-sheet-changed`事件，`i=-1`是新增模式（沿用vanilla原来`editIndex=-1`的含义）。`react/src/sheets/`新增4个文件：`EditSheet.tsx`（sheet外壳+顶层字段+`editingPlan`/`oneTimeStash`/`planMode`等核心状态+保存/删除/取消）、`GenPanel.tsx`（公式生成器）、`PlanRows.tsx`（手动逐行编辑）、`BatchBlock.tsx`（批量设置）。

**关键设计决定：批量设置还款日/金额这两处确认弹窗，没有在React里另建一套UI，而是给vanilla共享的`ask()`加了一层Promise外壳复用同一个`#modalScrim`单例。** 这是讨论时用户明确要求的——迁移后触发这两个确认的数据（`editingPlan`）变成纯React状态，vanilla没法再插手改，但这个弹窗以后还要接着优化视觉/交互，做成两份实现（vanilla一份、React一份）以后改一次要同步改两处，用户不想要这个维护负担。技术上：`ask()`/`closeModal()`加了`_onCancel`/`_confirmed`两个新的模块级变量，新增`askAsync(title, body, opts)`返回一个Promise（`opts.month`有值时确认返回选中的月份字符串、取消返回`null`；没有`opts.month`时确认返回`true`、取消返回`false`）——**这层包装完全不影响原有十几个callback风格的调用点**（注销账户确认、销这期、删除债务等）：`_onCancel`只在`askAsync()`内部被设置，老调用点从来不碰这个变量，`closeModal()`里新增的"检查`_onCancel`要不要触发"分支对它们永远是空操作。桥接给React的是`window.__azBridge.confirmAsync(title, body, opts?)`。

**另一处刻意的简化：`#gFirstField`当年的DOM节点搬家技巧（`appendChild`把"首期还款日"这一份DOM物理挪到4个`[data-gg]`区块里当前生效的那个），在React里完全不需要照搬。** 那个技巧存在的唯一原因是vanilla用`display:none/block`互斥切换4个区块、同一个DOM节点没法同时"属于"两个区块；React这边4个分支各自的JSX里放一个绑定同一个`fields.first`状态的受控`<input>`就是完全等价的效果（amort时跟"期数"拼成一行、其它三种单独成一行），不是偷懒抄近路，是这套DOM操作在声明式渲染模型下本来就没有存在的必要。

**踩了两个真实的坑，都已经修复并补了回归测试**：
1. **批量删除#editSheet相关JS代码那一刀切太宽，误删了`#notifySheet`的`renderNotifyRules`/`openNotifySheet`/`closeNotifySheet`三个函数+5处事件监听器**（这几个函数原来物理上夹在`closeEdit()`和`saveForm()`之间，不属于`#editSheet`、是完全独立的还款提醒通知设置面板，但落在了同一段删除范围里）——表现是页面加载直接`openNotifySheet is not defined`崩溃，`window.__azBridge`都没能正常初始化（`getDebts`/`getAccount`全部读不到）。这是"改一行崩全站"那类错误的另一个变种：不是漏删引用，是**删除范围没有精确核对，靠"看起来是同一个大段落"的直觉批量删除，结果误伤了物理上恰好夹在中间、但逻辑上完全无关的代码**。教训：批量删除一大段vanilla代码前，必须先确认这段代码物理连续区间内，有没有夹带着不相关但逻辑独立的函数——尤其是这种"两个功能的代码在文件里交叉编排"的情况，肉眼过一遍`git diff`的删除内容（不是只看开头结尾对不对）比信任一个行号范围可靠得多。
2. **⚠️`deleteDebt`触发的自动关闭effect，第一版按下标判断`!debts[editIndex]`，在"删除的不是数组最后一条"时是错的**——`debts.splice(i,1)`会让原来排在后面的debt对象整体往前顺移一位，`debts[editIndex]`这个位置在删除后**依然有值**（只是变成了另一条债务），条件判断成false，sheet不会自动关闭，还会继续显示着已经被删掉的那条债务的过期数据。这个bug是Playwright headless跑完整交互流程时真实复现的（两笔债务、删除排在前面的那笔），不是理论推演。**当时的修法**：改成`editedDebtRef`（一个存"打开时是哪个debt对象引用"的`useRef`）+ `!debts.includes(editedDebtRef.current)`，按对象引用而不是下标判断"这条debt还在不在"——对splice导致的下标顺移天然免疫，跟这个项目`shared/state.ts`的`keyFor()`（WeakMap给debt生成稳定React key，也是"按引用不按下标"的同一个思路）是同一类解法。`EditSheet.test.tsx`补了一条专门覆盖"删除的不是最后一条"这个场景的回归测试。**这个workaround后来被彻底替换掉了**：债务加了真正的`id`字段之后，`editedDebtRef`整个删除，判断改成`!debts.some(x => x.id === editId)`——不再是"绕开下标不安全"的补丁，是结构上正确的写法。`DetailSheet.tsx`当时就已经有一模一样形状的潜在bug（只是还没触发过），也在同一轮里用同样的模式修好了。详见"债务对象加了真正的id字段"一节。

**验证**：`EditSheet.test.tsx`(25用例，覆盖开关回填/`oneTimeStash`往返/保存校验每一条/新增与编辑两种保存路径/公式生成器4种计息方式/29-30-31号拒绝/批量设置日期与金额的确认与取消两条路径/删除+两种自动关闭场景/返回键)+`state.test.ts`补充3个用例（`useEditSheetIndex`）；`npx tsc --noEmit`零错误；`npm run test:react`全绿（125个用例）；`npm test`（calc.js套件）不受影响；`npm run build:react`确认`sheets.js`产物正常（从detailSheet单独时的8.74KB涨到35KB左右，符合预期）。Playwright headless跑了一轮完整交互（新增债务、公式生成amort、批量设置还款日弹出月份选择器并正确铺日期、保存、从详情窗点编辑、一次性还清勾选/取消往返、删除确认弹窗+自动关闭、取消按钮、硬件返回键关闭），全部通过，控制台零JS报错，light/dark主题截图确认视觉正常。

### 收尾：第七~十一步，剩余全部subpage/sheet迁移到React（已全部完成）

第六步做完之后，把vanilla里剩下的全部8个subpage/sheet（`#accountScreen`/`#premiumScreen`/`#termsScreen`/`#simScreen`/`#notifySheet`/`#docsScreen`/`#backupScreen`/`#aiScreen`+`#aiHistorySheet`）也搬进React——至此`www/index.html`主`<script>`不再有任何`.subpage`/`.sheet`的DOM渲染代码，只剩数据模型读写+不可移植的cloud函数/native插件/IndexedDB调用。**`#loginGate`明确排除、以后也不迁移**——它是全App唯一必须在React bundle加载*之前*就同步决定显隐的东西（FOUC防护，见"登录门"一节），架构上不可能交给要等JS加载完才能渲染的React组件。

**全部复用第五步已建好的`react/src/sheets/`入口，不新开入口**——这8个screen都不属于任一个tab，跟`detailSheet`/`editSheet`当年"被多棵独立React树共同触发"是同一个架构问题，直接复用已验证的模式：`shared/state.ts`给每个screen配`openXScreen()`/`closeXScreen()`/`useXScreenOpen()`（布尔开关，`simScreen`例外需要债务下标，模式同`openDetailSheet(i)`），各自独立的`az:x-screen-changed`事件。第四步"我的"tab那批trigger-only桥接函数（打开某个screen）从这一步起被彻底取代——不再有任何`openXScreen`留在`__azBridge`里，全部screen内容本身归React所有。最终的`__azBridge`形状见下面"桥接契约"一节，不在这里重复枚举每一步加了什么函数。

**几个不平凡的设计决定，按screen列**：
- **accountScreen/premiumScreen/termsScreen**：`deleteAccount()`改成返回`Promise<boolean>`（不是`void`）让React自己决定要不要关闭screen——这是"返回值决定UI导航"这个模式第一次出现，之前的桥接函数都是"纯粹执行、不关心UI"。复用`confirmAsync`处理确认弹窗，不新写React确认组件（这个弹窗以后还要接着优化视觉，两份实现同步改两处不划算）。**删除`openPremiumScreen()`暴露出一处连锁死代码**：`createCloudBackup()`里"万一没premium就跳订阅页"的二次防御检查其实早就是多余的（`DataCards.tsx`已经gate过一次，没有订阅降级场景），顺势按YAGNI删掉。
- **simScreen/notifySheet**：`SIM_KEY`整体移交React所有权直接读写localStorage（跟`debtSort`当年同一个先例），结果展示用"运行那一刻的快照"而不是从当前输入框状态派生，用户测算后改输入框不会让已显示的结果跟着实时变。通知开关checkbox用"乐观更新"（本地state立刻反映点击，异步权限结果出来后再交还真实状态）而不是直接受控，避免等系统权限弹窗这段真实耗时里显得卡顿。
- **docsScreen**：`docKeyFor()`用`WeakMap`给文档条目生成稳定id，跟`keyFor()`给debt生成React key同一个技巧。**`useFiles()`踩过一次真实的坑**：第一版照抄`useDebts()`的"事件触发才标脏"写法，但`getFiles()`每次都用`.map()`合成全新数组、没有`useDebts()`那样"底层引用变了强制刷新"的保险，导致组件测试从第二个用例起渲染不出任何行（陈旧缓存永远还不上）——改成跟`useNotify()`一样按内容fingerprint比较后彻底解决。**以后任何新hook只要没有"可比较的底层数组引用"这个前提，直接抄fingerprint方案，别抄dirty-flag方案。**
- **backupScreen**：备份列表用组件内`useState`三态（加载中/列表/错误），`isOpen`变`true`时才拉取——不是常驻订阅，这是screen私有的、值得每次打开都问一遍服务端的数据，跟"数据变了自动跟上"的共享状态不是一回事。
- **aiScreen+aiHistorySheet**：消息发送状态机是vanilla逻辑的逐步骤翻译，但**故意没有照抄vanilla"直接mutate模块变量"的写法**，改用React `useState`不可变更新——跟"手势代码原样照抄不重新设计"的原则不同，这里判断消息状态机不涉及任何真机踩坑的DOM细节，idiomatic React表达反而更不容易出错。`castAiWand()`入场动效的reflow技巧从`el.offsetWidth`改成`el.getBoundingClientRect()`（TS的`SVGElement`类型没有`offsetWidth`，那是`HTMLElement`专属）。**测试环境两个新坑，都已修复且全局受益**：`Element.prototype.scrollIntoView`在jsdom不存在（已在`setup.ts`补空实现）；`#aiHistorySheet`的`aria-labelledby`让它的accessible name跟同名按钮撞了，`getByLabelText`会命中两个（测试改用`getByRole("button",{name:...})`精确限定即可，不需要改DOM）。

### 目录结构：`react/`（源码）→ `www/js/react-debts/`（构建产物，Vite多入口）

新增顶层目录`react/`（跟`www/`/`android/`/`cloudbase/`/`resources/`平级），是这个项目第一次引入真正的JS构建工具（Vite）。`react/src/debts/`/`react/src/pay/`/`react/src/report/`/`react/src/mine/`分别是四个已迁移tab（全部tab）的React源码，`react/src/sheets/`是第五个入口——不属于任何tab、常驻挂载的`#detailSheet`+`#editSheet`（详见上面"第五步"/"第六步"，两者共用同一个Vite entry，不是各自一个）。`react/src/shared/`是这几个入口共用的状态订阅hook（见下面"vanilla ↔ React 桥接契约"）。`react/vite.config.ts`用Vite的**库模式**（`build.lib`，不是Vite默认的app模式——这次不是造一个独立SPA，是把React组件挂进现有`www/index.html`的某几个节点，库模式产出可以直接`<script type="module">`引入的bundle）。

**第三步把`build.lib.entry`从单一路径改成了一个map**（`{debts:"src/debts/main.tsx", pay:"src/pay/main.tsx", report:"src/report/main.tsx"}`，`fileName:(format,name)=>`${name}.js``），一次`vite build`产出`www/js/react-debts/{debts,pay,report}.js`三个文件——**同时必须删掉`rollupOptions.output.inlineDynamicImports:true`这一行**（该选项只支持单入口，多入口配置下Rollup会报错）。删掉之后Rollup对多入口ES输出的默认行为是**自动把入口共享的依赖（react/react-dom/`shared/state.ts`）拆成独立的chunk文件**（`state-<hash>.mjs`这种命名），各入口各自`import`这个共享chunk，不会各打包一份重复的react/react-dom——实测验证过：单入口时`debts.js`是292KB（react/react-dom内联），改多入口后`debts.js`降到33KB+一份~260KB的共享chunk，其余tab各自几KB到十几KB，总大小基本不变，没有因为拆分而膨胀。**`www/index.html`里debts入口的产物文件名也从`main.js`变成了`debts.js`（因为文件名现在跟入口的key走，不再是硬编码的`"main.js"`）**，对应的`<script type="module">`标签要跟着改，这是这次改配置时容易漏掉、导致404的一个点。**第四步/第五步都只是往这个map里各加一个键**（`mine:"src/mine/main.tsx"`、`sheets:"src/sheets/main.tsx"`），没有其它配置变化——多入口的共享chunk机制、`fileName`按entry key生成文件名，这些第三步就已经搭好，后面几步纯粹是复用。

**`www/js/react-debts/`是构建产物，已加进`.gitignore`（跟`android/app/src/main/assets/public/`同一类"可重新生成的东西不进git"）**，`react/src/**`源码该进git。改了`react/`下的代码后，**必须先`npm run build:react`再`npx cap sync android`**——这是继"改了`www/index.html`要`npx cap sync android`"之后，这个项目第一次出现"先构建、再同步"两步走的场景，别漏了第一步。

`package.json`新增脚本：`build:react`（`vite build`）、`test:react`（`vitest run`）——**`npm test`（跑`calc.js`的`node:test`）语义完全没变**，两套测试工具彻底独立（见下面"两个坑"）。

**⚠️ 库模式构建配置里`define: {"process.env.NODE_ENV": ...}`只能在`command === "build"`时生效，不能对`vitest`也生效**——这是真机（其实是本地）踩过的坑：`react/vite.config.ts`用`vitest/config`的`defineConfig`把build配置和test配置合并在一个文件里，一开始图省事把`process.env.NODE_ENV`写死成`"production"`放在顶层（是为了让`react`/`react-dom`被摇树摇掉开发版分支，构建产物从802KB砍到292KB），结果导致`npm run test:react`全灭，报`TypeError: React.act is not a function`——因为`vitest run`复用同一份config，也被这条`define`影响，把`react-dom`测试专用的`act()`等API一起摇没了。修法：`defineConfig(({command}) => ({..., define: command==="build" ? {...} : {}, ...}))`，只在真正跑`vite build`时生效。**以后这份配置文件里任何"只应该影响构建产物、不该影响测试环境"的设置，都要照这个模式用`command`判断，不要写在顶层。**

**⚠️ `react/__tests__/`目录不能叫`react/test/`（哪怕只是想跟这个项目`test/`目录同名图方便）**——这也是真踩过的坑：`node --test`（`calc.js`的测试工具）默认会递归扫描整个项目找测试文件，Node这个版本的默认发现规则不只是"文件名匹配`*.test.js`"，连**目录名叫`test`**、以及**扩展名是`.ts`**（Node这个版本的`--test`已经原生支持轻量TS类型剥离，不需要额外loader）的文件都会被当成自己的用例尝试去跑——曾经真实复现过：目录改名成`react/__tests__/`后，`.tsx`文件不再被误抓，但**`.ts`文件（`gestures.test.ts`/`useDebts.test.ts`）依然被`node --test`抓到、报"test failed"**，因为触发条件是文件名匹配`*.test.ts`这条规则，跟目录名无关。最终修法是两层防御都要——目录改名`__tests__`（避免"目录名叫test"这条规则）+ `package.json`里`"test"`脚本显式写成`node --test 'test/*.test.js'`（把glob锁死在根目录`test/`下的`.js`文件，从根本上排除任何`.ts`/`.tsx`被误抓的可能）。**以后如果只改一处、不改另一处，这个坑会复发。**

### vanilla ↔ React 桥接契约（整个迁移的核心）

现状：vanilla主脚本是一个大IIFE，`debts`/`saveAll`/`renderAll`/`openDetail`/`payInstallment`/`commitReorder`等全部是IIFE内部私有的，不在`window`上（跟已经全局的`calc.js`函数、跟`window.__handleBackButton`这种刻意暴露的例外都不一样）。要让React调用这些，必须显式暴露。

**`window.__azBridge`**（定义在主IIFE末尾，`})();`之前）是唯一的暴露点，只包含已迁移React页面实际需要调用的这几个，第三步新增了`getNotify`/`openNotifySheet`/`exportReportXlsx`/`exportReportPdf`这4个，第四步（"我的"tab）又新增了`openDocsScreen`/`openBackupScreen`/`downloadBackupFile`/`triggerImportFilePicker`这4个，第五步（`#detailSheet`）**删除**了`openDetail`、新增了`settleFull`/`openSimScreen`这2个，第六步（`#editSheet`）**删除**了`openEdit`（打开这两个sheet都不再经过桥接，改成`shared/state.ts`的`openDetailSheet(id)`/`openEditSheet(id)`——这两个当年是按下标`i`存的，后来引入债务`id`字段之后改成按id存，见"债务对象加了真正的id字段"一节，见上面"第五步"/"第六步"）、新增了`setDebt`/`deleteDebt`/`toast`/`confirmAsync`这4个，第七步（accountScreen/premiumScreen/termsScreen）**删除**了`openPremiumScreen`/`openAccountScreen`（同样道理，这三个screen也变成纯React状态）、新增了`wxLogout`/`deleteAccount`/`redeemCode`这3个，第八步（simScreen/notifySheet）**删除**了`openSimScreen`/`openNotifySheet`、新增了`setNotifyEnabled`/`addNotifyRule`/`deleteNotifyRule`/`sendTestNotification`这4个，第九步（docsScreen）**删除**了`openDocsScreen`、新增了`getFiles`/`uploadArchiveFile`/`deleteArchiveFile`/`downloadArchiveFile`/`shareArchiveFile`这5个，第十步（backupScreen）**删除**了`openBackupScreen`、新增了`createBackup`/`listBackups`/`restoreBackup`/`deleteBackup`/`getBackupMeta`这5个，**第十一步（aiScreen+aiHistorySheet）删除**了`openAiScreen`、新增了这批迁移收尾里唯一的一个新函数`callAiAdvisor`——至此`__azBridge`不再有任何`openXScreen`这类trigger-only函数：
```js
window.__azBridge = {
  getDebts: function () { return debts; },   // 每次调用现读，见下面"为什么是函数"
  getPremium: function () { return premium; },
  getAccount: function () { return account; },
  payInstallment: payInstallment, unsettle: unsettle,
  commitReorder: commitReorder, saveAll: saveAll, renderAll: renderAll,
  settleFull: settleFull,
  waiveInstallment: waiveInstallment,
  getNotify: function () { return notify; },
  exportReportXlsx: exportReportXlsx,
  exportReportPdf: exportReportPdf,
  downloadBackupFile: downloadBackupFile,
  triggerImportFilePicker: triggerImportFilePicker,
  setDebt: setDebt,
  deleteDebt: deleteDebt,
  toast: toast,
  confirmAsync: askAsync,
  wxLogout: wxLogout, deleteAccount: deleteAccount, redeemCode: redeemCode,
  resetLocalData: resetLocalData,
  setNotifyEnabled: setNotifyEnabled, addNotifyRule: addNotifyRule,
  deleteNotifyRule: deleteNotifyRule, sendTestNotification: sendTestNotification,
  getFiles: getFiles, uploadArchiveFile: uploadArchiveFile,
  deleteArchiveFile: deleteArchiveFile, downloadArchiveFile: downloadArchiveFile,
  shareArchiveFile: shareArchiveFile,
  createBackup: createBackup, listBackups: listBackups,
  restoreBackup: restoreBackup, deleteBackup: deleteBackup,
  getBackupMeta: getBackupMeta,
  callAiAdvisor: callAiAdvisor
};
```
`downloadBackupFile`/`triggerImportFilePicker`是"我的"tab（`react/src/mine/DataCards.tsx`）专用的trigger-only函数——`downloadBackupFile`是把原来`dlBackupBtn`的inline click handler抽成的具名函数；`triggerImportFilePicker`是新写的一行`$("importFileInput").click()`，用来间接点开依然留在vanilla DOM里的`#importFileInput`（这个input和它的`change`监听器完整保留在vanilla，只是从`#view-data`内部搬到了折叠后的挂载点外面）。

**⚠️`payInstallment`/`unsettle`/`settleFull`/`deleteDebt`/`setDebt`这几个单笔债务寻址的函数，参数后来从下标`i: number`换成了id`string`**（见"债务对象加了真正的id字段"一节）——上面代码块里的写法（`payInstallment: payInstallment`这种直接引用）没有变化，变的是这些函数自身的参数类型和内部实现（改成`debts.find(x => x.id === id)`现查，不再是`debts[i]`）。

**`waiveInstallment`是React迁移全部完成之后新增的一个bridge函数**（2026-07-29，修部分还款支持那轮加的，不属于第一~十一步任何一步，完整背景见`debt-model-history` skill）——`DetailSheet.tsx`新增的"协商减免这一期"按钮触发，内部自己弹`askAsync`问金额，跟`settleFull`同一个套路。这也是`__azBridge`收尾（第十一步）之后第一次再有新函数加入，说明"只在迁移步骤里加桥接函数"这条不是铁律——凡是vanilla需要暴露新的写操作给React调用，任何时候都可以照着现有几十个例子的模式加。**`resetLocalData`是又一个例子**（2026-08-04，"注销账户"确认框新增"重置本地数据"选项那轮加的）——`localStorage.clear()`+`indexedDB.deleteDatabase(UP_DB)`+`location.reload()`，效果等同卸载重装但不用离开App、不影响服务器账户，`AccountScreen.tsx`选了这条路径后还要再过一层独立的二次确认（同样是`confirmAsync`）才真正调用，不能因为已经点过一次弹窗按钮就跳过再问一遍。

**共享确认弹窗`#modalScrim`/`ask()`/`askAsync()`2026-08-04新增了第三个按钮的支持（`opts.thirdLabel`，全App第一次出现三按钮弹窗）**——用在"注销账户"确认框里给出"重置本地数据"这条旁路。`askAsync()`点击第三个按钮时resolve字符串字面量`"third"`，跟已有的`true`/`false`/月份字符串区分得开；不传`opts.thirdLabel`就隐藏，不影响现有十几个两按钮调用点的行为。**这个按钮渲染在标题行右上角、纯文字下划线小链接样式，不是跟"取消/确认"同款的灰底大按钮**——第一版做成了跟"取消"同样的`.btn.ghost`大按钮、独立一行铺满宽度，真机验证后用户指出这样视觉权重跟一个零风险操作(取消)一样重，容易让人低估它的破坏性（这个操作实际上和"确认"一样不可逆），改成弱化的角落文字链接才对。**踩过一个真实的显隐bug**：第一版隐藏`#mThird`用的是外部CSS规则`display:none`，但JS显示它时用的是清空内联`style`（`mt.style.display=""`）——这两种手法不匹配，清空内联样式后外部CSS的`display:none`依然生效，按钮永远显示不出来；`#mMonthInput`/`#mDateInput`/`#mAmountInput`/`#mAmountHint`这几个先例全部是用**内联**`style="display:none"`藏起来的，改`#mThird`时没有照抄这个既有约定、自己另起了一套外部CSS，才踩到这个坑。**这类bug测试套件测不出来**——React这边的单测全程mock了`window.__azBridge.confirmAsync`，从没真正跑过vanilla`ask()`/`askAsync()`操作`#mThird`这段DOM逻辑本身，这个项目目前没有针对vanilla index.html的DOM测试基础设施（只有calc.js的node:test和React组件的vitest两套），这类"vanilla DOM显隐逻辑对不对"的bug只能靠真机/浏览器验证兜底。

`setDebt`/`deleteDebt`/`toast`/`confirmAsync`这4个是`#editSheet`（`react/src/sheets/EditSheet.tsx`等）专用——`setDebt(id, obj)`是`saveForm()`删除后唯一保留的narrow写入函数（`id`非空时按id查到对应下标覆盖并合并`old.id`/`old.settled`/`old.settledDate`，`id`为`null`是push新增并生成新id，内部调`recompute(obj)`但不调`saveAll`/`renderAll`，React保存时自己依次调这三个桥接函数，跟`commitReorder`那套细粒度调用惯例一致）；`deleteDebt`是原样暴露的既有vanilla函数（自带`ask()`确认+按id查下标+splice+saveAll+renderAll）；`toast`是`#flash`单例的简单passthrough；`confirmAsync`是`ask()`的Promise外壳（详见上面"第六步"）。

其余（`ask()`确认弹窗本身等）继续保持private。**详情窗`#detailSheet`、新增/编辑表单`#editSheet`、账户详情`#accountScreen`、订阅页`#premiumScreen`、条款页`#termsScreen`、提前还款模拟器`#simScreen`、通知设置面板`#notifySheet`、档案库`#docsScreen`、云备份`#backupScreen`、AI债务顾问`#aiScreen`+`#aiHistorySheet`这十个subpage/sheet的实际内容全部已经搬进React（分别是第五~十一步）**——至此`window.__azBridge`里再也没有任何`openXScreen`这类trigger-only函数，剩下的全部是①真正的debts数据读写、②不可移植的cloud/native/IO调用两类。

**`exportReportXlsx`/`exportReportPdf`两个函数虽然桥接给了React调用，但函数本身继续100%vanilla、原封不动**——它们已经确认是零DOM依赖的纯函数（只读`debts`、拼Excel/PDF的Blob、调用`window.XLSX`/`window.jspdf`/`saveToDeviceDownloads()`），React这边`ExportActions.tsx`只是原样复刻了vanilla原来两个按钮click handler里的`hasPremium(premium)`门禁判断，然后调用桥接函数触发真正的导出，不是把导出逻辑本身搬进React。**⚠️`ExportActions.tsx`在"统计tab视觉+交互升级"这轮已经删除，门禁逻辑原样吸收进新的`react/src/report/ExportMenu.tsx`（收进右上角"⋮"菜单，不再是两个独立按钮），桥接函数本身没变，详见下面"统计"一节"统计tab视觉+交互升级"子节。**

**为什么`getDebts`是函数不是直接暴露变量**：`debts`在`commitReorder`/`applyBackupData`/导入JSON三处会被**整体重新赋值**（`debts = next;`），不是原地mutate。如果React捕获了某一次的数组引用，重新赋值后这个引用就是旧的。用函数包一层，每次调用都读到当前最新的那个引用，避免这个陷阱。

**`az:state-changed`事件**：替代原来`renderAll()`里对各tab渲染函数的调用（`renderSummary`/`renderAIBanner`/`renderDebts`随第二步删除，`renderPay`/`renderReportScreen`随第三步删除）——`renderAll()`现在只剩：
```js
function renderAll() { debts.forEach(recompute); window.dispatchEvent(new CustomEvent("az:state-changed")); syncNotifications(); }
```
`renderAll()`之外还有几处单独修改`premium`/`account`的地方（兑换码成功回调`applyRedeemTier`、`__debugPremium()`、`renderAccountUI()`——登录/退出登录都会调到这个函数）也各自补了一行`window.dispatchEvent(new CustomEvent("az:state-changed"))`，让React（AI banner的premium门禁、头像的account）能感知到这类不经过`renderAll()`的状态变化。**第三步又补了一处**：`saveNotify()`原来完全没有dispatch这个事件（只是`localStorage.setItem`），导致"还款日"页铃铛图标的`.on`状态在`#notifySheet`里改完通知设置后不会响应式更新——这是真实的功能缺口，不是可选优化，已经补上。**这是vanilla↔React之间唯一的"数据变了"通知机制**——这个项目在此之前**完全没有**`CustomEvent`/`dispatchEvent`这套模式，是第二步迁移引入的第一次。

**React端订阅方式：`useSyncExternalStore`**（`react/src/shared/state.ts`——第三步从`react/src/debts/useDebts.ts`搬到了这个共享目录，因为"还款日"/"统计"两个新tab都要用，不再是"在还债务"专属）：
```ts
function subscribe(cb) { window.addEventListener("az:state-changed", cb); return () => window.removeEventListener("az:state-changed", cb); }
export function useDebts() { return useSyncExternalStore(subscribe, () => window.__azBridge.getDebts()); }
```
`usePremium()`/`useAccount()`是同一个模式的另外两份，全部订阅同一个事件（不需要给"debts变了"/"premium变了"/"account变了"分别发明不同的事件名——统一收到通知后，各自的`getSnapshot`回调自己决定读什么）。

**⚠️`useNotify()`踩了`useSyncExternalStore`的一个不算冷门的坑，真实复现过"Maximum update depth exceeded"**：`notify`这个vanilla模块变量是**原地mutate**的（`saveNotify()`改的是`notify.enabled`/`notify.rules`这些字段本身，`notify`对象引用永远不变，不像`debts`那样在`commitReorder`等几处会整体重新赋值）。第一次实现`useNotify()`时，为了让"引用总是不同、好让React认为变了"，让`getSnapshot`每次都返回一个新的浅拷贝对象字面量`{...notify}`——这直接触发了React的另一个已知限制：`useSyncExternalStore`不只在订阅事件触发时调`getSnapshot`，每次渲染/commit后都会再调一次做"有没有撕裂"一致性检查，每次都拿到不同引用会被判定成"还在变"，陷入无限重渲染循环。**正确做法是按值(fingerprint)比较**：只有`enabled`/`rules`的实际内容真的变了才生成一个新的缓存对象返回，没变就返回上一次缓存的**同一个引用**——`react/src/shared/state.ts`的`useNotify()`用一个模块级`notifyCache`+`notifyFingerprint`字符串（`enabled + "|" + rules.map(r=>r.offsetDays+":"+r.time).join(",")`）实现这个比较。**以后如果要给别的"原地mutate、不整体重新赋值"的vanilla状态（`notify`不会是最后一个）接`useSyncExternalStore`，直接抄这个fingerprint比较模式，不要直接返回浅拷贝。**

**`az:tab-changed`事件**：vanilla的tabbar点击处理原来直接调`exitJiggle()`/`closeDebtSwipe(debtSwipeOpen)`（第二步）、`closePaySwipe(paySwipeOpen)`（第三步）来清理各tab的手势状态，这几个函数现在都已经不在vanilla作用域了——改成每次点击tab都派发`window.dispatchEvent(new CustomEvent("az:tab-changed", {detail:{view}}))`，`DebtList.tsx`/`pay/App.tsx`各自监听这个事件，`detail.view`不是自己的tab时自己收起手势状态（"在还债务"退出编辑模式，"还款日"收起左滑的卡片）。"统计"tab没有任何手势状态，不需要监听这个事件。

**反向桥接：`window.__azDebtsBack`**——硬件/手势返回键"最上层先关"优先级链（`window.__handleBackButton`）原来第一条判断就是`if (jiggleMode) { exitJiggle(); return true; }`，`jiggleMode`现在是React状态，vanilla看不到。React的`DebtList.tsx`挂载时把这个判断注册成`window.__azDebtsBack = function(){...}`，`__handleBackButton`第一条判断改成`if (window.__azDebtsBack && window.__azDebtsBack()) return true;`。**这是这个项目第一次出现"React反过来向vanilla暴露一个函数"的方向**（跟`__azBridge`的方向相反），命名上刻意跟`__azBridge`区分开，避免以后误以为它们是同一个对象的不同字段。

**为什么`calc.js`的全局函数在React里能直接用`window.recompute(d)`这样调用**：`calc.js`是不在任何IIFE里的顶层`function`声明（见上面"纯计算函数"一节），加载后自然挂到`window`上，跟React是不是ES module、有没有自己的作用域完全无关——`<script src="js/calc.js">`（classic script）保证在`<script type="module" src="js/react-debts/main.js">`运行之前就已经执行完（HTML规范：`type="module"`脚本天然延迟到文档解析完、且晚于它之前所有阻塞性classic script执行完才运行，不需要手动保证顺序）。`react/src/calcGlobals.d.ts`给这几个用到的全局函数（`recompute`/`summarizeDebts`/`hasPremium`/`premiumLabel`/`detectMatchingSort`/`isActive`/`rateClass`/`fmt`）补了环境类型声明，纯粹是给TypeScript用的，不影响运行时行为。**React代码里显式写`window.recompute(d)`而不是裸调用`recompute(d)`**（虽然裸调用也能工作，标识符解析会自动落到全局对象）——显式`window.`前缀更清楚地标出"这是跨越到vanilla全局作用域的调用"这条边界。

### `debtSort`所有权整体移交React，不再经过vanilla

排序方式（含"自定义"）这次**整体归`react/src/debts/useDebtSort.ts`所有**，直接读写`localStorage["debt-manager-sort-v1"]`（`SORT_KEY`这个键名依然不能改，硬性铁律第1条），不经过桥接。这样做是因为现有代码里没有其它tab读`debtSort`（还款日用`dueBucket`分组，统计不依赖它）——vanilla原来的`DEBT_SORTS`/`debtSort`/`setDebtSort`/`SORT_KEY`变量已随这次迁移整体删除，不留一份不再被使用的死代码。`DEBT_SORTS`（10个预设排序的取值函数映射）在React这边（`useDebtSort.ts`）原样重新声明了一份，跟vanilla原来那份逐字对照过。

### 债务对象加了真正的`id`字段——`keyFor()`的`WeakMap`+`editedDebtRef`两处workaround都已删除

**这一节的历史已经翻篇。** 早期这个项目的债务对象没有稳定id字段（纯靠数组下标寻址），`react/src/debts/useDebts.ts`（后来搬到`shared/state.ts`）的`keyFor(d)`曾经用一个模块级`WeakMap<Debt, string>`给每个债务对象懒生成一个稳定的React key：只要对象引用不变（`commitReorder`只是重排同一批对象的顺序，不克隆），key就稳定跨越拖拽重排；`debts`被整体替换成新对象时（备份恢复、导入JSON），`WeakMap`查不到旧key会自然生成新key。当时这段注释还写着"这是一个更大的架构决定，不在这次范围内"。

**促成这次真正加id字段的直接原因，是`EditSheet.tsx`"第六步"那次真实踩过的bug**（详见下面"第六步"小节）：`deleteDebt`触发的自动关闭effect第一版按下标`!debts[editIndex]`判断，删除的不是数组最后一条时会误判——`splice`导致后面的debt顺移进被删的下标，`debts[editIndex]`读到的是"存在、但是另一条债务"。当时用`editedDebtRef`（一个存对象引用的`useRef`）+`debts.includes(ref)`打了个补丁，绕开了这个具体症状，但没有解决"债务没有身份"这个根本问题——`DetailSheet.tsx`里当时就已经有一模一样形状的按下标判断陈旧性逻辑，同样暴露在这个坑里，只是还没被触发过。

**后续直接从根上解决了这个问题**：`www/js/calc.js`新增`genDebtId()`（`"d"+Date.now()+Math.random().toString(36).slice(2,7)`，沿用备份`"b..."`/上传`"u..."`/AI对话`"c..."`同一个id生成惯例），`normalize(d)`给缺id的老数据惰性补发（`if (!d.id) d.id = genDebtId();`——现有3处`debts.forEach(normalize)`调用点自动完成迁移，不需要专门的一次性脚本）；`setDebt(id, obj)`新增债务时赋新id、编辑时保留旧id。`react/src/types.ts`的`Debt`接口加了`id: string`字段。

**结果**：`keyFor()`和它的`WeakMap`已经整个删除，所有React列表（`DebtList.tsx`/`SettledList.tsx`/`PayList.tsx`）直接用`d.id`当key；`EditSheet.tsx`的`editedDebtRef`也整个删除，自动关闭effect改成`!debts.some(x => x.id === editId)`（`DetailSheet.tsx`原本潜藏的同类bug，这次也顺手用同一个模式修好了：`!debts.some(x => x.id === openId)`，`SimScreen.tsx`原来完全没有这层保护，这次也补上了）。**真正的id还带来一个当年WeakMap方案做不到的好处**：因为`applyBackupData`/JSON导入都会走`debts.forEach(normalize)`，只要备份/导入的数据本身已经带着id（这次改动之后新产生的备份都会带），id能在备份恢复、导入导出这几个环节里原样存活——不再像WeakMap那样"备份恢复后是全新的key"。

**`window.__azBridge`里所有单笔债务寻址的函数，参数从下标`i: number`换成了id`string`**：`payInstallment(id)`/`unsettle(id)`/`settleFull(id)`/`deleteDebt(id)`/`setDebt(id, obj)`（`id`为`null`表示新增，取代原来`i<0`的写法；`obj`参数类型是`Omit<Debt,"id">`，id永远由vanilla赋值/保留，React这边保存时不该也不需要造一个id出来）。`shared/state.ts`里`openDetailSheet`/`openEditSheet`/`openSimScreen`这几个React自己拥有的sheet开关状态，同样从存下标改成存id，`openEditSheet`原来`-1`代表"新增"的约定换成了字符串哨兵值`NEW_DEBT_ID = "new"`（真实id都以`"d"`开头，不会跟这个哨兵值撞车）。`commitReorder`本身**不变**——它一直是按对象引用重排，不是按下标，这次加id字段不影响它的实现，也不需要它去用id做什么。

**没有变的地方**：`commitReorder`的"稳定分区"重排算法本身（见下面"在还债务自定义排序"一节）——id解决的是"怎么单独寻址一笔债务"，不是"怎么记录债务之间的相对顺序"，这两件事是独立的，`debts`数组里的物理顺序依然是唯一的排序依据，没有另外引入一个顺序字段。`SIM_KEY`的持久化形状也没变（依然只存`{mode, extra}`，不存"哪笔债务"）——这是product层面刻意维持的决定，不是因为技术上做不到了，详见"提前还款收益模拟器"一节。

### 手势代码：原样移植，不重新设计

长按拖拽排序（`beginDrag`/`applyDragFrame`/`autoScrollTick`/`finishDrag`）和左滑露出"销这期"，全部原样照抄进`react/src/debts/gestures.ts`（一堆跟vanilla逐行对照的普通函数，不是React hook），是这个app里真机反复踩坑才验证正确的代码（见"在还债务自定义排序"一节"必须用Touch Events不能用Pointer Events"那条教训）——移植原则是**逻辑原样照抄，不借机"用更React的方式重写"**：手势期间的视觉位移依然是通过`ref`拿到真实DOM节点直接`el.style.transform=...`，只有手势**结束提交**的那一刻才调用`ctx.onCommitReorder(newOrder)`（`DebtList.tsx`里实现，桥接回`window.__azBridge.commitReorder`）。

**"还款日"页的左滑手势（`react/src/pay/gestures.ts`）是第三步独立照抄vanilla的`initPaySwipe`写出来的一份新代码，不是从`debts/gestures.ts`里拆出来的**——两者虽然都在做"左滑露出按钮"这件事，但`debts/gestures.ts`的触摸状态机把长按拖拽排序和左滑判断耦合在同一套`onCardTouchStart`/`onCardPointerDown`里（靠`dx`/`dy`哪个先超阈值+`jiggleModeRef`分支），试图从里面干净地拆出"纯滑动"这部分风险不小、且没有实际收益，而且历史上是vanilla的`initPaySwipe`先有、`debts`当年的左滑判断是照抄`initPaySwipe`定的模式（不是反过来，见"还款提醒页"一节）——所以这次port直接从vanilla的`initPaySwipe`往`react/src/pay/gestures.ts`搬，逻辑更简单（没有长按/`jiggleMode`分支），跟`debts/gestures.ts`是两份独立但同构的代码，`PayGestureCtx`（只有`openSwipeRowRef`一个字段）也比`GestureCtx`小得多。

**⚠️ React的合成触摸事件（JSX的`onTouchMove`等）默认是passive的，合成事件里调`preventDefault()`不会真正阻止原生滚动**——这是React本身的一个众所周知的限制，正好是vanilla当年"长按拖拽必须用Touch Events + `{passive:false}`"那条教训在React下的对应体现。所以`react/src/debts/DebtCard.tsx`里**没有用任何JSX的`onTouchStart`/`onTouchMove`prop**，而是在`useEffect`里用`ref`拿到真实DOM节点，手动`addEventListener("touchstart", ..., {passive:true})`（`touchmove`则在手势内部动态`{passive:false}`挂载，逻辑跟vanilla一模一样）——这个`useEffect`只在挂载时跑一次（`[]`依赖），因为`gestures.ts`里的函数不依赖任何会随渲染变化的闭包变量（全部通过`ctx`里的ref/稳定的`window.__azBridge`调用），不会有闭包过期的风险。

**`el.__o = {d, i}`这个"把数据直接挂在DOM节点上"的技巧原样保留**（`gestures.ts`的`CardEl`接口）——`finishDrag`提交时从DOM子节点顺序反查每张卡片对应哪个债务对象，这是vanilla原有的做法，React版本没有改用"查React state"之类的替代方案，因为这段代码本来就是直接操作真实DOM几何位置（`getBoundingClientRect`等），跟数据挂在DOM节点上是同一类"跳出React声明式模型"的必要操作，混用React state反而更容易出错。

**`.jiggle`/`.dragging`/`.shifting`这几个CSS类的应用方式，React版本做了一处经过分析确认安全的简化**：`.jiggle`（是否处于抖动动画）现在由React的`className`声明式驱动（读`jiggleMode` prop），不像vanilla那样手动遍历`children`挨个`classList.add/remove`；`.dragging`/`.shifting`（拖拽过程中的瞬时视觉状态）依然由`gestures.ts`直接操作DOM（这两个class从不出现在任何组件的`className`计算里）。**这不会跟React的重渲染打架**：React只在某次渲染计算出的`className`字符串**真的变化**时才会写DOM的`class`属性；由于拖拽期间`jiggleMode`/严重度都不会变化（唯一能触发debts数据变化的操作都需要用户手指忙于拖拽，不可能同时发生），同一张卡片的`className`字符串在整个拖拽期间保持不变，React会跳过写入，不会覆盖掉`gestures.ts`加上去的`dragging`/`shifting`。

### CSS：不需要迁移，直接复用

React组件挂载在同一份`index.html`文档里（不是iframe/独立页面），`.debt`/`.hero`/`.kpi`/`.ai-banner`等类名和它们依赖的`:root` CSS变量都定义在现有全局`<style>`块里，且这个`<style>`块没有删除（其余三个tab还要用）——**React组件的JSX直接写`className="debt-front"`等现有类名就拿到完全一致的样式，没有做任何CSS Module化/样式迁移工作**。唯一手工搬的是wordmark SVG路径数据（`react/src/debts/Header.tsx`，用`dangerouslySetInnerHTML`原样内嵌，这段SVG本身就是固定的、不含任何用户输入的静态标记，不是XSS风险）。

### HTML结构变化：每个已迁移tab的旧容器折叠成一个挂载点

原来`#topHeader`（wordmark+头像）和`#topSummary`（hero+KPI+AI banner+口径说明）是独立于`.view`机制之外的两个容器，靠tabbar点击时的`showTop`特例代码（`$("topHeader").style.display=...`）手动显隐；`#view-debts`才是真正的`.view.active`容器。第二步迁移把前两者的特例显隐代码整个删除，第三步"还款日"/"统计"两个tab延续同一手法——`www/index.html`现在是：
```html
<section class="view active" id="view-debts"><div id="react-debts-root"></div></section>
<section class="view" id="view-pay"><div id="react-pay-root"></div></section>
<section class="view" id="view-report"><div id="react-report-root"></div></section>
```
各自的`App.tsx`在自己的挂载点内部渲染全部内容，跟"我的"tab统一走普通的`.view.active`机制——这是迁移顺带完成的简化，不是必须的，但消除了特例代码。

**⚠️ 折叠HTML结构时，`$("旧容器id").addEventListener(...)`这类挂在旧DOM节点上的vanilla事件监听器必须和HTML结构替换在同一次改动里一起删掉，不能分两步**——第三步真的踩到过这个坑：`#payHero`折进`#react-pay-root`挂载点后，如果漏删原来`$("payHero").addEventListener("click", ...)`这行（铃铛点击委托），`$("payHero")`会返回`null`，`.addEventListener`在主IIFE**顶层执行时同步抛异常**，导致整个vanilla脚本崩溃——不止"还款日"页出问题，IIFE末尾`renderFiles()`/`renderAll()`等其余初始化代码全部不会执行，是"改一行、崩全站"级别的错误，且不会有任何toast/报错提示只会体现为"App整个不工作"。**以后但凡要把某个vanilla容器折进React挂载点，第一步就该搜一遍这个容器id有没有被`$("xxx").addEventListener`直接引用过，跟删函数定义本身同等优先级，不能等"最后再检查一遍"。**

### "统计"tab：纯`data → JSX`翻译，零手势，导出逻辑保持vanilla

> **⚠️ 这一节标题里"零手势"这句话是描述React迁移第三步当时的状态，"统计tab视觉+交互升级"这轮（`react/src/report/`新增`chartScrub.ts`、`BalanceBars.tsx`/`TypeStack.tsx`加了点击高亮状态）之后已经不再成立**——完整细节见下面"统计"一节"统计tab视觉+交互升级"子节，这一节保留是为了如实记录当时那一步迁移的真实情况（纯翻译、零状态），不是当前状态。

跟"在还债务"/"还款日"不同，"统计"tab完全没有手势代码，也没有任何tab内部状态（`payFilter`/`jiggleMode`这类）——`renderBalanceBars`/`renderTypeStack`/`renderPayoffLine`/`renderReportTables`这4个vanilla函数原本就是纯粹的"给定`data`（`computeReportData(debts)`的返回值）拼出HTML字符串"，翻译成`react/src/report/`下同名的`.tsx`组件（`BalanceBars.tsx`/`TypeStack.tsx`/`PayoffLine.tsx`/`ReportTables.tsx`）只是把字符串拼接换成JSX，数学/条件分支逻辑一行没改，是这三步迁移里风险最低、最接近"机械翻译"的一次。**JSX的文本插值天然转义，字符串拼接版本里手动调用的`esc()`在JSX版本里不需要了**（不是行为变化，是JSX本身的固有安全特性替代了手动转义这一步）。**导出按钮（`exportReportXlsx`/`exportReportPdf`）本身没有搬进React**——已确认这两个函数零DOM依赖（只读`debts`造Blob），继续100%vanilla，只是新增桥接给React的`ExportActions.tsx`调用，premium门禁判断原样复刻。

### 验证状态

十一步迁移逐步都跑过桌面Chromium + Playwright验证（一次性临时装卸，不是常驻依赖）：每个screen的开关/门禁/表单校验/确认弹窗/硬件返回键链路、跨tab数据一致性，全部覆盖，全程浏览器console零JS报错，light/dark双主题截图核对。过程中挖出并修复的两个真实bug已经记在对应小节里（`useDebts()`原地mutate不触发重渲染，见"第五步"；`deleteDebt`自动关闭effect的下标失效，见"第六步"），不在此重复。

**零手势的纯data→JSX展示tab（当时的"统计"/"我的"）桌面Playwright覆盖已经足够，不需要真机**；`#detailSheet`的grip拖拽同理（只是4个pointer监听器，不是`gestures.ts`那套状态机）。**"还款日"左滑手势**移植时逻辑上逐行照抄，但历史教训是手势代码"必须真机验证"（见"在还债务自定义排序"一节），没有因为是移植就免掉这一步。**"统计"tab后来在"统计tab视觉+交互升级"那轮加入了`chartScrub.ts`/`pieRotate.ts`真实触摸手势**，"零手势"这条已经不再成立，从此变成第二个需要真机确认手感的tab——完整细节见下面"统计"一节。

## 原生插件：`SaveFile`

档案库的"下载"按钮存文件到用户自己选的位置，用的是这个自定义原生插件（`android/app/src/main/java/io/github/jenkjyu/afterzero/SaveFilePlugin.java`），不是网页标准的`<a download>`。

**为什么需要一个原生插件**：`<a download>` + `blob:` URL 这种纯网页写法在桌面浏览器没问题，但在安卓WebView里基本不生效（点了没反应）。

**现在用的是系统"另存为"选择器（Storage Access Framework, `Intent.ACTION_CREATE_DOCUMENT`），不是早期版本静默写入`MediaStore.Downloads`那一套**——这是踩坑之后换的架构，原因见下面"踩过的坑"。用户点"下载"会弹系统自带的文件选择界面，自己挑文件夹（也能选Google Drive这类云盘）、确认文件名后再保存，不再是"点了就无声存完"。好处：完全不需要在`AndroidManifest.xml`里申请任何存储权限（SAF本身就不需要），且`ACTION_CREATE_DOCUMENT`从API 19（远早于这个项目`minSdkVersion=24`）就存在，不像旧的`MediaStore.Downloads`写法那样要求安卓10+——**这个插件现在对minSdk覆盖的所有安卓版本（7+）都支持，没有版本边界要特殊处理**，CLAUDE.md早前记录的"安卓10以下不支持"这条限制已经不存在。

**踩过的坑（为什么从静默写入MediaStore.Downloads换成SAF选择器）**：老写法用`MediaStore.Downloads.EXTERNAL_CONTENT_URI` + `IS_PENDING`那套流程写入，原生层面`call.resolve()`确实是在真正写入成功之后才触发的，不是假成功。但**很多国产手机的文件管理器"下载"这个分类入口，只按识别得出的mime类型（图片/视频/文档/安装包...）过滤显示**——图片/PDF能命中分类、正常可见，但备份文件用的`application/json`是冷门类型，命中不了任何分类，会被过滤掉不显示，文件其实原样躺在"所有文件→内部存储→Download"这个真实文件夹里，只是分类视图里看不到。表现为"App提示已保存到下载，用户去文件管理器翻却怎么也找不到"，很容易被误判成"保存失败"，实际上原生代码从来没有真的失败过。换成SAF"另存为"选择器后，文件存在哪是用户自己点出来确认的，不存在"看不见"这个问题。

**用户在系统选择器里点"取消"是正常操作，不是错误**：`SaveFilePlugin.java`的`@ActivityCallback`方法把这种情况单独`reject("已取消")`，跟真正的写入失败区分开，JS那边不用特殊分支处理，直接把`err.message`吐出来toast就是恰当的中性文案。

**⚠️`SaveFilePlugin.java`现在的写法是"先把base64落到cache临时文件、只把短临时路径带过Activity边界、回调时从临时文件流式拷贝到用户选的位置"，不是早期那种"把整段base64留在`PluginCall`里带过选择器、回调时`Base64.decode`成byte[]一次性`out.write`"——这是踩了真机崩溃坑之后改的架构，改这个文件前务必看懂原因**：系统"另存为"选择器是覆盖满屏的独立Activity，会把本App退到后台；Capacitor为了在进程可能被回收后还能把结果回调给这个`call`，会保存这个call（其`data`里就是那段base64）。当导出的文件较大时（尤其是**内嵌图表PNG的PDF、含多张sheet的xlsx**——高级统计报表导出就是这两种），这段base64会让保存/恢复call时的Binder事务超限抛`TransactionTooLargeException`，或在回调里"持有base64 + 再decode出一份等大byte[]"双份占内存OOM——两种都是**框架层未捕获异常直接闪退**（不是`call.reject`能兜住的，所以JS那边也toast不到任何错误），而此时SAF已经先把目标文件创建成**0字节**，于是真机表现就是"选完保存路径就闪退、导出的文件0B打不开、提示格式错误"。修法就是别让大数据跨Activity边界：`save()`里先`Base64.decode`写进`getCacheDir()`的临时文件，把`call`里的`data`大字段`remove`掉、只塞一个`tmpPath`短字符串，`handleSaveResult()`回调里用`FileInputStream`→`openOutputStream(uri)`**64KB缓冲流式拷贝**、`finally`删临时文件。**JSON备份之类小文件当年没触发这个坑（base64小、远不到Binder上限），所以是报表导出（大文件）才暴露出来的——以后`saveToDeviceDownloads()`要保存的东西只要可能变大，就得走这条临时文件路径，别退回"整段base64塞call"的老写法。**

**JS这边怎么调用**：`www/index.html` 里的 `saveToDeviceDownloads(blob, filename, mime)` 函数会检测 `window.Capacitor.Plugins.SaveFile` 是否存在——存在（真机原生环境）就转base64调用原生插件；不存在（比如本地`python3 -m http.server`桌面浏览器测试）就退回到旧的`<a download>`写法。**这意味着"下载"功能本身没法在桌面浏览器里完整测出真实效果，必须编译APK装真机验证。**

**凡是"往手机存文件"的按钮都必须走 `saveToDeviceDownloads()`，别再直接用 `<a download>`**：除了档案库单个文件的"下载"，"我的"→数据备份里的"下载备份文件"按钮也是这一类。曾经踩过坑——"下载备份文件"当初直接用了裸的 `<a download>` + blob URL，桌面浏览器测着没问题，真机上点了完全没反应（就是上面说的安卓WebView不支持这种写法），后来才改成同样走 `saveToDeviceDownloads()`。以后再加任何"导出/保存到本地"的入口，第一反应就该是复用这个函数，而不是 `<a download>`。

## 原生插件：`WeChatLogin`（账号登录基础设施）

"我的"标签页里的"微信登录"入口，用的是这个自定义原生插件（`android/app/src/main/java/io/github/jenkjyu/afterzero/WeChatLoginPlugin.java` + `wxapi/WXEntryActivity.java`）。**登录现在是全局强制的，不再是可选的基础设施**——`www/index.html`里的`#loginGate`是一个不可关闭的全屏浮层，`account`（localStorage的`ACCOUNT_KEY`）为空时会盖住整个App（含底部tabbar），四个标签页全部进不去，必须先微信登录成功才能看到任何内容（具体是哪四个tab见下面"导航重排"一节，早期是债务列表/待还提醒/档案库/我的，现在档案库已经从tabbar撤下）。这是一次明确的架构决定（不是回归/bug）：原本能完全离线使用的四个标签页，现在都需要联网+装微信+登录成功才能用。

**登录门是"默认可见、fail-closed"设计，别改回"默认隐藏、靠JS显示"**：`.login-gate` 的 CSS 默认就是 `display:flex`（可见），只有确认已登录后才用 `.authed` 类把它 `display:none` 隐藏。这是踩过"一闪而过"坑之后刻意反过来的——早期是默认 `display:none`、靠 JS 判断未登录再显示，但那几个 CloudBase CDN `<script src>` 是阻塞解析的，首屏 JS 要等它们跑完才执行，这段空档里登录门还没显示、底下的 App 内容会闪出来一帧。现在反过来：默认永远盖着，哪怕 JS 完全没执行也不会露馅。两个地方负责加 `.authed`：`<body>` 顶部一段极早的内联脚本（在那几个 CDN script 之前、同步读一次 localStorage 就决定），以及主脚本里的 `renderAccountUI()`（冷启动、登录成功、退出登录、注销账户后都会调，`account`有值就加`.authed`隐藏、没有就去掉并加`.open`触发手写动画）。

**为什么需要原生插件（不只是JS调API）**：微信登录在原生App里官方要求走"移动应用"OAuth流程——拉起手机上装的微信App本身走授权，不是网页扫码，这个交互没法用纯JS实现，必须靠微信官方Android SDK（`com.tencent.mm.opensdk`，Maven Central发布，见`android/app/build.gradle`）。

**SDK硬编码写死不能改的路径、CloudBase接线时按顺序会踩到的6个坑、`createTicket`/`signInWithCustomTicket`用法、release签名要求，全部见`wechat-login-setup` skill**（`.claude/skills/wechat-login-setup/SKILL.md`），不在这里重复。

**JS这边怎么调用**：`www/index.html` 里点击"微信登录"按钮，跟`SaveFile`同样的模式检测 `window.Capacitor.Plugins.WeChatLogin` 是否存在，不存在（桌面浏览器测试）就提示"仅支持安卓App内使用"。存在的话调用原生插件的`login()`拉起微信，真正的授权结果是异步的，通过 `wechatAuthResult` 事件回传（因为微信App拉起和用户授权跨越了Activity生命周期，`PluginCall`没法跨这段存活，只能用事件而不是直接resolve这次调用）。拿到微信返回的`code`后，调用腾讯云开发（CloudBase）的云函数换取自定义登录票据完成登录——**AppSecret绝不出现在客户端代码里**，只存在云函数的环境变量中，客户端只带AppID（AppID本身不是秘密）。

**目前的完成状态**：微信登录已经端到端跑通验证成功（真机测试，"我的"tab顶部正确显示头像+昵称）。`WeChatLoginPlugin.java`里的`APP_ID`已填真实值，云函数`WX_APPID`/`WX_APPSECRET`已配置。CloudBase环境`after-zero-d7gub5p5f09c8cc2d`，`wxLogin`云函数已部署，"自定义登录"已启用并配好私钥。

**CDN脚本加载顺序、`signInAnonymously()`规避bug、匿名登录开关、`wxLogin`权限例外、`users`集合手建、release包WebView调试这6个坑，以及`createTicket`/`signInWithCustomTicket`API用法、"别启用内置微信开放平台登录"，全部见`wechat-login-setup` skill**（`.claude/skills/wechat-login-setup/SKILL.md`）。

**部署云函数、`cloudbaserc.json`要求、环境变量/权限控制的坑，见`cloudbase-deploy` skill**（`.claude/skills/cloudbase-deploy/SKILL.md`）——不在这里重复，那边有完整的部署命令、三个必查的坑、验证方法、当前全部云函数一览。

### 云函数：`deleteAccount`（注销账户）

"我的"标签页→账户详情页里的"注销账户"按钮，调用这个云函数（`cloudbase/functions/deleteAccount/index.js`）在服务端真删除`users`集合里对应的文档——不是只清客户端本地登录态那种"假注销"。

**身份来源，不信任客户端参数**：跟`wxLogin`"绝不信任客户端输入"的原则一致，这个函数**不接受、也不该信任**客户端传来的openid参数，而是用`app.auth().getUserInfo()`读已认证会话的`customUserId`——`wxLogin`当初签发`createTicket(openid)`时，把openid设成了这个用户的自定义登录标识，客户端`signInWithCustomTicket()`登录成功后，这个`customUserId`就应该等于当初的openid。这个函数只需要默认的admin app（`cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })`），不需要`wxLogin`里那个专门为`createTicket()`准备的`getAuthApp()`私钥实例。

**⚠️ 待真机核实的地方**：`customUserId`是否真的原样等于openid字符串（没有额外前缀/包装）是查官方文档得出的结论，这个项目里还没实测验证过。第一次真机走通注销流程时，建议临时在函数里加一行`console.log(JSON.stringify(auth.getUserInfo()))`，走一次真实注销，去云开发控制台"云函数日志"确认`customUserId`确实等于预期的openid，再决定要不要删掉这行log——这跟上面"CloudBase自定义登录的两处API调用"那条"别凭记忆写、要核对当前文档"是同一类风险。

**权限控制，不需要给它单独配规则**：上面第4条已经改正过来了——"权限控制"是整个环境共用一份配置文件，不是每个函数各自独立。只要`*`通配规则保持在安全默认值（`auth.loginType != 'ANONYMOUS' && auth != null`），`deleteAccount`不用任何具名配置就自动吃到这条安全规则（只允许真实登录、非匿名的调用者调用）。**踩过的坑**：这个项目第一次配`wxLogin`权限时图省事直接把`*`整条改成了`{"invoke": true}`（对所有人开放），当时没意识到这会同时影响`deleteAccount`（和以后任何新加的函数）——后来对照文档发现`*`是共享兜底规则，才改成"给`wxLogin`单独加具名例外，`*`收紧回安全默认值"这种正确写法（见上面第4条的JSON示例）。**即使当时`*`一度是开放的，`deleteAccount`本身也没有实际风险**：它从不信任客户端参数，身份完全来自已认证会话的`customUserId`，查不到就直接拒绝、且只会操作调用者自己的数据，删不了别人的账号——控制台这层"谁能调用"的门槛和函数内部"删谁的数据"的门槛是两件独立的事，后者才是这个函数真正的安全边界。

这个函数不需要任何`envVariables`（不用微信API密钥，也不用`createTicket`的私钥，只需要默认admin DB权限+`getUserInfo()`）。部署方式见`cloudbase-deploy` skill，跟`wxLogin`一样。

## 原生插件（官方npm）：`@capacitor/local-notifications`（还款提醒通知）

> **⚠️ `#notifySheet`本身（第八步，React迁移收尾）已经整体由React接管（`react/src/sheets/NotifySheet.tsx`）——渲染/开关状态归React，真正调用这个原生插件的权限检查/申请/调度这几件impure的事，依然留在vanilla（桥接给`setNotifyEnabled`/`addNotifyRule`/`deleteNotifyRule`/`sendTestNotification`这4个`__azBridge`函数）。这一节记录的原生插件接线方式（`npx cap sync`自动处理、不用手动`registerPlugin()`）、调度策略、渠道创建等依然100%成立，不受这次UI迁移影响，具体React这边的实现细节见"React 迁移"一节"第八步"。**

"还款日"标签页顶部"最近还款日"卡片右上角有个铃铛图标，点开是一个通知设置面板（`#notifySheet`），可以打开/关闭通知、添加"提前N天+几点"的提醒规则（全局共享，对所有在还债务统一生效，不按债务单独配置）。

**跟`SaveFile`/`WeChatLogin`那两个手写插件性质完全不同，别用同一套心智模型去改它**：`@capacitor/local-notifications`是官方发布在npm上的标准Capacitor插件（`package.json`里的依赖，不是`android/app/src/main/java/io/github/jenkjyu/afterzero/`下的手写`.java`文件）。装完跑`npx cap sync android`会自动处理**所有**原生接线——Gradle依赖（`android/capacitor.settings.gradle`/`android/app/capacitor.build.gradle`，这两个文件本身就是"DO NOT EDIT"的自动生成文件）、`AndroidManifest.xml`里的`POST_NOTIFICATIONS`/`RECEIVE_BOOT_COMPLETED`/`WAKE_LOCK`权限和几个receiver，全部靠插件自己的AAR manifest merge自动注入。**这意味着这个插件不需要、也不应该在`MainActivity.java`里手动`registerPlugin()`**（那是给`SaveFilePlugin`/`WeChatLoginPlugin`这种不是npm包的手写插件用的注册方式，官方npm插件靠Capacitor构建时自动发现），也不需要手动改`AndroidManifest.xml`——已经在合并后的release manifest里核实过这几条权限和receiver确实自动出现了。

**数据模型是全局共享的一份配置，不是挂在每笔债务上**：`NOTIF_KEY`（`after-zero-notify-v1`）存的是`{enabled, rules:[{offsetDays, time}]}`，`offsetDays`只允许`0|1|2|3`（当天到期～提前3天），`time`是`"HH:MM"`。之所以能做成全局共享而不用给每笔债务发明一个稳定id，是因为需求本身就是"同一套提醒规则套用到所有债务"，不是按债务区分——如果以后要改成"每笔债务单独配置提醒"，得先解决这个项目"债务没有id字段、纯靠数组下标寻址"这个更大的架构问题（见下面"在还债务自定义排序"一节）。

**调度策略是"全清再重排"，不是增量更新**：`syncNotifications()`每次调用先把所有待触发的通知全部`cancel`掉，再根据当下`debts`+`notify.rules`重新排一遍——因为这个App没有别的功能用本地通知，全清不会误伤别的东西，比给每条通知发明持久稳定ID去做增量diff简单可靠得多。这个函数挂在`renderAll()`末尾，意味着**任何改动债务数据的地方（还款、增删债务、结清、导入备份……）最终都会走到`saveAll();renderAll();`这个收尾模式，规则就自动跟着当下最新的`d.nextDate`重新排一遍**——这也是"提前N天"这种相对规则不需要`repeats`标记就能自动滚动到下一期的原因，每次重排读到的`nextDate`本来就已经是`recompute()`推进过的最新值。

**通知渠道(channel)必须手动建，插件不会自动建**：安卓8+发通知必须先有一个channel，`LN.createChannel({id:"repay",...})`在App启动时调一次（幂等，重复调用无副作用）。**状态栏小图标不能直接用现有的全彩`mipmap-*/ic_launcher*`**——安卓要求这个图标必须是纯白/透明的单色剪影，新增了一个专门的矢量drawable`android/app/src/main/res/drawable/ic_stat_notify.xml`（单个vector覆盖所有密度，不用出PNG套图）；这个文件在`android/app/src/main/res/`下，`npx cap sync`不会碰它，需要手动创建一次、长期保留。

**故意选择"非精确闹钟"，不申请`SCHEDULE_EXACT_ALARM`**：这是权衡后的明确取舍——申请精确闹钟权限需要用户在安卓12+系统设置里额外手动开一个"闹钟和提醒"权限（这个App没上应用商店，走不了商店审核那条豁免路径），换来的是"到点分毫不差"；不申请的话完全不需要额外操作，代价是安卓省电策略可能让实际弹出时间比设定的晚几分钟到十几分钟。对"还款提醒"这个场景，晚几分钟不影响实际使用，所以选了不用额外权限的路子。**以后如果要改成精确闹钟，除了申请权限，还要在`schedule()`的`schedule`对象里研究`allowWhileIdle`等参数，且要重新评估这条路径。**

**JS这边的检测模式跟`SaveFile`/`WeChatLogin`一致**：`window.Capacitor && window.Capacitor.Plugins.LocalNotifications`存在才调用，不存在（桌面浏览器测试）就静默跳过或提示"仅支持安卓App内使用"——同样是"真实通知能不能弹出没法在桌面浏览器完整验证，必须编译APK装真机"这条老规矩。

**通知面板里有个"发送测试通知"按钮**（10秒后弹一条），专门用来在不用等真实还款日的情况下，快速验证真机上"权限→渠道→调度→系统弹出"这整条链路通不通。`syncNotifications()`末尾原来把所有调度失败都静默吞掉（空`.catch`），已经改成至少`console.error`出来，方便配合`chrome://inspect`/`edge://inspect`（见上面"环境要求"里release包调试那条）排查。

**已实测确认一个真实坑：华为/荣耀（EMUI/HarmonyOS）把"从最近任务卡片划掉App"当成对这个App的软性强制停止处理**，会连带撤销它的后台唤醒权限，导致App在前台时测试通知能收到、划掉最近任务后同一条测试通知就再也收不到——这不是`syncNotifications()`调度逻辑的bug（AlarmManager本身是系统级的，不依赖App进程存活），是系统限制。**排查"通知到点收不到"类反馈，先问两件事：手机品牌/系统是什么、用户是怎么"关闭"App的（划掉最近任务 vs 单纯回到桌面 vs 系统设置里手动强制停止）**——这两个变量决定了是要去"应用启动管理"里放行，还是真的要去查调度代码。华为/荣耀这台上的解法：**手机管家→应用启动管理**，找到这个App把"自动管理"关掉，手动打开"自启动/关联启动/后台活动"三个开关；小米/OPPO/vivo等其他国产系统大概率有同类限制，只是入口页面名字不同，遇到报告先按这个思路查对应设置页，不要先怀疑代码。

## Edge-to-edge（状态栏/导航栏透明，内容延伸到全屏）

**根因已找到并修复：不是CSS/safe-area的问题，是一条常驻的原生ActionBar。** 早期怀疑过`android:background`指向的启动图drawable透出来（见下面"排查过、已经证伪的猜测"），但用户提供的真机截图给出了更直接的证据——状态栏正下方多出来的那"一层"是**朴素无衬线粗体的"After Zero"文字**，跟App自己CSS画的手写体wordmark logo（在再往下的hero卡片上方）字体完全不同，一眼能看出是两个不同来源，不是"CSS背景没铺到位"这种视觉缝隙问题。

**根因**：`AndroidManifest.xml`里`<activity>`标签的`android:theme="@style/AppTheme.NoActionBarLaunch"`，这个主题名字虽然带"Launch"，但**实际上是`MainActivity`整个生命周期一直生效的运行时主题**，不是只在启动闪屏那一下用——这个项目里从来没有代码把主题从"启动态"切换成"运行态"（没调用`SplashScreen.installSplashScreen()`，也没有`postSplashScreenTheme`声明）。而`AppTheme.NoActionBarLaunch`（`android/app/src/main/res/values/styles.xml`）继承自`Theme.SplashScreen`，**没有像它的兄弟主题`AppTheme.NoActionBar`那样显式设置`windowActionBar=false`/`windowNoTitle=true`**——于是系统全程显示一条原生ActionBar，标题读的是`strings.xml`里`title_activity_main`这个字符串资源，值恰好就是字面量"After Zero"。这条ActionBar是传统View、不理解edge-to-edge的system bar insets，顶在状态栏正下方把WebView内容往下挤，这就是真机上看到"两层After Zero叠在一起、状态栏下面多出一截"的完整成因。

**修法**：给`AppTheme.NoActionBarLaunch`补上跟兄弟主题一样的`windowActionBar=false`/`windowNoTitle=true`（AppCompat和platform两种属性名都加了，因为这个主题的parent链不是AppCompat系，只用AppCompat自定义属性名不一定生效）：
```xml
<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
    <item name="android:background">@drawable/splash</item>
    <item name="windowActionBar">false</item>
    <item name="windowNoTitle">true</item>
    <item name="android:windowActionBar">false</item>
    <item name="android:windowNoTitle">true</item>
</style>
```
ActionBar消失后，WebView内容直接从状态栏正后方开始铺，配合下面"已经做的改动"里`WindowCompat.setDecorFitsSystemWindows(false)`+透明状态栏/导航栏+CSS `env(safe-area-inset-top)`这套本来就正确的edge-to-edge基础设施，效果才能真正生效——**这几行原来就没写错，只是一直被这条常驻ActionBar从中间打断，视觉上看起来像是"CSS没生效"，实际上CSS这层从来没出过问题。**

**教训**：`android:theme`挂在`<activity>`标签上、且名字里带"Launch"/"Splash"这类字眼的主题，不能想当然认为它只在启动那一刻起作用——除非代码里真的调用了`installSplashScreen()`并配了`postSplashScreenTheme`做主题切换，否则这个主题就是这个Activity**唯一、永久**的主题，它遗漏的任何"运行态该有的设置"（这次是关ActionBar）都会在整个App生命周期里持续生效，不会在闪屏结束后自动消失。以后新增/修改这类"名字暗示是临时态"的主题配置，先确认代码里是否真的做了主题切换，没有的话就要按"这是唯一主题"的标准去核对它的完整性。

### 已经做的改动（这些原理上一直是对的，这次确认没有问题，别怀疑到这一层）
1. `www/index.html`头部加了`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`（原来完全没有viewport标签，`env(safe-area-inset-*)`一直解析成0）。
2. `MainActivity.java`的`onCreate()`里调用`WindowCompat.setDecorFitsSystemWindows(getWindow(), false)` + `getWindow().setStatusBarColor(Color.TRANSPARENT)` + `setNavigationBarColor(Color.TRANSPARENT)` + 状态栏图标深浅跟系统日夜间模式走。
3. CSS给`.app`/`.login-gate`/`.subpage-header`三处共享容器的padding-top换成了`max(原值, env(safe-area-inset-top))`。

### 排查过、已经证伪的猜测
- **`capacitor_bridge_layout_main.xml`（Capacitor官方WebView容器布局，`node_modules/@capacitor/android/capacitor/src/main/res/layout/`）没有设置`fitsSystemWindows`**，`CoordinatorLayout`和`CapacitorWebView`都是`match_parent`——排除了"Capacitor自己的布局在悄悄吃掉状态栏空间"这个猜测。
- **`android:background`指向的启动图drawable透出来**这条曾经是怀疑度最高的猜测，实际证伪——真机截图显示的是ActionBar标题文字，不是图标/图片，两者视觉上完全不同，这条猜测方向就没对。

**这类改动没法在桌面浏览器验证**——状态栏、显示安全区这些概念桌面浏览器压根不存在，`env(safe-area-inset-*)`桌面上恒等于0，跟真机行为不是一回事，必须编译release包装真机看。**这次的教训依然成立**：光凭代码审查+编译通过不足以确认"做对了"，第一版就是编译成功、逻辑看起来没错，但真机效果依然不对；这次能定位到真正根因，靠的是用户提供了真机截图——之前只有一句话描述"不知道啥玩意"，排查效率很有限，拿到截图后一眼就能分辨出"两种字体的After Zero叠在一起"这个具体细节，才带出了"这是原生ActionBar不是CSS问题"这个关键转向。**遇到"看起来对不上但说不清哪里不对"的真机UI反馈，第一反应应该是先要一张真机截图，而不是继续在代码层面猜。**

**已真机验证通过**：装了`assembleRelease`产出的包，原生ActionBar确实消失了，App背景直接延伸到状态栏，效果符合预期。

## `Popover`定位：光算锚点不够，必须量面板自己的尺寸再按视口钳制

第一版`shared/Popover.tsx`只按触发器的位置算：`align="end"`时直接给`right: innerWidth - rect.right`、`"start"`时直接给`left: rect.left`。**这在"面板比触发器到那一侧边缘的距离还宽"时会整块溢出屏幕**——真机上"加权平均利率"旁边那个问号点开后内容跑到屏幕外就是这么来的。

**修法（2026-07-29）**：统一只算`left`（不再用`right`），算完按视口钳制；纵向下方放不下就翻到触发器上方，上下都放不下就贴底。**面板尺寸只有渲染出来才量得到**，所以定位分两趟：第一趟以`visibility:hidden`渲染（不是`display:none`——那样`offsetWidth/offsetHeight`量出来是0），`useLayoutEffect`里量完再定位并显示，用户看不到中间态。CSS那边还配了`max-width: calc(100vw - 20px)`兜底——钳制left的前提是面板本身不能比视口还宽，否则只能保证左边不溢出、右边照样跑出去。

**⚠️给这套几何逻辑写测试必须显式打桩**：jsdom不做布局，`offsetWidth`/`offsetHeight`恒为0、`getBoundingClientRect()`全是0，不打桩的话钳制逻辑拿到的全是0，测了等于没测。`Popover.test.tsx`里那组测试用`Object.defineProperty`临时覆盖`HTMLElement.prototype.offsetWidth/offsetHeight`和`Element.prototype.getBoundingClientRect`（按className区分是面板还是触发器），跑完在`finally`里还原。

## flex布局的交叉轴auto margin会取消stretch——`.ai-thread`踩过，别再踩

**症状**（真机报的bug）：AI顾问页发出一条短消息后、回复还没到的那几秒，用户气泡和"思考中"气泡看着像**挤在屏幕中间**，"思考中"三个字甚至被压成竖排；等AI回了一大段长文本，两个气泡才"自己"回到左右两侧。

**根因跟气泡本身、跟`align-self`完全无关**：`#aiScreen`是`display:flex; flex-direction:column`容器，`.ai-thread`作为它的flex子元素带着`margin: 0 auto`（本意是内容居中、限宽560px）。**flex布局里交叉轴上的auto margin优先级高于`align-items:stretch`**——有auto margin就不拉伸了，宽度退化成fit-content再居中。于是消息短的时候整条thread被缩成一根窄条，里面的气泡再怎么`align-self:flex-end`也只能贴着这根窄条的边；长回复撑满可用宽度后，thread变回全宽，气泡才看起来"正常"了。

**修法**：`#aiScreen .ai-thread`补`width: 100%`（配合`max-width:560px; margin:0 auto`依然是"居中且限宽"的效果）。`.ai-composer`当年就写了`width:100%`所以从没露出这个问题，是`.ai-thread`漏了。

**以后判断"flex子元素为什么没有铺满"，先看它自己有没有`margin:auto`**，别一上来就怀疑`align-items`/`align-self`写错了。这条对`.subpage`/`.sheet`里任何"限宽+居中"的内容容器都适用——这个项目里`margin: 0 auto`+`max-width`是个高频组合。

**⚠️jsdom不做布局，这类bug自动化测试锁不住**。`AiScreen.test.tsx`里那条回归测试锁的是另一半契约（左右对齐完全由`.ai-msg`上的`user`/`bot`类决定，且这两个类从消息发出的第一帧起就必须正确，不是等回复回来才补），真正的视觉验证只能靠Playwright截图或真机。

## 指标名词统一：同一个数字全App只能有一个叫法

`summarizeDebts().paidPrincipal`这个数字曾经在三个地方有三个名字——"债务"tab hero里叫"已归还本金"、正下方KPI卡叫"已还金额"、"统计"tab叫"累计已还本金"。真实用户会以为这是三个不同的指标（用户自己报的问题）。**现在统一叫"已还本金"**，`react/src/debts/Summary.tsx`（hero行 + KPI卡 + 口径说明）改过；"统计"tab这边当时改的是`react/src/report/Hero.tsx`（KPI卡 + 口径说明3处），**该文件已在 2026-07-31 统计页整体重做时删除**，这条命名统一在新结构里由`ReportHead.tsx`/`Outro.tsx`延续（仍然叫"已还本金"，没有再度分裂成不同名字，见上面"统计页整体重做"子节）。

**选"已还本金"不选"已还金额"的理由**："金额"含糊，容易被读成"本金+利息的总和"，而这个数字**只算本金**（利息在旁边的"另付利息"子行单列）。"累计"两个字是冗余的——它本来就是累计口径（含已结清债务），不需要在标签里强调，口径说明里讲清楚就够。

**以后再加新指标先查一遍全项目有没有同义词**：`grep -rn "已还金额\|已归还本金\|累计已还本金" react/src/`这类检查很便宜，比等用户在真机上发现"这两个数字一样但名字不一样"要划算。导出的Excel/PDF用的是"已还期数"/"是否已还"，跟这个指标不是一回事，不受这次统一影响。

## 提前结清 = 记一次真实的还款事件（`applySettle`/`undoSettle`，2026-07-29重做）

**⚠️这一节推翻了此前"提前结清只写`settled=true`、不动plan、剩余本金两边都不计"那套口径**——凡是别处（尤其"统计tab口径修正"一节）还写着"提前结清的剩余本金既不在`total`也不在`paidPrincipal`"的描述，都是旧状态。

**改的起因**：用户要求"提前结清后把每一期都打勾已还，撤销时恢复原样"，但他自己随即发现了这个做法的死结——**那些期原本的利息还挂在计划表里，会被算进"已还利息"**，而提前结清现实中恰恰是免掉未来利息的，统计页会显示用户多付了一笔根本没发生的利息。于是改成现在这套：不打勾，而是把它记成一次真实发生的还款事件。

**数据变换（`www/js/calc.js`的`applySettle(d, paidAmount, todayString)`，纯函数，有node:test覆盖）**：
- 弹窗问用户**实际付了多少钱**（预填`d.balance`＝剩余本金，输入框下面有一行小字标明"默认值＝只还本金、利息为0"，这行标注是用户明确要求的）
- 剩余未还期次**整体移进`d.settleStash`**，`plan`末尾追加一条`{date, amount: X, principal: 剩余本金P, interest: r2(X - P), paid: true, settleRow: true}`
- 结果：已还本金`+P`（这P确实被还掉了，归零进度该往前走）；已还利息`+(X−P)`——**`X>P`是多付的手续费/违约金，`X<P`是协商减免、记负数**，这样"本金+利息"两栏加起来恰好等于用户真实付出去的钱，总账不会对不上
- 详情页的还款计划表一眼看得出"这笔是被一次性结清掉的、花了多少钱"，而不是伪装成每期都按原计划按时还了（那是往用户自己的账里写假数据）

**`undoSettle(d)`处理两条互不相同的结清路径，别混为一谈**：
- **提前结清**（有`settleStash`）：删掉`settleRow`那条、把快照原样`concat`回去，完全回到结清前那一刻，一期不多一期不少。
- **销掉最后一期自动结清**（没有`settleStash`，`payInstallment`里`d.terms<=0`那条分支）：只清`settled`标记会留下一条"每期都已还、剩余待还¥0"的**僵尸债务**挂在在还列表里（真机实测到的bug），所以还要**释放最后一期的`paid`标记**，让它回到"还剩1期没还"。

**⚠️`recompute()`里`d.rate`的算法跟着改了**：提前结清过的债务，年化要用**原始完整计划**（`plan`里非`settleRow`的行 + `settleStash`）反推，不能用当前这份带结清行的plan——结清行是一笔大额一次性支付，混进IRR会算出一个跟这笔债务原本利率毫无关系的数字。写成"从`d`自己的字段推导"而不是"另存一个`rateBeforeSettle`字段"，好处是每次reload重新`recompute`都能自愈，不需要维护同步。

**`d.settledDate`继续用短格式`"M/D"`**（已结清列表一直这么显示，`payInstallment`那条自动结清路径用的`todayStr()`也是这个格式），由`applySettle`从`todayString`（`"YYYY-MM-DD"`，计划行格式）里切出来，不额外传第二个日期参数——保证两者永远指向同一天。

**`ask()`/`askAsync()`新增了`opts.amount`（数字输入框）+ `opts.amountHint`（下面那行说明文字）**，跟当年加`opts.month`是同一个套路的第二个可选输入控件，**互斥使用**（取值优先级是"先看月份、再看金额"，真要同时用得先改`mOk`那个handler）。`#mAmountInput`/`#mAmountHint`是两个独立元素、各自控制显隐，没传`amountHint`就不显示那一行。

**详情页计划表的期次号分母用`origTerms`不是`plan.length`**（`react/src/sheets/DetailSheet.tsx`）——提前结清会把剩余期次收进快照、只留一条结清行，`plan.length`会缩水成"已还期数+1"，拿它当分母会显示成"✓ 2/3"这种跟原计划完全对不上的数字。`origTerms = 非结清行条数 + 快照条数`。结清行本身不显示期次号，显示"✓ 结清"。

## `.sheet`的滚动必须在内层，不能挂在带圆角的那一层上（深色模式圆角露白）

**症状**（真机报的bug，只在深色模式出现）：打开债务详情窗/通知设置面板，**把抽屉往上拖到内容真正需要滚动的高度之后**，左上/右上两个圆角位置露出白边。

**根因**：`.sheet`原来同时具备**圆角 + `overflow-y:auto` + `transform`**这三样，Chromium会把它当成一个**不透明的合成滚动层**（`contents_opaque`），圆角外那几个像素直接留了图层的默认白底。**浅色模式下`--surface`本来就是白的，所以这个白边跟卡片本身混在一起完全看不出来，只有深色才露馅**——这解释了"为什么只有深色模式有这个问题"，也是定位这个bug的关键线索。用户提供的两张对比截图（一张拖高了露白、一张没拖高正常）直接给出了"要滚动才触发"这个触发条件。

**修法**：把滚动挪到内层`.sheet-scroll`（`flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain`），`.sheet`自己改成`display:flex; flex-direction:column; overflow:hidden`——只剩圆角+`overflow:hidden`+`transform`，不再是合成滚动容器，那个组合就不成立了。**四个sheet（`DetailSheet`/`EditSheet`/`NotifySheet`/`SortSheet`）都要有这层包裹**，`SortSheet.test.tsx`里有一条结构断言盯着这件事。**⚠️`#aiHistorySheet`（`AiScreen.tsx`，第十一步React迁移收尾时新写的）当时漏掉了这层包裹，2026-08-04才补上**——它是在这条规则定下来之后另一轮新加的sheet，没有照抄这个既有约定，说明"新增sheet要不要包`.sheet-scroll`"这条不会被linter/类型检查自动提醒，得靠人工核对。以后再新增任何`.sheet`，先确认这层包裹加了没有。

**顺带的好处**：`grip`留在滚动区**外面**（是`.sheet`的直接子元素），拖动条永远在顶部、不会被内容滚走。`gripDrag.ts`里`sheet.style.height`的写法不受影响——外层是flex容器，设了高度之后内层`flex:1`自动填满。

**教训**：`min-height:0`这条在这个项目里已经是第三次出现（`#aiScreen .ai-thread`、`.sheet-scroll`、以及当年AI页三段布局），**flex子元素默认`min-height:auto`会被内容撑开，导致`overflow-y:auto`根本不生效、滚动跑到外层去**——以后写任何"flex父容器 + 内部某块自己滚动"的结构，直接把`min-height:0`当成必写项。

## 过度滚动（overscroll）：必须CSS+原生两层一起关，只关一层不管用

页面滚到顶/滚到底之后继续滑，不该再有"拉扯"回弹。**安卓12+的WebView默认overscroll效果是stretch——它拉伸的是整个渲染表面，连`position:fixed`的`.tabbar`都会跟着一起被拽走**，真机上的观感是"整个App被拖动了"，不是常见的那种"只有列表内容被拉出一条空白"。这是真机反馈的bug，桌面浏览器复现不了（桌面Chromium的overscroll行为跟安卓WebView不是一回事）。

**两层开关，缺一不可**：
- **CSS层**（`www/index.html`）：`html, body { overscroll-behavior-y: none; }` 关掉根滚动容器；内部自己滚动的容器（`.sheet`、`#aiScreen .ai-thread`）用`overscroll-behavior: contain`——既不产生自己的拉扯、也不把滚动链传给底下的页面（sheet滑到底了继续滑不该把背后的债务列表也带着滚）。
- **原生层**（`MainActivity.java`）：`bridge.getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER)`。

两者管的**不是**同一件事：CSS那层管"文档滚动容器要不要产生overscroll行为"，原生那层管"WebView这个原生View自己要不要画overscroll效果"。只关一层的话，另一层在某些机型/WebView版本上依然会把拉伸效果画出来。**以后再遇到"滑到底还在动"这类反馈，先确认这两处是不是都还在，别只改CSS就以为完事。**

## 焦点环（`:focus-visible`）必须用`box-shadow`画，不能用`outline`——圆角会对不上（2026-07-31修）

用户截图报的bug：新增/编辑债务表单里"还款日（几号）""备注"这两个字段点击后，绿色焦点描边**左右溢出**，明显比输入框本身宽出一截。这不是这两处独有的问题——根因在全局规则上，**所有输入框/下拉框/按钮点了都有同样的问题，只是这两处先被发现**。

**根因**：全局规则原来是`:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }`（`www/index.html`）。`outline`的圆角是浏览器按`outline-width`/`outline-offset`跟元素自身`border-radius`近似猜出来的一条曲线，**不保证精确贴合**——`.field input`等实际圆角是9px，`outline-offset:2px`把描边往外推之后，浏览器给这条描边算出来的圆角半径明显比"9px+2px offset"该有的更小，直线边那段就会比输入框本身宽出一截，圆角处反而显得内缩，看起来就是"左右溢出"。这条规则里的`border-radius: 4px`其实从来没生效过（`.field input`那条更具体的选择器优先级更高，元素自己的圆角一直是9px），真正的病根纯粹是outline+offset+圆角这个组合在浏览器里的近似渲染算法。

**修法**：改用`box-shadow`画焦点环——`box-shadow`是照着元素**当前实际生效**的`border-radius`整个描边画的，不存在"近似猜"这一步，不管元素圆角是几都贴合：
```css
:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--accent); }
```
**⚠️这是全局规则，牵一发动全身，改的时候要连带检查有没有专门"关掉焦点环"的例外**——这个项目里已经有两处（`.sort-sel:focus-visible`、`.ai-composer textarea:focus`）因为别的原因显式把焦点环关掉，原来只写了`outline: none`，换成box-shadow方案后必须同时补上`box-shadow: none`，不然这两处会意外重新长出一圈之前特意去掉的环。以后再新增类似"这个控件不需要焦点环"的例外，两个属性都要关，别只关一个。

**验证**：Playwright依次focus"新增债务"表单里的input（贷款产品）、input（还款日）、textarea（备注）、select（借款类型）四种控件，`getComputedStyle`确认`outlineStyle:none`+`boxShadow`是贴合圆角的`0 0 0 2px`，深色模式截图确认描边紧贴边框、零溢出，控制台零报错。

## 返回键处理（安卓硬件/手势返回）

弹窗关闭 + 退出App这两件事，走的是"原生问JS，JS说了算"的桥接，两头都有各自的坑：

**原生这边（`MainActivity.java`）覆写的不是 `onBackPressed()`，而是用 `getOnBackPressedDispatcher().addCallback(...)`。** 这不是随手选的写法——这个项目 `targetSdkVersion = 36`（`android/variables.gradle`），高版本安卓的手势/预测性返回走的是新的 `OnBackPressedDispatcher` 机制，直接覆写老式的 `Activity.onBackPressed()` 在这个targetSdk下**不可靠触发**（踩过这个坑：第一版就是覆写 `onBackPressed()`，编译没问题，真机上按返回键完全没反应，跟没写一样，排查半天才发现是这个）。**以后不管加什么返回键相关的逻辑，都用 `OnBackPressedDispatcher`，别用 `onBackPressed()`。**

**JS这边（`www/index.html`）**：每次按返回键，原生层用 `evaluateJavascript` 问挂在 `window` 上的 `window.__handleBackButton()`（业务代码整体是IIFE包起来的，这个入口函数必须显式挂到 `window` 才能被原生层拿到）——返回 `true` 表示"我自己关掉了一层东西"，原生层什么都不做；返回 `false` 表示"没什么可关的"，原生层才 `finish()` 退出App。

**这个函数内部按"最上层的先关"的顺序逐层判断**（在还债务的抖动编辑模式 `jiggleMode` → 居中确认弹窗 `#modalScrim` → 账户详情页 `#accountScreen` → 通知设置面板 `#notifySheet` → 编辑窗 `#editSheet` → 详情窗 `#detailSheet`），实现的是"一层一层退"而不是一键全退到桌面。**以后新增别的弹窗/浮层，如果也想让返回键能关掉它，得手动把它的判断加进这个函数的优先级链——这是JS和Java两边靠一个字符串名字"约定"起来的隐性契约，编译器不会提醒你漏加，加漏了也不报错，只是那个新弹窗按返回键没反应、直接退出App，很容易漏测出来。**`#accountScreen`和`jiggleMode`都是这条警告的具体例子：都是新增的浮层/模式，被显式加进了这条链。`#notifySheet`同理，只是它走的是`.sheet`那套（跟`#editSheet`/`#detailSheet`同类），不是`#accountScreen`那种`.subpage`整页推入。

**`#loginGate`（登录门）反而故意不加进这条链**——它没有关闭函数，设计上就是不可关闭的。登录门显示时，上面几个`if`全部为false，自然落到`return false`，原生层`finish()`退出App，这正是想要的"没什么可关的，直接退出"效果，不是漏加。

**`.subpage`是这个项目第一个"整页推入"型浮层**（账户详情页`#accountScreen`用的就是这个class），跟原有的`.scrim`/`.sheet`底部弹出模式不同——从右侧滑入、覆盖满屏（含tabbar）、带返回箭头+标题的头部，不是从底部弹出的卡片。z-index分层：`.tabbar`=20 < `.scrim`=30 < `.sheet`=31 < `.subpage`=35 < `.login-gate`=40 < `.modal-scrim`=50 < `.flash`(toast)=60。以后再加类似的整页浮层，按这个顺序找自己的位置插进去，不用重新摸索。

**⚠️同一个z-index下，谁画在上层由DOM顺序决定，不是靠"感觉上谁该在上面"——2026-07-31新增`AboutScreen`时真实踩过，且是两处独立的坑，都要过**：所有`.subpage`共享同一个z-index=35（除非像`#aiHistorySheet`那样手动覆盖），层叠顺序纯靠"后出现在DOM里的画在上层"。`AboutScreen`（"我的"页新入口）第一版在`react/src/sheets/App.tsx`里写在`TermsScreen`后面，结果"关于我们→会员服务协议"这条路径点开`TermsScreen`后，它的返回箭头被同层级、仍然`open`着的`AboutScreen`截胡（Playwright报`intercepts pointer events`）——因为`AboutScreen`在JSX里排得更后，反而盖住了应该在上层的`TermsScreen`。**这跟`window.__handleBackButton`的优先级链是两件独立的事，一个管"点击测试选中谁"（JSX挂载顺序/z-index），一个管"按返回键先关谁"（链里判断的先后顺序），这次两个都真的各踩了一次**：把`AboutScreen`挪到`TermsScreen`/`PrivacyScreen`/`AgreementScreen`/`AccountScreen`前面后，`__handleBackButton`链里原来`__azAccountScreenBack`排在新加的`__azAboutScreenBack`判断*之后*——`AboutScreen`新增了"账户与登录信息"入口会打开`AccountScreen`，链里顺序不对会导致按返回键先把底下还开着的`AboutScreen`关掉、上层的`AccountScreen`纹丝不动。**规则统一成一句话：凡是"screen X会从screen Y内部被打开"，X在JSX挂载顺序里要排在Y后面，X对应的`__azXScreenBack`在`__handleBackButton`链里也要排在Y前面**——两处顺序方向刚好相反（JSX是"后来者居上"，返回键链是"上层先关"），改的时候容易顾此失彼，两个都要对着检查一遍，别改完一个就以为完事。详见`react/src/sheets/App.tsx`和`www/index.html`里`__handleBackButton`对应的注释。

## 在还债务自定义排序：长按拖拽 + 抖动编辑模式

"在还债务"列表除了10种预设排序（利率/借款金额/剩余待还/月供/剩余期数），还有第11种"自定义"——长按任意债务卡片进入iOS桌面图标式的抖动编辑模式（`jiggleMode`），此时卡片可以按住拖动重新排序，松手后如果新顺序恰好跟某个预设排序完全一致会自动切回那个预设名，否则自动切到"自定义"。退出编辑模式有两条路：排序框左边的"保存"按钮（`#jiggleDoneBtn`，只在编辑模式显示），以及**在编辑模式里再长按一次任意卡片、按住不动**（2026-07-29新增，见下面"长按退出"那段）。相关状态/函数集中在`renderDebts()`后面那一整块（`jiggleMode`/`dragCtx`/`onCardTouchStart`/`onCardPointerDown`/`beginDrag`/`applyDragFrame`/`autoScrollTick`/`finishDrag`/`commitReorder`/`detectMatchingSort`）。

**靠"稳定分区"重排`debts`数组本身**：早期这个项目的债务对象是纯用数组下标寻址的（`openDetail(i)`等），没有单独的id或顺序字段；后来加了真正的`id`字段（见"债务对象加了真正的id字段"一节），但那解决的是"怎么单独寻址一笔债务"，不是"怎么记录债务之间的相对顺序"——`debts`数组里的物理位置依然是唯一的排序依据，没有另外引入一个顺序字段，下面这套重排算法完全没有变。拖拽提交时`commitReorder()`按原数组顺序走一遍，凡是"在还"的槽位依次填入新顺序，凡是"已结清"的槽位原样不动——已结清债务在数组里的相对位置完全不受这次拖拽影响。

**拖拽全程用文档坐标（`clientY + window.scrollY`），不是纯视口坐标**——这是为了让"拖到屏幕边缘自动滚动页面"不需要额外的重新测量：`beginDrag()`一次性测好每张卡片在文档坐标下的自然位置（`naturalTop[]`），之后无论页面怎么滚动，两张卡片位置的差值都不变，`applyDragFrame()`每次都是从`naturalTop[]`重新算全部卡片该挪多少像素，不是在上一帧基础上累加——这样来回快速拖拽也不会产生漂移误差，卡片回到原位时自动得到位移为0。

**⚠️ 触摸手势必须用 Touch Events，不能用 Pointer Events——这是踩了很多轮才定位到的架构级坑，改这块前务必看懂**：需求是"同一张卡片：平时手指按上去能滚动列表，长按后能拖动排序"。这两件事在触摸设备上没法用 Pointer Events 兼顾，根本原因是——**用 Pointer Events 时，`pointermove` 上的 `preventDefault()` 不能阻止浏览器滚动**，滚不滚只由 CSS 的 `touch-action` 决定，而 `touch-action` 在手指刚触屏那一刻就锁定了、手势中途改它对当前这次触摸无效。于是 Pointer Events 只能二选一：`touch-action:none`→拖得动但卡片上没法滚动；`touch-action:pan-y`→能滚动但一竖着拖就被浏览器抢去当滚动、发`pointercancel`把拖拽杀掉。**之前反复"要么拖不动、要么只能在卡片间隙滚动"，全是因为在 Pointer Events 这条注定二选一的路上来回调参数。**

  最终方案（`onCardTouchStart`）：**触摸设备走 Touch Events（`touchstart`/`touchmove`/`touchend`），且 `touchmove` 监听器必须 `{passive:false}`**——只有 touch 事件的 `touchmove.preventDefault()` 能"逐次"动态否决原生滚动。平时（等待长按、或判定为滑动/滚动）完全不 `preventDefault`，原生滚动照常、手感跟卡片间隙完全一致；一旦长按判定成功、确认进入拖拽，之后每一次 `touchmove` 都 `preventDefault` 挡掉滚动、由 JS 接管定位。因为长按判定期间手指是静止的（移动超过10px就取消长按、判定为滚动），拖拽激活时原生滚动根本没启动，第一次 `preventDefault` 就能干净挡下。卡片 `touch-action` 保持默认（`auto`），不要再设 `none`/`pan-y`。**桌面鼠标**才走 Pointer Events（`onCardPointerDown`，`pointerType==='mouse'` 时才处理，纯为桌面浏览器可测；真机上 touchstart 和 pointerdown 都会触发，靠这个判断避免两边重复处理）。

  **长按还会触发 WebView 自带的系统级触感反馈（马达震动）**，这是内容层的手势识别，网页层的 `user-select:none`/`preventDefault` 都管不住——已在 `MainActivity.java` 里用 `bridge.getWebView().setHapticFeedbackEnabled(false)` 从原生层关掉。配合全局的 `user-select:none`（body 上关、只 input/textarea 放开）+ 全局阻止 `contextmenu`，一起压掉长按的选中/菜单/震动这几个原生副作用。

  **拖拽期间故意不复用现有的`lockScroll()`/`unlockScroll()`**（`initGripDrag`用的那套refcounted滚动锁，靠`document.body.style.overflow = "hidden"`实现）——如果拖拽时也锁滚动，会跟"边缘自动滚动"里的`window.scrollBy()`打架（`overflow:hidden`在不同浏览器引擎下对程序化滚动的影响不一致，不值得赌）。拖拽时靠上面说的 `touchmove.preventDefault()` 挡原生滚动就够，不需要再叠一层滚动锁。

**排序选择器是自绘的底部面板（`react/src/debts/SortSheet.tsx`），不是原生`<select>`**（2026-07-29改）。原生select在安卓WebView里弹出的是**系统自带的全屏列表**（白底、系统字体、系统圆点），跟这个App的视觉完全脱节——真机截图一眼能看出是两套设计。换成`<button>`+`.sheet`底部面板后：11个选项从上到下列出、选中项用"强调色文字+对勾"（跟`.pm-btn.active`/`.file-row[aria-current]`同一套选中态配方，不用原生radio）。

顺带说明两件事：①**没做成贴着按钮的`Popover`**——11个选项那种小面板放不下，会变成要么内部滚动要么溢出屏幕（这是跟用户确认过的形态选择）；②`.sort-sel`那几条"显式再设一次`user-select:none`、单独关掉`:focus-visible`绿色描边"的CSS补丁，当年是专门为了摁住原生select的长按副作用打的，**换成button之后其实已经没有必要了**，保留着无害但别以为它们还在解决什么问题。

**⚠️这个面板必须加进返回键链**：`window.__azDebtsBack`里排在`jiggleMode`判断**之前**（"最上层先关"——面板是盖在列表之上的sheet，比编辑模式更靠上）。因为那个回调只注册一次（`useEffect`空依赖），闭包会永远捕获初始的`false`，所以开关状态要跟`jiggleModeRef`一样额外挂一个`sortSheetOpenRef`。**这是这个项目里第三次踩"注册一次的全局回调读不到最新state"这个模式**，以后往`__azDebtsBack`里加任何新判断，默认就该配一个ref。

**排序方式（含自定义）现在会跨App重启记住**——`debtSort`存在独立的`SORT_KEY`（`debt-manager-sort-v1`）里，通过`setDebtSort()`这一个函数统一读写，不要绕过它直接改`debtSort`变量（会漏掉持久化）。

**长按退出编辑模式（`JIGGLE_EXIT_HOLD`，`react/src/debts/gestures.ts`）——两段计时，别改成一段**：编辑模式下"按住就能拖"是主操作（`dragDelay()`在编辑模式里只等120ms），所以不能为了让路给退出手势就把这个延迟整体拉长（那样每次想拖都得先干等半秒）。做法是**在拖拽真正开始之后再起第二段计时**（450ms，从手指落下算总共约570ms）：这段时间里手指位移超过`JIGGLE_EXIT_SLOP`（8px，比拖拽判定的10px阈值略小）就把`moved`标true并取消这段计时——**想拖的人一动就取消，想退出的人按住别动即可，两个手势互不打扰**。计时到点且没动过，就`ctx.exitJiggle()`（内部会`finishDrag(ctx,false)`丢弃这次没提交的拖拽），等同点"保存"。

**⚠️这条手势必须主动把`row.__justDragged`标成`true`**：它全程零位移，浏览器松手时**会**补发一个click，不拦的话`DebtCard`的click监听器会顺手把这笔债务的详情窗打开——退出编辑模式的同时弹出详情，明显不是用户想要的。这跟"还款提醒页"当年那条`__justDragged`教训是同一个问题的**反面**：那次是带位移的拖拽**不会**补发click、导致标记位永远等不到被消费而变脏；这次是零位移**会**补发，所以必须主动设上。**以后再写任何"手势结束后要不要抑制click"的逻辑，先想清楚这次手势到底有没有位移**，两种情况的处理方向是相反的。

`wasJiggling`必须在`pointerdown`/`touchstart`那一刻就快照下来，不能等timer回调里再读`ctx.jiggleModeRef.current`——那时如果是"这次长按刚把编辑模式打开的"，读到的已经是`true`，会导致刚进入编辑模式就立刻又被自己的退出计时关掉。

**编辑模式期间`#addBtn`（新增一笔）、已结清区域的"恢复"按钮、`#debtSortSel`下拉框都会被禁用**（CSS靠`#view-debts.jiggling`这个类切换），目的是保证编辑模式期间不会有别的sheet被同时打开——这也是为什么`window.__handleBackButton`里`jiggleMode`的判断可以放在最前面、跟其余判断互斥（见上面"返回键处理"一节）。

## 表面层级体系（2026-07-30建立）：改任何底色/卡片色之前必读

起因是用户反馈"统计页很low、深色模式尤其"，顺着查下去发现根因不在配色好不好看，在**表面之间根本没拉开层级**。当时实测：

| | 改之前 | 改之后 |
|---|---|---|
| 深色 卡片/页面底 | **1.07** | 1.23 |
| 浅色 卡片/页面底 | 1.13 | 1.18 |
| 浅色 输入框/卡片 | **1.07** | 1.13 |
| 深色 输入框/卡片 | 1.10 | 1.15 |

**⚠️第一条最容易搞错的事：四个tab的页面底色是`--app-grad`，不是`--bg`。** `--bg`只用在`.subpage`/`.tabbar`/`.login-gate`/`body`；`.app`（四个tab的内容容器）用的是`--app-grad`。**衡量"卡片够不够浮起"必须拿卡片跟`--app-grad`比**，拿`--bg`比会得到偏乐观的数字（当时就是这么先量错了一轮）。两者应该保持同一色温，早前浅色下`--bg`是偏蓝的而`--app-grad`是偏绿的，导致tab页和子页面底色温度不一致，这次统一成了冷灰。

**⚠️第二条：明暗两套模式的层级方向是相反的，不能一套算出来另一套推导。**
- **浅色**：石墨hero（很暗）＜＜ 页面底（浅冷灰）＜ 卡片（纯白）。"浮起"＝更亮。
- **深色**：页面底（近黑）＜ 卡片 ＜ 石墨hero（**最亮**）。同样"浮起＝更亮"，但因为hero在浅色是最暗、在深色是最亮，两套模式里hero跟卡片的相对位置正好调个个儿。深色模式靠明度台阶表达层级，**不能靠阴影**——黑色阴影压在深色底上几乎不可见，那是浅色模式的思路。

**⚠️第三条（这次真踩到的连带坑）：深色模式抬高`--surface`之后，有四类东西会跟着"塌陷"，必须一起抬，否则会出现"本该高亮的东西看起来像个凹陷的洞"。**
1. **`--glass`**（`.debt-front`/`.pay`磨砂玻璃卡用的，**不读`--surface`**）——它是半透明色叠在页面底上，`--surface`抬了它不会自动跟着抬，结果就是"债务tab的玻璃卡明显比我的tab的实心卡暗"。要按"叠加后的实际颜色 ≈ 新的`--surface`"反推alpha和底色。
2. **四个`*-soft`淡色底**（`--accent-soft`/`--critical-soft`/`--warning-soft`/`--good-soft`）——它们原本是按旧的（更暗的）卡片色调的，卡片一抬就变得比卡片还暗，`.pm-btn.active`这类"选中高亮"会看起来像凹进去。
3. **`--card-grad`**（`.kpi`/`.viz-block`/`.popover-panel`等用它而不是`--surface`）——不同步改的话同一页里会出现两种卡片色。
4. **`--graphite-a/b`**（石墨hero）——卡片抬上来之后hero跟卡片只差1.10，几乎糊在一起，要跟着往上让位。

**验证方法上的教训：只验"每个颜色对底色"是不够的，必须验相邻的那一对。** 早前跑`validate_palette.js`验的全是"色 vs 背景"，所以本金/利息两段绿各自对底色都过（7.67和3.33），但**它们俩贴在一起只有2.30**（低于相邻填充要求的3:1）——这个漏洞就是这么来的。`/private/tmp/.../scratchpad/`下这轮用的几个小脚本是一次性的，没进git，但方法要记住：**改配色时列出所有真实相邻的组合逐对验，不要只验对底色。**

## ⚠️承载数据的容器不能用磨砂玻璃（2026-07-30确认，别再"顺手对齐"过去）

"统计页容器材质对齐"这一步字面上该把 `.debt-front` 那套 `--glass` + `backdrop-filter` 抄到 `.viz-block` 上，**实际不能这么做**：

页面底 `--app-grad` 是个**渐变**，玻璃是半透明的，于是同一张图表卡在页面顶部和底部的实际底色不同——实测浅色下 `#F7F8FA`（顶）vs `#F4F5F7`（底）。后果是刚验好的图表对比度**掉到 3:1 以下、而且随滚动位置漂移**（利息色 3.09 → 2.91/2.83）。数据标记需要稳定可预测的背景，"对比度取决于你滚到哪儿"是不可接受的。

**所以材质分两类，这是有原则的划分不是不一致**：
- **列表卡片**（`.debt-front`/`.pay`）→ 玻璃，强调"漂在页面上的可操作物件"
- **承载数据的容器**（`.viz-block`）→ 不透明，`--card-grad`

`.viz-block`/`.kpi` 改成跟 `.debt`/`.pay-row` **同一档 elevation（`--e2`，原来是最轻的 `--e1`）+ 一条顶部内高光**（`::after` 的 `inset 0 1px 0 var(--glass-hi)`，跟 `.hero::after` 同一招）来补齐"材质感"，不靠透明度。加 `position: relative` 是安全的——`.chart-area`/`.pchart-grid` 的定位参照分别是 `.chart-plot`/`.pchart-viewport`，两者本来就是 `position: relative`，比 `.viz-block` 更近。

## 图表色板 `--ch-*` / `--series-*` / `--pie-*`（2026-07-31 三色角色制重做）：一个颜色 = 一个角色，别互相顶替

> **⚠️ 这个 token 表已经改过两次，当前状态以本节为准**。2026-07-30 那版是"每张图一个专属颜色"的四档制（`--ch-principal`/`--ch-interest`/`--ch-bar`/`--ch-line`）；2026-07-31 统计页从"看板"重做成"债务报告"（见下面"统计"一节）时，`--ch-bar` 被删除，改成三个更贴近数据语义的角色。走过的坑（`--ch-bar` 那版蓝紫配色没验相邻分离度）记在下面，是为了让"为什么现在这样设计"可追溯，别把已经作废的四档表当成当前值去用。

定义在 `.viz-root` 里（跟着明暗模式换，三个块：裸 `.viz-root` + 媒体查询 + `[data-theme=dark]`）。色相取自 `--ic-*` 图标家族，但**饱和度压低一档**——大面积必须少色相低饱和，见下一节那条原则。

| token | 只给谁用 | 为什么不能拿别的档顶替 |
|---|---|---|
| `--ch-principal` / `--ch-interest` | 压力图的堆叠柱（本金/利息） | principal 为了跟 interest 拉开 3:1 被压得很深，单独用会闷；这一对从 2026-07-30 定下来之后没再变过 |
| `--ch-mag` | 量级（排行条 `.rank-bar`、走势图辅助数据） | "量级=多大" 这个角色专属，不跟成本/进度混用 |
| `--ch-cost` | 成本（压力图/明细里的利息相关数值） | 跟 `--ch-mag` 拉开色相，同一个角色（本金/利息、成本对比）出现在不同图表时颜色要一致，读者不用重新学 |
| `--ch-line` | 走势图折线+面积渐变 | 唯一回答"我在变好吗"的图，给最亮一档 |
| `--risk` / `--calm` | 排行条风险二档（年化 ≥18% / 其余） | 见下面"红/琥珀/蓝三档不成立"那条 |
| `--series-1..8` | （历史遗留，`.viz-root` 里还在，当前 React 组件未使用） | 见下方"类型占比改甜甜圈"说明 |
| `--pie-1..6` | 类型占比甜甜圈（`TypePie.tsx`） | 分类色，2026-07-31 新增，跟 `--series-*` 是两套独立的分类色板 |

**⚠️本金/利息故意不用同色系两级，这是纠正过的判断**。原来是 `--accent`/`--accent-mid` 同一色相两级（"part-whole 用 sequential"），实测**相邻对比只有 3.01(浅)/2.30(深)**，深色那档低于相邻填充要求的 3:1，而且对红绿色盲几乎不可分辨。同色两级在浅色下有个死结：两者都要 ≥3:1 对白底，就**只能都很深**，反而更闷。改成绿(本金)/琥珀(利息)两个色相后四项校验全过：相邻 3.10/3.06、各自对底 ≥3、**色盲模拟距离从近乎 0 提升到 120(浅)/191(深)**。语义上"利息=成本"也更清楚。**这一对从 2026-07-30 定下来之后一直保留，是唯一有强语义理由绑死绿/琥珀两色的图。**

**⚠️`--ch-bar`（原来的横条图颜色）在 2026-07-31 被删除，起因是一次没做完整的验证**：上一版把 `--ch-line` 改蓝 `#2D63C8`、`--ch-bar` 改紫 `#7451B8`，各自对底色的对比度都跑过 `validate_palette.js`——但**只验了每个颜色单独对底色，没验这两个颜色之间**。用户后续对着原型截图发现问题后补验：`--pairs all` 跑出来 normal-vision ΔE 只有 9.8（硬性下限 15）、protan 只有 3.4，蓝紫在正常视觉下就已经很接近，红绿色盲下基本是同一个颜色。**教训：改一批同时出现在同一个用户会话里的颜色（哪怕分属不同图表），必须把它们放进同一次 `--pairs all` 校验，只验"每个颜色 vs 背景"是不够的**——这条在 2026-07-30 就记过一次（本金/利息那对），2026-07-31 又在另一批颜色上犯了同一类错误，说明"验证要覆盖哪些对"这件事本身容易漏，以后改任何一组图表色，先把这一批全部拿去跑一次 `--pairs all`，不要只验证新改的那一两个。

**⚠️`--risk`/`--calm` 排行条风险二档，也是从"三档不成立"里退出来的**：本想按 App 现有的 `.tag.rate-hi/mid/lo` 做三档（红/琥珀/蓝），验出来红↔琥珀 normal ΔE 只有 12.4（deutan 4.5），三档在色相上就不成立，改成二档 + 每行直接写利率数字，颜色不是唯一编码。**这条对 `.tag` 那三个标签色本身同样适用**——它们现在事实上是靠标签上的文字（"18.5%"这种）在扛区分，颜色只是辅助。

**⚠️`--series-1..8` 换掉的是 dataviz skill 自带的品牌中性占位色板**——那套本来就是设计成"先用着、之后换成你自己的品牌派生色"的，这个项目一直没做那次替换，结果统计页出现"前几张图全是品牌绿、到类型占比突然一片通用彩虹"的割裂感。**这不是当初的设计决定，是没做完的活**（早前CSS注释里拿"颜色单一语义原则"去解释它，属于事后合理化）。**2026-07-31 类型占比图从堆叠横条改成甜甜圈（`TypePie.tsx`）之后，实际用的是新增的 `--pie-1..6`，`--series-1..8` 目前在 `.viz-root` 里还留着但没有任何 React 组件引用——是死代码，还没清理，以后如果确认没有别的地方要用可以删掉。**

**走势图的面积填充必须是渐变，不能是纯色浅底**：原来用 `--accent-soft`，对底色只有 **1.14(浅)/1.15(深)**，等于隐形——既不是有效的视觉锚点也不是装饰。现在是线条色 26%→2% 的 `linearGradient`。**这里刻意不追 3:1**，面积不是用来读数值的标记（数值由线条和刻度承担），拉到 3:1 反而会盖过线条。⚠️`gradientUnits="userSpaceOnUse"` 是必须的，默认的 `objectBoundingBox` 在 `preserveAspectRatio="none"` 非等比拉伸下方向会变形。`Journey.tsx`（原 `PayoffLine.tsx`）有测试锁住这几点。

**这一节所有数字的教训**：只验"每个颜色对背景"会漏掉相邻那一对，而且**亮度对比一项也不够**——绿/琥珀这种情况必须同时看色盲模拟距离，否则会挑出一对"数值达标但色盲用户完全分不出"的颜色。这条教训被验证了两次（本金/利息、走势/排行），别指望"记住过一次"就不会再犯，每次改配色都要重新完整跑一遍。

## 图标徽章色家族（2026-07-30建立）：`--ic-*` 是全项目唯一"不跟主题换"的一组颜色

`--ic-brand-*`/`--ic-blue-*`/`--ic-violet-*`/`--ic-rose-*`/`--ic-amber-*`（每档一对 `-bg` 浅底 + `-fg` 深符号），**只在裸`:root`里定义一次，故意不写进那四个主题块**——这是全项目唯一一处刻意违反"四个块都要同步改"那条规矩的地方，别以为是漏改了。理由：这些颜色只出现在38px的小圆角方块里（约屏幕面积2%），小面积高饱和在明暗两种底色下都成立，保持恒定反而让App有一个跨主题稳定的色彩signature（参考的Google账号设置页就是这么做的，深色模式下那些紫/绿/蓝徽章原样不变）。技术上能生效是因为四个主题块都不定义 `--ic-*`，级联下来永远用 `:root` 那份。

**这一套背后的核心原则，比这几个色值本身重要得多**：

> **颜色的"多样性"和"面积"必须反向配比——小面积可以多色相、高饱和；大面积必须少色相、低饱和。**

这条是对着 Google 账号设置页数出来的：那一屏用了**7个色相**（比这个项目统计页多得多），但每个只占一个小圆圈；而统计页是1~2个色相铺满40%面积。结果前者读起来丰富有序、后者闷。**所以"统计页该用几种颜色"从来不是正确的问题，"每种颜色占多大面积"才是。** 统计页图表属于"大面积"，要用的是从这个家族**派生出来的低饱和档**，不是直接把这几个 `--ic-*` 值拿去铺柱子。

配色时三项都要验（这个家族全部通过）：符号/底≥4.5、底/白卡≥1.2（浅色下徽章要看得见）、底/深卡≥3（深色下要跳出来）。

**`.entry-*` 是"我的"页统一的列表行**（`.entry-card`/`.entry-row`/`.entry-ic`/`.entry-text`/`.entry-title`/`.entry-sub`），由早前只有会员入口卡在用的 `.premium-entry-*` 改名而来（`.premium-entry-card` 这个类名保留，但现在只剩 `.is-member` 那条选择器在用）。四张数据卡以前是"标题 + 一整段说明 + 一个按钮"的旧写法，按钮文案还把标题重复了一遍（"云备份"卡里放一个"打开云备份"按钮）；现在统一成"徽章 + 标题 + 副标题、整行可点"，高度差不多减半。**分组靠 `.entry-group` 的间距表达（组内6px、组间20px），不加小节标题**——这也是抄的同一个参考页。

⚠️改这几张卡的文案时注意：`DataCards.test.tsx`/`MineApp.test.tsx` 是按**可见文字**查元素的（`getByText("云备份")`），改标题会让测试失败，这是预期的，跟着改测试即可。

## 按钮层级体系 + `--on-*` 前景色token（2026-07-30建立）：加任何实心按钮之前必读

**⚠️铁律0：全局 `button` 规则里的 `color: inherit` 不能删。** `<button>` 不像普通元素那样继承文字色，不显式声明就会落到浏览器默认的 `ButtonText`（黑色）。浅色模式下碰巧接近正常文字色所以看不出问题，**深色模式下就是黑字压深底、几乎看不见**。订阅页那三张价卡（`.price-card`，是 `<button>` 但只设了 `background` 没设 `color`）就是这么中招的，真机报上来的。加了这条之后新写的按钮默认就是对的，不用每个都记得补。

**⚠️铁律1：实心按钮的文字色一律用 `--on-accent`/`--on-good`/`--on-critical`，永远不要写死 `#fff`。** 这条不是洁癖——深色模式下 `--accent`/`--good`/`--critical` 全部会变成**浅色调**（亮薄荷/浅蓝/浅红），白字压上去只有 2.2~3.2，远低于 4.5。这个错误历史上在**十来处同时犯过**（保存、应用到全部、左滑销这期、toast、AI用户气泡、AI发送按钮、价卡角标、会员图标、逾期hero、空状态图标），全部由这批token一次性修掉，`grep "color: #fff"` 现在应该是 0 命中，看到新的就是又犯了。

**同一个颜色变量不能同时当"文字色"和"填充底色"**，两者对明度的要求正好相反，所以拆成两套：

| 用途 | 浅色 | 深色 |
|---|---|---|
| `--accent` 文字/图标/描边 | 深墨绿（白底上要够深） | 亮薄荷（深底上要够浅） |
| `--accent-fill` 实心底 | 明快的中绿（**不是** `--accent` 那个近黑墨绿，当大色块太沉太旧） | 亮薄荷（＝`--accent`） |
| `--critical` 文字/图标 | 深红 | 浅红 |
| `--critical-fill` 实心底（逾期hero） | 深红（＝`--critical`） | **深红**（不是`--critical`那个浅红——深色下浅红当大色块会像糖果，要深底配白字才沉得住） |

**四档按钮，靠层级区分主次，不靠"是不是绿的"**：①`.btn.primary` 实心（**一屏最多一个**）②`.btn.ghost` 中性描边 ③`.btn.danger` 淡红底 ④tertiary＝局部小工具（`.batch button` 那种"应用到全部"，`--surface` 底 + `--accent` 文字 + 中性描边）。以前 `.batch button` 跟 `.btn.primary` 的CSS**一模一样**，导致一个批量填充小工具跟"提交整个表单"视觉权重相同。

**两条连带规矩**：
- **段落标题（`.subhead`）不许用强调色**，用 `--text` + 字重。用 `--accent` 会跟同屏按钮同色，读起来像可点的链接。
- **分段控件的选中态不能长得像按钮**（`.plan-mode-toggle`/`.pm-btn`）：现在是"`--surface-2` 凹槽 + `--surface` 浮起滑块"，不是"淡绿底+绿描边+绿字"。后者会让一屏出现四个语义完全不同却同色的绿。

## 在还债务主页视觉改版：石墨hero卡 + 磨砂玻璃债务卡 + 灵动AI入口

顶部区域（原来是"债务管理"标题+5张平级KPI+朴素AI banner）整体重做过一轮，目标是解决"没有设计感、像默认样式堆出来的"这条反馈。改动只在视觉/交互层，`renderSummary()`/`renderDebts()`算的数字、`openDetail`/`payInstallment`这些底层函数完全没动。

**新增的一批CSS变量**（`--hair`/`--card-grad`/`--app-grad`/`--e1`/`--e2`/`--e3`/`--glass`/`--glass-border`/`--glass-hi`/`--graphite-a`/`--graphite-b`/`--graphite-text`/`--graphite-dim`/`--graphite-sheen`/`--text-faint`/`--accent-rgb`）——**四个块都要同步改**（裸`:root`+`prefers-color-scheme:dark`媒体查询里的`:root`、`:root[data-theme="light"]`、`:root[data-theme="dark"]`；早前这里写的是"三处"，是笔误，实际浅色深色各有两个块），这是这个文件一直以来的既有模式（明暗色靠系统偏好和手动切换两条路都要覆盖到），别漏改其中一处。`--e1/e2/e3`是三档elevation阴影（列表最轻、卡片中等、hero最重），跟原有全局唯一的`--shadow`并存，`--shadow`继续给这轮没碰的其它组件（sheet、modal、价格卡等）用，不要把它们批量替换成新token。

**顶部header**：原来的`<h1>债务管理</h1>`+`.asof`换成了手写"After Zero" wordmark + 圆形头像入口（`#topAvatarBtn`，点击复用"我的"页已有的`openAccountScreen()`）。**wordmark这个SVG是直接复用登录门`.gate-hw`那9个字母的`d`路径数据**（详见"登录门"一节），但渲染方式不同：登录门那份是`fill:none; stroke:currentColor`配合`stroke-dasharray`做逐笔画出的动画，这里是静态logo，去掉了`--i`/`--len`这两个动画专用属性和`hw-letter`class，直接`fill="currentColor"`把提取出的字形轮廓当实心字画——不用重新走一遍fontTools提取流程，两个地方的路径数据必须保持一致（以后如果改了登录门那份文案/字体，这里要跟着重新提取）。

**KPI区改成"一个石墨hero + 4个降权小指标"**：`renderSummary()`现在会分别写两个容器——`#heroCard`（固定的`.hero`外壳+JS每次重灌内部HTML，同`#summary`这种"外层壳子在HTML里、内容每次innerHTML替换"的既有模式）放"在还总负债"这一个数字，配一条"距归零 N%"进度条（`N = 已还本金/(已还本金+在还总负债)`，`zeroBase`为0时兜底显示0%不做除法）；`#summary`降级成2×2的`已还金额/经常性月供/在还笔数/已结清`小卡片网格。hero卡内有三团用`radial-gradient`+`blur`+`mix-blend-mode:screen`做的`.hero-puff`色雾，`heroDrift1/2/3`三条不同周期(8s/10s/12.5s)的`@keyframes`错开漂移，色调不变、纯做材质层次，`prefers-reduced-motion`会关掉。

**AI banner改成"灵动胶囊"**：`.ai-banner`从方角卡片改成全圆角胶囊，`::before`一圈用`background-size:220% 100%`+位移动画做的极淡描边扫光，`::after`一层`radial-gradient`呼吸光晕，图标从原来的"星芒"改成"对话气泡+魔法棒"组合（气泡是`stroke`路径，魔法棒是`.wand`一个`<g>`：一条`stroke`手柄+一个4角闪光菱形+两个小圆点"魔法尘"，`filter:drop-shadow`常驻微光+`wandGlow`呼吸透明度）。**没开通Premium时**（`.ai-banner:not(.is-ai)`）扫光/呼吸/魔法棒发光全部关掉，图标降级成中性灰色纯静态——发光本身被设计成一种"已解锁"的身份感，不是无条件的装饰。`.wand`的入场动效（"进入AI页面时摇两下再定住转成呼吸闪烁"，`.wand.cast`+`@keyframes wandCast`）已经在`#aiScreen`聊天式改版里接上，详见下面"AI 债务顾问"一节——这里的`.wand`只是静态图标，跟`#aiWelcomeWand`共用同一份CSS规则（同一个class名），两处图标路径数据也保持一致，改了一处要记得另一处同步。

**债务卡改成磨砂玻璃 + 左滑露出"销这期"，去掉原来"查看详情/销这期"两个并排按钮**：

- **⚠️踩过一个坑：玻璃卡的滑动按钮绝对不能用`position:absolute`叠在卡片正后方，必须跟卡片左右并排（flex sibling）**——`.debt-front`是`background:var(--glass)`（半透明，light下`rgba(255,255,255,.5)`）+`backdrop-filter:blur()`的磨砂玻璃，哪怕完全用它的不透明区域盖住正后方的东西，玻璃本身的透明度还是会让背后的颜色透出来（真机/截图都能看到卡片右边缘常驻一条蓝色"销这期"字样，不是间歇性的，是持续存在的）。修法是`.debt-row`（flex容器）里`.debt-front`（flex:0 0 100%）和`.debt-swipe-btn`（flex:0 0 92px）左右并排，关闭状态下按钮压根不在玻璃背后、没有任何东西可透；滑动只是把`.debt-row`整体`translateX`，把按钮从屏幕外移进来。**以后但凡是"半透明/玻璃质感容器 + 里面还要叠一层别的可交互内容"这种组合，先假设会透色，用并排/分层结构规避，不要想当然觉得"反正盖住了就行"。**
- **`.debt`（外层，`#debtList`的直接子元素）没有变过**——长按拖拽排序那套代码（`beginDrag`/`applyDragFrame`/`enterJiggle`等，见上面"在还债务自定义排序"一节）深度假设`$("debtList").children`直接就是可拖拽的卡片、每张卡片直接被`el.style.transform`设置纵向位移，所以这轮**没有**在`.debt`外面再套一层wrapper——`.debt-row`/`.debt-front`/`.debt-swipe-btn`都是`.debt`内部新增的结构，纵向拖拽位移仍然打在`.debt`本身，横向滑动位移打在内层的`.debt-row`，两者作用在不同元素上天然不冲突。
- **⚠️同一张卡片现在要同时支持"长按拖拽排序"(纵向)、"左滑露出销这期"(横向)、"点击进详情"(零位移)三种手势，靠一个统一的`onCardTouchStart`/`onCardPointerDown`（现在多接收一个`row`参数）里的"decided"状态机做判断，不是三套独立监听器**：横向位移先超10px阈值 → 判成`swiping`（这时会`clearTimeout`掉长按计时器，长按不会再触发）；纵向位移先超阈值、或者长按计时器先到点 → 维持原来的拖拽逻辑；全程零位移松手 → 两条路径都不`preventDefault`，交给浏览器原生合成的`click`事件，由`renderDebts()`里单独挂在`.debt-front`上的click监听器接手开详情。`jiggleMode`为true时横向位移不会被判成`swiping`（编辑模式下手势全部让给排序）。swipe结束用`row.__justDragged`标记防止紧接着的click把刚露出的按钮误关掉——这个模式**直接照抄自还款提醒页`initPaySwipe`那套已经验证过的写法**（见下面"还款提醒页"一节），没有发明新模式。
- **卡片不再显示原来的"借款金额"这一行**（只保留"剩余待还"），是为了让卡片更短更精致，原始借款金额还留在"查看详情"里能看到，是有意的取舍不是漏了。
- 卡片左侧原来的4px实色边框条（按利率红/黄/蓝区分严重度）换成了`.debt-front::before`一层同色系但极淡的`linear-gradient`色晕（`.debt.crit`/`.warn`/`.good`这三个class挂在外层`.debt`上，`sevClass`判断逻辑跟以前完全一样：`rate>=18`→crit，`>=10`→warn，否则good）。

**已结清列表的日期文字颜色**从`var(--good)`（蓝色）改成了`var(--text-faint)`——蓝色在这个位置显得突兀，绿色对勾图标已经足够表达"已完成"这层意思，日期不需要再抢一个强色。

**后来又删掉了`#count`（header下面那行"N笔在还 · M笔已清"）**：这行文字跟它正下方`.summary`网格里的"在还笔数"/"已结清"两张`.kpi`卡片说的是同一件事，是真实的信息冗余，删掉`#count`/`.asof`这个DOM节点，`renderSummary()`里也去掉了对应的`$("count").textContent=...`赋值。**同一时间点，"计算口径说明"（`#sumNote`，那三行"在还总负债=...；已还金额=...；经常性月供=..."的公式）改成了默认折叠**：这段文字之所以能收起，是因为三条公式现在都已经在各自的KPI卡片上有了轻量提示（hero卡"只算本金"角标对应第一条、"已还金额"卡的"另付利息¥Y"子行对应第二条、"经常性月供"卡新加的"不含一次性还清"子行对应第三条），公式说明本身降级成给较真用户看的补充细则，不需要默认占屏幕。折叠靠新增的`.note-toggle`（一个纯文字+chevron的小按钮，`#sumNoteToggle`）手动切换`display`，**没有用`<details>`/`<summary>`**——这个项目在"统计"页数据明细表那次已经明确弃用过原生`<details>`（见"统计"一节），这里延续同一个偏好，不要在类似场景里重新引入。
## 还款提醒页：hero卡片 + 左滑销这期——设计细节见`pay-tab-design` skill

"还款日"tab（`react/src/pay/`）顶部"最近还款日"hero卡+下方列表，卡片左滑露出"销这期"（同一动作在债务页/详情窗都叫这个名字，统一过一次）。

**⚠️列表的一行 = 一期，不是一笔债务，是本页最重要的一条当前事实**：`PayItem`按日期逐期展开（不是每笔债务只显示下一期），`amount`必须读这一期的`r.amount`（不能用`d.monthly`，先息后本这类计划每期金额不同）。

急迫程度4档阈值、分组(`dueBucket`)跟筛选(`PayFilter`)两套"7天内/30天内"语义为什么不同（互斥分段 vs 累计口径）、左滑手势实现细节（`__justDragged`标记复位坑）、筛选条5档+日历自定义天数改版，全部见`pay-tab-design` skill（`.claude/skills/pay-tab-design/SKILL.md`）。

**⚠️2026-08-04修的一个真机截图报的bug**：Hero卡原来只显示`items[0]`单独一笔（`react/src/pay/App.tsx`），同一天到期的其它债务会被吞掉——用户报的现象是"3天后有不止一笔要还，卡片却只显示一笔"。改成按"跟`items[0]`同一天"分组，笔数按`debt.id`去重、金额原样加总这些期次，名称显示成"test3 等6笔"这种形式，金额也是当天全部到期笔的合计，不再是单笔的数字。同一轮顺手在`PayList.tsx`的`section-label`（"下一期 · 12 期"这行）后面加了总金额（"· ¥XXX"），一眼看出这个筛选窗口内一共要还多少钱。

## 新增/编辑债务表单（`#editSheet`）——设计细节见`edit-sheet-design` skill

全项目最复杂的一块UI（公式生成器、批量设置还款日、`oneTimeStash`状态机）。`oneTimeStash`暂存机制、`planMode`切换、`#gFirstField`的DOM搬家技巧、批量设置日期确认框、29/30/31号限制、计息方式选择器+等额本金新增、`genPlan()`四舍五入/负数bug的完整排查过程，全部见`edit-sheet-design` skill（`.claude/skills/edit-sheet-design/SKILL.md`）。

**⚠️唯一提前抽出来的通用规则**：跟主表单共用同一个`<form>`、靠`display:none`切换显隐的子面板里的字段，不能带原生`required`属性——哪怕字段所在tab当前不可见，只要它是空的，点提交按钮就会被浏览器原生表单校验拦截，安卓WebView不会像桌面浏览器那样弹提示气泡，表现是"点了彻底没反应"，很难排查。校验都要挪到具体按钮的点击事件里手动`toast()`。

## 订阅UI基础设施：单一 Premium，只有买断（一次性）一种购买方式

> **⚠️ 这一节的历史已翻篇两次：早期是 Premium / Premium+ 两级分级 → 合并成"单一 Premium 一个 tier" → 2026-08-04 又去掉了月付/年付，只留买断。** 下面正文里凡是还提到"Premium+ / 分级 / hasPremiumPlus / 两个tab / 月付 / 年付"的描述都是**已作废的旧状态**，保留是为了让你读懂演进；当前真实状态以本框内和"AI 债务顾问"一节为准：
> - **产品决策（2026-08-04）**：去掉月付/年付两个入口，只留买断——面向负债人群的判断是"再背一笔按月/按年扣费"对这批用户心理阻力远大于一般记账App用户，一次性买断更符合"帮你摆脱债务"这个定位；长期变现路径改成买断打底、以后靠订阅做**增量**（不是唯一收入来源）。AI/云备份这两个有真实持续成本的功能靠既有的每日用量软上限兜住风险，不因为改成买断制就需要额外处理。
> - **只有一个 Premium**：数据模型 `PREMIUM_KEY`（`after-zero-premium-v1`）存 `{ premium: {method:"onetime"|"redeemed", at:ISO} | null }`，单字段——`method` 曾经还有 `"monthly"|"yearly"` 两个值，去掉入口后类型跟着收窄（`react/src/types.ts`），没有入口就不该留着这两个死值。`hasPremium()` = `!!premium.premium`，不读 `method` 的具体取值。加载时有一次性兼容迁移（旧 `premiumPlus` 字段搬进 `premium`，`billing` 不管原来是什么值现在统一归成 `"redeemed"`）。
> - **只有一张价卡**：`react/src/sheets/PremiumScreen.tsx` 的 `#premiumPrice` 只剩一张静态 `<div className="price-card">`（不再是可点击切换选中态的 `<button>`，`premiumPlanSel`/`Plan` 类型/`useState` 一并删除——只有一个选项，没有"选"这个动作），价格现价 ¥24、原价 ¥40 划线、"限时优惠"角标——**这个角标故意不用`.pc-badge`绿色实心胶囊**（跟"永久解锁"标签、卡片外框、下面"开通Premium"按钮撞成一片绿，四处同一个强调色挤在一小块区域会互相抢戏），改成纯文字弱化处理（`.pc-limited`）；卡片外框也去掉了常驻的 `.selected` 高亮（只剩一张卡时"选中态"这个语义已经不存在）。**具体数字（¥24/¥40/限时优惠）是产品决策，不是技术细节，改的时候别自己套别的框架（比如按百分比"省X%"去算）**——真机验证时用户明确纠正过这一点，"限时优惠"是紧迫感框架，不是"省了多少钱"的计算框架，两者逻辑不同。
> - **免费/付费边界**：图表查看、提前还款模拟器 → **免费**（零成本、桌面级、口碑引擎，删了门禁）；高级统计报表**导出 PDF/Excel**、云备份、AI → **付费**（导出在 `reportExportXlsxBtn`/`reportExportPdfBtn` 的 click handler 里判 `hasPremium()`，查看图表无门禁）。判断标准：有真实成本（服务器/算力）才收费，纯客户端零成本的不设障碍。
> - **兑换码**：`REDEEM_CODES = {"0000":"premium"}`；`applyRedeemTier` 写 `premium.premium={method:"redeemed",at}`。`__debugPremium` 状态只剩 `"premium"`/`"none"`。
> - **法律文案联动**：`docs/legal/会员服务协议.md` + `react/src/sheets/TermsScreen.tsx`"当前状态说明"那条原来写"买断、包月、包年三种购买方式的入口"，跟着改成"只提供买断（一次性）这一种购买方式"——**以后任何一次改变购买方式的产品决策，都要检查这两处法律文案是不是也要同步改**，它们描述的是同一件事的两份拷贝（`.md`是源文件，`TermsScreen.tsx`是渲染进App的硬编码版本），改一处忘另一处会导致法律文案和实际功能对不上。

## （旧版分级设计，已作废，仅存档）Premium(买断) + Premium+(月付/年付，分级)

早期是两级会员（更早之前是"Pro"/"AI"正交产品线，后改成"Premium"/"Premium+"分级：`hasPremium() = hasPremiumPlus() || !!premium.premium`），`PREMIUM_KEY`存`{premium, premiumPlus}`两个独立字段（一次性买断 vs `{billing:"monthly"|"yearly"|"redeemed"}`），调试钩子是`window.__debugPremium("premium"|"premiumPlus"|"none")`，兑换码`"0000"`兑换`"premiumPlus"`。`#premiumScreen`（Premium/Premium+两个tab切换）、`.terms-link`点开的`#termsScreen`等UI结构也已随React迁移收尾整体重做。完整设计细节、`Popover`/subpage返回键链等已作废的实现描述见git log（`git log -p -S "hasPremiumPlus" -- www/index.html`），当前状态以本节最上方的框为准。

## 提前还款收益模拟器（Premium）

> **⚠️ 渲染层已经翻篇：`#simScreen`（第八步，React迁移收尾）已经整体由React接管（`react/src/sheets/SimScreen.tsx`），`SIM_KEY`的读写也整体移交React（不再经过vanilla）。这一节记录的计算模型/简化取舍/持久化决策依然成立，是理解"为什么这么设计"的背景，具体实现细节以"React 迁移"一节"第八步"为准。**

债务详情窗（`#detailSheet`）"编辑"/"销这期"下面新增了"提前还款模拟"按钮（`#dSimulate`），点击后（`hasPremium()`门禁，未购买跳订阅页）打开新的整页浮层`#simScreen`，可以选"单次多还一笔"或"每期都多还"两种模式，输入金额+从第几期开始，测算"提前几个月还清、省多少利息"。

**计算模型故意不追4种计划生成器（`amort`/`equalfee`/`interestfirst`/`custom`）各自的原始逐行数学**——`equalfee`（信用卡等本等费）和`custom`（自定义）根本没有良定义的"月利率"概念，没法统一处理"注入一笔额外还款后怎么重新摊销"。改用`recompute()`已经对所有债务统一算出的三个派生值做标准等额本息模拟：`d.balance`（剩余本金）、`d.monthly`（当前月供，模拟时全程保持不变）、`d.rate`（`impliedAPR()`反推的实际年化）。新增的`amortForward(balance, i, M, extraAt)`/`simulatePrepay(d, mode, atPeriod, extra)`两个函数（在`impliedAPR`/`recompute`附近）就做这件事：给定月供不变，逐月摊销直到还清，`extraAt(monthIndex)`回调决定这个月要不要叠加一笔额外还款。**这是一个明确的简化取舍**：不管原始债务是等额本息、信用卡等本等费还是先息后本，模拟出来的"提前还清"效果都是按标准等额本息模型推算的，跟原始计划的逐行数字对不上是预期行为，不是bug。

`M <= interest`（月供还不够付利息，本金永远还不完）时`amortForward`返回`null`，UI层toast"月供不足以覆盖利息，无法测算"——这不该在正常数据下触发，但custom计划允许全0金额，属于防御性兜底。

**只持久化`{mode, extra}`（上次用的模式+金额），不记是哪笔债务/哪一期**：新增localStorage键`after-zero-simulate-v1`（`SIM_KEY`）。**这条决定当初的理由是"债务没有稳定id，记'哪笔债务'在删除/拖拽重排后会失效或指错对象"——这条理由现在已经是历史了**（债务后来加了真正的id字段，见"债务对象加了真正的id字段"一节，技术上完全可以记）。`SIM_KEY`的形状**刻意维持不变**：只记用户的数值习惯（模式+金额）而不记"上次模拟的是哪笔债务"，是产品层面的选择——这个模拟器本来就是"临时算一下、看个大概"的工具，没有"记住上次在哪笔债务上算过"的实际需求。`SimScreen.tsx`倒是借这次机会顺手补了一个之前没有的auto-close effect（这笔债务在模拟器开着的时候被删除/消失会自动关闭），这是识别度更高的正确性修复，跟`SIM_KEY`存不存debt id是两件事。

## 导航重排：tabbar从"债务/还款日/档案库/我的"改成"债务/还款日/统计/我的"

**这轮只做了大方向的结构调整，细节（比如统计tab要不要重新设计视觉、档案库子页面要不要单独打磨）明确留到下一轮**，别把这轮的实现当成"已经定稿的最终视觉"去精修。

**改动内容**：底部tabbar第3个位置从"档案库"换成新的"统计"（`data-view="report"`，把原来"我的"页里Premium门禁的"高级统计报表"整页浮层内容直接搬过来，详见下面"统计"一节）；"档案库"从tabbar撤下，改成"我的"页里的一张入口卡片（`#docsEntryBtn`），点开是新的整页浮层`#docsScreen`——内容（上传/文件列表/预览）跟以前一模一样，只是从"tab切换显隐的`.view`"换成了"点入口卡片推入的`.subpage`"，`renderFiles()`/`renderDocContent()`等函数完全没动，纯粹是外层容器换了一层。

**`.view`↔`.subpage`互换是这次改动的核心手法，值得记住**：这个项目原来有两套完全独立的"内容容器"机制——`.view`（4个tab之一，靠`data-view`属性 + JS给`.view.active`加/去class切换显隐，横向切换、没有返回箭头）和`.subpage`（从某处点进去、推入一个整页浮层，靠`.open`class控制、右上角没有但左上角有返回箭头、要接进`__handleBackButton`链）。**升级成主tab（报表：subpage→view）和降级成子页面（档案库：view→subpage）本质上是同一种操作反过来做**：只需要换外层容器的标签/class，内部子元素的id和JS逻辑完全不用动——`renderReportScreen()`不管自己挂在`#reportScreen`(subpage)还是`#view-report`(tab)下面，只要`#reportKpis`/`#reportCharts`这两个id还在，代码原封不动能跑。以后如果要"把某个入口从tab降级/从子页面升级"，直接照这个模式做：搬内容、换外层容器类型、接/摘`__handleBackButton`链、调整事件监听器（tab不需要back按钮监听器，subpage需要）。

**统计tab因为是"常驻可见"而不是"点开才存在"，触发渲染的时机必须从"点击入口时渲染一次"改成"数据变化时渲染"**：原来`openReportScreen()`点开时才调`renderReportScreen()`；现在挂进了`renderAll()`管线（`debts`数据一变就跟着重渲染），不然会出现"改了债务、切到统计tab却看到旧数据"这种问题。**这是"tab"和"subpage"两种容器在渲染时机上的本质区别，以后但凡把什么东西从subpage升级成tab，都要检查它原来是不是"打开时才渲染"，是的话必须挪进某个数据变化就会跑的公共渲染管线。**

**导出按钮的premium门禁逻辑也要跟着简化**：原来`reportExportXlsxBtn`点击时未开通会先`closeReportScreen()`再`openPremiumScreen()`（因为要先关掉自己这层subpage，不然订阅页会叠在报表页上面）；现在统计tab不是subpage、没有"关掉"这个概念，未开通直接`openPremiumScreen()`，订阅页作为新的subpage会正常叠在tab之上，返回时自动回到统计tab（tab本身不需要被关闭，也关不掉）。

**顺手一起修的两个真机反馈bug（跟导航重排本身无关，但是同一轮改的）**：
- 排序方式下拉框（`.sort-sel`/`#debtSortSel`）长按会选中文字+弹出`:focus-visible`的绿色描边——`user-select:none`对`<select>`这类原生表单控件在安卓WebView里不完全可靠（浏览器把它当"原生chrome"处理），必须显式在`select`自己身上再设一遍`-webkit-user-select:none`/`-webkit-touch-callout:none`才压得住；绿色描边是全局`:focus-visible`规则被WebView判定"这个控件需要可见焦点"触发的，这个控件是纯点按操作、不存在键盘导航场景，单独给它加`:focus-visible{outline:none}`关掉，不动全局规则（全局规则还要留给真正靠键盘/外接设备导航的场景用）。
- 债务卡片长按有蓝色底色一闪——`.debt`/`.debt-row`/`.debt-front`都是`<div>`不是`<button>`，接不到全局`button{-webkit-tap-highlight-color:transparent}`那条规则，安卓WebView默认的原生"点按高亮"（半透明蓝）在长按触发拖拽排序手势时会闪一下。三层都单独加了`-webkit-tap-highlight-color:transparent`。

  **⚠️2026-07-29改成全局关闭，不要再逐个class补了**：这个bug前后被真机报了三轮（债务卡片 → 档案库文件行`.file-row` → AI历史对话行`.backup-row`），每次都是"又新增了一个可点击的`<div>`、又忘了补那一行"。根因是**逐个补这个策略本身**就注定漏——`-webkit-tap-highlight-color`是**继承属性**，在`body`上设一次就覆盖全站所有后代。现在`body { -webkit-tap-highlight-color: transparent; }`是唯一需要的那一行，`button`/`.debt`那几处保留着只是无害的冗余。关掉原生高亮之后"按下去有反应"由项目自己的`:active`规则负责（`button:active, .file-row:active, .backup-row:active { filter: brightness(.94) }`），**以后新增可点击的`<div>`，要操心的是给它配一条`:active`反馈，而不是关tap-highlight**。

## 统计（原"高级统计报表"，已从"我的"页Premium子页升级成主tab）

> **⚠️ 这一节标题下面到"云备份"一节之前，绝大部分记的是 2026-07-29～30 那个"看板"版本
> （石墨hero + 常驻KPI + `.viz-block`卡片墙 + 6行总结）的演进过程——`Hero.tsx`/
> `PressureChart.tsx`/`PayoffLine.tsx`/`BalanceBars.tsx`/`TypeStack.tsx`/`SummaryCard.tsx`
> 这几个文件在 2026-07-31 已经**整个删除**，那套"看板"结构不再是当前代码。**当前状态以
> 紧跟在这条提示后面的"统计页整体重做"子节为准**，下面那些子节整段保留是为了如实记录
> "为什么当年那样设计、后来发现了什么问题"的过程，其中大部分口径/数据正确性的教训
> （逾期不混进未来月份、X轴按真实时间比例、`amount`不能独立算高度等）在这次重写里
> 原样继承，只是外层组件和视觉结构整个换了。

### 统计页整体重做：从"看板"到"债务报告"（2026-07-31）

**起因**：用户看真机截图直接指出"这个统计页就low死了，图表大面积用同一种颜色…尽显后台
数据看板"。排查确认这不是主观感受——统计页是全 App 唯一有 ⋮ 三点菜单、纯文字排序切换器、
色块图例的页面，这几个部件在其余三个 tab 一次都没出现过，读起来像另一个产品的后台。
经过一轮小改（配色）→ 三套静态原型对比（`prototypes/report-redesign/`，独立目录不进
构建、不碰正式代码，过程和踩过的坑见该目录 `README.md`）→ 用户选定"债务洞察叙事"方案
后，把结构和交互完整搬进 `react/src/report/`，替换了原来的"看板"结构。

**删除**：`Hero.tsx`（石墨hero+4常驻KPI）、`PressureChart.tsx`、`PayoffLine.tsx`、
`BalanceBars.tsx`、`TypeStack.tsx`、`SummaryCard.tsx`——原来"石墨hero + 4个viz-block
卡片墙 + 6行key-value总结"这套结构整个不存在了。

**新结构**（"先给判断，再给证据"，不再是"整页铺数据"）：
```
ReportHead.tsx   报告头：判断句标题 + 总额/笔数/进度/还清日期写进句子里的导语
Conclusions.tsx  三件值得注意的事 + 最该先动手的地方（展开 severity 最高的可行动结论）
Journey.tsx      还清进度：里程碑标在图上 + 拖动读数，不画坐标轴
Pressure.tsx     未来压力：面积/柱状两种模式可切换，点月看明细再点收起
Rank.tsx         钱压在哪几笔：累计占比达 70% 截断，不再固定 top 3
TypePie.tsx       这些债务是什么类型：可拖拽旋转的甜甜圈
Outro.tsx        结语 + 导出入口 + 计算口径说明
```
`findings.tsx`（新增，不是组件，是纯逻辑）是整套改版的核心——结论规则引擎，4条候选各带
触发条件、severity 公式、`actionable` 标记，条件不成立就整条不出现（不是显示一条"0笔"
的空壳）：

| 结论 | 触发条件 | severity | actionable |
|---|---|---|---|
| 利息集中度 | 单笔占剩余待付利息 ≥30% | 该占比×100 | ✓ |
| 高息债务 | 存在年化 ≥18% 的债务 | 余额占比×100+(最高年化−18)×2 | ✓ |
| 还款峰值月 | 峰值÷月均 ≥1.5 | (倍数−1)×60，封顶100 | ✓ |
| 利息负担分档 | 恒成立 | 轻10/中45/重80 | ✗（纯陈述，不会被选成"最该先动手"） |

"三件值得注意的事" = 按 severity 取前3（不限 actionable）；"最该先动手的地方" = actionable
里 severity 最高的那条展开，展开内容由结论自己提供。

**为什么需要这套规则、不能写死结论**：原型第一版有一句写死的话"N 笔网贷吃掉了大部分利息"，
在用户提供的真实数据下**是假的**——那批网贷占余额 12.0%、占剩余待付利息 12.9%，几乎等比例，
谈不上"大部分"；真正吃利息的是一笔年化只有 5.79%（全场最低）的银行贷，因为金额大、期限长，
一笔占剩余待付利息 41%。**高利率 ≠ 高剩余利息，这两件事必须分开算、分开说**——利率高低看
`.rate`，实际要付多少利息要看 `remainingInterest(d)` 现算，两者经常指向不同的债务。这正是
`findings.tsx`第一条规则（利息集中度）存在的理由，也是"高息债务"那条改成只陈述事实（几笔/
占余额多少/利率区间）、不再断言"吃掉大部分利息"的原因——那个断言现在由"利息集中度"规则
去验证是否成立，不能想当然。

**配色**：`--ch-mag`/`--ch-cost`/`--ch-line` 三色角色制替代原来的`--ch-line`/`--ch-bar`
两色（`--ch-bar` 整个删除），新增 `--risk`/`--calm` 风险二档、`--pie-1..6` 分类色，
`--ch-principal`/`--ch-interest`（压力图堆叠柱）保留不动。完整token表和踩过的验证坑见
上面"图表色板"一节。

**几处交互细节**：
- **走势图不画坐标轴**——这是判断不是漏了。三个里程碑（今天/还掉一半/归零）已经把关键
  锚点标在图上，再画Y轴刻度和X轴时间刻度是同一份信息写两遍，而且会跟里程碑标签抢位置。
  精确值改由拖动读数承担（复用原有的 `chartScrub.ts`），拖动时里程碑淡到 0.18 避免两套
  标签打架。
- **压力图默认堆叠面积，可切柱状**，模式存组件本地state**不持久化**（重开App回到默认
  面积图），切换时保留当前选中的月份。**切换模式时卡片高度和坐标轴必须纹丝不动**——
  给"峰值"标注留的头顶空间放在两种模式共用的 `.pcanvas`（18px），不能只给一种模式加
  （原型阶段真出过"切到柱状卡片整体拉长14px"的问题）；也不能直接给 `.achart`/`.pbars`
  加padding（`.achart`里绝对定位的游标竖线/圆点的坐标是相对padding box算的，一加padding
  整套坐标就偏）。头顶空间本身不能省——外层 `.ascroll` 有 `overflow-x:auto`，
  **overflow-x一旦不是visible，overflow-y也会被强制成非visible**，伸到容器外的东西
  会被整个裁掉。
- **排行不再固定前3笔，改成累计占比达70%为止**（`Rank.tsx`的`COVER`常量），债务越集中
  列得越少，标题"前N笔占了X%"两个数都是算出来的。展开/收起按钮用 `--accent`（跟"计算
  口径说明"同色）不用蓝色——蓝色在这一页是数据色（`--calm`，排行条里"非高息债务"），
  同一个颜色既当数据编码又当交互控件色会让人以为按钮跟"蓝色那批债务"有关。
- **类型占比从堆叠横条改成可拖拽旋转的甜甜圈**（`TypePie.tsx`+`pieRotate.ts`）。标签
  **贴容器左右边缘 + 折线引线**，不是沿半径方向直着往外放——后者在扇区转到正左/正右时
  水平空间只剩 60 多px，标签放不下，半径只能压到62；改成贴边缘后水平空间跟角度无关，
  半径能给到76。**文字本身不跟着转**，只有位置(left/top)跟着扇区转，避免转到下半圈时
  文字是倒的。旋转手势跟这个项目手势代码的老规矩一致：Touch Events + `{passive:false}`，
  角度不进React state（拖拽期间每帧setState会让整棵子树重渲染、手势发顿），存在ref里，
  回调直接改DOM。

**⚠️两个真实踩过的bug**：
1. **`.fill`（排行条/结论展开块的填充条）是`<span>`，默认`display:inline`，inline元素
   会静默忽略`width`**——内联样式`width:68.9%`算对了却完全不生效，界面上只剩空的灰色
   底槽，条形长度差异和颜色一起消失。这个bug先在原型阶段被用户截图指出来过一次，正式
   重写`Conclusions.tsx`时同一个模式又写了一遍（`.act-item .fill`），修法都是补
   `display:block`。**这类"尺寸被静默忽略"的问题肉眼很难在整页截图里发现**（条形只有
   6px高），以后新增任何"用一个`<span>`当填充条"的地方，先确认它有没有被blockify。
2. **四个tab的React树在App启动时同时挂载，`#view-report`初始`display:none`**，此刻
   饼图容器`.pie-wrap`的`clientWidth`是0，`TypePie.tsx`的几何计算`apply()`第一句就
   `if (!W) return`，扇区和标签一个都画不出来；之后切到统计tab只是把`display`改回
   `block`，既不触发window resize也不触发React重渲染，饼图永远是空的。**jsdom测试
   因为测试里把`clientWidth`打了桩反而是通过的**，真实浏览器（Playwright无头模式，
   跟真机同一套渲染管线）才量出"扇区0个、引线0条"。修法是加`ResizeObserver`监听
   `.pie-wrap`，元素从0宽变成有宽度时会触发重新计算。**教训：任何依赖容器实际尺寸
   （`clientWidth`/`getBoundingClientRect`）做初始渲染的组件，如果它可能挂载在一个
   当前不可见（`display:none`）的容器里，必须用`ResizeObserver`兜底，不能只信
   `useLayoutEffect`跑一次就够——这类问题jsdom测试打桩之后测不出来，必须过一轮真实
   浏览器/真机验证。**

**验证**：`tsc --noEmit`零错误，`npm test`（calc.js套件）102个不受影响，`test:react`
306个→308个（删除6个过时测试文件，新增`findings.test.tsx`/`Pressure.test.tsx`/
`Rank.test.tsx`/`Journey.test.tsx`/`TypePie.test.tsx`共36条用例），`build:react`
（`report.js`23.22kB→49.89kB）。Playwright用12笔真实形状债务（按用户提供的真机截图
反推的余额/类型分布：银行贷/信用卡分期/网贷三类合计分别等于35,711/16,208/7,069，这个
约束下类型分配唯一）跑浅深两套主题：6个段落顺序正确、结论条数按规则算出、act-list
填充条形有正确的宽度占比（不是空槽）、切换面积/柱状卡片高度零变化、两种模式峰值标注
都在、点月出明细再点收起、饼图3扇区3引线、导出菜单两项，零JS报错零横向溢出。`npx cap
sync android`+`assembleRelease`后解包核对：APK内`index.html`跟工作区`diff`完全一致，
`report.js`里新文案（"债务体检"/"最该先动手的地方"/"导出这份报告"）和`ResizeObserver`
补丁都在。

---

**以下压缩自这个页面"看板"版本时期（2026-07-28～30）的完整演进史**——`Hero.tsx`/`PressureChart.tsx`/`PayoffLine.tsx`/`BalanceBars.tsx`/`TypeStack.tsx`/`SummaryCard.tsx`/`MonthlyChart.tsx`/`ReportTables.tsx`等文件、`renderReportScreen()`等vanilla函数早已不是当前代码，具体的P0/P1/P2/BUG编号narrative和逐项UI改版细节见`git log -p -- CLAUDE.md`；这里只留下**跨版本依然成立的技术事实**：

**导出（`exportReportXlsx`/`exportReportPdf`）100%vanilla，从看板版沿用至今，未受统计页重写影响**：
- `jspdf@2.5.1`/`xlsx@0.20.2`本地打包在`www/js/`（`jspdf.umd.min.js`/`xlsx.full.min.js`），**不走CDN**——国内移动网络下`cdn.jsdelivr.net`/`cdn.sheetjs.com`常加载失败，真机点导出会弹"组件未就绪"、桌面浏览器却测不出来（能连通CDN）。以后引入任何第三方前端库都应下载到`www/js/`本地引入，别用国内不稳的CDN（CloudBase那三个`static.cloudbase.net`脚本是例外，腾讯自家CDN国内稳）。
- PDF导出**不克隆屏幕上用CSS变量取色的SVG去截图**——`var(--accent)`脱离页面样式表解析不出来，会渲染成黑色/空白。改用`buildExportChartsSVG(data)`生成颜色写死成字面hex值的独立SVG，走`svgStringToPngDataURL()`转PNG贴进jsPDF。**标题/KPI/数据明细表文字也整段栅格化**（不用`doc.text()`）——jsPDF内置字体不含中文字形，中文文字用`doc.text()`画完全画不出来；代价是PDF文字不可选中。表格按约34行/页用`buildTablePagesSVG()`分页。PDF固定浅色配色，不跟随设备深色模式（打印品浅色更易读）。
- "债务类型占比"按`d.type`（4个固定选项，超6类折叠"其他"）分组，不按自由文本的`d.funder`。

**几条跨版本延续的工程教训**（具体UI已被2026-07-31重写取代，但这些判断依然适用）：
- **图表交互按数据形状分两档**：连续时间序列图用真正的press+drag scrub手势（`chartScrub.ts`，Touch Events + `{passive:false}`）；离散分类图只需要普通`onClick`高亮，不需要scrub这套重手势基础设施。
- **新增数据维度不要塞进`computeReportData()`的返回对象**——它被导出函数按字段名精确解构，改形状会同时打断两个导出功能，新维度独立成新函数。
- **`Popover`的stacking context坑**：`position:fixed`只改定位参照，不脱离祖先stacking context——挂在`overflow:hidden`容器内即使坐标对了也点不到，需要`createPortal(panel, document.body)`真正挂到body下。以后任何"贴触发器展开的浮层"如果"位置对但点不到"，先怀疑这个坑。
- **`--accent-soft`一类"卡片浅底"色不能当图表填充色**——对比度可能低到1.14:1、等于隐形，这类判断必须跑`dataviz` skill的`validate_palette.js`验证，不能凭肉眼。
- **SVG图表+覆盖其上的HTML标记，两者的定位参照必须是同一个盒子**——`.chart-plot`一度带了`padding-left`刻度槽而绝对定位子元素百分比是相对"含padding整宽"算的，导致标记点和scrub手势的命中位置都systematically偏移，修法是另起一层不带padding的绘图区当唯一坐标系。
- **"它有文档说明"不构成保留一个反直觉口径的理由**——用户不会读footnote，只会看到反直觉的数字，文档解释不了的行为就是bug。
- **用户报的现象和真正的bug可能是两回事，但都要查到底**——为了证伪一个误报而做的像素级检查，可能顺带挖出别的真bug，不能"复现不出来就说没问题"。

## 云备份（Premium）——设计细节见`cloud-backup-design` skill

"我的"页"云备份"入口打开`#backupScreen`（`react/src/sheets/BackupScreen.tsx`）：手动、每次创建一条独立备份记录（不是自动同步/覆盖），5个云函数+配额数字+集合寻址方式+客户端恢复逻辑+真机验证边界，全部见`cloud-backup-design` skill（`.claude/skills/cloud-backup-design/SKILL.md`）。

**⚠️这条是跨功能的核心认证修复，AI债务顾问也依赖同一套，别挪进skill**：早期`ensureCbAuthReady()`无条件调`signInAnonymously()`垫底（绕开CloudBase SDK对null凭证读`.scope`的崩溃bug），但这会把微信自定义登录建立的"非匿名"会话**降级成匿名**，导致任何云函数调用命中权限规则被拒`[PERMISSION_DENIED]`。修法：`ensureCbAuthReady()`改成只在本地**连`account`记录都没有**时才`signInAnonymously()`——用`account`这个自己可靠掌握的信号判断"是否已登录"，比猜SDK内部登录态形状稳妥。新增`cbAuth()`统一入口（`cbApp().auth({persistence:"local"})`显式要求会话持久化），**所有拿auth的地方都走`cbAuth()`，别再直接`cbApp().auth()`**。桌面浏览器伪造`account`跳过登录门的老技巧对**任何调云函数的功能都不适用**——会让`ensureCbAuthReady()`误判已登录、连匿名会话都没有，这类功能的真实端到端往返必须真机验证。

## 档案库PDF预览：`<embed type="application/pdf">`在安卓WebView里天生是空白的，改用pdf.js真正渲染（2026-07-30）

档案库（`react/src/sheets/DocsScreen.tsx`）点开一个PDF文件，原来的预览是`<embed src={objectURL} type="application/pdf">`——桌面Chrome测试时看着是好的，真机上点开是一片空白，用户报了上来。

**根因是AOSP层面的能力缺口，不是哪个品牌的定制问题**：`<embed>`/`<object>`能不能显示PDF内容，取决于浏览器有没有内置PDF渲染插件——桌面Chrome自带PDFium插件，安卓系统WebView从来没有这个东西。这跟"哪个手机牌子"无关，装什么ROM都一样，纯粹是WebView这个组件本身的缺口。代码里当年其实留了一句"若空白说明此设备浏览器不支持内嵌PDF预览"的footnote，说明这是当时就知道、但没真正解决的一个缺口。

**修法：本地打包pdf.js（Mozilla开源PDF渲染库），把每一页真正解码画到`<canvas>`上，多页纵向堆叠**，不再依赖设备浏览器有没有PDF插件。具体做法刻意跟`jspdf`/`xlsx`那两个既有的本地库走**不同**的接入方式：

- **不是npm依赖，不参与Vite打包**——`www/js/pdf.min.mjs`（主库）+`www/js/pdf.worker.min.mjs`（worker）是从`pdfjs-dist@6.2.108`包里手动复制出来的构建产物两个文件（`legacy/build/`目录下那两个，不是默认的`build/`目录），跟`jspdf.umd.min.js`/`xlsx.full.min.js`同一类"本地静态资源、进git、不进`package.json`"。**用`legacy`构建不用默认构建**——这个App的minSdk覆盖到安卓7，`legacy`构建是pdf.js官方专门为"不支持最新JS特性的环境"准备的更保守版本，兼容性优先于体积。
- **必须用ES module方式引入，不能像jspdf/xlsx那样用classic `<script src>`**——`pdf.mjs`本身是`export`语法写的ES模块，`www/index.html`里用一段行内`<script type="module">`把它`import`进来、挂成`window.pdfjsLib`全局（`pdfjsLib.GlobalWorkerOptions.workerSrc = "js/pdf.worker.min.mjs"`），供`sheets.js`（React代码）跨模块边界读取。**这段module script必须排在react-debts那几个module script之前**——`type="module"`脚本按文档里出现的相对顺序依次执行，这条要先跑完，`window.pdfjsLib`才能在`DocsScreen.tsx`的effect跑之前就绪。
  - `workerSrc`设成纯字符串`"js/pdf.worker.min.mjs"`（不是`import`specifier，是运行时传给`new Worker()`的一个值）——pdf.js内部会自动用`new Worker(workerSrc, {type:"module"})`创建worker（已读源码确认，不需要额外配置`type:"module"`），这个字符串按**文档baseURL**解析（不是按调用它的那个JS文件的URL解析），跟`<script src="js/calc.js">`这类路径是同一个解析方式，所以能直接写成相对路径。
- pdf.js本身没有静态导入其它文件（读源码确认过，只有一处跟sandbox相关的动态`import()`，普通PDF预览用不到，不影响）。

**桌面Playwright真实验证过（不是只跑单元测试）**：本地http server起服务，用`setInputFiles`上传一份真实生成的测试PDF（单页+3页两种都测过），检查渲染出的canvas数量匹配页数、且用`getImageData`确认canvas里画了真实非空白像素（不是空画布）、截图肉眼确认PDF文字内容确实显示出来了，深色模式下背景正确跟随主题（PDF页面内容本身固定白底黑字，这是PDF文件原本的样子，不需要跟着App主题变色，等同一张扫描件）。**这次没有引入npm测试依赖**——`react/__tests__/DocsScreen.test.tsx`的单元测试用`vi.fn()`打桩`window.pdfjsLib`和`window.fetch`（jsdom既不能真的`fetch(blob:)`也没有`window.pdfjsLib`），`canvas.getContext("2d")`在jsdom里恒为`null`（没装`canvas`这个npm包），组件对此已有判空保护(`if (ctx) await page.render(...)`)，测试断言止步于"渲染出了正确数量的canvas元素"，真实像素级验证只在上面这轮桌面Playwright手工验证里做。

**⚠️踩了一个React+命令式DOM混用的坑，类型是"React的虚拟DOM和手工DOM操作互相打架"**：第一版把"正在加载PDF…"这行提示和`containerRef`绑定的canvas容器塞进了**同一个**DOM节点里——effect里`container.innerHTML = ""`会把React自己渲染的那个提示`<div>`也清空掉，等`status`变化触发重渲染、React想去移除它记忆中的那个子节点时，那个节点早被我们自己删了，报`NotFoundError: The node to be removed is not a child of this node`。**修法：把"加载中"提示挪成`containerRef`那个div的兄弟节点，`containerRef`绑的div在JSX里永远不渲染任何子节点**——这样对React来说这个div的子节点列表永远是空的，重渲染时压根不会去碰它内部任何东西，我们才能放心用`appendChild`/`innerHTML`直接操作它。**以后凡是"React管理的容器 + 里面还要塞命令式操作的DOM内容"（这个项目里`gestures.ts`/`chartScrub.ts`也是同一类模式），那个被命令式操作的DOM节点的JSX里必须永远保持零子节点，任何声明式渲染的兄弟内容都不能塞进同一个节点，哪怕看起来只是"加一行提示文字"这么小的改动。**

**真机验证仍然待做**：桌面Chromium和安卓WebView都是Chromium内核，`fetch(blob:)`/`Worker(type:"module")`这两个真正跨设备风险点在桌面已经验证是通的，理论上真机大概率一致；但按这个项目一贯的规矩（"必须真机验证"这条红线只对`SaveFile`/`WeChatLogin`等原生插件严格适用，PDF预览走的是纯Web标准API不是原生插件），这次没有走完整的编译APK真机流程，建议下次装机测试时顺手点开档案库里的PDF确认一遍。

## 字体：`www/fonts/`

`www/fonts/Inter-Variable-Latin.woff2`（+ `OFL.txt`许可证文本）不是随手丢进去的孤立文件，是`www/index.html`里`@font-face`引用的本地字体资源，`npx cap sync`会把整个`www/`文件夹（不只是`index.html`一个文件）打包进APK，所以这样引用没问题。**只包含拉丁字母/数字（`unicode-range`限定），不含中文字形**——这是故意的：完整内嵌一个覆盖几千汉字的中文字体体积会到几MB到十几MB，塞进这个项目不现实。中文文字会自动落到`--font-ui`变量里排在后面的系统字体（`"PingFang SC"`等），不受这个字体文件影响。别看着这个目录只有两个文件就以为是没清理干净的临时产物。

## 登录门："After Zero"手写字样：`www/img/app-icon.png` + `#loginGate`里的`.gate-hw` SVG

登录门（`#loginGate`）顶部是App图标原图（`www/img/app-icon.png`，从`resources/icon-only.png`原样复制、缩小到320×320），下方"After Zero"是手写笔迹逐字画出来的动画（`www/index.html`里`class="gate-hw"`的那段SVG）。

**这段SVG里每个字母的`<path d="...">`坐标不是手画的，是用`fontTools`从开源手写字体`Caveat`（Google Fonts，OFL协议，跟`www/fonts/`那个Inter同协议）精确提取出来的真实字形轮廓**——这是吸取了之前"手绘火柴人走路动画"失败的教训后改的路线：手绘/AI生成的图形效果不可控，字体文件里的矢量数据是精确、可复现的。每个`<path>`的`style="--i:N;--len:X"`里，`--i`是这个字母的顺序（用来做逐字错开的`animation-delay`），`--len`是这条路径的**真实几何长度**（用`svgpathtools`算出来的，不是`pathLength`标准化值——踩过一个坑：本机用来验证效果的`resvg`渲染工具不支持SVG的`pathLength`属性对`stroke-dasharray`/`stroke-dashoffset`计算的归一化效果，导致一开始怎么调都看不出动画在动，改成用真实长度才验证通过）。CSS部分是标准的"描边逐笔画出"技法：`stroke-dasharray:var(--len); stroke-dashoffset:var(--len)` → 动画到`stroke-dashoffset:0`。

**以后如果要改这行文字（换成别的文案）或者换字体，不能直接手改这些`d`坐标**——那样跟手绘瞎猜没区别。正确做法是重新走一遍提取流程：`pip3 install fonttools svgpathtools`，下载目标字体文件，写一个小脚本用`fontTools.pens.svgPathPen.SVGPathPen`重新提取新文字每个字符的路径+用`hmtx`表算前进宽度排版，再用`svgpathtools`的`parse_path(d).length()`算每条路径的真实长度填到`--len`——这套流程本身不难，但没有这几个库/这个思路的话，容易掉回"手画字形"这个老坑。

**"微信登录"按钮里的图标同理，不是手画的**：用的是开源图标库[Simple Icons](https://simpleicons.org)里收录的官方微信图形矢量数据（`https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/wechat.svg`，CC0协议，可自由使用），`viewBox="0 0 24 24"`配合`fill="currentColor"`直接抄进`.btn-ic`（这个项目已有的"按钮内图标"通用class，别的按钮比如"编辑"也在用），颜色自动跟着`.btn.primary`的白色文字走，不用单独指定。

**登录门的按钮不是一直显示的——延迟到"After Zero"手写完才淡入出现**：`.login-gate .data-actions`默认`opacity:0`+`pointer-events:none`，`.login-gate.open`时播放`gateBtnIn`动画，`animation-delay: 1.45s`。**这个1.45s是手算出来的，不是自动跟着手写动画走的**：手写动画9个字母，`animation-delay: calc(var(--i) * 90ms + 150ms)`，最后一个字母（`--i:8`）结束于 8×90+150+500=1370ms，按钮延迟在这基础上多留约80ms（1450ms）。**以后如果改了"After Zero"这几个字（字母数变了）或者改了逐字延迟/动画时长这些参数，这个1.45s要跟着手动重新算，不会自动同步**——这是两段独立CSS动画靠一个手算的时间常数耦合起来的，编译器/浏览器都不会提醒你算错了，只会导致按钮出现得太早（手写还没画完）或太晚（凭空停顿一截）。

## App图标：`resources/`

`resources/icon-only.png`、`icon-foreground.png`、`icon-background.png` 是App启动图标的设计源文件（1254×1254），不是随手放的孤立图片。`icon-background.png` 是纯黑白左右对半分的通栏底色，`icon-foreground.png` 是透明底的"门/0 + 走路的人"图形（黑白根据所在半边跟随反转，只留描边保证两边都看得清）。

真正编译进APK的是 `android/app/src/main/res/mipmap-*/` 下那一整套图标文件——那些是用 [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets) 从 `resources/` 这三个源文件生成的（`npx @capacitor/assets generate --android`），不要手动改mipmap下的PNG，改了下次重新生成会被覆盖；要调整图标，改 `resources/` 里的源文件后重新跑生成命令。

**踩过一个坑**：`@capacitor/assets` 默认会给 `mipmap-anydpi-v26/ic_launcher.xml`（自适应图标配置）里的 `<background>` 和 `<foreground>` 都套一层 `16.7%` 的内缩（`<inset>`）。这对本项目不对——`icon-background.png` 设计上就是要通栏铺满到边缘的（黑白对半分），内缩之后四周会露出一圈透明，实机上大概率透出桌面壁纸/系统默认色，很难看。所以 `<background>` 这层的inset已经手动去掉了（保留 `<foreground>` 的inset，因为 `icon-foreground.png` 里的图形本身上下几乎顶到画布边缘，需要靠内缩才不会被圆形/方形等不同launcher遮罩裁掉）——**以后如果重新跑 `@capacitor/assets generate`，它会把 `<background>` 的inset加回去，记得再删一次。**

## AI 债务顾问（Premium）——设计细节见`ai-advisor-design` skill

"在还债务"页AI banner是入口（`hasPremium()`门禁），聊天式界面（`react/src/sheets/AiScreen.tsx`）。欢迎态芯片、云函数模型选型（`hy3`混元，DeepSeek被套餐锁住）、每日用量软上限、历史对话可继续追问的状态机、z-index坑，全部见`ai-advisor-design` skill（`.claude/skills/ai-advisor-design/SKILL.md`）。

真实"生成报告/追问"往返依赖真实微信登录会话，跟云备份同一条限制（见上面"云备份"一节），桌面/CLI都测不出，必须真机验证。

**2026-08-04又改了两处**：①`buildAiSummary()`（`www/index.html`）原来只传"月供"这一个笼统数字，先息后本/等本等费这类每期金额不同的贷款AI看不到后面某期本金会跳涨、答出跟真实计划表矛盾的结论（真机报的bug），改成每笔债务连完整逐期还款计划表（日期/金额/本金/利息/是否已还）+计息方式都传过去。②新增`AiLimitModal.tsx`——首次进AI页面（等魔法棒0.75s施法动效播完再弹）和真撞到20次/天上限时，弹一个说明"App免费、AI有真实成本、所以限量"的弹窗，带"复制完整分析提示词"按钮（内容=同一份`buildAiSummary()`JSON+雪球/雪崩法说明），可以粘贴给豆包等外部AI助手继续问，等于零成本给了一条"无限量"的退路。弹窗进场动画是手写CSS弹性缓动曲线，没有引入动画库——这个项目所有动效一直是这个路子。

## 隐私政策 / 用户服务协议 / 会员服务协议 + "关于我们"入口（2026-07-31新增）

App 之前**完全没有**任何地方展示《隐私政策》《用户协议》——微信登录+处理个人信息的 App 理论上该有，且`react/src/sheets/TermsScreen.tsx`原来显示的是一份假设"应用商店计费"的占位条款（用户自己确认"当时是乱写的"）。这一轮把三份真正的法律文档接了进去，源文本在`docs/legal/`（`隐私政策.md`/`用户服务协议.md`/`会员服务协议.md`），基于一木记账同类文档的结构参考+App当前真实功能整理，不是照抄，也不虚构不存在的数据收集行为（比如没有一木那些微博/QQ/友盟/百度语音/支付宝SDK，就没往里塞）。

**"个人信息收集清单"调研结论，决定了这次没照抄一木的做法**：查过工信部/网信办App专项治理系列文件，法定强制要求的是**隐私政策正文本身**逐一列出收集的个人信息类型/目的/方式/范围，没有查到"必须再单独拆成一个可导航的清单页面"这条强制规定——一木记账那套"账号信息/订单信息/服务内容信息"三级菜单是自愿选择的呈现方式，不是合规红线。这次判断：不做独立清单页（隐私政策正文已完整覆盖），"关于我们"里"账户与登录信息"这一行直接复用已有的`AccountScreen`（点开就能看到我们从微信拿到的真实数据自证），不新建页面；也没做"订单信息"占位入口——代码库里压根没有订单/交易数据模型，做一个点开空空如也的入口是负分体验，真正的"预留"落在《会员服务协议》"当前状态说明"那段文字里（如实写明价格是占位、真实支付渠道接入后会更新协议）。

**新增/改动的文件**：`react/src/sheets/PrivacyScreen.tsx`、`AgreementScreen.tsx`（全新）+ `TermsScreen.tsx`（内容整段替换成《会员服务协议》，**内部标识符`TermsScreen`/`openTermsScreen`/`closeTermsScreen`/`useTermsScreenOpen`/`window.__azTermsScreenBack`/`id="termsScreen"`全部保留原名不改**——参照`renderReportScreen()`那条先例，内部名字没跟着改不影响功能，是历史遗留，以后大改这块UI时可以顺手改名）。`react/src/sheets/AboutScreen.tsx`（新，"我的"页新入口，见下方）。`react/src/shared/state.ts`新增`aboutScreen`/`privacyScreen`/`agreementScreen`三对开关，完全照抄`accountScreen`/`premiumScreen`/`termsScreen`那套已有模式（布尔开关+独立`az:x-screen-changed`事件），没有发明新模式。`react/src/mine/DataCards.tsx`里原来模块内部的`EntryCard`改成了具名导出，供`AboutScreen.tsx`和`mine/App.tsx`共同复用。

**`AboutScreen`内容**：App图标+版本号（写死字符串常量`"1.0"`，需要跟`android/app/build.gradle`的`versionName`手动保持同步——这个项目没有任何"构建时把版本号注入JS"的机制）+ 联系邮箱 + 三份协议入口 + "账户与登录信息"（复用`AccountScreen`）。`PremiumScreen.tsx`那句"开通即表示你同意《购买者服务条款》…费用从你的应用商店账户中扣除"的footnote同一时间也改掉了——跟`onSubscribe()`里早就如实说明的"After Zero 还未上架应用商店"自相矛盾，是同一类"假设应用商店计费"的过时文案。

**Playwright验证时挖出两个真实bug（DOM挂载顺序+返回键链顺序都要对），详细成因和修法见上面"返回键处理"一节的"⚠️同一个z-index下…"那段**，这里不重复。

**正文排版**：三份新screen都用`className="terms-body"`（`TermsScreen.tsx`已有的排版规则），隐私政策"委托处理"那张SDK表格用`.md-tbl`包裹（现成的表格样式，档案库markdown预览也在用）。`.terms-body`原来只有`h3`/`p`/`.terms-note`三条规则，这次给富文本条款补了`h4`（二级小标题，比如"（一）账号登录信息"）和`ul`/`ol`/`li`（没有的话`<ul><li>`会退化成浏览器默认样式，跟其它段落字号不一致），`www/index.html`里CSS已经加上。**不搬运**每份`.md`源文件开头的"📝 起草说明"块——那是给开发者自己看的草稿备注，不是给最终用户看的内容。

**验证**：`test:react`306个用例全绿（新增`PrivacyScreen.test.tsx`/`AgreementScreen.test.tsx`/`AboutScreen.test.tsx`，更新`TermsScreen.test.tsx`/`PremiumScreen.test.tsx`/`MineApp.test.tsx`）、`tsc --noEmit`零错误、`build:react`正常（`sheets.js`93.68KB→138.99KB，符合新增大段法律文本的预期）、`npm test`（calc.js套件）102个不受影响。Playwright桌面验证：三份文档来回打开关闭、四层返回键（Privacy/Agreement/Terms/Account相对About）逐层正确回退，light/dark主题截图确认排版正常（SDK表格在窄屏下自动压缩换行，不溢出，是Playwright量出`scrollWidth===clientWidth`确认过的，不是眼看）。

## 云函数源码：`cloudbase/`

`cloudbase/functions/wxLogin/`是腾讯云开发（CloudBase）云函数的源码，服务端代码，负责微信登录时用`code`换`openid`、签发自定义登录票据（详见上面"原生插件：`WeChatLogin`"一节）。`cloudbase/functions/deleteAccount/`是配套的注销账户云函数，负责真正删除`users`集合里的用户文档，现在也负责联动清理云备份数据（详见上面"云备份（Premium）"一节）。`cloudbase/functions/backupCreate/`、`backupList/`、`backupRestore/`、`backupDelete/`、`backupUploadFile/`是云备份功能的5个云函数，读写`backups`集合+Storage文件，详见上面"云备份（Premium）"一节。`cloudbase/functions/aiAdvisor/`是 AI 债务顾问云函数，详见上面"AI 债务顾问（Premium）"一节。**这个目录不属于Capacitor/Android那套构建流程，`npx cap sync android`不会碰它，也不会自动部署**——改完要手动部署，部署命令/坑/验证方法见`cloudbase-deploy` skill。AppSecret等敏感配置只存在CloudBase云函数的环境变量里，不存在这个目录任何文件里，也不能加进来。

## 构建

```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
```

产出：`android/app/build/outputs/apk/debug/app-debug.apk`

**要测微信登录必须编译release包**（debug签名过不了微信的签名校验）——release签名文件位置、构建命令、丢失后果见`release-keystore` skill（`.claude/skills/release-keystore/SKILL.md`）。

## 本地网页测试（不用编译安卓包）

`www/index.html` 是纯前端文件，改完想快速验证效果，不必每次都走完整的 `npx cap sync android` + Gradle编译流程。用 `cd www && python3 -m http.server 8765`，然后浏览器打开 `http://localhost:8765` 就能测（Chrome桌面版即可）。

**别用 `file://` 直接双击打开来测。** `localStorage`/`IndexedDB` 是按协议+域名+端口（origin）隔离存储的，`file://` 协议下各浏览器对这两个存储API的限制不统一（尤其Chrome限制较多），行为跟安卓WebView里跑的真实情况不一致，容易测出假结果。用 `http://localhost` 这种标准origin更接近Capacitor WebView的真实环境。

**登录现在是强制的，桌面浏览器测试想跳过`#loginGate`（比如只是想测债务/档案库这些跟登录无关的功能），在devtools console手动执行一次即可**（`window.Capacitor.Plugins.WeChatLogin`在桌面浏览器里不存在，登录门里的按钮点了只会提示"仅支持安卓App内使用"，没法真正走通登录）：

```js
localStorage.setItem("after-zero-account-v1", JSON.stringify({openid:"test",nickname:"测试昵称",avatarUrl:"<任意https图片url>",loggedInAt:Date.now()}))
```

执行完刷新页面，登录门就会消失。

## 环境要求 & 已知坑

- **必须 JDK 21**，JDK 17 编译会报 `无效的源发行版：21`（Capacitor这个版本要求的）。
- **macOS + Homebrew装的`openjdk@21`默认不会链接到`java`命令**（Homebrew的openjdk是keg-only，不进`/usr/bin`，不改`JAVA_HOME`）。`java -version`可能直接报"Unable to locate a Java Runtime"，就算`brew install openjdk@21`已经装过了。跑Gradle时要显式指定：`JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug`（Apple Silicon路径；Intel Mac是`/usr/local/opt/openjdk@21`）。
- 需要安卓SDK的 `platform-tools` + `platforms;android-34` + `build-tools;34.0.0`。
- `android/local.properties` 要写 `sdk.dir=<SDK路径>`，这个文件因机器而异、已被gitignore，每台机器自己建。
- **如果在配了网络代理的 Claude Code session 里跑构建，或者 `git push`/`git pull` 到GitHub**：`sdkmanager` 装SDK组件、Gradle编译需要连 `dl.google.com` / `maven.google.com`，`git push` 需要连 `github.com`；这个session之前用的一个住宅代理连这些域名会失败（`dl.google.com`/`maven.google.com` 报连接重置 Recv failure，`github.com` 报 `Proxy CONNECT aborted`）。遇到这种情况，把要用到网络的命令加上 `env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy` 前缀去掉代理再跑，能直接连通。

## 硬性铁律，改代码前必看

1. **`localStorage` 的 KEY（在`www/index.html`里搜 `debt-manager-v5`）永远不能改。** 这是用户设备上保存真实数据的键名，改了等于让已经装过的app找不到自己原来存的数据，直接清零。同理，`DKEY`（`debt-manager-docs-v5`）、账号登录状态用的`ACCOUNT_KEY`（`after-zero-account-v1`）、在还债务排序方式用的`SORT_KEY`（`debt-manager-sort-v1`）、还款提醒通知设置用的`NOTIF_KEY`（`after-zero-notify-v1`）、订阅状态用的`PREMIUM_KEY`（`after-zero-premium-v1`）、提前还款模拟器用的`SIM_KEY`（`after-zero-simulate-v1`）、云备份"上次备份时间"用的`BACKUP_KEY`（`after-zero-backup-meta-v1`）、AI 债务顾问每日用量计数用的`AI_USAGE_KEY`（`after-zero-ai-usage-v1`）、AI 债务顾问历史对话记录用的`AI_CHATLOG_KEY`（`after-zero-ai-chatlog-v1`）、AI 债务顾问"是否已看过首次额度说明弹窗"用的`AI_LIMIT_NOTICE_KEY`（`after-zero-ai-limit-notice-v1`）以后也不能改——十一者是各自独立的键，不要以为加新功能可以复用或合并。
2. **新安装必须是空数据。** `www/index.html` 里 `SEED`（债务种子数据）、`DOCS_SEED`（文档种子数据）这两个常量现在都是空值——这是故意的，因为这个app的定位是要发给别人用，任何人第一次打开都不能预装开发者自己的私人财务数据。**改代码时如果要放测试数据，改完记得清空再提交，别把私人内容（真实债务数字、个人反思文档、任何带真实姓名/金额的东西）带回默认值里。**
   **私人数据不止藏在这三个常量里。** 之前排查发现过一次：一个叫`cliff`的调试用标记字段，虽然完全没有UI能设置它（不是SEED、不是表单字段），但代码里直接写死了具体的还款日期和金额字符串（`"2027-05 起还本，月供跳至 ¥2,182"`这类）挂在渲染逻辑里，跟SEED是否清空无关。改代码时留意：不只是搜`SEED`/`DOCS_SEED`这两个变量名，任何看着像真实日期/金额/人名的硬编码字符串都要多看一眼是不是该删。（补：曾经还有个`POSTER`"愿景海报"常量，因为没有任何UI入口能往里填内容、属于永远激活不了的死代码，已整体删除，包括`fileItems()`/`renderDocContent()`里对应的分支，别再找它。）
   **"新安装=空数据"这个假设依赖 `AndroidManifest.xml` 里 `android:allowBackup="false"`。** 安卓系统默认（`allowBackup="true"`，Capacitor脚手架生成时的默认值）会把App数据自动云备份到用户的Google账号，卸载重装或者换新手机登录同一个Google账号时可能会自动把旧数据（包括`ACCOUNT_KEY`存的登录态）恢复回来，让"重装"变得不再可靠地等于"空白状态"。这个项目已经手动改成`allowBackup="false"`彻底关掉自动备份——以后如果看到这个值被改回`true`（比如重新跑`npx cap add android`之类的脚手架命令覆盖了手改的manifest），要记得改回`false`。
3. **包名 `io.github.jenkjyu.afterzero` 是这个app的永久身份，不要随便改。** 安卓系统靠包名判断"新装的这个APK是不是我认识的那个app的新版本"——包名一样+签名一致才会被当成"更新"（原地覆盖、保留数据）；包名一变，系统当成完全不相关的新app，跟原来的app和它的数据没有任何关系，装出来是第二个图标、全新空数据。这个项目早期开发阶段（曾用过 `com.jenkjyu.debtmanager` 这个包名做过几版debug包）就是因为这个原因废弃重来的——开发者自己手机上可能还留着那个旧包名、带真实数据的旧版本，跟现在这个 `io.github.jenkjyu.afterzero` 是两个互不相通的独立app，别搞混、别以为它们共享数据。
4. **release签名密钥已经生成（因为微信登录要求提交release签名SHA1去微信开放平台注册），但目前还没有任何正式发布用过它。** 文件位置/构建命令/`signingConfigs.release`的生效条件见`release-keystore` skill。**这个keystore一旦真正拿去发布过一个版本，丢了 = 以后再也没法用同一个身份更新这个app，需要跟`localStorage`那条铁律同等严重地对待——离线、异地备份好。**
5. **License 是 PolyForm Noncommercial 1.0.0，不是MIT/ISC这类常见的宽松协议，是刻意选的。** 开发者规划未来要在这个app上加付费功能，选这个协议是为了禁止别人白嫖代码去做商业竞品（发到应用商店卖钱、内置广告等）；别人依然可以自由fork/学习/个人非商业使用。改动licensing相关内容（`LICENSE`文件、`package.json`里的`license`字段、README里的License说明）前要确认这个前提没变。
6. **`AndroidManifest.xml` 里的 `INTERNET` 权限当初是为未来付费功能预留的，现在已经真正用上了**——`www/index.html` 里的微信登录功能会加载CloudBase CDN脚本、调用腾讯云开发的云函数，是这个app第一次真正发出网络请求（`WeChatLogin`原生插件本身走的是Intent/AIDL跟微信App通信，不占用这条权限）。这条权限不要删。
