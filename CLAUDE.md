# CLAUDE.md

这个文件给 Claude Code 看，记录这个项目非显而易见的技术细节和雷区。给人看的项目介绍在 `README.md`。

**如果项目根目录下有 `PROGRESS.md`，先看那个文件。** 那是不进git、按时间记录"哪天做了什么、现在卡在哪一步"的进度日志（这份CLAUDE.md记的是相对稳定的技术细节，不记当前进度）——不是每个clone/checkout都会有这个文件（它是gitignored、因机器而异的本地文件），没有的话说明是全新环境，忽略这条即可。

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
- ⚠️口径细节（`summarizeDebts`同样适用）：提前结清（`settleFull`）只写`settled=true`、不标记plan为已还，所以那笔债务的剩余本金**既不在`total`也不在`paidPrincipal`**——它是"用一笔金额未知的钱结掉了"，两边都不计是诚实的处理，两个tab的口径说明里都必须讲清楚，不能假装它被还了。
- **`computeUpcomingPressure`跟`computeMonthlyRepayment`有三处关键区别**，每一处都对应一个已确认问题：①**按`active`过滤**——`settleFull()`不标记plan为已还，那些剩余期次仍是`{paid:false}`，`computeMonthlyRepayment`不过滤会把它们算成"待还"，表现为"已经结清的债务，未来几个月还显示要还钱"；②**逾期未销的期次（`date < 今天`）单独进`overdue`桶**，不混进未来月份（"已经错过"和"即将要还"是两件事，混在一起会让"本月待还"虚高，跟"还款日"tab把逾期单独分档是同一个判断）；③**窗口从当前月起固定N个月**（默认12），不是从数据最早月铺到最晚月。金额**拆`principal`/`interest`两段**——这两个字段对amort/equalfee/interestfirst三种生成方式都可靠；**手续费没有独立字段**（`equalfee`的手续费`pf`直接写进`interest`），所以只做两段、不做"本金/利息/手续费"三段，宁可少一个维度也不为了图表复杂度制造不可信数据。`today`参数只为可测（默认取`today0()`），调用方正常不传。

**同一轮还修了`computeReportData()`的`timeline`一个真实bug**：`timeline`第一个点固定是"今天"、随后按未还行日期升序追加，**逾期未销的期次日期在今天之前，会让第二个点的日期早于第一个点**，折线图上表现为"今天→过去→未来"的时间倒流。修法是把逾期未销（以及日期缺失/格式不对）的期次归到"今天"这个桶里——语义上也对，逾期的钱今天就该还，投影上按"立即偿还"处理，图上表现为起点处的一个陡降（此时会有两个日期同为今天的点，一个是起始余额、一个是扣掉逾期后的余额，这是刻意的，保证"起点=当前总余额""终点归零"两个不变量都不破）。**⚠️这个修复会连带改变PDF导出**——`exportReportPdf`通过`buildReportTableRows`/`buildExportChartsSVG`两处都读`timeline`（`exportReportXlsx`和`buildAiSummary`只读`totalBalance`/`avgRate`/`payoffDate`，不受影响）；这是刻意接受的：只修屏幕不修导出会造成"屏幕上对了、导出还是错的"这种更糟的不一致。

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

### 收尾：第七~十一步，剩余全部subpage/sheet迁移到React

第六步做完之后，用户明确要求"先把迁移做完"——把vanilla里剩下的全部subpage/sheet也搬进React，让`www/index.html`主`<script>`只留cloud函数/native插件/IndexedDB这类impure逻辑，不再有任何JSX/DOM渲染代码。走了完整的`EnterPlanMode`流程（先手动读完`index.html`第1140-2565行剩余vanilla逻辑全貌，再写plan），确认剩下未迁移的一共8个：`#accountScreen`/`#premiumScreen`/`#termsScreen`/`#simScreen`/`#notifySheet`/`#docsScreen`/`#backupScreen`/`#aiScreen`+`#aiHistorySheet`。**明确排除在外、以后也不迁移**：`#loginGate`——它是全App唯一必须在React bundle加载*之前*就同步决定显隐的东西（FOUC防护，见"登录门"一节），架构上不可能交给一个要等JS加载完才能渲染的React组件。

**架构决策：全部复用第五步已经建好的`react/src/sheets/`入口（`#react-sheets-root`），不新开入口**——这8个subpage/sheet都不属于任一个tab（`accountScreen`被"在还债务"Header和"我的"页两处触发、`premiumScreen`被4处触发、`simScreen`被`DetailSheet.tsx`触发、`notifySheet`被"还款日"铃铛触发、`docsScreen`/`backupScreen`被"我的"页触发），跟当年`detailSheet`/`editSheet`"被多棵独立React树共同触发、不属于任何tab"是完全相同的架构问题，直接复用已验证的模式：`shared/state.ts`给每个screen新增`openXScreen()`/`closeXScreen()`/`useXScreenOpen()`（布尔开关，不是下标——这几个screen全局只有一份，不需要"打开哪一个"这种参数，`simScreen`是例外，需要债务下标，模式同`openDetailSheet(i)`），各自独立的`az:x-screen-changed`事件（继续遵守"哪个sheet开着"和"数据变了"两类事件分开的既有原则）。**这也终结了第四步那句"'我的'tab现在是最后一处能干净套用trigger-only模式的地方了"的预判**——第七步起，trigger-only这条路直接被"screen本身搬进React"取代，不是又发明了一套新模式，而是把已经验证过的detail/editSheet模式套用到更大范围。

**第七步：账户 + 订阅 + 条款（`accountScreen`/`premiumScreen`/`termsScreen`）。** 新增`react/src/sheets/AccountScreen.tsx`/`PremiumScreen.tsx`/`TermsScreen.tsx`。三张价卡的互斥选中态、兑换码输入框的展开/复位全部改成组件本地`useState`（组件常驻挂载不会因为screen关闭而卸载重建，所以"上次选中的还记得"这个效果不需要额外持久化）。`__azBridge`新增3个真正的cloud/native/共享状态调用（vanilla保留，React不重新实现）：
- `wxLogout()`：原`wxLogoutBtn`inline handler抽出的具名函数，**没有确认弹窗**（照抄原handler行为，跟"注销账户"不同）。
- `deleteAccount(): Promise<boolean>`：原`doDeleteAccount()`去掉"成功后`closeAccountScreen()`"那行，**改成返回布尔值**（不是`void`）让React自己决定要不要关闭screen——这是这批新增桥接函数里第一次"返回值决定UI导航"的模式，跟`setDebt`/`deleteDebt`这类"纯粹执行、不关心UI"的旧桥接函数不同。
- `redeemCode(code): string | null`：原`REDEEM_CODES`查表+`applyRedeemTier`调用抽出来，返回命中的tier或null，React据此决定toast文案（"请输入兑换码"这个空值校验挪到了React这边，因为这是纯UI校验不需要vanilla参与）。

复用既有`confirmAsync`处理"注销账户"确认弹窗和"暂未开放真实支付"提示，不新写React确认组件（跟第六步`askAsync`那条决策同一个理由——这个弹窗以后还要接着优化视觉，两份实现要同步改两处不划算）。**踩了一个因为删除`openPremiumScreen()`而暴露出来的连锁问题**：`createCloudBackup()`（`#backupScreen`要等第十步才迁移，这一步还是100%vanilla）内部有一行"万一没premium就跳订阅页"的二次防御检查(`closeBackupScreen(); openPremiumScreen("premium");`)，这行代码调用的`openPremiumScreen()`一旦被第七步删除就会直接报错——排查后确认这层检查本来就是多余的（进这个函数之前"我的"页`DataCards.tsx`已经用`hasPremium()`gate过一次，这个app也没有订阅到期/降级的实际场景），直接删掉这行（YAGNI，不是漏做，第十步原计划就要做这个简化，这次是提前触发）。同理`applyRedeemTier`/`__debugPremium`/`applyBackupData`里三处调用`renderAccountDetail()`的地方也全部删除——这些语句本来就紧邻着会派发`az:state-changed`（或者调用`renderAll()`，`renderAll()`本身会派发），`AccountScreen`的`usePremium()`/`useAccount()`能自动跟上，不需要vanilla再手动触发一次渲染。

**第八步：提前还款模拟器 + 通知设置（`simScreen`/`notifySheet`），两个都是被别的sheet/tab触发的独立小工具，合并成一轮（参照当年"还款日+统计"合并的理由）。**
- `simScreen`：新增`react/src/sheets/SimScreen.tsx`。`openSimScreen(i)`挪进`shared/state.ts`（模式同`openDetailSheet(i)`，`DetailSheet.tsx`"提前还款模拟"按钮的调用点从`window.__azBridge.openSimScreen(i)`改成直接`import`）。**`SIM_KEY`（模式+上次金额）整体移交React所有权**，直接读写localStorage——跟`debtSort`当年"没有别的地方依赖它，整体移交"是同一个先例，vanilla这边`simPrefs`/`saveSimPrefs`/`simIndex`/`simMode`/`setSimMode`/`openSimScreen`/`closeSimScreen`/`runSimulate`全部删除，`simulatePrepay()`继续是calc.js全局纯函数，React直接`window.simulatePrepay(...)`调用。**结果展示用一份"运行那一刻的快照"（含`mode`/`atPeriod`/`extra`等）而不是从当前输入框状态派生**——照抄vanilla`runSimulate()`把这几个值直接拼进结果HTML字符串的效果：用户测算后再改输入框，展示的结果文案不会跟着实时变，直到再次点"开始测算"。
- `notifySheet`：新增`react/src/sheets/NotifySheet.tsx`，读`useNotify()`（已有hook，不用新写）。`openNotifySheet()`/`closeNotifySheet()`挪进`shared/state.ts`（`pay/App.tsx`铃铛点击的调用点改成直接`import`）。`__azBridge`新增4个**必须留vanilla**的函数（真实调用`@capacitor/local-notifications`权限检查/申请/调度，不能重写成纯React）：`setNotifyEnabled(enabled)`返回`Promise<boolean>`（最终生效状态，权限被拒时是`false`）、`addNotifyRule(offsetDays, time)`、`deleteNotifyRule(idx)`、`sendTestNotification()`。vanilla原来的`renderNotifyRules`/`openNotifySheet`/`closeNotifySheet`整个删除，"开了通知但一条规则都没加就退出、兜底成当天到期09:00"这条逻辑挪进了`NotifySheet.tsx`的`handleClose()`里（用`notify.enabled`/`notify.rules`判断+调用`addNotifyRule`）。**开关checkbox用了"乐观更新"模式**（`pendingChecked`本地state，点击立刻反映、异步权限结果出来后再交还给`notify.enabled`）而不是直接`checked={notify.enabled}`——照抄vanilla原来未受控checkbox"先勾选、被拒再回退"的效果，避免controlled input在等待系统权限弹窗这段真实耗时里显得卡顿。

**第九步：档案库（`docsScreen`）——单文件最重的一步（IndexedDB blob存储+3种预览方式+原生分享），但跟当年"统计"tab同一个风险等级（零手势、纯data→JSX）。** 新增`react/src/sheets/DocsScreen.tsx`。IndexedDB（`upGetAll`/`upPut`/`upDelete`/`upClear`）、`saveToDeviceDownloads`、`tryShareFile`原生分享、`docs`数组本身的增删——全部保留vanilla（跟"云备份/AI"一贯原则一致：impure IO/native的部分不重写成TS）。`openDocsScreen()`/`closeDocsScreen()`挪进`shared/state.ts`（布尔开关，`DataCards.tsx`的调用点改成直接`import`）。

`__azBridge`新增5个函数：
- `getFiles(): FileItem[]`——原来的`fileItems()`去掉DOM构建，直接返回数据。**给每个markdown文档条目挂一个通过`WeakMap<object,string>`懒生成的稳定id**（`docKeyFor(d)`，跟`shared/state.ts`的`keyFor()`给debt生成React key是同一个技巧）——`docs`数组元素在splice/restore之外引用不变，upload条目已有IndexedDB的`id`天然稳定。**`FileItem`类型故意不含原始`Blob`**——下载/删除/分享这几个操作全部改成传`id`字符串回vanilla按id反查目标，不需要把Blob传过桥接边界（虽然技术上可以，因为是同一个JS runtime，但按id反查更简单、也避免React持有可能过期的Blob引用）。
- `uploadArchiveFile(file): Promise<void>`（含扩展名校验，逻辑跟原来`uploadInput`的`change`handler一致）
- `deleteArchiveFile(id): Promise<void>`（**不含确认逻辑**——原来`ask()`确认弹窗挪到了React这边用`confirmAsync`处理，标题按`item.upload`是`"删除文件"`还是`"删除文档"`区分，确认后才调这个函数，只做"真的去删"这一步）
- `downloadArchiveFile(id): Promise<void>`、`shareArchiveFile(id): void`

**新增`az:files-changed`事件**——docs/uploads任何一处变化都会派发（上传/删除/备份恢复/导入json），`shared/state.ts`新增`useFiles()`。**这个hook没有采用`useDebts()`那套"事件触发标脏"的写法，而是抄`useNotify()`那套按值(fingerprint)比较**——`getFiles()`不像`getDebts()`那样有一个可比较的底层数组引用（每次调用都用`.map()`合成全新数组，结构上更像`getNotify()`），"事件触发才标脏"这套依赖"能比较底层引用"这个前提在这里不成立，直接照抄`useNotify()`的fingerprint方案更简单可靠。**这里有一次真实踩的坑**：第一版直接照抄`useDebts()`的"dirty flag"写法（不比较内容，只在事件触发时标脏），组件测试跑第一个用例还行，但从第二个用例开始`fileList`渲染不出任何行——因为每个测试换一个全新的mock bridge、但没有dispatch`az:files-changed`，dirty flag从上一个测试起就一直是`false`，`getFilesSnapshot()`一直返回第一个测试缓存的陈旧数据。`useDebts()`那套写法之所以在它自己的场景下没事，是因为它还叠了一层"底层引用变了也强制刷新"的保险（`source !== debtsCacheSource`），而`getFiles()`每次都合成新数组，没有这样一个可比较的"源引用"，少了这层保险就直接暴露出"标脏时机不对就永久陈旧"这个问题。改成fingerprint比较后（不管有没有事件触发，每次都真的调一次bridge、按内容决定要不要换缓存），问题彻底解决，测试全绿。

删除：`fileItems`/`renderFiles`/`renderDocContent`/`bindFileDownload`/`docSel`/`FILES`/`ICON_IMG`/`ICON_PDF`/`ICON_CLIP`/`ICON_DOC`全部删除（图标SVG原样复刻进`DocsScreen.tsx`的JSX常量），`#uploadInput`不再是vanilla DOM里游离的隐藏input——第九步之后它是`DocsScreen.tsx`自己渲染+持有ref的普通React元素（不需要再像`#importFileInput`那样留一个手动触发的桥接函数，因为上传的业务逻辑本身已经整体搬进React，不需要vanilla继续插手）。

**第十步：云备份（`backupScreen`）——跟"我的"tab当年的云备份入口不同，这次是里面的实际内容（创建/列表/恢复/删除4个cloud函数调用）搬进React，不再只是trigger-only。** 新增`react/src/sheets/BackupScreen.tsx`，`useState`管理"加载中/列表/错误"三态（原来`renderBackupList()`直接改DOM，这次改成组件内`useEffect`在`isOpen`变`true`时触发`listBackups()`重新拉取——不是常驻订阅，备份记录列表不是"数据变了自动跟上"这种共享状态，是这个screen自己私有的、每次打开都值得重新问一遍服务端的东西）。`openBackupScreen()`/`closeBackupScreen()`挪进`shared/state.ts`（布尔开关，跟`accountScreen`/`docsScreen`同一个模式，`DataCards.tsx`"打开云备份"门禁通过后的调用点改成直接`import`）。

全部cloud函数调用逻辑（`ensureCbAuthReady`/`cbApp().callFunction`这套认证会话状态）继续保留vanilla——跟`aiAdvisor`/`wxLogin`同一个"认证会话状态是vanilla独占的、不可移植"的原因。`__azBridge`新增5个函数：`createBackup(): Promise<boolean>`、`restoreBackup(id): Promise<boolean>`、`deleteBackup(id): Promise<boolean>`这3个**沿用`deleteAccount()`那个先例**——内部照旧`toast`成功/失败文案（跟原来`createCloudBackup`/`doRestoreBackup`/`confirmDeleteBackup`的文案逐字一致），返回布尔值让React决定要不要刷新列表；`listBackups(): Promise<BackupRecord[]>`是纯读取，没有布尔判断需要做，失败直接`throw`，React用`try/catch`显示错误文案（效果跟原来`renderBackupList()`的`catch`分支一致）；`getBackupMeta(): {lastBackupAt}`是同步读取（`lastBackupMeta`本来就是常驻内存的模块变量，不需要额外的loading态）。恢复/删除的二次确认弹窗（原来`ask()`包着的"此操作不可撤销，确定继续吗"）挪到了React用`confirmAsync`处理，成功后再调`restoreBackup`/`deleteBackup`——这几个vanilla函数因此**不含确认逻辑**，只做"真的去调用"这一步，跟第九步`deleteArchiveFile`同一个处理方式。

删除：`createCloudBackup`/`renderBackupList`/`confirmRestoreBackup`/`doRestoreBackup`/`confirmDeleteBackup`/`renderBackupMeta`/`openBackupScreen`/`closeBackupScreen`全部删除（`applyBackupData`保留，`restoreBackup`内部继续调用它），HTML里`#backupScreen`整块。`createCloudBackup()`内部原来那行"万一没premium就跳订阅页"的二次防御检查在第七步（删除`openPremiumScreen()`时）就已经因为YAGNI被提前删掉，这一步不需要再处理这层。

**真机限制（老规矩，不是新问题）**：真实的创建/列表/恢复/删除往返依赖真实微信登录会话，这个环境测不出——本地Playwright验证时用"伪造`account`跳过登录门"这个老技巧打开`backupScreen`，`listBackups()`确实按预期显示出`获取备份列表失败：Cannot read properties of null (reading 'scope')`这条错误文案，这正是"云备份（Premium）"一节"桌面浏览器测试的边界"里记录的那个已知现象（伪造`account`会让`ensureCbAuthReady()`误判"已登录"从而跳过`signInAnonymously()`兜底，连匿名会话都没有就直接撞上CloudBase SDK的null凭证读`.scope`的bug）——不是这次迁移引入的新bug，UI正确地把它当错误态展示出来而不是崩溃，符合预期。桌面Playwright验证覆盖：打开screen显示正确的"上次备份"文案+列表进入错误态、门禁两个方向（未开通跳订阅页/已开通打开backupScreen）、硬件返回键+点返回箭头都能正确关闭，light/dark主题截图确认，控制台零JS报错。

**第十一步：AI债务顾问（`aiScreen`+`aiHistorySheet`）——收尾里技术上最"干净"的一步，也是最后一步。** 新增`react/src/sheets/AiScreen.tsx`（聊天界面+内嵌的历史对话sheet，两者放在同一个文件里，不是两个独立文件——历史对话sheet只从`AiScreen`自己的header按钮触发，不像其它screen那样"被多棵独立React树共同触发"，不需要在`shared/state.ts`里为它单独开一对`open/close`，`historyOpen`是纯组件本地`useState`，跟`PremiumScreen`兑换码输入框展开/收起是同一类"组件本地UI状态"）。`AI_USAGE_KEY`（每日用量软上限）/`AI_CHATLOG_KEY`（历史对话记录）这两个localStorage键整体移交React所有权（照抄`SIM_KEY`当年"没有别的地方依赖它，整体移交"的先例），vanilla的`aiConvos`/`saveAiConvos`/`aiUsage`/`aiUsageToday`/`aiUsageLeft`/`bumpAiUsage`全部删除，只有`buildAiSummary()`/`callAiAdvisor()`原样保留（因为依赖`ensureCbAuthReady`/`cbApp().callFunction`这套认证会话状态，不可移植）——`callAiAdvisor`是这一步`__azBridge`**唯一**新增的函数，`openAiScreen`则被删除（打开screen不再经过桥接，改成`shared/state.ts`的`openAiScreen()`/`closeAiScreen()`/`useAiScreenOpen()`，跟其它screen同一个布尔开关模式）。`findAiConv`/`bumpAiConvTop`继续是calc.js全局纯函数，React直接`window.findAiConv(...)`/`window.bumpAiConvTop(...)`调用，不复制逻辑到TS这边。

**消息发送/持久化的状态机是vanilla逻辑的逐步骤翻译，不是重新设计**：`composeAndSend(displayQ, isReportMode)`按vanilla`aiComposeAndSend()`原来的顺序——`busy`守卫→用量检查→算出`contextHistory`（发给云函数的上下文，取自"这次提问之前"的已有消息，不含这次提问本身）→乐观追加用户气泡+"思考中"占位气泡→`setConvos`用不可变方式要么更新已有记录（继续追问）要么新增一条（新对话，`unshift`到最前）→调`callAiAdvisor`→成功后`bumpAiUsage()`+替换占位气泡为真实回复+按`AI_CHATLOG_MAX_MSGS`裁剪+用`window.bumpAiConvTop`顶到最前+按`AI_CHATLOG_MAX_CONVOS`裁剪+`saveAiConvos()`持久化→失败则显示错误气泡，**如果这条对话从没成功回复过（`messages.length<=1`）就把这条空壳记录从`convos`里撤销掉**（照抄vanilla"不留僵尸对话"的逻辑，失败分支本来就不调用持久化，这个撤销只影响内存态）。这套翻译用普通的React `useState`不可变更新（`setConvos(prev => ...)`）而不是照抄vanilla那种"直接mutate一个模块级变量+手动触发渲染"的写法——跟`gestures.ts`"手势代码原样照抄不重新设计"的原则不同，这里选择用idiomatic React重写是因为消息状态机不涉及任何真机踩过坑的DOM操作细节，用React自己的机制表达反而更不容易出错，也不违反"忠实复刻行为"这个更高优先级的原则（分支条件、发送顺序、持久化时机全部逐条对照过）。

**魔法棒入场动效**（`castAiWand()`）：`castWand(el)`辅助函数原样照抄vanilla那套"remove class→强制reflow→add class→animationend后移除"技巧，只是用`useRef<SVGGElement>`拿到`<g>`节点而不是`$("aiWelcomeWand")`按id查——**`reflow`那一步在vanilla里用`el.offsetWidth`，React这边改成`el.getBoundingClientRect()`，因为TypeScript的`SVGElement`类型定义里没有`offsetWidth`这个属性**（那是`HTMLElement`专属，浏览器运行时对SVG元素其实也支持，但走类型检查这条路更省事）。触发时机保留vanilla两个入口：screen打开时（`useEffect`依赖`isOpen`）、点"新对话"按钮时，`loadConversation()`（加载历史对话）不触发，因为vanilla的`loadAiConversation()`也没调用`showAiWelcome()`。

**测试环境的两个新坑，都已经修好且以后其它组件也会受益**：
1. `Element.prototype.scrollIntoView`在jsdom里不存在——`AiScreen.tsx`每次新增消息都会调用它把最新气泡滚进视图（`useEffect`依赖`messages.length`），真实浏览器/WebView都有这个方法，但jsdom没实现，第一次跑测试直接报`el.scrollIntoView is not a function`。修法是在`react/__tests__/setup.ts`里补一个空实现（`if (typeof Element.prototype.scrollIntoView !== "function") Element.prototype.scrollIntoView = () => {}`）——这是全局setup文件的改动，不是`AiScreen.test.tsx`自己糊一个mock，以后别的组件如果也用到`scrollIntoView`不会重复踩这个坑。
2. **`#aiHistorySheet`的`aria-labelledby="aiHistoryTitle"`让它的可访问名称(accessible name)也是"历史对话"这几个字，跟header上`aria-label="历史对话"`的按钮撞了**——Testing Library的`getByLabelText("历史对话")`会同时命中两者，报"Found multiple elements"。这不是这次迁移引入的新问题（vanilla原来的HTML结构一直是这样），只是第一次有自动化测试去查询这个文本才暴露出来；测试改用`getByRole("button", { name: "历史对话" })`精确限定成"按钮"这个role即可避开，不需要改动组件的DOM结构/aria属性。

**验证**：`AiScreen.test.tsx`(17用例，覆盖欢迎态渲染/3种发送入口/用量上限拦截/发送失败丢弃僵尸对话/连续追问带正确history/成功回复持久化进`AI_CHATLOG_KEY`/历史对话加载与删除两条路径/硬件返回键"先关历史sheet再关aiScreen"的顺序/重新打开重置欢迎态)；`npx tsc --noEmit`零错误；`npm run test:react`208个用例全绿（从191涨到208）；`npm test`（calc.js套件）43个不受影响；`npm run build:react`确认`sheets.js`产物正常增长（93.68KB，从backupScreen那步的79.64KB涨上来，符合预期）。Playwright headless验证：AI banner打开aiScreen、欢迎态3个芯片正确渲染、点常见问题芯片发送后**网络受限环境下`callAiAdvisor`按预期报`Cannot read properties of null (reading 'scope')`**（真机限制，老规矩，见下方）、失败的对话确认没有出现在历史列表里（"还没有历史对话"）、硬件返回键第一次关历史sheet第二次才关aiScreen、重新打开+手输发送一条新消息全流程正常、点返回箭头关闭，全程控制台**零JS报错**，light/dark主题截图确认视觉正常。**真机限制（老规矩）**：真实AI生成/追问依赖真实微信登录会话，这个环境测不出，跟云备份/微信登录当年是同一条限制。

至此**React迁移收尾第七~十一步全部完成**，`www/index.html`主`<script>`里已经不再有任何`.subpage`/`.sheet`的DOM渲染代码——`grep`过一遍确认剩下的全部函数要么是数据模型读写（`debts`/`docs`/`notify`/`premium`/`account`等及其`save*`函数），要么是不可移植的cloud函数调用（`wxLogin`相关、`createBackup`等、`callAiAdvisor`）、native插件调用（`SaveFile`/`WeChatLogin`/`LocalNotifications`）、IndexedDB操作（`upGetAll`等），符合方案里"vanilla只剩impure逻辑"这个最终目标。

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

### 已完成的验证 & 还没做的验证

**已验证（桌面Chromium + Playwright，一次性临时`npm install playwright`验证完就`npm uninstall`了，不是这个项目的常驻依赖）**：
- 第二步（"在还债务"）：登录门跳过、hero/KPI数字、3档严重度色晕、点卡片开详情、左滑露出+点击"销这期"触发确认弹窗、长按500ms进入抖动编辑模式("保存"按钮出现)、退出编辑模式、排序下拉框切换、"+新增一笔"打开编辑表单、`__debugPremium()`切换AI banner发光态、点头像打开账户页、tab来回切换后债务列表内容不丢。
- 第三步（"还款日"+"统计"）：还款日hero卡+空状态、按`dueBucket`分组的4档section-label及计数、渲染的卡片数、点铃铛打开`#notifySheet`、**切通知开关后铃铛`.on`状态响应式更新（验证了`saveNotify()`新增的`az:state-changed`派发确实生效）**、筛选按钮切换后列表变化、鼠标模拟左滑露出"标记已还"按钮、点该按钮触发确认弹窗、点卡片（非滑动状态）打开`#detailSheet`；统计tab的KPI/三张图/数据明细表渲染、`hasPremium()`门禁两个方向（未开通跳订阅页/已开通直接触发导出）；跨tab一致性（"在还债务"tab切换后仍正常读同一份`debts`数据）。
- 第四步（"我的"）：头像/昵称渲染、`__debugPremium()`切换Premium入口卡文案+`.is-member`样式、点头像/Premium入口分别打开`#accountScreen`/`#premiumScreen`、云备份按钮门禁两个方向（未开通跳订阅页/已开通打开`#backupScreen`）、档案库按钮打开`#docsScreen`（无门禁）、"下载备份文件"触发桌面`<a download>`路径实际下载出JSON、"上传备份文件"确认`#importFileInput`搬出`#view-data`后依然能被`triggerImportFilePicker()`间接点开、四个tab来回切换后各自内容不丢。
- 第五步（`#detailSheet`）：两个tab（"在还债务"/"还款日"）点卡片都能正常打开详情窗，内容跟改之前一致；grip拖拽（下拖关闭、上拖调高、重新打开高度自动重置）；点"销这期"确认后**详情窗原地刷新**显示新进度（不关闭）；一次性债务点"一次性结清"、多期债务点"提前结清"，确认后债务变settled、**详情窗自动关闭**且移入已结清区；点"编辑"详情窗关闭+正确打开`#editSheet`；点"提前还款模拟"详情窗关闭+正确打开`#simScreen`；硬件/手势返回键（详情窗打开时只关详情窗不退出App，关闭后再按才真正退出）；四个tab来回切换互不影响。**这轮还额外挖出并修复了一个前四步遗留的真实bug**：`useDebts()`在`debts`数组被原地mutate时完全不触发重渲染（不是显示旧值，是整个组件都不重渲染），这个bug理论上从第一步就存在，这次靠"结清后详情窗该自动关闭却纹丝不动"这个明显反例才第一次被抓到、修复、补了回归测试（细节见上面"第五步"那段"⚠️真机会真实踩到"的部分）。
- 第六步（`#editSheet`）：新增债务全流程（填字段、公式生成amort、批量设置还款日弹出月份选择器并正确铺日期、保存）；从详情窗点"编辑"正确打开、detailSheet同步关闭；一次性还清勾选/取消往返数据不丢；点"删除"弹出确认框（复用vanilla`#modalScrim`）、确认后sheet自动关闭且debts数组正确减少；点"取消"关闭；硬件返回键正确关闭。**这轮同样挖出并修复了一个真实bug**：`deleteDebt`触发的自动关闭effect第一版按下标判断，删除的不是数组最后一条时因为`splice`导致下标顺移而误判（细节见上面"第六步"），这次是靠两笔债务、删除排在前面那笔的完整Playwright交互流程真实复现的，不是理论推演，修复后补了专门覆盖这个场景的回归测试。
- 第七步（`accountScreen`/`premiumScreen`/`termsScreen`）：点头像打开accountScreen并显示正确的头像/昵称/会员/微信绑定文案；退出登录（无确认弹窗）清空account并重新弹出登录门；三张价卡互斥选中态切换；空/无效/有效兑换码三条路径的toast文案+有效兑换码后输入框收起+Premium入口卡更新成"Premium 会员"+`.is-member`；点《购买者服务条款》打开termsScreen并显示条款正文；硬件返回键按"先关termsScreen再关premiumScreen"的顺序逐层退；点"开通Premium"弹出"暂未开放真实支付"提示。全程零JS报错。
- 第八步（`simScreen`/`notifySheet`）：从详情窗点"提前还款模拟"正确关闭detailSheet+打开simScreen并显示对应债务名；空金额/月供不足两条toast路径；正常测算显示结果+`SIM_KEY`正确持久化；重新打开时extra按持久化值回填、atPeriod重置为1、结果清空；硬件返回键关闭。从"还款日"tab铃铛打开notifySheet；桌面浏览器无`Capacitor.Plugins.LocalNotifications`时切换开关/发送测试通知都正确toast"仅支持安卓App内使用"、checkbox正确回退未勾选（验证了乐观更新+回退这条路径）；添加/删除提醒规则正确更新列表+`NOTIF_KEY`持久化；点"完成"和硬件返回键都能正确关闭。
- 第九步（`docsScreen`）：点"打开档案库"打开docsScreen并渲染已有的markdown文档条目；点击文档行触发`mdToHtml`预览渲染出正确的标题标签；上传一张真实图片文件，`uploads`数量正确增加+toast"已上传 ✓"，点该行触发图片预览且`<img>`的`src`是有效的`blob:` objectURL；上传不支持的扩展名（`.exe`）被正确拒绝、toast提示、文件数量不变；点删除文档行弹出标题为"删除文档"的确认框（复用vanilla`#modalScrim`），确认后行数正确减少+toast"已删除"；硬件返回键正确关闭docsScreen。全程浏览器console零JS报错。
- 第十步（`backupScreen`）：点"打开云备份"打开backupScreen，正确显示"从未备份"+触发`listBackups()`；网络受限环境下`listBackups()`按预期落进错误态（显示"获取备份列表失败：..."，这是"云备份（Premium）"一节记录的已知SDK行为，不是这次迁移的新bug，验证了UI没有因为这个错误而崩溃或卡死）；门禁两个方向（未开通跳订阅页/已开通打开backupScreen）；硬件返回键+点返回箭头都能正确关闭。全程浏览器console零JS报错。**真实的创建/恢复/删除往返依赖真实微信登录会话，这个环境测不出，属于老规矩限制。**
- 第十一步（`aiScreen`+`aiHistorySheet`）：点AI banner打开aiScreen显示欢迎态+3个快捷芯片；点常见问题芯片/生成分析报告芯片/手输发送三条路径都能正确触发`callAiAdvisor`；网络受限环境下发送按预期落进错误气泡（同样是`Cannot read properties of null (reading 'scope')`这个已知SDK行为，不是新bug）；失败的对话确认不出现在历史列表（"僵尸对话"被正确丢弃）；硬件返回键"先关历史sheet、再关aiScreen"的两段式顺序验证正确；点返回箭头关闭。全程浏览器console零JS报错。**真实AI生成/追问依赖真实微信登录会话，这个环境测不出，属于老规矩限制。**
- 全程浏览器console **零JS报错**，light/dark两种主题都截图核对过。

**React迁移收尾（第七~十一步）至此全部完成，`www/index.html`主`<script>`不再有任何`.subpage`/`.sheet`的DOM渲染代码。**

**"统计"和"我的"这两个tab都是零手势的纯data→JSX展示，不需要真机验证，桌面Playwright覆盖已经足够**（跟第二步Summary/AiBanner这类纯视觉组件判定为无需真机是同一个理由）——"我的"tab里"下载/上传备份文件"两个按钮背后的真实原生行为（`SaveFile`插件的"另存为"选择器、真机文件选择器），这次迁移完全没有改动它们的实现，只是把触发入口从vanilla按钮换成React按钮调用同一个函数，不需要为这次迁移重新验证一遍那两个功能本身。`#detailSheet`同理零手势（`initGripDrag`只是4个pointer监听器操作单个DOM节点，不是`gestures.ts`那套长按/滑动状态机），桌面Playwright覆盖已经足够。**"还款日"的左滑手势是目前唯一还留着的真机确认项**——桌面Playwright用鼠标模拟的Pointer Events路径验证了"能触发swiping分支、不报错"，但真实手指触摸的手感、多点触控边界情况、安卓WebView的触摸事件时序，历史上这个项目的教训是"必须真机验证"（见"在还债务自定义排序"一节），这次移植代码逻辑上是逐行照抄，但没有免除真机验证这一步。

> **⚠️ "'统计'tab零手势"这句话从"统计tab视觉+交互升级"这轮（`react/src/report/chartScrub.ts`落地）开始已经不成立**——`PayoffLine.tsx`/`MonthlyChart.tsx`都接入了真正的Touch Events拖动/点击scrub手势，"统计"tab从此变成这个项目里第二个有真实触摸手势代码、需要真机验证的tab（"还款日"左滑是第一个）。完整细节（含桌面验证记录、真机验证待办）见下面"统计（原'高级统计报表'...）"一节"统计tab视觉+交互升级"子节。

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

**几个容易踩坑、且微信SDK硬编码写死不能改的地方**：
- 回调Activity必须叫 `wxapi.WXEntryActivity`，包路径必须是 `<applicationId>.wxapi.WXEntryActivity`（也就是 `io.github.jenkjyu.afterzero.wxapi.WXEntryActivity`）——这是微信SDK自己去找这个类的硬编码路径，改名字/挪包会导致回调收不到，不是能自由重构的普通类。
- `AndroidManifest.xml` 里必须有 `<queries><package android:name="com.tencent.mm" /></queries>`——本项目`targetSdkVersion 36`，安卓11+的包可见性限制下，没有这行`isWXAppInstalled()`/`sendReq()`会静默失效（不报错，就是不工作），排查起来容易摸不着头脑。
- 微信登录**要求提交App的release签名证书SHA1指纹**去微信开放平台注册，debug签名注册不了——这是这个项目第一次真正生成release keystore的直接原因（见下面"硬性铁律"第4条的更新）。

**JS这边怎么调用**：`www/index.html` 里点击"微信登录"按钮，跟`SaveFile`同样的模式检测 `window.Capacitor.Plugins.WeChatLogin` 是否存在，不存在（桌面浏览器测试）就提示"仅支持安卓App内使用"。存在的话调用原生插件的`login()`拉起微信，真正的授权结果是异步的，通过 `wechatAuthResult` 事件回传（因为微信App拉起和用户授权跨越了Activity生命周期，`PluginCall`没法跨这段存活，只能用事件而不是直接resolve这次调用）。拿到微信返回的`code`后，调用腾讯云开发（CloudBase）的云函数换取自定义登录票据完成登录——**AppSecret绝不出现在客户端代码里**，只存在云函数的环境变量中，客户端只带AppID（AppID本身不是秘密）。

**目前的完成状态**：微信登录已经端到端跑通验证成功（真机测试，"我的"tab顶部正确显示头像+昵称）。`WeChatLoginPlugin.java`里的`APP_ID`已填真实值，云函数`WX_APPID`/`WX_APPSECRET`已配置。CloudBase环境`after-zero-d7gub5p5f09c8cc2d`，`wxLogin`云函数已部署，"自定义登录"已启用并配好私钥。

**跑通这条链路过程中踩过的坑，全部是一次性的环境/配置问题，不是代码逻辑问题，但极其隐蔽，按顺序记录供以后类似场景排查参考**：

1. **CDN引入CloudBase JS SDK时，`cloudbase.js`只是"内核"，登录(auth)和云函数(functions)模块必须单独再引入两个`<script>`标签**（`cloudbase.auth.js`、`cloudbase.functions.js`，同版本号），漏引会导致`app.auth()`返回的对象没有`.auth`方法（`cbApp().auth is not a function`）。`www/index.html`里这三行script标签必须一起出现，别只看到一行`cloudbase.js`就以为够了。
2. **CloudBase JS SDK（至少2.28.6这个版本）有个内部bug**：`auth._getCredentials()`内部先读`t.scope`再判断`t`是否为`null`，全新设备/App从没建立过任何登录态时`t`就是`null`，直接抛`TypeError: Cannot read properties of null (reading 'scope')`，会连带搞挂`callFunction()`（云函数调用内部也会走鉴权凭证检查）。**规避方法**：在真正走自定义票据登录流程之前，先调一次`auth.signInAnonymously()`（失败就忽略，不阻塞主流程）垫底写入一份本地凭证，绕开这个先用后判的bug。`handleWxAuthResult`函数开头那段`auth.signInAnonymously ? auth.signInAnonymously().catch(...) : null`就是干这个的，别以为是多余代码删掉。
3. **CloudBase控制台"身份认证→登录方式"里，"匿名登录"必须单独开启**，不开的话上面第2条的`signInAnonymously()`会直接被拒（400，报错信息里会明确写"当前调用的signInAnonymously()所需的登录方式尚未在云开发控制台启用"，这条SDK自己的报错信息其实写得很清楚，不用瞎猜）。
4. **`wxLogin`云函数默认的"安全规则"（权限控制）是`auth != null && auth.loginType != 'ANONYMOUS'`**——这条规则专门排除了匿名登录调用者，而`wxLogin`恰恰是给"还没真正登录、只靠匿名身份垫底"的客户端用来换取正式登录票据的入口函数，会被这条默认规则直接403拒绝，报`[PERMISSION_DENIED] Permission denied`。**这条规则必须手动放开**，改的位置是云开发控制台"云函数/函数管理"页面顶部工具栏的"权限控制"按钮（不是某个函数详情页里的tab，也不是每个函数各自一个按钮）。

   **⚠️ 重要：这个"权限控制"弹窗改的是整个环境共用的一份配置文件，不是单个函数独立的设置**（已对照当前官方文档`docs.cloudbase.net/cloud-function/security-rules`核实）。格式是 `{ "函数名或*": { "invoke": "表达式或布尔值" } }`，匹配优先级"具体函数名 > `*`通配"。**正确做法是给`wxLogin`单独加一条具名例外，`*`通配规则保持/恢复成安全默认值，不要把`*`整条改成`{"invoke": true}`**（那样会让环境里以后新加的任何云函数都默认对所有人开放，包括不该开放的）：
   ```json
   {
     "*": { "invoke": "auth.loginType != 'ANONYMOUS' && auth != null" },
     "wxLogin": { "invoke": true }
   }
   ```
   这个函数本身也靠"必须有真实微信code才能换到东西"这层业务逻辑兜底安全性，不依赖CloudBase登录态门槛——但控制台这层权限规则依然应该按"具名例外+安全通配"来配，不要图省事直接把`*`开放。
5. **`wxLogin/index.js`里查询/写入的`users`集合，CloudBase不会自动建**：文档型数据库里没有这个集合的话，`db.collection("users").where(...).get()`会报`[ResourceNotFound] Db or Table not exist: users`。**注意：用CLI（`tcb db nosql execute`）查询一个不存在的集合不会报错，只会返回空数组`[]`**（MongoDB语义下`find`对不存在的集合本来就不报错），所以不能靠CLI查询来验证集合是否真的建好了，只能去控制台"文档型数据库"页面肉眼确认集合列表里有没有`users`。集合权限选"无权限[ADMINONLY]"就够（这个集合只被云函数用管理员身份访问，客户端永远不直接读写它）。
6. **Capacitor默认只有debug构建才会打开WebView远程调试**（`android.webContentsDebuggingEnabled`默认跟着`isDebug`走），release包默认关闭，而微信登录又必须用release签名才能过微信那边的签名校验——导致"必须用release包测试，但release包默认没法用`chrome://inspect`/`edge://inspect`远程调试"这个死结。**排查这类release包专属问题时，临时在`capacitor.config.json`里加`"android": {"webContentsDebuggingEnabled": true}`，重新编译release包调试，调完记得改回去删掉这个临时开关**，不要把这个当成正式配置长期留着（默认关闭是有意的安全考虑）。

**CloudBase自定义登录的两处API调用，已对照当前官方文档（`docs.cloudbase.net/authentication-v2/method/custom-login`）核实过，不是凭记忆写的**：
- 云函数端：`app.auth().createTicket(openid)`——只接受一个参数（自定义用户唯一标识），不支持`refresh`/`expire`这类选项，传第二个参数会导致票据签发行为跟文档不符。
- 客户端：不是直接`signInWithTicket(ticket)`，而是先用`auth.setCustomSignFunc(fn)`注册一个"怎么去拿ticket"的回调（这个回调内部调云函数换票据），再调用**不带参数**的`auth.signInWithCustomTicket()`，SDK内部会自己回调注册的函数取票据完成登录。方法名和调用方式如果以后又要改，务必重新核实这个链接，CloudBase的Node SDK在这块API上有过大版本调整。

**`app.auth().createTicket()`必须用启用了"自定义登录"后下载的私钥初始化的app实例调用**，不能直接用云函数默认那个`cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })`初始化的`app`（那个实例没有签发登录票据的权限，调用会报权限错误）。`wxLogin/index.js`里专门用`getAuthApp()`函数单独初始化了一个带`credentials`的app实例来做这件事，跟处理数据库操作的默认`app`分开。

**CloudBase控制台里内置的"微信开放平台登录"这个登录方式，不是我们用的东西，别被名字搞混去启用它**——那个走的是网站应用的网页跳转授权流程（`genProviderRedirectUri`生成URL→重定向→拿code），是给网站/网页场景设计的；这个项目走的是原生App直接拉起微信App的SDK授权流程，两者不通用，官方文档自己都没写清楚原生App怎么接这个内置选项。继续用现在这套"自己的`wxLogin`云函数 + 自定义登录"就好。

**部署云函数要用CloudBase CLI（没有全局装，用`npx -p @cloudbase/cli tcb ...`调用），且必须在`cloudbase/`目录下跑**（CLI靠当前目录找`cloudbaserc.json`，在repo根目录跑会读不到配置转成交互式问答卡住）：

```bash
cd cloudbase
npx --yes -p @cloudbase/cli tcb fn deploy wxLogin --force
```

`cloudbase/cloudbaserc.json`（**已gitignore，不进git**）是这次新加的部署配置文件，性质跟`android/keystore.properties`/`android/local.properties`一样——因机器而异、装真实密钥，每次要重新部署得先确认这个文件存在且内容对（`envId`、`functions[0].envVariables`里的`TCB_CUSTOM_LOGIN_*`三个变量）。**这个文件不存在的话，云函数部署会失败或者把配置搞错，不是`npm install`能自动补出来的东西**，得重新从CloudBase控制台下载私钥JSON手动配。

**踩过的坑**：私钥JSON如果直接整个塞进一个环境变量的值，`tcb fn deploy`会报`Environment.Variables.0.Value`类型应为`string`的错误（怀疑是CLI/API把"长得像JSON"的字符串值自动解析成了对象）。解决办法是拆成三个独立的纯字符串环境变量（`TCB_CUSTOM_LOGIN_PRIVATE_KEY_ID`/`TCB_CUSTOM_LOGIN_PRIVATE_KEY`/`TCB_CUSTOM_LOGIN_ENV_ID`），`wxLogin/index.js`里的`getAuthApp()`再把这三个拼回`credentials`对象——以后不管是这个云函数还是别的云函数，只要要往CloudBase环境变量里塞"一整块JSON"，先想到这个坑，别重复踩。

### 云函数：`deleteAccount`（注销账户）

"我的"标签页→账户详情页里的"注销账户"按钮，调用这个云函数（`cloudbase/functions/deleteAccount/index.js`）在服务端真删除`users`集合里对应的文档——不是只清客户端本地登录态那种"假注销"。

**身份来源，不信任客户端参数**：跟`wxLogin`"绝不信任客户端输入"的原则一致，这个函数**不接受、也不该信任**客户端传来的openid参数，而是用`app.auth().getUserInfo()`读已认证会话的`customUserId`——`wxLogin`当初签发`createTicket(openid)`时，把openid设成了这个用户的自定义登录标识，客户端`signInWithCustomTicket()`登录成功后，这个`customUserId`就应该等于当初的openid。这个函数只需要默认的admin app（`cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })`），不需要`wxLogin`里那个专门为`createTicket()`准备的`getAuthApp()`私钥实例。

**⚠️ 待真机核实的地方**：`customUserId`是否真的原样等于openid字符串（没有额外前缀/包装）是查官方文档得出的结论，这个项目里还没实测验证过。第一次真机走通注销流程时，建议临时在函数里加一行`console.log(JSON.stringify(auth.getUserInfo()))`，走一次真实注销，去云开发控制台"云函数日志"确认`customUserId`确实等于预期的openid，再决定要不要删掉这行log——这跟上面"CloudBase自定义登录的两处API调用"那条"别凭记忆写、要核对当前文档"是同一类风险。

**权限控制，不需要给它单独配规则**：上面第4条已经改正过来了——"权限控制"是整个环境共用一份配置文件，不是每个函数各自独立。只要`*`通配规则保持在安全默认值（`auth.loginType != 'ANONYMOUS' && auth != null`），`deleteAccount`不用任何具名配置就自动吃到这条安全规则（只允许真实登录、非匿名的调用者调用）。**踩过的坑**：这个项目第一次配`wxLogin`权限时图省事直接把`*`整条改成了`{"invoke": true}`（对所有人开放），当时没意识到这会同时影响`deleteAccount`（和以后任何新加的函数）——后来对照文档发现`*`是共享兜底规则，才改成"给`wxLogin`单独加具名例外，`*`收紧回安全默认值"这种正确写法（见上面第4条的JSON示例）。**即使当时`*`一度是开放的，`deleteAccount`本身也没有实际风险**：它从不信任客户端参数，身份完全来自已认证会话的`customUserId`，查不到就直接拒绝、且只会操作调用者自己的数据，删不了别人的账号——控制台这层"谁能调用"的门槛和函数内部"删谁的数据"的门槛是两件独立的事，后者才是这个函数真正的安全边界。

这个函数不需要任何`envVariables`（不用微信API密钥，也不用`createTicket`的私钥，只需要默认admin DB权限+`getUserInfo()`），`cloudbase/cloudbaserc.json`里的条目比`wxLogin`简单。部署方式跟`wxLogin`一样，必须在`cloudbase/`目录下跑：

```bash
cd cloudbase
npx --yes -p @cloudbase/cli tcb fn deploy deleteAccount --force
```

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

## 返回键处理（安卓硬件/手势返回）

弹窗关闭 + 退出App这两件事，走的是"原生问JS，JS说了算"的桥接，两头都有各自的坑：

**原生这边（`MainActivity.java`）覆写的不是 `onBackPressed()`，而是用 `getOnBackPressedDispatcher().addCallback(...)`。** 这不是随手选的写法——这个项目 `targetSdkVersion = 36`（`android/variables.gradle`），高版本安卓的手势/预测性返回走的是新的 `OnBackPressedDispatcher` 机制，直接覆写老式的 `Activity.onBackPressed()` 在这个targetSdk下**不可靠触发**（踩过这个坑：第一版就是覆写 `onBackPressed()`，编译没问题，真机上按返回键完全没反应，跟没写一样，排查半天才发现是这个）。**以后不管加什么返回键相关的逻辑，都用 `OnBackPressedDispatcher`，别用 `onBackPressed()`。**

**JS这边（`www/index.html`）**：每次按返回键，原生层用 `evaluateJavascript` 问挂在 `window` 上的 `window.__handleBackButton()`（业务代码整体是IIFE包起来的，这个入口函数必须显式挂到 `window` 才能被原生层拿到）——返回 `true` 表示"我自己关掉了一层东西"，原生层什么都不做；返回 `false` 表示"没什么可关的"，原生层才 `finish()` 退出App。

**这个函数内部按"最上层的先关"的顺序逐层判断**（在还债务的抖动编辑模式 `jiggleMode` → 居中确认弹窗 `#modalScrim` → 账户详情页 `#accountScreen` → 通知设置面板 `#notifySheet` → 编辑窗 `#editSheet` → 详情窗 `#detailSheet`），实现的是"一层一层退"而不是一键全退到桌面。**以后新增别的弹窗/浮层，如果也想让返回键能关掉它，得手动把它的判断加进这个函数的优先级链——这是JS和Java两边靠一个字符串名字"约定"起来的隐性契约，编译器不会提醒你漏加，加漏了也不报错，只是那个新弹窗按返回键没反应、直接退出App，很容易漏测出来。**`#accountScreen`和`jiggleMode`都是这条警告的具体例子：都是新增的浮层/模式，被显式加进了这条链。`#notifySheet`同理，只是它走的是`.sheet`那套（跟`#editSheet`/`#detailSheet`同类），不是`#accountScreen`那种`.subpage`整页推入。

**`#loginGate`（登录门）反而故意不加进这条链**——它没有关闭函数，设计上就是不可关闭的。登录门显示时，上面几个`if`全部为false，自然落到`return false`，原生层`finish()`退出App，这正是想要的"没什么可关的，直接退出"效果，不是漏加。

**`.subpage`是这个项目第一个"整页推入"型浮层**（账户详情页`#accountScreen`用的就是这个class），跟原有的`.scrim`/`.sheet`底部弹出模式不同——从右侧滑入、覆盖满屏（含tabbar）、带返回箭头+标题的头部，不是从底部弹出的卡片。z-index分层：`.tabbar`=20 < `.scrim`=30 < `.sheet`=31 < `.subpage`=35 < `.login-gate`=40 < `.modal-scrim`=50 < `.flash`(toast)=60。以后再加类似的整页浮层，按这个顺序找自己的位置插进去，不用重新摸索。

## 在还债务自定义排序：长按拖拽 + 抖动编辑模式

"在还债务"列表除了10种预设排序（利率/借款金额/剩余待还/月供/剩余期数），还有第11种"自定义"——长按任意债务卡片进入iOS桌面图标式的抖动编辑模式（`jiggleMode`），此时卡片可以按住拖动重新排序，松手后如果新顺序恰好跟某个预设排序完全一致会自动切回那个预设名，否则自动切到"自定义"。退出编辑模式靠排序框左边的"保存"按钮（`#jiggleDoneBtn`，只在编辑模式显示）。相关状态/函数集中在`renderDebts()`后面那一整块（`jiggleMode`/`dragCtx`/`onCardTouchStart`/`onCardPointerDown`/`beginDrag`/`applyDragFrame`/`autoScrollTick`/`finishDrag`/`commitReorder`/`detectMatchingSort`）。

**靠"稳定分区"重排`debts`数组本身**：早期这个项目的债务对象是纯用数组下标寻址的（`openDetail(i)`等），没有单独的id或顺序字段；后来加了真正的`id`字段（见"债务对象加了真正的id字段"一节），但那解决的是"怎么单独寻址一笔债务"，不是"怎么记录债务之间的相对顺序"——`debts`数组里的物理位置依然是唯一的排序依据，没有另外引入一个顺序字段，下面这套重排算法完全没有变。拖拽提交时`commitReorder()`按原数组顺序走一遍，凡是"在还"的槽位依次填入新顺序，凡是"已结清"的槽位原样不动——已结清债务在数组里的相对位置完全不受这次拖拽影响。

**拖拽全程用文档坐标（`clientY + window.scrollY`），不是纯视口坐标**——这是为了让"拖到屏幕边缘自动滚动页面"不需要额外的重新测量：`beginDrag()`一次性测好每张卡片在文档坐标下的自然位置（`naturalTop[]`），之后无论页面怎么滚动，两张卡片位置的差值都不变，`applyDragFrame()`每次都是从`naturalTop[]`重新算全部卡片该挪多少像素，不是在上一帧基础上累加——这样来回快速拖拽也不会产生漂移误差，卡片回到原位时自动得到位移为0。

**⚠️ 触摸手势必须用 Touch Events，不能用 Pointer Events——这是踩了很多轮才定位到的架构级坑，改这块前务必看懂**：需求是"同一张卡片：平时手指按上去能滚动列表，长按后能拖动排序"。这两件事在触摸设备上没法用 Pointer Events 兼顾，根本原因是——**用 Pointer Events 时，`pointermove` 上的 `preventDefault()` 不能阻止浏览器滚动**，滚不滚只由 CSS 的 `touch-action` 决定，而 `touch-action` 在手指刚触屏那一刻就锁定了、手势中途改它对当前这次触摸无效。于是 Pointer Events 只能二选一：`touch-action:none`→拖得动但卡片上没法滚动；`touch-action:pan-y`→能滚动但一竖着拖就被浏览器抢去当滚动、发`pointercancel`把拖拽杀掉。**之前反复"要么拖不动、要么只能在卡片间隙滚动"，全是因为在 Pointer Events 这条注定二选一的路上来回调参数。**

  最终方案（`onCardTouchStart`）：**触摸设备走 Touch Events（`touchstart`/`touchmove`/`touchend`），且 `touchmove` 监听器必须 `{passive:false}`**——只有 touch 事件的 `touchmove.preventDefault()` 能"逐次"动态否决原生滚动。平时（等待长按、或判定为滑动/滚动）完全不 `preventDefault`，原生滚动照常、手感跟卡片间隙完全一致；一旦长按判定成功、确认进入拖拽，之后每一次 `touchmove` 都 `preventDefault` 挡掉滚动、由 JS 接管定位。因为长按判定期间手指是静止的（移动超过10px就取消长按、判定为滚动），拖拽激活时原生滚动根本没启动，第一次 `preventDefault` 就能干净挡下。卡片 `touch-action` 保持默认（`auto`），不要再设 `none`/`pan-y`。**桌面鼠标**才走 Pointer Events（`onCardPointerDown`，`pointerType==='mouse'` 时才处理，纯为桌面浏览器可测；真机上 touchstart 和 pointerdown 都会触发，靠这个判断避免两边重复处理）。

  **长按还会触发 WebView 自带的系统级触感反馈（马达震动）**，这是内容层的手势识别，网页层的 `user-select:none`/`preventDefault` 都管不住——已在 `MainActivity.java` 里用 `bridge.getWebView().setHapticFeedbackEnabled(false)` 从原生层关掉。配合全局的 `user-select:none`（body 上关、只 input/textarea 放开）+ 全局阻止 `contextmenu`，一起压掉长按的选中/菜单/震动这几个原生副作用。

  **拖拽期间故意不复用现有的`lockScroll()`/`unlockScroll()`**（`initGripDrag`用的那套refcounted滚动锁，靠`document.body.style.overflow = "hidden"`实现）——如果拖拽时也锁滚动，会跟"边缘自动滚动"里的`window.scrollBy()`打架（`overflow:hidden`在不同浏览器引擎下对程序化滚动的影响不一致，不值得赌）。拖拽时靠上面说的 `touchmove.preventDefault()` 挡原生滚动就够，不需要再叠一层滚动锁。

**排序方式（含自定义）现在会跨App重启记住**——`debtSort`存在独立的`SORT_KEY`（`debt-manager-sort-v1`）里，通过`setDebtSort()`这一个函数统一读写，不要绕过它直接改`debtSort`变量（会漏掉持久化）。

**编辑模式期间`#addBtn`（新增一笔）、已结清区域的"恢复"按钮、`#debtSortSel`下拉框都会被禁用**（CSS靠`#view-debts.jiggling`这个类切换），目的是保证编辑模式期间不会有别的sheet被同时打开——这也是为什么`window.__handleBackButton`里`jiggleMode`的判断可以放在最前面、跟其余判断互斥（见上面"返回键处理"一节）。

## 在还债务主页视觉改版：石墨hero卡 + 磨砂玻璃债务卡 + 灵动AI入口

顶部区域（原来是"债务管理"标题+5张平级KPI+朴素AI banner）整体重做过一轮，目标是解决"没有设计感、像默认样式堆出来的"这条反馈。改动只在视觉/交互层，`renderSummary()`/`renderDebts()`算的数字、`openDetail`/`payInstallment`这些底层函数完全没动。

**新增的一批CSS变量**（`--hair`/`--card-grad`/`--app-grad`/`--e1`/`--e2`/`--e3`/`--glass`/`--glass-border`/`--glass-hi`/`--graphite-a`/`--graphite-b`/`--graphite-text`/`--graphite-dim`/`--graphite-sheen`/`--text-faint`/`--accent-rgb`）——**三处都要同步加**（裸`:root`+`prefers-color-scheme:dark`媒体查询里的`:root`、`:root[data-theme="light"]`、`:root[data-theme="dark"]`），这是这个文件一直以来的既有模式（明暗色靠系统偏好和手动切换两条路都要覆盖到），别漏改其中一处。`--e1/e2/e3`是三档elevation阴影（列表最轻、卡片中等、hero最重），跟原有全局唯一的`--shadow`并存，`--shadow`继续给这轮没碰的其它组件（sheet、modal、价格卡等）用，不要把它们批量替换成新token。

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
## 还款提醒页：hero卡片 + 左滑标记已还

> **⚠️ 这一节记录的是这个页面视觉/交互设计的历史由来（为什么是4档急迫程度、为什么筛选和分组都叫"7天内/30天内"但语义不同、为什么手势要用Touch Events等），这些设计决定依然成立、依然是当前实现的依据。但"渲染方式"本身已经翻篇：这个页面（连同`#payHero`/`#payList`/`#payFilter`等vanilla DOM结构和`renderPayHero()`/`renderPay()`等函数）已经整体由React接管，见上面"React 迁移"一节"第三步"。CSS类名（`.pay-hero`/`.pay-row`等）全部原样复用，下面提到的具体函数名/DOM id仅作历史参照，不代表当前代码里还存在。**

"还款日"标签页顶部有一张"最近还款日"卡片（`#payHero`，`renderPayHero()`），取所有在还债务里下一期还款日最近的那一笔，底色按急迫程度换色。下面`#payList`列表里每一条债务卡片支持向左滑动，滑出一个"标记已还"按钮（类似iOS/微信聊天列表左滑删除）。

**急迫程度现在是4档阈值，卡片底色和列表圆点共用同一套`urgencyTier(diff)`**（`diff`=距还款日的天数）：`diff<0`=逾期(`overdue`)、≤3天=红(`crit`)、≤14天=黄(`warn`)、其余=绿(`dim`)。**逾期是后来单独从`crit`拆出来的一档**——早期逾期和"3天内到期"共享同一个`crit`视觉，都是淡色底；逾期这一档现在故意用`--critical`实心底+白字（比其它三档的淡色底更强烈），列表圆点也加了`dotPulse`脉冲动画（`box-shadow`用`--critical-soft`做呼吸圈），因为逾期没还的实际代价（利息/信用）比"还没到但快了"更高，需要更抢眼的提示，不能被当成同一档忽略掉。`relLabel(diff)`对应也从含糊的"已到期"改成"已逾期 N 天"。**`dim`档一开始用的是`--accent`（品牌绿），浅色模式下这个绿是`#18453B`深墨绿，9px小圆点尺寸下几乎看着像黑色**——已经改成`--good`（这个项目里"已结清"/"低利率"这些正面信号一直用的蓝色），清晰可辨。以后再调这类小尺寸状态色，先拿实际渲染尺寸眼看一遍，不要只看色值本身是不是"绿色"就假设够用。

**左滑手势沿用"在还债务"长按拖拽那条踩过的教训（见下面"在还债务自定义排序"一节），但场景更简单**：拖拽排序需要在同一个垂直轴上"平时滚动、长按后接管"，只能用Touch Events；这里左滑只需要接管**水平**轴，垂直滚动完全交给原生，所以可以额外用`touch-action:pan-y`提前告诉浏览器"水平不归你管"，减少和原生手势抢的可能，JS里对水平方向再补一层`preventDefault`兜底。触摸设备走Touch Events（`touchstart`/`touchmove`+`{passive:false}`/`touchend`），第一次移动时按dx/dy哪个更大判断"这是横滑还是竖直滚动"；桌面鼠标走独立的Pointer Events分支（`pointerType==='mouse'`才处理），纯为桌面浏览器可测。

**⚠️ 踩过一个坑：`__justDragged`这个"防止拖拽结束后紧接着的click把刚展开的滑块关掉"的标记位，必须在每次新手势开始时重置，不能只靠点击去消费它**——真正带位移的拖拽/滑动手势结束后，浏览器**不会**触发click事件（只有原地无位移的tap才会），所以如果只在click handler里"用一次就清空"，这个标记位在一次真实拖拽后会一直是`true`、永远等不到click来消费它，直到很久以后一次完全独立、毫不相关的正常点击也被这个陈旧的标记位误伤（表现是"点开着的滑块想关掉它，点了没反应"）。修法：`touchstart`/`pointerdown`一开始就先重置`front.__justDragged = false`，而不是只寄希望于click阶段清空。以后写类似"拖拽后抑制紧跟着的一次click"的逻辑，先确认这次手势结束后浏览器到底会不会补发click，别想当然。

**同一时间只允许一条卡片保持展开**（`paySwipeOpen`模块级变量），展开新的会自动收起旧的；点开着的卡片本身会收起它；切到别的tab会强制收起（`closePaySwipe`）。滑出的"标记已还"按钮直接复用`payInstallment(i)`（债务详情页"销这期"背后的同一个函数），确认弹窗、结清判断、toast提示全部保持一致，没有另写一套逻辑。

**这轮跟"在还债务主页视觉改版"对齐风格时，`.pay`卡片也改成了磨砂玻璃质感，连带把左滑结构从"绝对定位叠层"换成了"flex并排"**——这是补上`.debt-front`那次已经踩过、写进CLAUDE.md的坑：`.pay-swipe-btn`原来是`position:absolute`叠在`.pay`正后方，`.pay`当时是不透明的`var(--surface)`所以不出问题；改玻璃质感后如果不动结构就会重蹈"按钮颜色透过玻璃常驻可见"的老坑。现在结构是`.pay-row`（外层，`overflow:hidden`+`box-shadow:var(--e2)`）→`.pay-swipe-row`（内层flex行，左滑的`translateX`打在它身上）→`.pay`（`flex:0 0 100%`，玻璃卡面）+`.pay-swipe-btn`（`flex:0 0 92px`，卡片右侧屏幕外），跟`.debt-row`/`.debt-front`/`.debt-swipe-btn`同一套模式。`initPaySwipe(outer, swipeRow, front, idx)`签名也跟着改了，`transform`统一打在`swipeRow`（即`.pay-swipe-row`）上，不再是`front`。

**点卡片（非滑动状态）现在会打开债务详情（`openDetail(idx)`）**——早期版本卡片点击只处理"收起已展开的滑块"，没有导航效果，是一个功能缺口（跟"在还债务"卡片"点击开详情"的心智模型不一致）。`initPaySwipe`新增第4个参数`idx`就是为了接这个。

**Hero下方新增`#payStats`两个小指标卡（本周待还/本月待还，金额+笔数）**，跟主页`#summary`共用`.kpi`视觉语言。**周/月是累计口径（月⊇周，`diff`0~6算周、0~29算月）且都不含逾期**——逾期是"已经错过"的，跟"即将要还"的"待还"语义不是一回事，逾期笔数只在下面列表分组里出现，不在这两个小指标里重复计。

**`#payList`现在按`dueBucket(diff)`（已逾期/7天内/30天内/更晚，四档，注意阈值跟`urgencyTier`的3/14天不是同一套）分组显示，组间插入`.section-label`小节标题（"7天内 · 3笔"这种格式）**，不再是一条纯排序的flat list。**逾期分组的`.section-label`额外加`.overdue`（红字加粗），单独摘出来强调**——逾期的实际代价比"还没到但快了"更高，之前只体现在hero和圆点颜色上，列表本身没有单独强调过。

**⚠️分组标签最早叫"本周内/本月内"，真机反馈后改成了"7天内/30天内"**——"本月"这种说法暗示按自然月计算（比如"到本月底"），但`dueBucket`实际是纯滚动天数窗口（`diff<=7`/`diff<=30`），标签数字和逻辑边界能对上才不会误导人，以后这类"相对时间窗口"分组，标签直接用字面天数，不要用"周/月"这种容易被读成日历语义的词。

**列表上方新增`#payFilter`筛选条（全部/已逾期/7天内/30天内四个`.pf-btn`），跟分组用的是同一个"7天内/30天内"说法但语义不同，注意别混淆**：分组（`dueBucket`）是给"全部"视图做互斥分段用的，每笔债务只属于一个组，避免同一条在列表里出现两次；筛选是"看更窄范围"，`payFilter`的`week`/`month`两档判定用的是**累计**口径（`diff 0~7`/`diff 0~30`，`month`天然包含`week`那些），不是从`dueBucket`的互斥边界复用逻辑——这是刻意的：点"30天内"筛选时用户想看的是"接下来30天要还的全部"，不是"只看第8~30天那一段"，如果照搬互斥分组的判定会让这周就要还的那几笔从"30天内"筛选结果里消失，违反直觉。`payFilter`是模块级变量（不持久化，纯会话内状态），`renderPay()`每次都重新渲染筛选条+按当前`payFilter`过滤`items`得到`visible`，hero和`#payStats`两个小指标卡不受筛选影响，永远基于全量`items`算——它们是总览widget，不是"当前筛选视图"的一部分。

**Hero下方两个小指标卡的标签也从"本周待还/本月待还"改成了"7天内待还/30天内待还"**，跟分组标签统一说辞。这两个卡的口径本身没变，仍然是累计（0~7/0~30，`month`≥`week`），因为一个KPI headline("7天内待还¥X")本来就该是"接下来7天内全部要还的钱"这种累计语义，跟分组labels面对的问题（互斥分段被误读成累计）不是同一类风险，不需要跟着分组改成互斥。

**卡片左边那个9px小圆点(`.dot`)已经删掉**：改磨砂玻璃质感这轮给卡片本身加了`.pay-row.crit/.warn/.dim/.overdue`驱动的`::before`色晕，已经能传达同一份严重度信息，小圆点变成纯粹的信息冗余，删掉了`.dot`相关的CSS（含`dotPulse`那个逾期呼吸动画）和HTML。

**`.pay-row`/`.pay`的圆角从20px改成了18px，跟"在还债务"卡片的`.debt`/`.debt-front`对齐**——这两套左滑卡片结构是同一套模式抄出来的两份实现，圆角数值当初没有互相核对，一个20px一个18px，视觉上两个页面来回切换能看出差异。统一成18px（以`.debt`那份为准，它是更早定下来的）。

**空状态（没有在还债务）从一行灰字改成了带图标的正向反馈**：`.pay-hero.empty`背景从中性灰改成`--good-soft`（跟`dim`档共用"平静的好消息"语义），配一个绿底白色对勾图标（复用"销这期"按钮同一条`M20 6 9 17l-5-5`路径，不是新画的）+"全部结清"标题+"暂无待还款项"副标题。**没有用emoji**——这个App别的地方（比如`payInstallment`成功后的toast）历史上用过🎉，但这次空状态刻意选了更克制的纯图标+文字方案。

## 新增/编辑债务表单（`#editSheet`）

**"一次性还清"复选框(`f-oneTime`)勾选/取消勾选，靠`oneTimeStash`暂存被隐藏的期数，不能只是视觉隐藏**：早期`renderPlanRows()`勾上"一次性还清"时只是把第2期起从界面上`slice(0,1)`隐藏掉，底层`editingPlan`数组没有真的删——如果用户先手动加了2期再勾选，保存时那第2期还是会跟着存进去，导致"一次性¥X"（只显示第1期金额）和"借款金额"（全部期数本金相加）对不上，是个真实bug。修法：`syncOneTimeUI()`里勾选时把第2期起真正挪到`oneTimeStash`里（不是丢弃），取消勾选时原样放回`editingPlan`——这样来回勾选不会丢手动填过的数据。`oneTimeStash`每次`openEdit()`都要清空，不能跨债务残留。

**"手动添加"/"公式生成"是二选一的分段切换器（`planMode`变量 + `#planModeToggle`），不是两套入口同时堆在页面上**——原来是"用公式生成▾"折叠按钮和常驻的"＋加一期"按钮并存，容易同时露出两套UI显得乱。现在点哪个就只显示哪个的内容，公式生成完之后自动切回"手动添加"（`setPlanMode("manual")`）方便直接在结果上逐行微调。

**⚠️ `#gFirstField`（首期还款日）只有一份DOM，靠JS在切换计息方式时物理搬家，不是四份独立字段**：公式生成有4种计息方式（等额本息/信用卡等本等费/先息后本/自定义），"首期还款日"这个输入框是所有计息方式共用的同一个字段，但用户要求"期数"和"首期还款日"在默认的"等额本息"模式下要拼成一行——由于`data-gg`各计息方式区块之间是互斥显示（切换时`display:none/block`），没法让同一个DOM节点同时"属于"两个不同区块。解决方式是`setGenUI(k)`每次切换计息方式时，用`appendChild`把`#gFirstField`这个`.field`容器整个搬到当前生效区块里——等额本息时搬进`#amortPeriodRow`（跟"期数"拼成`.field.two`一行），其它三种搬到各自区块末尾（单独一行，位置跟以前一样）。**以后如果要再调整这个字段的布局，记住它是"移动"不是"复制"，四种计息方式任何时候都只有一份`#g-first`输入框存在于DOM里，只是挂在不同父节点下。**

**"还款日（几号）"(`f-day`)不再手动填，是从还款计划第1期的实际日期里自动推出来的**（`updateFDayFromPlan()`，挂在每次计划变动的地方：加/删行、改日期、公式生成、批量设置还款日、一次性还清勾选/取消）。这个字段现在是`readonly`，不带必填星号，`saveForm()`校验时也直接读`editingPlan[0].date`而不是这个DOM字段的值。这么改是因为`d.day`这个字段过去在整个App里**完全没有别的地方读取/显示**（纯粹是用户手填、存进去就再也用不上的孤立数据），让它跟真实计划数据保持一致远比允许手填一个可能对不上的数字更有意义。

**批量设置还款日：选"几号"之后点"应用到全部"会额外弹一个要"首期哪年哪月"的确认框**——这是给`ask()`这个原有的通用确认弹窗新加的可选第4个参数`opts.month`（会临时显示一个`<input type="month">`，`onOk`回调收到选中的月份字符串），其它调用`ask()`的地方不传这个参数就是原来纯文字确认框，不受影响。确认后按"首期年月+几号，每期顺延一个月"批量铺日期，超过当月天数会clamp到当月最后一天。

**批量设置的"几号"和公式生成的"首期还款日"都不允许选29/30/31号，但还款计划表格里逐行手动填的日期不受限制**——这两个入口本质是在投射"每月同一天"的重复规律，29-31号在有些月份根本不存在，会导致还款日在不同月份之间漂移（有的月28号有的月31号），所以直接拦（`isBadRepeatDay(day)`），toast提示去表格里逐行手动填。表格里每一行的日期选择器（`#planRows`里的`data-f="date"`）代表的是"这一期具体是哪天"的真实数据，现实中贷款完全可能就是某个月的30号到期，所以这里故意不加这条限制——**两个入口的定位不同（一个是投射重复规律的快捷工具，一个是记录真实数据的详情表），限制也应该不同，别图省事统一加同一条规则。**

**⚠️ 踩过一个坑：`#g-P`/`#g-rate`/`#g-n`/`#g-first`（公式生成tab专属的几个字段）不能带HTML5原生`required`属性**——它们跟"保存"提交按钮共用同一个`<form id="debtForm">`。只要用户当时停留在"公式生成"这个tab（`#genPanel`是`display:block`可见状态），哪怕根本没点"生成计划"，这几个字段只要有空的，点"保存"就会被浏览器原生表单校验拦截、`saveForm()`根本不会被调用——**而安卓WebView不会像桌面浏览器那样弹校验提示气泡，拦截后的观感就是"点保存彻底没反应"**，不关窗、不报错、不提示，非常难排查（一度真机反馈"编辑债务保存点不了"，查了很久才定位到是这几个`required`）。修法：去掉这几个字段的`required`（视觉星号`<span class="req">*</span>`保留），校验挪到`#doGen`（"生成计划"按钮，`type="button"`不是`submit`）自己的点击事件里手动toast提示。**以后如果再往`#genPanel`（或者任何跟主表单共用一个`<form>`、但靠`display:none`切换显隐的子面板）里加字段，一律不要用原生`required`，会有同样的隐形阻塞风险——校验都应该手动做、用`toast()`明确提示，不要依赖浏览器原生表单校验的可见反馈（WebView里没有）。**

## 订阅UI基础设施：单一 Premium（买断 + 订阅两种购买方式）

> **⚠️ 这一节的历史已翻篇：早期是 Premium / Premium+ 两级分级（正交产品线 → 后来改成分级），现在已经合并成"单一 Premium 一个 tier"。** 原 Premium+ 独有的 AI 功能全部并入 Premium。同时免费/付费边界也重划过一轮（见下）。下面正文里凡是还提到"Premium+ / 分级 / hasPremiumPlus / 两个tab"的描述都是**已作废的旧状态**，保留是为了让你读懂演进；当前真实状态以本框内和"AI 债务顾问"一节为准：
> - **只有一个 Premium**：数据模型 `PREMIUM_KEY`（`after-zero-premium-v1`）存 `{ premium: {method:"onetime"|"monthly"|"yearly"|"redeemed", at:ISO} | null }`，单字段。`hasPremium()` = `!!premium.premium`。**`hasPremiumPlus()` 已删除**，全项目引用改成 `hasPremium()`。加载时有一次性兼容迁移（旧 `premiumPlus` 字段搬进 `premium`）。
> - **两种购买方式并存**：¥98 永久买断 / ¥5.9 月 / ¥50 年，三张价卡共享一份互斥选中态（`premiumPlanSel` 是单个字符串 `"onetime"|"monthly"|"yearly"`）。订阅页 `#premiumScreen` 不再有 tab，一份功能列表 + 一个价格区（买断整行高亮 + 月/年两列）。价格仍是占位（用户已确认），接真实支付时再定。
> - **免费/付费边界（重划后）**：图表查看、提前还款模拟器 → **免费**（零成本、桌面级、口碑引擎，删了门禁）；高级统计报表**导出 PDF/Excel**、云备份、AI → **付费**（导出在 `reportExportXlsxBtn`/`reportExportPdfBtn` 的 click handler 里判 `hasPremium()`，查看图表无门禁）。判断标准：有真实成本（服务器/算力）才收费，纯客户端零成本的不设障碍。
> - **兑换码**：`REDEEM_CODES = {"0000":"premium"}`；`applyRedeemTier` 写 `premium.premium={method:"redeemed",at}`。`__debugPremium` 状态只剩 `"premium"`/`"none"`。

## （以下为旧版分级设计的记录，多数已作废，读时对照上面的框）Premium(一次性买断) + Premium+(月付/年付，分级包含Premium)

"我的"页"账户"卡片和"全部数据"卡片之间有一张Premium入口卡片（`#premiumEntryCard`），"在还债务"页顶部KPI卡片下方有一条低调的AI入口banner（`#aiBannerBtn`），两者都会跳到同一个新的整页浮层`#premiumScreen`（Premium/Premium+两个tab切换）。**这轮只做UI展示层，没有接真实支付**——App还没上架任何应用商店，接不了Google Play Billing/华为应用内购这类真实购买流程，"订阅并支付"按钮点了只会弹"暂未开放真实支付"的提示框（`ask()`, `onOk`传`null`）。以后App真正上架后，要把这个按钮换成真实购买流程，再决定`premium.premium`/`premium.premiumPlus`要不要补充到期时间等字段。

**⚠️ 这两级会员名字最早叫"Pro"/"AI"，后来改成了"Premium"/"Premium+"，且关系从"两条互相独立的产品线"改成了"分级"**——早期`hasPro()`/`hasAI()`是正交的（可以只买一个、也可以两个都买，互不包含）；现在`hasPremiumPlus()`（对应老的`hasAI()`）和`hasPremium()`（对应老的`hasPro()`）是**分级**关系：`hasPremium()`的实现是`hasPremiumPlus() || !!premium.premium`，买了Premium+就自动被判定为拥有Premium的全部功能，不需要再单独持有一份`premium.premium`记录去"凑"这个包含关系。以后如果在代码里看到`hasPro`/`hasAI`这两个名字，那是没改完的遗留，应该统一改成`hasPremium`/`hasPremiumPlus`。

**数据模型依然是两个独立的可空字段，不是单一tier枚举**：`PREMIUM_KEY`（`after-zero-premium-v1`）存的是`{premium, premiumPlus}`，`premium.premium`形状是`{purchasedAt}`（一次性买断，没有"到期"概念），`premium.premiumPlus`形状是`{billing:"monthly"|"yearly"|"redeemed", startedAt}`。拆成两个字段而不是`tier:"free"|"premium"|"premiumPlus"`纯粹是历史沿革（当年Pro/AI是正交产品线时就这么设计的），现在虽然逻辑上是分级，但没必要为了"看起来更像tier"去重构存储形状——`hasPremium()`/`hasPremiumPlus()`/`premiumLabel()`三个helper已经把分级关系封装好了，"我的"页入口卡片、账户详情页"会员"行、AI banner三处渲染都调这三个函数，不要各写一套if/else，也不要绕开这两个helper直接读`premium.premium`/`premium.premiumPlus`。

**开发/测试阶段没有真实支付可以验证"已订阅"UI，用`window.__debugPremium(state)`这个调试钩子**（跟CLAUDE.md早先记录的"手写localStorage跳过登录门"是同一类调试手法，但这个额外包成了函数）：

```js
window.__debugPremium("premium")      // 模拟已买断Premium
window.__debugPremium("premiumPlus")  // 模拟已订阅Premium+（自动包含Premium的全部功能）
window.__debugPremium("none")         // 清空，恢复"普通用户"
```

调用后会立即重渲染"我的"页入口卡片、账户详情页"会员"行、AI banner这三处UI，不需要手动刷新页面——桌面浏览器或真机WebView的devtools console里都能执行。

**兑换码：`#premiumScreen`底部"我有兑换码"入口，这一批只做了最小可用的调试功能，不是真实的兑换系统**——点开会展开一个文本输入框+"兑换"按钮，`REDEEM_CODES`是一个硬编码的`{code: tier}`映射表，目前只有一条：`"0000"`兑换`"premiumPlus"`。兑换成功会调`applyRedeemTier(tier)`直接在本地写`premium.premiumPlus`（`billing:"redeemed"`，跟真实购买的`"monthly"|"yearly"`区分开，方便以后排查这份数据是不是调试凑出来的），没有任何服务端校验、没有一次性使用限制、没有真实的码库。**App正式上线、接入真实支付渠道后，这条硬编码必须删掉**，换成真正的后端兑换码系统（生成、核销、防止重复使用、绑定具体商品）——现在这个只是给开发者自己在没有真实支付的情况下快速切到Premium+效果看的，跟`window.__debugPremium()`是同一类"临时调试手段"，只是换了个从UI里也能触发的入口。

**订阅页价格是占位数字**（Premium ¥98一次性、Premium+ ¥18/月或¥120/年），已经跟用户确认过接受占位、以后接入应用内购时再定真实定价和商品ID，代码里也注释了这一点。Premium+既然分级包含Premium，未来定真实价格时，Premium+的定价逻辑上应该体现"Premium价格+差价"而不是两个完全独立算出来的数字——这次占位数字没有体现这层关系，上线定价时要重新算。

**`.subpage#premiumScreen`是这个项目第二个"整页推入"型浮层**（第一个是`#accountScreen`，见上面"返回键处理"一节），完全照抄它的`.subpage`/`.subpage-header`/`.subpage-body`骨架，也同样加进了`window.__handleBackButton`那条"最上层先关"的判断链——加在`accountScreen`判断**之前**（`modalScrim`判断之后），因为`premiumScreen`在HTML里插在`accountScreen`之后，两者同为`.subpage`（z-index:35）时DOM顺序更靠后的绘制在上层，返回键要先关视觉上在最上层的那个。

**Premium tab的"强调"没有照搬`.pay-hero.overdue`那种整卡实心红底的处理手法**——那是"逾期"这种真正紧急语义专属的最强视觉信号，订阅是转化场景，语义严重级别低得多，用了跟`.pm-btn.active`/`.file-row[aria-current]`同一套"描边+浅底"选中态配方，不专门为订阅页发明新的强调手法。

**兑换码输入框默认收起，每次进订阅页都强制复位成收起**：`#redeemInputWrap`默认`display:none`，点"我有兑换码"（`#redeemToggleBtn`）才展开。`openPremiumScreen()`里显式把它`display="none"`+清空输入框——不这么做的话，上次展开过、关掉订阅页再进来会残留成"一进来就展开"的观感（用户当bug报过）。以后订阅页里任何"点开才显示"的东西，都在`openPremiumScreen()`里复位初始态，别只依赖HTML的默认属性。

**《购买者服务条款》是订阅页footnote里一个高亮可点的链接（`.terms-link`/`#termsLink`），点开进整页浮层`#termsScreen`看真实条款**：条款正文（`www/index.html`里`#termsScreen .terms-body`）目前是**初稿**——覆盖适用范围/会员类型/价格支付/自动续订与取消/退款/兑换码/变更终止/数据免责/更新等条目，末尾明确标注"初稿、仅占位、非最终法律文本"。App正式接入真实支付、上架前要把这份换成正式版本（措辞、退款政策要对齐实际接入的应用商店规则）。`#termsScreen`是继`accountScreen`/`premiumScreen`之后又一个`.subpage`整页浮层，已加进`__handleBackButton`判断链（见下面那条）。

**"我的"页顶部账户区已从"带框的横排（头像+昵称+右箭头）"改成"无框竖排：头像居中、昵称在头像下方居中"**（`.account-head`/`.account-avatar-btn`/`.account-avatar-lg`/`.account-name-c`，替换掉原来的`.data-card#accountCard`+`.account-row`）——**点头像**（`#accountAvatarBtn`）进"账户"详情页`#accountScreen`（原来是点整条`#accountRowBtn`）。注意`.account-avatar`这个class（44px）现在只剩账户详情页在用了，别删；账户区头像用的是新的`.account-avatar-lg`（78px）。`renderAccountUI()`往`#accountAvatarImg`/`#accountNameText`塞头像和昵称，这两个id没变。

**"更大档案库空间"这条Premium功能文案已删除**：档案库文件存在设备本地，开发者没有服务器成本要摊销，人为设一个容量上限纯粹是为了逼氪制造障碍，经不起"这明明不花你一分钱为什么要限制我"的质疑，跟"云备份"（有真实服务器成本）、"OCR识别"/"智能问答"（有真实算力成本）这几条不是一回事。以后再给Premium/Premium+列功能点，先想清楚这条是不是有真实成本支撑，不要照抄"更大空间/无限XX"这类通用套路。

**`__handleBackButton`那条"最上层先关"判断链，当前完整顺序是** `modalScrim` → `termsScreen` → `aiHistorySheet` → `aiScreen` → `backupScreen` → `docsScreen` → `simScreen` → `premiumScreen` → `accountScreen` → `notifySheet` → `editSheet` → `detailSheet`（`aiScreen`=AI 债务顾问整页浮层，DOM 里插在 `backupScreen` 之后、`termsScreen` 之前，所以判断排在 `backupScreen` 之前、`termsScreen` 之后；`aiHistorySheet`=从`aiScreen`内部打开的历史对话sheet，必须排在`aiScreen`判断**之前**，因为它视觉上盖在`aiScreen`上层——这是"最上层先关"规则第一次出现在"sheet挂在subpage内部"这种场景，不是简单按DOM先后顺序套用，而是按实际视觉层级：`aiHistorySheet`的z-index被手动提到36、比`aiScreen`所在的35更高，见上面"AI 债务顾问"一节）。**`docsScreen`（档案库，见下面"导航重排"一节）是"高级统计报表"升级成主tab之后腾出来的subpage槽位——原来这个DOM位置是`reportScreen`，`reportScreen`已经不再是subpage，`docsScreen`原样占了它的位置和链上的判断顺序，没有引入新的DOM排序问题。** 判断依据不变——这几个`.subpage`在HTML里都插在`premiumScreen`之后（`simScreen`最先、`docsScreen`次之、`backupScreen`、`termsScreen`最后），DOM顺序更靠后的在同z-index下画在上层，返回键要先判视觉上在最上层的那个。以后再加新的`.subpage`，永远加在它在DOM里紧邻的"后一个已有subpage"判断之前，不要图省事加到链尾。（`termsScreen`=购买者服务条款页，是订阅页里"《购买者服务条款》"链接点开的整页浮层，DOM里插在`backupScreen`之后，所以判断排在`backupScreen`之前、`modalScrim`之后。）

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
- 债务卡片长按有蓝色底色一闪——`.debt`/`.debt-row`/`.debt-front`都是`<div>`不是`<button>`，接不到全局`button{-webkit-tap-highlight-color:transparent}`那条规则，安卓WebView默认的原生"点按高亮"（半透明蓝）在长按触发拖拽排序手势时会闪一下。三层都单独加了`-webkit-tap-highlight-color:transparent`。**这类"某个自定义可点击的`<div>`没有tap-highlight"的问题，以后遇到同样表现（长按/点击后有一闪而过的原生高亮色），先检查它是不是div/非button元素，没接`button{}`规则这个大概率就是根因，别先怀疑是自己写的CSS/JS有冲突。**

## 统计（原"高级统计报表"，已从"我的"页Premium子页升级成主tab）

> **⚠️ 渲染层已经再翻篇一次：`#view-report`内部这次（React迁移第三步）已经整体由React接管（`react/src/report/`），下文提到的`renderReportScreen()`/`renderBalanceBars()`等vanilla函数、`#reportKpis`/`#reportCharts`等DOM id都已经是历史记录，不是当前代码。这一节记录的"tab化"这个架构决定（免费查看/付费导出边界、`renderAll()`管线触发渲染）依然成立，是理解"为什么现在这样设计"的背景，但具体实现细节以"React 迁移"一节的"统计"子节为准。**

**这里的历史已经翻篇：早期是"我的"页里`hasPremium()`门禁的一张入口卡片、点开是整页浮层`#reportScreen`——现在是底部tabbar第3个主tab（`data-view="report"` → `#view-report`），不再是子页面，也不再有任何门禁。** 这次改动是"导航重排"那轮的一部分（详见下面"导航重排"一节），动机是图表查看本来就已经改成免费（见上面"订阅UI基础设施"一节的免费/付费边界），既然免费又是这个app除债务列表外最值得看的东西，直接提到主tab比藏在"我的"页一张卡片后面曝光率高得多。**导出PDF/Excel依然是Premium权益，没变**——门禁在`reportExportXlsxBtn`/`reportExportPdfBtn`各自的click handler上，未开通直接跳订阅页（不再需要先"关掉当前子页面"这一步，因为现在就在主tab上，没有子页面要关）。

内容（React迁移第三步时）：2个KPI（加权平均利率、预计全部还清日期）+ 3张图（各债务余额对比的横向条形图、债务类型占比的堆叠条形图+图例、负债预测走势折线图）+ 数据明细表（默认直接展开，不折叠），支持导出真正的`.xlsx`和`.pdf`文件。**`renderReportScreen()`函数名字没跟着改**（还叫"Screen"不叫"View"，是历史遗留，不影响功能，以后大改这块时可以顺手改名）——现在挂在`renderAll()`管线里跟`renderSummary()`/`renderDebts()`等一起调用，债务数据一变，统计tab的内容自动跟着刷新，不需要"进入tab时才渲染"这种额外逻辑（因为它不再是"打开"的东西，是常驻的tab）。**⚠️"2个KPI+3张图"这个数字后来变了两次**：先是"统计tab视觉+交互升级"那轮改成可折叠的Hero（2常驻+4展开共6个指标）+4张图；再是"统计tab口径修正"这轮（2026-07-29）把折叠去掉、改成**4个常驻KPI（累计已还本金/经常性月供/归零进度/加权平均利率）+ 笔数降级成一行小字 + 一个"计算口径说明"折叠面板**，见下面"统计tab口径修正"子节。

**这是这个项目第一批图表，配色套用了`dataviz` skill的默认8色类别色板**（`.viz-root`里的`--series-1`..`--series-8`，明暗双模式都定义了），**已经用skill自带的`validate_palette.js`对着本项目实际的浅色`#FFFFFF`/深色`#191D24`底色重新验证过**（全部PASS，只有浅色模式下3个色阶低于3:1对比度触发"relief rule"——用可见的图例文字+数据表满足，不单靠颜色）——不是直接照抄skill文档里参考色`#fcfcfb`/`#1a1a19`的验证结果，那个底色跟这个项目不是一回事，swap配色后必须重新跑一遍验证脚本，这条以后加新图表也适用。三张图全部手写（条形图用普通div+百分比宽度，堆叠条+折线图用内联SVG），没有引入任何图表库。

**"债务类型占比"用`d.type`分组，不是`d.funder`**：`type`是表单里的固定下拉选项（银行贷/信用卡分期/网贷/私人借款，4个值），天然有界；`funder`是自由文本，可能有任意多种取值，容易在图上炸出一堆细碎分类。超过6类会折叠成"其他"，这是判断取舍，不是bug。

**导出用两个库：`jspdf@2.5.1`（UMD，全局`window.jspdf.jsPDF`）+ SheetJS `xlsx@0.20.2`（全局`window.XLSX`）。⚠️这两个库现在是本地打包在`www/fonts`同级的`www/js/`目录下（`www/js/jspdf.umd.min.js`、`www/js/xlsx.full.min.js`），用`<script src="js/xxx">`本地引入，不走CDN——这是踩坑之后改的**：早期从`cdn.jsdelivr.net`（jspdf）/`cdn.sheetjs.com`（xlsx）引入，在国内移动网络下这两个CDN经常加载不出来（不像腾讯的`static.cloudbase.net`稳，所以微信登录/CloudBase那几个CDN脚本没事），真机上表现为点"导出Excel/PDF"弹`toast("导出组件未就绪…")`（`typeof XLSX/window.jspdf === "undefined"`），桌面浏览器却测不出来（能连通CDN）。本地引入后随APK一起装机、离线可用，`npx cap sync`会把整个`www/`（含`www/js/`）打包进去。**以后再要引第三方前端库，第一反应就是下载到`www/js/`本地引入，不要用国内网络不稳的CDN**（CloudBase那三个`static.cloudbase.net`脚本是例外，腾讯自家CDN在国内稳，且SDK有版本耦合不方便本地固化）。`www/js/`跟`www/fonts/`性质一样，是`index.html`引用的本地静态资源、该进git，别当临时产物删掉。

- **Excel导出**（`exportReportXlsx()`）：`XLSX.utils.book_new()` + 3个sheet（债务明细/还款计划明细/汇总KPI），`XLSX.write(wb,{type:"array",bookType:"xlsx"})`包成`Blob`，走`saveToDeviceDownloads()`（硬性规则，见下面"原生插件：SaveFile"一节，不能用`<a download>`）。
- **PDF导出**（`exportReportPdf()`）：**故意不去克隆屏幕上那份用CSS变量取色的主题化SVG去截图**——序列化成独立SVG文档做光栅化时，`var(--accent)`这类CSS自定义属性脱离了页面样式表的作用域根本解析不出来（渲染出空白/黑色），这是真实会踩的坑，不是猜测。改成`buildExportChartsSVG(data)`单独生成一份**颜色全部写死成字面浅色hex值**的导出专用SVG（不依赖任何CSS变量、不依赖DOM，纯数据驱动），再走`svgStringToPngDataURL()`（Blob→Image→canvas→`toDataURL`）转成PNG，`doc.addImage()`贴进jsPDF页面。**⚠️标题/KPI这几行文字也画进这份SVG里一起栅格化，不用jsPDF的`doc.text()`**——jsPDF内置字体（Helvetica等）不含中文字形，`doc.text()`画中文会整段无法显示（不是排版问题是完全画不出），除非额外内嵌中文字体到vfs（工作量大，不做）。所以整份PDF的中文全程走"SVG→canvas→PNG"这条路，代价是PDF里文字不可选中（是图片）。**PDF固定用浅色配色，不跟随设备当前深色/浅色模式**——打印品在浅色下更易读，这是刻意的取舍。

**PDF现在也包含数据明细表了（不再只是图表摘要）**：早期版本PDF只有图表、明细留给Excel，后来用户要求PDF也带上明细表。因为明细是中文、同样过不了`doc.text()`，走的还是"SVG→PNG"这条路——`buildReportTableRows()`把三张表（各债务余额/类型占比/负债走势）拍平成行，`buildTablePagesSVG()`按每页约34个"行单位"（表头算2个）**分页**成多张SVG（`buildTablePageSVG()`每页一张、高度按行数动态算），`exportReportPdf()`把第1页图表 + 后续N页明细表逐张栅格化后`doc.addPage()`拼进PDF。之所以要分页而不是一张长图，是因为时间线可能几十行，单张超长图贴进A4会被页边裁掉。**屏幕上的数据明细表（`renderReportTables()`）现在也默认直接展开、不折叠了**（去掉了原来的`<details>`/`<summary>`，用户要求"直接展开不要收起"）。

### 统计tab视觉+交互升级：石墨hero+可折叠KPI+第4张图（月还款统计）+全部图表交互化

React迁移第三步时"统计"tab是最后一批机械翻译的组件（零手势、零交互、视觉上还停留在"高级统计报表"时代），这轮补齐——参考一木记账的统计页设计（可折叠KPI头、图表可切换+点击/拖动看精确值），但重新翻译成debt语境的信息维度，不照搬记账app的收支词汇（"收支统计"翻译成"月还款统计"——已还/待还两段，不是收入/支出两段）。

**新增第4张图"月还款统计"，不替换现有"负债预测走势"**：两者性质不同——负债走势是余额随时间递减的投影曲线，月还款统计是每月发生额（已还/待还两段）。现有3张图（`BalanceBars`/`TypeStack`/`PayoffLine`）也都加了交互；导出Excel/PDF从独立按钮收进右上角"⋮"菜单（`ExportMenu.tsx`，替代删除的`ExportActions.tsx`）。

**图表交互分两个复杂度量级，按数据形状（连续时间序列 vs 离散分类）区分，不是所有图表一刀切成同一种手势**：
- **连续时间序列图**（`MonthlyChart.tsx`新图 + `PayoffLine.tsx`升级）：真正的press+drag scrub手势，共用新的`react/src/report/chartScrub.ts`——`nearestIndexForX(clientX, rect, count)`纯函数算最近索引，`attachChartScrub(el, {count, onIndexChange})`挂Touch Events（`touchmove`必须`{passive:false}`）+桌面`pointerType==='mouse'`网关的Pointer Events，`touchstart`/`pointerdown`落地立即触发一次（"点击=查看精确值"），`touchmove`/`pointermove`持续触发（"拖动=连续更新"）。图表上方常驻`.viz-scrub-readout`文字行，`activeIndex`为`null`时兜底显示默认视图（`PayoffLine`是"今天¥X·date还清"，`MonthlyChart`是最新一个月）。**释放手指后数字停留在最后scrub到的点，不自动回弹**——这样抬手后还能看清刚划到的数字。这个手势比"长按拖拽排序"简单得多：不需要长按计时器、不需要dx/dy方向判断，`touchstart`落在图表内直接开始scrub（代价：图表正上方开始的垂直滑动不会触发页面滚动，这是iOS股票类App图表的标准做法，可接受）。
- **离散分类图**（`BalanceBars.tsx`/`TypeStack.tsx`）：只需要普通React `onClick`（离散数据每项本来就是完整的一个值，不需要"划过中间任意一点"），不需要Touch Events这套重手势基础设施。`BalanceBars`每行`activeIdx`状态+`.active`类（再点一次取消）；`TypeStack`的堆叠段和图例项联动同步（点任意一个都会高亮另一边），非选中段加`.dim`（`opacity:.35`）。

**`computeMonthlyRepayment(debts)`（calc.js第41个函数）故意不塞进`computeReportData()`的返回对象**——那个对象被`exportReportXlsx`/`exportReportPdf`（100% vanilla）按字段名精确解构，改形状会同时打断两个导出功能。任何要给统计tab加的新数据维度都应该照这个先例独立成新函数，不要碰被解构的对象。不按`active`过滤（已结清债务的历史已还记录仍计入对应月份，否则结清瞬间会让过去月份的柱子突然变矮）；用`amount`（本金+利息合计）不是`principal`（这张图回答"当月要还多少钱"）；月份在数据范围内按月连续补0，不留稀疏空洞。

**`react/src/shared/Popover.tsx`是`shared/`下第一个UI组件**（之前只有`state.ts`纯hook）——"?"说明弹窗（`InfoTip.tsx`）和"⋮"导出菜单（`ExportMenu.tsx`）共用同一个"点图标→弹出贴着图标的小面板→点外面/再点一次关闭"交互模式。

**⚠️踩了一个隐蔽但很有代表性的坑：面板一开始用CSS `position:absolute`相对锚点定位，真机验证前的Playwright桌面测试就已经抓到"点导出菜单里的选项完全没反应"——根因分两层，且比想象的更深**：
1. **第一层（真的是clipping）**：`ExportMenu`的触发器在`Hero.tsx`的`.hero-top`里，而`.hero`本身有`overflow:hidden`（用来裁切装饰性的`hero-smoke`色雾），绝对定位的下拉面板会被这层`overflow:hidden`直接裁掉/挡住。**改成`position:fixed`+JS用`getBoundingClientRect()`算视口坐标**看似解决了——面板的"定位参照"确实跳到了视口，不再被`.hero`的`overflow:hidden`裁切。
2. **第二层（真正的根因，比clipping更隐蔽）**：改完`position:fixed`后问题依然复现。用最小复现单独排查后才搞清楚：**`position:fixed`只让元素的定位参照跳到视口，不会让它跳出祖先的stacking context**。`.hero-top`和`.hero-amt`都是`.hero`的直接子元素，都被`.hero > *{position:relative;z-index:1}`这条规则赋予了相同的z-index、各自形成独立的stacking context——面板在DOM树里依然是`.hero-top`这个stacking context的后代，会被整体画在`.hero-top`这层，而DOM顺序更靠后、z-index相同的`.hero-amt`作为兄弟stacking context会整个画在它上层。哪怕面板的视觉坐标已经算到了`.hero-amt`下方的空白区域，**命中测试(hit-test)点到的还是`.hero-amt`**——这是纯CSS定位技巧解决不了的，`position:fixed`元素的"绘制层级"依然由它在DOM/stacking-context树里的位置决定，不是由它最终画在屏幕哪个像素决定。
3. **最终解法**：用`createPortal(panel, document.body)`把面板真正挂到`document.body`下，让它在DOM树里就不是`.hero`的后代，彻底跳出整条stacking context链——这是这个项目第一次用React Portal。`Popover.tsx`同时保留`position:fixed`+`getBoundingClientRect()`算坐标（打开时机+`resize`/`scroll`时机重新量一次），两者都需要：portal解决"画在谁上面"，fixed+算坐标解决"面板具体显示在哪"。判断"点击面板外关闭"的逻辑也要相应调整——面板挂在body下之后，必须同时检查触发器（`rootRef`）和面板本身（`panelRef`）两处，不能只检查触发器所在的`.popover-root`，否则点面板自己的内容（比如菜单项）会被误判成"点了外面"而立刻关闭。**以后这个项目里任何"贴着触发器展开的浮层"，如果发现"看起来定位对了但点不到"，先怀疑是不是这个stacking context坑，而不是继续调CSS的z-index数值**——加大z-index在这里完全没用，问题不在z-index大小，在DOM树位置。

**`Hero.tsx`结构上还踩过一个更基础的坑：一开始把`.summary`（KPI网格）/`.note-toggle`/展开的KPI网格全部嵌套在`.hero`内部**，跟"债务"tab的`debts/Summary.tsx`（`.hero`和`.summary`是兄弟节点，不是父子）这个既有模式不一致。后果不只是结构不统一——`.summary`里的`InfoTip`弹窗也被嵌套进了`.hero`的`overflow:hidden`里，触发了跟上面`ExportMenu`同一类的裁切问题。修法是把`.hero`（只包含`hero-top`/`hero-amt`/`hero-pill`）改成独立的一个块，`.summary`/`note-toggle`/展开网格作为**兄弟节点**紧跟在后面，跟`debts/Summary.tsx`的结构完全对齐。**这个坑是Playwright验证阶段真实复现"点了'加权平均利率'旁边的说明按钮没反应"之后才定位到的，不是设计阶段就想到的**——以后往这几个hero卡片里加任何新的弹层/浮动内容，先确认它有没有被不小心嵌进了`.hero`这层`overflow:hidden`容器。

**`.viz-block`补上了卡片外壳**（之前一直是裸的`margin-bottom:22px`，没有`background`/`border`/`shadow`）：`background:var(--card-grad);border:1px solid var(--hair);border-radius:18px;padding:14px 16px;box-shadow:var(--e1)`，让5个viz-block（`BalanceBars`/`TypeStack`/`PayoffLine`/`MonthlyChart`/`ReportTables`）都套上跟"债务"/"还款日"两个tab一致的卡片质感。

**验证**（⚠️这段是"视觉+交互升级"那轮的记录；其中"更多指标"折叠在下一轮"统计tab口径修正"里已经删除，换成4个常驻KPI+"计算口径说明"折叠）：桌面Chromium + Playwright（一次性临时`npm install playwright`，用完卸载）：Hero"更多指标"展开/收起、InfoTip打开/关闭、导出菜单打开/关闭+两个premium门禁方向（未开通跳订阅页/已开通直接触发导出）、`MonthlyChart`柱状/折线切换、`BalanceBars`/`TypeStack`点击高亮联动、`MonthlyChart`和`PayoffLine`的桌面鼠标拖动scrub（两者的readout都正确跟着更新、抬手后停留不回弹），light/dark两种主题截图核对（含真实移动端viewport 390×844，不是fullPage长图——**fullPage长图截图对`position:fixed`元素会有已知的拼接假象，曾经一度误以为"还款提醒通知"面板不知为何默认打开着，用普通viewport截图核实后确认只是fullPage截图工具的假象，不是真实bug**，以后排查类似"截图里出现不该出现的东西"，先用非fullPage的普通viewport截图复核一遍再当真）；`npx tsc --noEmit`零错误，`npm run test:react`全绿，`npm test`（calc.js套件）不受影响，`npm run build:react`确认`report.js`产物正常增长（从升级前的8.94kB涨到23kB左右，符合预期——4张图+可折叠KPI头+2个共享UI组件）。

**⚠️还没做的验证：真机触摸手势确认**——`MonthlyChart`/`PayoffLine`的scrub手势是这轮唯一动了真正touch事件的地方（`chartScrub.ts`），桌面Playwright只能验证鼠标模拟的Pointer Events路径不报错、代码逻辑没问题，验证不了真实手指连续拖动的手感、多点触控边界情况、安卓WebView的触摸事件时序——跟这个项目历史上"长按拖拽排序"/"还款日左滑"的教训是同一类要求，**这一步必须真机确认，不能跳过**。已编译好debug APK（`android/app/build/outputs/apk/debug/app-debug.apk`），下一步是装真机验证：两张连续时间序列图的拖动/点击scrub手感、`ExportMenu`/`InfoTip`两个弹层在真机WebView上的定位是否正确（这轮修复的stacking context坑理论上在任何浏览器引擎下都成立，但WebView版本差异值得留意）、light/dark主题下视觉效果、硬件返回键行为不受影响（这轮没有新增/改动任何`.sheet`/`.subpage`，`__handleBackButton`链不需要变动）。

### 统计tab口径修正（2026-07-29，进行中）

上一轮"视觉+交互升级"解决的是"好不好看、能不能交互"，**这一轮解决的是"数字对不对"**——调查阶段用真实数据跑出来3个已确认的口径bug（不是代码审查推测出来的，每一个都有先于实现写好、确认过是红的回归测试）。三个bug的成因和修法见上面"纯计算函数"一节`summarizeAllTime`/`computeUpcomingPressure`那两段，这里只记UI层的决定。

**Hero改版：4个常驻KPI + 笔数一行小字 + 一个"计算口径说明"折叠**，替代原来的"2常驻+4折叠(更多指标)"：
- **hero大金额补回了标签**。原来`hero-label`是"统计"两个字，一个36px的大金额上方没有任何说明它是什么口径——用户无从得知这是"在还总负债、只算本金"。改成跟"债务"tab一致的"在还总负债"，口径角标放到金额下面的pill行（`hero-top`右侧被`ExportMenu`的"⋮"占着，塞不下"只算本金"那个pill）。
- **新增`.hero-pills`这个flex容器**——`.hero-pill`本身没设`display`（默认block），在"债务"tab里它是`.hero-top`这个flex行的子元素所以天然收缩到内容宽度，但统计tab的pill只能放在金额下面单独一行，直接放会被拉成整行宽的圆角框。`.hero-pills`就是给它一个能收缩的flex上下文，同时支持并排放多个pill。**Playwright验证里专门加了一条"pill宽度必须明显小于行宽"的断言**盯住这个回归。
- **4个KPI的选择依据是"金额/利息/进度/利率比笔数更值得占位置"**：累计已还本金（含利息子行）、经常性月供、归零进度、加权平均利率（带`InfoTip`）。在还/已结清笔数降级成`.hero-counts`一行小字——它们原来是2张占满位置的`.kpi`卡片，而且跟"债务"tab的KPI网格完全重复。
- **BUG-2的修法最后落在`summarizeDebts`本身上，两个tab共用同一个累计口径**（中途曾经短暂存在过一个只给统计tab用的`summarizeAllTime`，见上面"纯计算函数"一节的完整经过）。**连带改的是`debts/Summary.tsx`的footnote**——它原来那句"两者都不含已结清的债务"现在是错的，改成了"已还金额 = 全部债务（含已结清）…"，并补上了"已完成% 怎么算"和"提前结清的剩余本金两边都不计"两条。
- **"计算口径说明"折叠面板是新增的**（照抄"债务"tab `.note-toggle`那套）。⚠️**这两个tab的折叠按钮现在文案完全相同（都叫"计算口径说明"）**，运行时不冲突（分属两个`.view`），但**写Playwright脚本时`text=计算口径说明`会同时命中两个、报strict mode violation**——真实踩到过，脚本里所有选择器都要加`#view-report`作用域限定。同理`.hero-label`现在两个tab都是"在还总负债"。
- 口径说明的内容必须覆盖6条：在还总负债只算本金、累计已还本金含已结清、经常性月供不含一次性还清、归零进度只按本金算、预计还清日期是预测不是承诺、**以及"提前结清"的剩余本金既不计入总负债也不计入累计已还**（实际付了多少钱App并不知道，必须诚实说明，不能假装它被还了）。

## 云备份（Premium）

> **⚠️ 渲染层已经翻篇：`#backupScreen`（第十步，React迁移收尾）已经整体由React接管（`react/src/sheets/BackupScreen.tsx`）——创建/列表/恢复/删除4个cloud函数调用的UI全部由React渲染，二次确认弹窗改用`confirmAsync`。这一节记录的产品决策（手动/独立记录而非自动同步、配额/单文件上限数字、身份来自服务端会话不信任客户端参数）依然100%成立，是理解"为什么这么设计"的背景，具体前端实现细节以"React 迁移"一节"第十步"为准。**

**⚠️ 这个功能第一版做的是"自动同步、单一文档覆盖"，已经推翻重做成"完全手动、每次创建一条独立备份记录"——用户自己用下来发现自动同步让人担心手滑/多设备冲突把数据搞乱，宁可自己点一下、每条备份都能单独恢复更放心。**"云同步"这个说法也一并废弃，整个App只保留"云备份"这一种说法，别再在新代码/文案里用"同步"字眼描述这个功能。

"我的"页"云备份"入口卡片（`#backupEntryBtn`，`hasPremium()`门禁）打开整页浮层`#backupScreen`：一个"上次备份"时间展示 + "创建备份"按钮（点击会打包当前的债务/文档/设置/档案库文件，作为**新的一条**记录写入云端，不覆盖已有记录）+ 备份记录列表（每条显示创建时间、笔数/文件数/大小，各自带"恢复"和"删除"按钮）。点"恢复"会先弹二次确认（"此操作不可撤销，确定继续吗"），确认后才会用那条记录的内容整体覆盖本机当前数据。**没有任何自动触发的推送/拉取**——数据变动不会自动上云，登录/冷启动也不会自动去云端拉数据，一切都要用户自己点"创建备份"/"恢复"。

**架构：依然是全部走云函数代理，不做客户端直传云存储**——复用`deleteAccount`已经建立的"身份完全来自服务端已认证会话（`auth.getUserInfo().customUserId`），绝不信任客户端参数"这条安全原则，不用去研究一套这个项目从没碰过的CloudBase Storage安全规则语法（那是一个完全独立于云函数"权限控制"的配置面板）。代价：文件走base64通过函数体积会膨胀~33%、受函数超时/请求体限制——**单文件上限`BACKUP_MAX_FILE_BYTES`（8MB）**，超过的文件在打包这条备份时会被跳过（`console.error`记一条日志），不参与这次备份，仍然可以走手动的本地JSON导出导入兜底。

**每用户配额（写在`backupCreate`云函数里，不是客户端校验）：最多保留20条备份记录、总大小上限300MB**——这是权衡个人记账app的真实使用量给的数字：单文件已经封顶8MB，20条记录留出足够的历史版本可选，300MB对一个人的债务JSON+几张回执单/合同照片绰绰有余，同时又给CloudBase存储成本设了一个明确的硬顶不会无限增长。每次`backupCreate`成功写入新记录后，会按创建时间正序查出这个用户名下的全部记录，只要条数或总字节数超过配额就从最老的一条开始删（连带删它在Storage里的文件），一直删到重新落在配额内。如果单次备份内容自己就超过300MB会直接拒绝写入（`{ok:false, error:...}`），不会出现"删了半天最后把自己删了"的怪异结果。**这两个数字（`MAX_BACKUPS`/`MAX_TOTAL_BYTES`）都是常量写在`backupCreate/index.js`顶部，以后要调整额度直接改这两个数、重新部署即可，不涉及数据结构变动。**

**5个云函数**（`cloudbase/functions/`下，写法全部照抄`deleteAccount`"身份来自`auth.getUserInfo().customUserId`，不信任客户端传参"这一条）：
- **`backupUploadFile`**：接收`{backupId, fileId, filename, mime, base64}`，`Buffer.from(base64,"base64")`后`app.uploadFile()`到`backups/{openid}/{backupId}/{fileId}-{filename}`，返回`{fileID, size}`。**这个函数纯粹是Storage上传代理，完全不碰数据库**——它不知道也不需要知道"这份文件属于哪条备份记录的完整清单"，客户端把所有文件逐个传完、拿到每个的`fileID`之后，自己组装成`files`数组一次性交给下面的`backupCreate`。
- **`backupCreate`**：接收`{backupId, debts, docs, notify, premium, files}`（`files`是`backupUploadFile`已经返回的`{id,name,mime,size,fileID}`列表，不含base64），`db.collection("backups").add(...)`写入**一条新文档**（不是`update`/`set`覆盖）。负责上面说的配额清理。
- **`backupList`**：`.where({openid}).orderBy("createdAt","desc")`查这个用户名下所有记录，`.field({...})`投影只取轻量字段（`createdAt`/`totalSizeBytes`/`debtsCount`/`filesCount`），**不带完整的`debts`/`docs`内容**，列表页够用就行，完整数据留到真正点"恢复"才取。
- **`backupRestore`**：接收`{backupId}`，`doc(backupId).get()`取出记录后**显式核对`record.openid === customUserId`**——`backupId`本身不是私密凭证（没有额外加密/签名），必须在服务端二次确认这条记录确实属于当前调用者，不能假设"客户端传得出这个id就有权限看"。核对通过后对`files`里每个`fileID`调`app.getTempFileURL()`换临时直链返回。
- **`backupDelete`**：接收`{backupId}`，同样先核对`record.openid`归属，再删Storage文件+删文档。

**这4个新（不含`backupUploadFile`纯代理，共5个）函数都不需要碰环境共用的"权限控制"配置**——安全默认值`auth.loginType != 'ANONYMOUS' && auth != null`本来就要求真实登录，正好是这几个函数需要的门槛，不用像`wxLogin`那样加具名例外（详见上面"原生插件：WeChatLogin"一节第4条那个"权限控制是环境级共享配置"的坑）。

**⚠️踩过一个隐蔽的客户端坑：云备份一直报`[PERMISSION_DENIED] Permission denied`，根因是客户端把自己的登录会话降级成了匿名。** 表现：明明微信已登录（"我的"页头像昵称都在），一进云备份点任何操作就`PERMISSION_DENIED`。链路：`ensureCbAuthReady()`早期版本**无条件**调`signInAnonymously()`垫底（本意是绕开上面"WeChatLogin第2条"那个SDK对null凭证读`.scope`的崩溃bug），但这会把微信自定义登录建立的"非匿名"会话**降级成匿名**，于是命中上面那条`*`权限规则（要求非匿名）被拒。**修法**：`ensureCbAuthReady()`改成只在本地**连`account`记录都没有**（`if (account) return;`才不return、才走匿名）时才`signInAnonymously()`——用`account`这个我们自己可靠掌握的信号判断"是否已登录"，比去猜SDK内部登录态的形状（`currentUser`/`hasLoginState()`这些在2.28.6上不一定有/不一定准）稳妥得多。同时新增`cbAuth()`统一入口，`cbApp().auth({persistence:"local"})`显式要求会话持久化到localStorage（跨App冷启动自动恢复+续期，否则重启后又只剩匿名），**所有拿auth的地方（登录/注销/退出/`ensureCbAuthReady`）都走`cbAuth()`，别再直接`cbApp().auth()`**。注意登录流程`handleWxAuthResult`开头那次`signInAnonymously()`是**故意保留**的（它在自定义登录之前、且随后就`signInWithCustomTicket()`升级上去，不构成降级），别顺手也删了。

**⚠️再踩一个更隐蔽的部署坑：`PERMISSION_DENIED`修好后，云备份改报`[FUNCTIONS_EXECUTE_FAIL] Error: Cannot find module '@cloudbase/node-sdk'`——根因是这5个备份函数目录里当初漏建了`package.json`。** `wxLogin`/`deleteAccount`目录下都有`package.json`声明`"@cloudbase/node-sdk"`依赖，但这5个备份函数一开始只有`index.js`、没有`package.json`。CloudBase部署时靠函数目录里的`package.json`决定装哪些npm依赖，没有它就不装，运行时`require("@cloudbase/node-sdk")`直接`Cannot find module`。**这个报错跟权限层无关、是函数真的跑起来之后在运行时崩的**——所以看到错误码从`PERMISSION_DENIED`（调用权限层）变成`FUNCTIONS_EXECUTE_FAIL`（函数执行层），其实是"权限通了、进到函数体里了"的进展信号，别当成又坏了一处。**修法**：给5个备份函数各补一个`package.json`（`{name, main:"index.js", dependencies:{"@cloudbase/node-sdk":"^3.18.3"}}`，跟`wxLogin`一致），逐个`tcb fn deploy <name> --force`重新部署。**以后新加任何云函数，第一件事就是照着`wxLogin/package.json`建好`package.json`再写`index.js`**——`index.js`里只要`require`了任何非Node内置模块（`@cloudbase/node-sdk`是必然要用的），就必须在`package.json`里声明，否则部署上去能过、一调用就`Cannot find module`。验证部署有没有真的把依赖装上：`tcb fn invoke <name>`（会以admin身份无终端用户会话跑一次），只要**不是**`Cannot find module`、而是函数自己的业务响应（比如`{"ok":false,"error":"未登录…"}`）就说明依赖到位了（`invoke`日志里那句"缺少依赖 ws 请 npm install ws"是CLI自己streaming日志用的，跟函数无关，忽略）。

**`backups`集合的寻址方式变了，从"一个用户一个文档（`doc(openid)`）"改成了"一个用户多个文档（`openid`是普通字段，配合`.where()`查）"**——因为现在一个用户可以有多条备份记录，不能再用`doc(openid)`这种一对一寻址。**集合本身还是要跟当初`users`集合一样手动去控制台建**（CLI对不存在的集合查询会静默返回`[]`，不能拿来验证是否已经建好），权限选无权限[ADMINONLY]。**Storage存储桶权限也要去控制台确认设成最严格的私有选项**——这是一个跟云函数"权限控制"完全独立的配置面板，这次开发没有实机核实过具体配置项名字，上线前要对照当前CloudBase官方文档重新确认一遍。

**客户端`applyBackupData()`（点"恢复"之后真正落地数据的函数）先`upClear()`清空本机现有档案库文件，再按这条备份记录的`files`清单重新铺回来**——"恢复"语义上是"整体覆盖"，如果不先清空，备份创建之后本机新加的文件会跟恢复回来的文件混在一起，不是真正的覆盖。`debts`/`docs`/`notify`/`premium`这几个JSON字段则是直接整体替换（`localStorage.setItem`），不做字段级合并。

**本地只留一个极简的`after-zero-backup-meta-v1`（`BACKUP_KEY`）存`{lastBackupAt}`**，纯粹给"上次备份"这行展示用——不再像第一版那样维护`lastPushedAt`/`lastLocalChangeAt`/`pushDirty`这类冲突检测用的字段，因为完全手动、每次都是新建记录的模型下不存在"本地和云端谁更新"这种需要比较的情况，那套字段连同它们所在的`SYNC_KEY`已经整体删除，不是改名字，是真的不需要了。

**注销账户联动清理**：`cloudbase/functions/deleteAccount/index.js`现在会在删`users`文档**之前**，`.where({openid: customUserId})`查出这个用户名下**全部**备份记录（不再是当年单文档模型那样`doc(customUserId)`一次搞定），逐条删除对应的Storage文件+文档——不这样做的话，云备份上线后注销账户会真实留下别人看不见但确实存在的孤儿文件，是隐私缺口，不是可选的顺手步骤。

**桌面浏览器测试的边界，容易想当然**：CLAUDE.md早先记录的"用`ACCOUNT_KEY`localStorage小技巧跳过登录门"**只是伪造本地`account`对象、隐藏`#loginGate`，从来没有真正跑通`signInWithCustomTicket()`**——这个状态下`cbAuth()`根本没有真实的CloudBase已认证会话，任何`callFunction({name:"backupCreate"/"backupList"/...})`调用在服务端都会因为鉴权失败被拒（`auth.getUserInfo().customUserId`拿不到值）。**⚠️注意：现在`ensureCbAuthReady()`用`if (account) return;`判断是否已登录（见上面那条降级坑的修法）——桌面浏览器伪造`account`会让它误以为"已登录"从而跳过`signInAnonymously()`，于是连匿名会话都没有，`callFunction`可能直接踩中SDK的null凭证崩溃或鉴权失败。这不是bug，正是"云备份必须真机验证"的另一个体现：桌面伪造`account`这条老调试手法对云备份不适用（对债务/档案库等纯本地功能仍然好用）。**真正的ticket只能来自真实微信OAuth换来的`code`，只有真机走通原生插件才能拿到。**所以模拟器、报表图表/导出、Premium/Premium+订阅页UI、兑换码这几个功能可以完整在桌面浏览器验证，但云备份的真实端到端往返（创建/列表/恢复/删除）必须是装了真实微信登录的真机**，跟当初微信登录本身的验证要求一模一样，没有捷径。

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

## AI 债务顾问（Premium）

> **⚠️ 渲染层已经翻篇：`#aiScreen`+`#aiHistorySheet`（第十一步，React迁移收尾）已经整体由React接管（`react/src/sheets/AiScreen.tsx`）——聊天界面/欢迎态快捷芯片/历史对话sheet全部由React渲染，`AI_USAGE_KEY`/`AI_CHATLOG_KEY`整体移交React所有权直接读写localStorage(不再经过vanilla)。这一节记录的产品设计（聊天式而非报告+问答两段拼接、成本兜底数字、云函数模型选型）依然100%成立，是理解"为什么这么设计"的背景，具体前端实现细节（含`data-q`属性/`#aiChipReport`等DOM id已不存在、`aiComposeAndSend`逻辑已翻译成React的`composeAndSend`）以"React 迁移"一节"第十一步"为准。**

"在还债务"页顶部的 AI banner（`#aiBannerBtn`）现在是这个功能的入口（`hasPremium()` 门禁，未开通跳订阅页）。点开进整页浮层 `#aiScreen`——**这是聊天式界面，不是"大按钮生成报告+底部迷你问答框"那种三段拼接**（那是第一版的做法，已经推翻重做）。**只做了"报告 + 智能问答"两件事，没做 OCR**（当初 Premium+ 列的三条 AI 功能之一，明确推迟）。

**空状态是欢迎语+3个快捷芯片，不是常驻的"生成分析报告"按钮**：打开页面（或点"新对话"）看到的是欢迎语（"有什么想聊的？"）+ 魔法棒图标 + 3个芯片（`#aiChipReport`"生成分析报告"、另两个是常见问题"我该先还哪一笔？"/"怎样最快还清所有债务？"，`data-q`属性存问题原文）。点任意一个都走同一条统一消息流（`aiComposeAndSend(displayQ, isReportMode)`），报告和问答不再是两套UI、两套渲染逻辑——报告只是"isReportMode=true"时调云函数用`mode:"report"`（`question`传空串，服务端会忽略它），但气泡里仍然显示"生成分析报告"这句话，视觉上跟用户真提了这个问题一致。

**魔法棒入场动效已经接上**：打开这个页面或点"新对话"回到欢迎态时，`#aiWelcomeWand`（跟主页AI banner同一份图标标记，见"在还债务主页视觉改版"一节）会临时加`.cast`类摇两下再定住，动画结束后`.cast`类被JS移除，`.wand`基础规则本来就一直在播的`wandGlow`呼吸光晕自动接续——这是当年在别处Artifact预览定过稿、但因为AI页面这轮才真正重做所以一直没接上的效果（`castAiWand()`函数，`prefers-reduced-motion`时直接跳过整个流程，不加`.cast`类，否则`animation:none`会让`animationend`永远不触发、`.cast`类卡住摘不掉）。

**走"云函数调大模型"的正道，不是一木记账那种"导出 txt 让用户自己粘 AI"的假 AI**（这个反面教材是这次重构的直接动机）：`www/index.html` 里 `buildAiSummary()` 用 `computeReportData()` + 遍历 `debts` 拼出一份紧凑的结构化 JSON（条目少、token 便宜），`callAiAdvisor(mode, question)` 走 `ensureCbAuthReady().then(cbApp().callFunction({name:"aiAdvisor",...}))`。

**云函数 `cloudbase/functions/aiAdvisor/` 用 CloudBase 自带的大模型能力**：`app.ai().createModel("cloudbase").generateText({model, messages})` 返回 `{text}`——**计费走 CloudBase 资源点，不需要第三方 API Key、不用往环境变量塞密钥**，这是它相比"云函数里直连 DeepSeek/通义 API"最省事的地方（贴合项目现有的 CloudBase 基建）。模型 id 是 `index.js` 顶部常量 `AI_MODEL`，用 `"hy3"`（混元）。**这是实机核对控制台后定的，不是随手填的**：这个环境是「体验版」套餐，控制台 AI→生文模型 里只有混元（`hy3` / `hy3-preview`）状态是「已开启」可用，**DeepSeek 全系被套餐锁住**（`deepseek-v4-*` 旁边有小皇冠图标=要升级套餐才能开、`deepseek-v3.2` 状态是「即将下线」）。`hy3` 是一方模型、最便宜、也是官方 Node SDK 文档示例用的 id。控制台 hy3 那行"免费额度剩余"显示的是"-"（不是具体数字），**别当成"免费"就默认无成本**——如果账单出现异常，先看这里而不是怀疑代码有 bug。控制台顶部曾有一条"报名小程序成长计划可获得 10 亿混元 Token"的活动横幅，是另一件事（需要单独报名），不是自动生效的额度，不能假设它已经在起作用。以后升级套餐解锁 DeepSeek 想换模型，改 `AI_MODEL` 这一行即可，但**只能填控制台里当时状态为「已开启」的 model id**，别填「即将下线/被锁」的。函数不需要 envVariables，也不需要具名"权限控制"例外（吃 `*` 安全默认值 `auth.loginType != 'ANONYMOUS' && auth != null` 即可，跟备份函数一样）。**照铁律先建了 `package.json`**（漏建=部署能过、一调用就 `Cannot find module`）。

**部署状态：已完成，依赖已验证正常。** `cd cloudbase && npx --yes -p @cloudbase/cli tcb fn deploy aiAdvisor --force` 部署成功；`tcb fn invoke aiAdvisor` 返回 `{"ok":false,"error":"未登录，无法使用 AI 分析"}`——**不是 `Cannot find module`**，说明 `@cloudbase/node-sdk` 装上了、函数体正常执行到 `getUserInfo()` 这一步，invoke 本身没有终端用户会话所以拿不到 `customUserId` 属于预期。真实的"生成报告/追问"往返还没做真机验证（跟云备份一样，需要真实微信登录会话，桌面/CLI 都测不出）。

**成本兜底：客户端每日用量软上限**。新增 localStorage 键 `AI_USAGE_KEY`（`after-zero-ai-usage-v1`）存 `{date, count}`，`AI_DAILY_LIMIT`（默认 20）次/天，跨天自动清零，超限 toast 拦截。**这是客户端软限、可绕过，beta 够用**；因为买断用户的 AI 是"一次付费、持续产生算力成本"，需要个上限兜底。正式上线要换服务端计数（放 `users` 文档或独立集合）才防得住。

**历史对话真实持久化、可继续追问，不是只读快照**：右上角图标（`#aiHistoryBtn`）打开历史对话sheet（`#aiHistorySheet`，从`#aiScreen`这个`.subpage`内部打开，见下面z-index那条），存进新增的`AI_CHATLOG_KEY`（`after-zero-ai-chatlog-v1`，见"硬性铁律"第1条）——`aiConvos`数组，每条`{id, title, isReport, updatedAt, messages:[{role,content}]}`，最新的排最前。**任何时候只有一个"当前会话"，不区分"只读历史"和"进行中"**：点历史列表里某一条（`loadAiConversation(rec)`）= 把它整个加载回当前会话（消息+上下文都恢复），之后可以直接在输入框继续追问，新的问答会**追加**进这条记录、把它顶到列表最上面，不会产生重复记录；"新对话"按钮（`#aiNewConvBtn`/`startNewAiConversation()`）才会真正清空当前内容、开始一条全新记录。`currentAiConvId`（模块级变量，null=还没产生过消息的全新会话）是这套状态机的核心，第一次成功收到AI回复时才会真正创建并写入`aiConvos`。**这是产品决策上明确纠正过的一版**：最初设计过"点历史=只读快照，追问必须新开对话"，用户当场指出"所有chatbot都是能在旧对话里继续追问的"，改成了现在这套——以后再碰到"要不要限制用户在历史记录上做某个操作"这类设计，默认先假设标准聊天应用的心智模型，不要凭直觉发明限制。

**每条对话的消息数、以及对话总条数都各自封顶**（`AI_CHATLOG_MAX_MSGS`=40、`AI_CHATLOG_MAX_CONVOS`=50，都是`www/index.html`里的常量），防止长期高频使用后localStorage无限增长——这两个数字没有跟用户对齐过具体值，纯粹是防御性上限，不是像备份配额那样讨论出来的数字，以后如果用户反馈"历史对话动不动就被吞了"，先看是不是撞了这两个数字。**失败的对话不会留下"僵尸记录"**：如果一次调用失败发生在这条对话还从没成功回复过（`rec.messages.length<=1`，即只有用户这一句、AI还没真正答过），会把这条刚创建的空壳记录从`aiConvos`里撤销掉，不会在历史列表里出现一条"只有提问、AI从没答过"的死记录。

**发给云函数的`history`参数，是"这次提问之前的上下文"，不含这次提问本身**——`callAiAdvisor(mode, question, history)`签名从两参数改成三参数，`history`由调用方（`aiComposeAndSend`）显式传入：`rec.messages.slice(-12)`（在把这次的`user`消息push进`rec.messages`之前取的快照），这样服务端`aiAdvisor/index.js`里"先塞`history`、再把`question`接在最后"这套拼接逻辑才不会把同一句问题发送两次。`report`模式不需要`history`（服务端对`report`模式压根不读`history`字段），传空数组即可。

**历史对话sheet的z-index是手动提高过的，不能沿用其它`.sheet`默认的31**：`.sheet`默认z-index是31、`.subpage`是35（见下面"返回键处理"一节的z-index分层表），这个历史sheet是从`#aiScreen`（一个`.subpage`）内部打开的，如果沿用默认31会被35的`#aiScreen`本身盖住、点开跟没点一样——`#aiHistorySheet, #scrimAiHistory { z-index: 36; }`这条CSS专门覆盖，这是这个项目第一次出现"从subpage内部打开sheet"的场景，以后如果再有类似场景（sheet挂在某个subpage下面），记得同样需要手动把z-index提到35以上（但别超过`.login-gate`的40）。`__handleBackButton`链里这个sheet的判断插在`aiScreen`判断**之前**（"最上层先关"），`closeAiScreen()`内部也会先调一次`closeAiHistorySheet()`，防止用户点页面自带的返回箭头（不是硬件返回键）关闭`#aiScreen`时把历史sheet晾在半空。

**桌面浏览器测不了真实 AI 往返**：跟云备份完全一样——伪造 `account` 没有真实 CloudBase 已认证会话，`callFunction({name:"aiAdvisor"})` 在服务端 `getUserInfo().customUserId` 拿不到值被拒。免费/付费门禁、订阅页 UI、`__debugPremium` 切状态这些能在桌面验；**真实 AI 生成/追问必须真机（release 包 + 微信登录）**。

## 云函数源码：`cloudbase/`

`cloudbase/functions/wxLogin/`是腾讯云开发（CloudBase）云函数的源码，服务端代码，负责微信登录时用`code`换`openid`、签发自定义登录票据（详见上面"原生插件：`WeChatLogin`"一节）。`cloudbase/functions/deleteAccount/`是配套的注销账户云函数，负责真正删除`users`集合里的用户文档，现在也负责联动清理云备份数据（详见上面"云备份（Premium）"一节）。`cloudbase/functions/backupCreate/`、`backupList/`、`backupRestore/`、`backupDelete/`、`backupUploadFile/`是云备份功能的5个云函数，读写`backups`集合+Storage文件，详见上面"云备份（Premium）"一节。`cloudbase/functions/aiAdvisor/`是 AI 债务顾问云函数，详见上面"AI 债务顾问（Premium）"一节。**这个目录不属于Capacitor/Android那套构建流程，`npx cap sync android`不会碰它，也不会自动部署**——改完要手动同步到CloudBase控制台或用他们的CLI工具部署。AppSecret等敏感配置只存在CloudBase云函数的环境变量里，不存在这个目录任何文件里，也不能加进来。

## 构建

```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
```

产出：`android/app/build/outputs/apk/debug/app-debug.apk`

**要测微信登录必须编译release包**（debug签名过不了微信的签名校验，见上面"原生插件：`WeChatLogin`"一节）——前提是这台机器上已经有`android/app/after-zero-release.keystore`+`android/keystore.properties`（见"硬性铁律"第4条，两个都因机器而异、已gitignore，不是每台机器天生就有）：

```bash
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleRelease
```

产出：`android/app/build/outputs/apk/release/app-release.apk`

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

1. **`localStorage` 的 KEY（在`www/index.html`里搜 `debt-manager-v5`）永远不能改。** 这是用户设备上保存真实数据的键名，改了等于让已经装过的app找不到自己原来存的数据，直接清零。同理，`DKEY`（`debt-manager-docs-v5`）、账号登录状态用的`ACCOUNT_KEY`（`after-zero-account-v1`）、在还债务排序方式用的`SORT_KEY`（`debt-manager-sort-v1`）、还款提醒通知设置用的`NOTIF_KEY`（`after-zero-notify-v1`）、订阅状态用的`PREMIUM_KEY`（`after-zero-premium-v1`）、提前还款模拟器用的`SIM_KEY`（`after-zero-simulate-v1`）、云备份"上次备份时间"用的`BACKUP_KEY`（`after-zero-backup-meta-v1`）、AI 债务顾问每日用量计数用的`AI_USAGE_KEY`（`after-zero-ai-usage-v1`）、AI 债务顾问历史对话记录用的`AI_CHATLOG_KEY`（`after-zero-ai-chatlog-v1`）以后也不能改——十者是各自独立的键，不要以为加新功能可以复用或合并。
2. **新安装必须是空数据。** `www/index.html` 里 `SEED`（债务种子数据）、`DOCS_SEED`（文档种子数据）这两个常量现在都是空值——这是故意的，因为这个app的定位是要发给别人用，任何人第一次打开都不能预装开发者自己的私人财务数据。**改代码时如果要放测试数据，改完记得清空再提交，别把私人内容（真实债务数字、个人反思文档、任何带真实姓名/金额的东西）带回默认值里。**
   **私人数据不止藏在这三个常量里。** 之前排查发现过一次：一个叫`cliff`的调试用标记字段，虽然完全没有UI能设置它（不是SEED、不是表单字段），但代码里直接写死了具体的还款日期和金额字符串（`"2027-05 起还本，月供跳至 ¥2,182"`这类）挂在渲染逻辑里，跟SEED是否清空无关。改代码时留意：不只是搜`SEED`/`DOCS_SEED`这两个变量名，任何看着像真实日期/金额/人名的硬编码字符串都要多看一眼是不是该删。（补：曾经还有个`POSTER`"愿景海报"常量，因为没有任何UI入口能往里填内容、属于永远激活不了的死代码，已整体删除，包括`fileItems()`/`renderDocContent()`里对应的分支，别再找它。）
   **"新安装=空数据"这个假设依赖 `AndroidManifest.xml` 里 `android:allowBackup="false"`。** 安卓系统默认（`allowBackup="true"`，Capacitor脚手架生成时的默认值）会把App数据自动云备份到用户的Google账号，卸载重装或者换新手机登录同一个Google账号时可能会自动把旧数据（包括`ACCOUNT_KEY`存的登录态）恢复回来，让"重装"变得不再可靠地等于"空白状态"。这个项目已经手动改成`allowBackup="false"`彻底关掉自动备份——以后如果看到这个值被改回`true`（比如重新跑`npx cap add android`之类的脚手架命令覆盖了手改的manifest），要记得改回`false`。
3. **包名 `io.github.jenkjyu.afterzero` 是这个app的永久身份，不要随便改。** 安卓系统靠包名判断"新装的这个APK是不是我认识的那个app的新版本"——包名一样+签名一致才会被当成"更新"（原地覆盖、保留数据）；包名一变，系统当成完全不相关的新app，跟原来的app和它的数据没有任何关系，装出来是第二个图标、全新空数据。这个项目早期开发阶段（曾用过 `com.jenkjyu.debtmanager` 这个包名做过几版debug包）就是因为这个原因废弃重来的——开发者自己手机上可能还留着那个旧包名、带真实数据的旧版本，跟现在这个 `io.github.jenkjyu.afterzero` 是两个互不相通的独立app，别搞混、别以为它们共享数据。
4. **release签名密钥已经生成（因为微信登录要求提交release签名SHA1去微信开放平台注册），但目前还没有任何正式发布用过它。** Keystore文件在 `android/app/after-zero-release.keystore`，密码等配置在 `android/keystore.properties`——两个都已gitignore，不在git历史里。`android/app/build.gradle` 里 `signingConfigs.release` 检测到 `keystore.properties` 存在才生效（没有这个文件时`buildTypes.release`不带签名配置，仍然能正常debug构建，克隆仓库的人不受影响）。**`./gradlew assembleDebug`（README默认的构建命令）产出的还是debug包，不受这次改动影响；只有显式跑 `assembleRelease` 才会用到这个release签名。** 这个keystore一旦真正拿去发布过一个版本，丢了 = 以后再也没法用同一个身份更新这个app，需要跟`localStorage`那条铁律同等严重地对待——离线、异地备份好。
5. **License 是 PolyForm Noncommercial 1.0.0，不是MIT/ISC这类常见的宽松协议，是刻意选的。** 开发者规划未来要在这个app上加付费功能，选这个协议是为了禁止别人白嫖代码去做商业竞品（发到应用商店卖钱、内置广告等）；别人依然可以自由fork/学习/个人非商业使用。改动licensing相关内容（`LICENSE`文件、`package.json`里的`license`字段、README里的License说明）前要确认这个前提没变。
6. **`AndroidManifest.xml` 里的 `INTERNET` 权限当初是为未来付费功能预留的，现在已经真正用上了**——`www/index.html` 里的微信登录功能会加载CloudBase CDN脚本、调用腾讯云开发的云函数，是这个app第一次真正发出网络请求（`WeChatLogin`原生插件本身走的是Intent/AIDL跟微信App通信，不占用这条权限）。这条权限不要删。
