---
name: capacitor-ui-system
description: Use this skill when modifying After Zero's current Capacitor + React layout, global CSS or theme tokens; adding or changing cards, buttons, sheets, subpages, popovers, modals, animation, focus treatment, drag/swipe/chart gestures, or responsive geometry; or debugging dark-mode hierarchy, clipped corners or focus rings, stacking/portal bugs, scroll interference, safe areas, edge-to-edge, Android WebView visual behavior, native form-control mismatch, or PDF preview rendering. Do not use it for pure bridge/state ownership work, debt calculations, or native plugin/build tasks unless they also change UI behavior.
---

# Capacitor UI 与交互系统

## 先确认源码和边界

以当前 Capacitor + React 产品为准，不参考已封存的 `flutter/` 实现：

- JSX 与页面交互在 `react/src/**`；全局 CSS、主题 token、tabbar 和少量宿主表面在 `www/index.html`。
- React 组件与宿主处在同一文档，直接复用全局 class 和 CSS 变量；没有 CSS Modules 或独立 iframe 样式层。
- 共享 UI primitive 先查 `react/src/shared/Popover.tsx`、`PickerSheet.tsx`；sheet 拖动查 `react/src/sheets/gripDrag.ts`；债务、还款日和图表重手势分别查 `react/src/debts/gestures.ts`、`react/src/pay/gestures.ts`、`react/src/report/chartScrub.ts`、`pieRotate.ts`。
- 涉及 React/vanilla 状态所有权、五入口挂载、跨树导航或硬件返回链时，同时加载 `react-bridge-architecture` skill。业务规则再按功能加载 `debt-domain`、`pay-tab-design`、`edit-sheet-design` 等专项 skill。
- 不直接编辑 `www/js/react-debts/**` 或 `android/app/src/main/assets/public/**` 生成物。

先读真实消费者和现有 class；不要按“第几轮改版”推断现状，也不要为一个新页面复制第二套视觉系统。

## 维护主题与表面层级

### 同步主题 token

普通明暗主题 token 在 `www/index.html` 有四个覆盖入口：裸 `:root`、系统深色媒体查询、显式 `[data-theme="light"]`、显式 `[data-theme="dark"]`。新增或修改普通 token 时四处同步，分别核对系统偏好和手动主题。

唯一刻意例外是 `--ic-*` 图标徽章家族：只在裸 `:root` 定义，跨主题保持同一组小面积高饱和色。不要误补进四个主题块。

按角色使用现有 token：

- 页面：四个 tab 的 `.app` 使用 `--app-grad`；`body`、`.subpage`、`.tabbar`、`.login-gate` 使用 `--bg`。评估 tab 卡片层级时必须与 `--app-grad` 比，不要拿 `--bg` 代替。
- 内容表面：普通实心表面用 `--surface`/`--surface-2`；卡片渐变用 `--card-grad`；`--e1`/`--e2`/`--e3` 表示递增 elevation。深色层级主要靠明度台阶，不依赖黑色阴影。
- 玻璃：`--glass` 只用于可操作列表卡片，如 `.debt-front`、`.pay`。图表、KPI 和其它承载精确数据的容器必须是不透明 `--card-grad`，否则渐变页面底会让实际底色和数据对比度随滚动位置变化。
- 文本与实心填充必须分角色：文字/图标/描边用 `--accent`、`--good`、`--critical`；实心底用对应 `*-fill`；实心底上的前景用 `--on-accent`、`--on-good`、`--on-critical`，不能写死 `#fff`。
- `button { color: inherit }` 是深色模式基线，不能删除。按钮层级保持 primary（每屏最多一个）、ghost、danger、局部 tertiary；分段控件的选中态用凹槽加浮起滑块，不画成另一组主按钮。
- 小面积徽章可以多色相、高饱和；大面积图表应少色相、低饱和。一个数据颜色只承担一个语义角色。改色时同时验证前景/背景、真实相邻填充之间的区分，以及色觉缺陷下的区分，不能只逐色对页面底检查。

浅色和深色的层级方向不能机械互推。每次改表面色都在两套主题中逐对检查：页面→卡片、卡片→输入/选中态、页面→玻璃的实际叠加色、卡片→hero。

### 保持焦点和字体基线

- 全局 `:focus-visible` 用 `box-shadow: 0 0 0 2px var(--accent)`，不用 `outline + outline-offset`；后者不能可靠贴合不同圆角。
- 明确无需焦点环的例外必须同时关 `outline` 和 `box-shadow`。不要因为触摸设备常用点按就全局删除键盘/外接设备焦点反馈。
- `.sheet-scroll` 的横向裁切边界必须给焦点环留 2px：保留 `margin: 0 -2px; padding: 0 2px`。
- `www/fonts/Inter-Variable-Latin.woff2` 只覆盖拉丁字母和数字；中文有意回退到 `--font-ui` 的系统字体。不要把它误当成残留资源删除。

## 选择并层叠 UI 表面

### 使用当前层级表

当前全局层级是：

| 表面 | z-index |
|---|---:|
| tabbar | 20 |
| sheet scrim / sheet | 30 / 31 |
| subpage | 35 |
| Popover 或从 subpage 打开的嵌套 sheet | 36 |
| login gate | 40 |
| confirm / limit modal | 50 |
| toast | 60 |

不要孤立调一个数字。新增嵌套表面时同时核对遮罩、内容、点击命中、DOM 顺序和返回链。同 z-index 下，DOM 后出现者覆盖前者；`react/src/sheets/App.tsx` 的书写顺序因此是功能契约。完整返回顺序见 `react-bridge-architecture` skill。

### 区分 sheet、subpage、popover 与 modal

- 用 `.sheet` 承载短任务、选择器和底部操作；用 `.subpage` 承载占满屏幕的独立任务。四个主 tab 是 `.view`，不是可关闭 subpage。
- `.sheet` 常驻挂载，只切 `.open`，让 `translateY(100%) → 0` 的入场过渡有起始帧；动态创建在终态的节点不会播放这段过渡。
- `.sheet` 外层只负责圆角、裁切、transform 和 flex；所有滚动放进 `.sheet-scroll`。保持 `flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain`，并让 `.grip` 成为滚动层外的直接子元素。不要把 `overflow-y:auto` 放回带圆角和 transform 的 `.sheet`，否则深色 Android WebView 会在圆角露出白边。
- flex 内部滚动区必须有 `min-height:0`；“`max-width` + `margin:auto`”的 flex 子元素若应铺满，还必须写 `width:100%`，否则交叉轴 auto margin 会让它缩成 fit-content。
- 从另一个 `.sheet` 或 `.subpage` 打开的 picker 用 `PickerSheet` 的 portal，并同时提高 scrim 与 sheet；只提高内容会留下错误的遮罩层级。安卓 WebView 的原生 `<select>` 可能弹系统全屏列表，长选项或需要主题一致性的选择优先复用自绘 picker。
- 锚定小浮层复用 `Popover`：portal 到 `document.body` 才能逃出祖先 overflow、transform 和 stacking context。打开后先以 `visibility:hidden` 渲染，量触发器及面板自身尺寸，再把 `left/top` 钳进视口；下方不足时翻到上方。jsdom 不计算布局，相关测试必须打桩 `offsetWidth`、`offsetHeight` 和 `getBoundingClientRect()`。
- 只有低频、强阻断的确认才用 modal；已有场景优先复用 `confirmAsync`，不要为每次提示造新的弹层视觉语言。

## 维护触摸、拖拽和图表交互

### 区分轻点按与需要接管滚动的重手势

普通点击、Popover 外部点击和 grip 拖动可以使用 Pointer Events。凡是手势需要在移动过程中动态决定“交给页面滚动还是由组件接管”，触摸设备必须用原生 Touch Events：

- `touchstart` 通常可 passive；需要调用 `preventDefault()` 的 `touchmove` 必须用 `addEventListener(..., {passive:false})`。
- 不要用 JSX `onTouchMove` 代替；React 合成触摸事件无法可靠阻止 Android WebView 原生滚动。
- 先按 `dx`/`dy` 和现有阈值判断轴向。纵向占优就全程放行页面滚动；横向或长按意图确定后才 `preventDefault()`。不要在 `touchstart` 一落点就抢走滚动。
- 桌面鼠标可另走 `pointerType === "mouse"` 的 Pointer Events 路径，避免真机同时触发两套逻辑。

### 保留已经验证的手势边界

- 债务卡的长按排序、左滑和点击是同一状态机，实现在 `react/src/debts/gestures.ts`。不要拆成互相竞争的监听器，也不要把 Touch Events 改回 Pointer Events。
- 拖拽期间继续直接改 DOM transform；只在结束提交时更新 React/持久化状态。`.jiggle` 由 React className 驱动，`.dragging`/`.shifting` 由手势代码瞬时维护；不要让两边同时拥有同一个 class。
- 债务列表拖拽依赖容器直接子节点和节点上的 `__o` 数据，并用 `clientY + scrollY` 的文档坐标支持边缘自动滚动。不要在 `.debt` 外再套 wrapper；也不要在拖拽时调用 body scroll lock，否则会与 `window.scrollBy()` 自动滚动冲突。
- 债务页与还款日的左滑实现独立保留；前者与长按排序耦合，后者是纯滑动状态机，不为“去重”强行合并。
- 半透明卡片的滑出按钮必须与卡片内容做 flex sibling，不能绝对定位在玻璃背后；透明材质会让关闭状态的按钮透色。
- `__justDragged` 在每次新手势开始时重置。带位移手势通常不会合成 click，需要避免脏标记误伤下一次点击；零位移的“长按退出编辑”反而会合成 click，必须主动标记以抑制详情打开。
- sheet grip 只操作一个明确的把手，已有 `touch-action:none`，继续复用 `gripDrag.ts` 的 Pointer Events；不要为了统一风格并入债务卡重手势。

### 维护图表触摸

- 连续时间序列复用 `chartScrub.ts`；离散分类选择通常只需普通点击；可旋转甜甜圈复用 `pieRotate.ts`。
- scrub 的命中索引必须使用与渲染相同的真实 x 坐标比例，不能假设数据点等距。SVG 与覆盖其上的 HTML 标记必须共享同一个无 padding 绘图区坐标系。
- 拖拽旋转等逐帧视觉更新放在 ref/DOM 中，避免每帧 React setState 重渲染整棵图表；结束时清理监听器和 requestAnimationFrame。
- 依赖 `clientWidth` 或实际几何的组件可能在隐藏 tab 中以 0 宽挂载；用 `ResizeObserver` 在变为可见时重新计算，不能只靠一次 `useLayoutEffect`。
- 图表首帧几何可用 `useLayoutEffect` 防止空图闪烁；jsdom 的几何打桩不能替代真实浏览器截图和触摸验证。

## 处理 Android WebView 视觉雷区

- 债务页 header 与登录门的 “After Zero” wordmark 共用同一组字形路径：header 静态填充，登录门用描边动画。改文字或字体时用字体工具重新提取路径和真实长度，不手改 `d` 坐标；登录按钮的 `1.45s` 入场延迟与逐字动画总时长手工耦合，改字母数或时序时一起重算。
- edge-to-edge 是 CSS 与原生窗口共同构成的契约：保留 `viewport-fit=cover`、共享容器的 `env(safe-area-inset-*)`、透明系统栏、`setDecorFitsSystemWindows(false)`，并确保 Activity 运行主题没有 ActionBar。桌面浏览器的 safe-area 通常为 0，必须用 Android 截图验证。
- overscroll 也有两层：`html, body { overscroll-behavior-y:none }` 和内部滚动区的 `contain` 负责 CSS 滚动链；`MainActivity` 的 `WebView.OVER_SCROLL_NEVER` 关闭原生 View stretch。缺一层都可能让固定 tabbar 跟着整页拉伸。
- 全站关闭 WebView tap highlight、文本选择和 context menu 后，可点击元素仍要有项目自己的 `:active` 反馈；不要逐个组件重复补 `-webkit-tap-highlight-color`。
- 长按债务卡的系统触感反馈由 `MainActivity` 关闭，网页的 `user-select:none` 或 `preventDefault()` 不能代替它。
- 同一 `<form>` 中仅靠 `display:none` 隐藏的子面板字段不要带原生 `required`；Android WebView 可能静默阻止提交而不显示桌面式提示。改用按钮事件里的显式校验和 toast。
- Android WebView 不内置 PDF 插件，不能把 `DocsScreen` 的 pdf.js + canvas 预览退回 `<embed>`/`<object>`。命令式 canvas 容器的 JSX 必须保持零子节点，把 React 管理的加载/错误文字放在兄弟节点，避免 `innerHTML` 与虚拟 DOM 互删。
- 纯视觉或几何异常先收集真机截图、主题、系统版本和触发手势。原生 ActionBar、WebView 合成层、safe area、系统 select 和 overscroll 无法从桌面截图或类型检查中排除。

所有非必要动画都要遵守 `prefers-reduced-motion`；关闭动画时仍保证最终状态、点击区域和返回行为成立。

## 修改与验证工作流

1. 读 `PROGRESS.md` 最近自然日并检查 `git status --short`，保留用户已有改动。
2. 在 `www/index.html` 和真实 React 消费者中核对现有 token、class、DOM 层级、事件监听和返回行为。
3. 复用最窄的现有 primitive；改 theme token 时同步四个主题入口，改 overlay 时画清 z-index/portal/DOM/back 顺序，改手势时明确谁拥有滚动。
4. 补结构、状态和几何测试。jsdom 无法验证布局、合成层和真实触摸，因此对相关改动至少再做 localhost 浏览器验证；WebView 专属问题用 Android 真机或模拟器验证。
5. 涉及产品 UI 源码至少运行：

   ```bash
   npm run test:react
   npx tsc --noEmit --project react/tsconfig.json
   npm run build:react
   npx cap sync android
   git diff --check
   ```

6. 同时核对浅色、深色、窄视口、长内容、滚动到边界、表面叠加和 `prefers-reduced-motion`。仅改文档或 skill 时不重建生成物。
