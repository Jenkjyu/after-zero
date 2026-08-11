---
name: react-bridge-architecture
description: Use this skill when modifying After Zero's current Capacitor + React UI under `react/src/**`, shared external state in `react/src/shared/state.ts`, the `AzBridge` contract or browser globals in `react/src/types.ts`/`calcGlobals.d.ts`, React mount roots or `window.__azBridge` in `www/index.html`, Vite multi-entry configuration, cross-tree screen navigation, `az:*-changed` events, or the Android hardware-back chain. Also use it when debugging stale React renders after vanilla mutation, missing bridge methods, a blank app after host-DOM changes, wrong sheet stacking/back order, or stale/missing `www/js/react-debts` bundles.
---

# React 与 vanilla 桥接架构

## 先按当前代码建立地图

不要从“第几步迁移”推断现状。先检查这些权威位置：

- `react/vite.config.ts`：入口、产物目录和Vitest配置。
- `www/index.html`：宿主DOM、脚本顺序、vanilla IIFE、事件派发和运行时`window.__azBridge`。
- `react/src/shared/state.ts`：共享数据订阅、跨React树UI状态和对应事件。
- `react/src/types.ts`：`AzBridge`与业务类型。
- `react/src/calcGlobals.d.ts`：classic-script全局、反向返回函数与其它`window`声明。
- `react/__tests__/mockBridge.ts`：测试环境的完整bridge实现。
- `react/src/sheets/App.tsx`：常驻screen/sheet的DOM层叠顺序。

当前是一个宿主、五棵React树：

| Vite入口 | 挂载点 | 所有权 |
|---|---|---|
| `debts` | `#react-debts-root` | “在还债务”tab |
| `pay` | `#react-pay-root` | “还款日”tab |
| `report` | `#react-report-root` | “统计”tab |
| `mine` | `#react-mine-root` | “我的”tab |
| `sheets` | `#react-sheets-root` | 不属于任何tab、始终挂载的subpage/sheet |

四个tab根在各自的`.view`内；`sheets`根在tab视图之外，供多棵树共同打开。全部产品page/screen/sheet内容已经由React渲染，不要再建立新的vanilla页面渲染器。

## 判断状态和逻辑归谁

按以下顺序决定，不要把bridge当成默认垃圾桶：

1. 只影响一个组件或一棵树的短期UI状态，放组件`useState`/`useRef`。
2. 多棵React树需要共同打开或观察的UI状态，放`react/src/shared/state.ts`，使用模块级快照、专用`az:x-changed`事件和`useSyncExternalStore` hook。
3. 持久化状态只有React消费者时，可以由React直接拥有并读写既有localStorage键。当前先例有债务排序、单笔模拟偏好和AI本地缓存/历史；键名仍受`AGENTS.md`铁律保护。
4. debts/premium/account/notify等共享数据，或需要localStorage/IndexedDB、CloudBase认证、云函数、原生插件、系统文件选择器、Blob保存的操作，继续归vanilla IIFE；React通过窄bridge读写。
5. 债务计算和账本变换归`www/js/calc.js`，不要在React或bridge再实现一份；同时加载`debt-domain` skill。

刻意保留的vanilla DOM例外：

- `#loginGate`默认可见，并在React bundle运行前由早期内联脚本同步判定登录态，不能迁移到React。
- `#modalScrim`是全App唯一确认弹窗；React通过`confirmAsync`复用，不另建第二套。
- `#importFileInput`及其change流程仍由vanilla拥有；React只通过`triggerImportFilePicker`触发。
- tabbar和全局CSS仍在宿主中；React复用现有class和CSS变量。

## 维护 `window.__azBridge`

把`__azBridge`限定为“React读取vanilla权威状态”或“React触发vanilla拥有的impure操作”。不要在文档维护容易漂移的完整函数快照，修改时直接核对三处：

1. `www/index.html`末尾的运行时对象；
2. `react/src/types.ts`的`AzBridge`接口；
3. `react/__tests__/mockBridge.ts`的mock实现。

新增、删除、改名、改参数或改返回值时三处同改，并给真实调用方补测试。若React新增了calc.js全局调用，再同步`react/src/calcGlobals.d.ts`。

保持这些边界规则：

- 状态读取用函数而不是捕获变量，例如`getDebts()`；vanilla可能整体重新赋值底层数组。
- 单笔债务操作按永久`Debt.id`寻址，不退回数组下标、名称或对象引用。`setDebt(null, obj)`表示新增。
- 先读实现再判断写操作是否自带持久化/事件。比如`setDebt`刻意不调用`saveAll`/`renderAll`，保存表单按现有契约显式编排三步；不能假设所有bridge写函数都自动收尾。
- React拥有的页面导航直接调用`shared/state.ts`的`openX`/`closeX`，不要给bridge重新加入`openXScreen`。
- `window.recompute`等calc函数来自先加载的classic script，不属于`__azBridge`；React显式写`window.`以标明跨运行时边界。

## 维护事件与外部快照

### 数据事件

- `az:state-changed`：debts、premium、account、notify等共享状态变化后的统一通知。任何不经过`renderAll()`的写路径也必须自己派发。
- `az:files-changed`：档案库展示数据变化；它与通用状态事件分开。
- `az:tab-changed`：vanilla tabbar通知React收起离开tab后的手势/临时状态。
- `az:*-(screen|sheet)-changed`及具体`az:detail-sheet-changed`等：React共享UI开关，各表面使用独立事件，避免无关订阅者一起更新。

事件只表示“可能变了”，真正值由snapshot读取。使用`useSyncExternalStore`时，`Object.is`比较的是返回值引用，必须按数据源形状选缓存：

- 底层可能原地mutation、也可能整体换引用，例如debts：事件回调把缓存标脏；snapshot在脏或source引用变化时`.slice()`，否则返回同一缓存。
- getter每次合成新对象/数组、没有可比较source引用，例如notify/files：按实际字段做fingerprint；内容未变时返回同一缓存。
- getter对应的每条写路径都稳定替换引用，例如当前account：可以直接返回；一旦出现原地mutation就必须重审。

premium既有`premium.premium = ...`原地写，也有`premium = {...}`整体替换。`usePremium()`现按`method + at`做fingerprint，只在值变化时生成内外层都脱离vanilla源对象的新快照；值不变时复用缓存引用。不要退回直接返回`getPremium()`对象，也不要无条件clone。若Premium数据形状增加会影响展示或门禁的新字段，必须同步扩展fingerprint/clone并补原地mutation与稳定引用回归测试。

永远不要让`getSnapshot`无条件返回新对象；React会在提交后再次检查快照，持续新引用会造成无限重渲染。也不要直接返回会被原地修改的同一对象；事件虽然触发，React仍会判定没有变化。

## 维护跨树screen和层叠顺序

跨树screen状态放在`shared/state.ts`，因为五个入口会共享Rollup拆出的模块chunk。典型形状是模块变量 + subscribe + open/close + hook；需要绑定债务的表面保存id，普通表面保存boolean。每个表面用自己的事件名。

新增常驻surface时同时处理：

- 在`shared/state.ts`增加状态API；
- 在触发树直接import open函数；
- 在`react/src/sheets/App.tsx`挂载组件；
- 为打开、关闭、跨树触发和目标对象消失补测试；
- 若surface可覆盖另一个surface，核对DOM层叠与返回链。

同z-index下，`App.tsx`里后渲染的组件位于上层。若X从Y内部打开，X通常必须排在Y后面；不要只看视觉z-index而忽略DOM顺序。

## 维护硬件返回链

返回链有三层：

1. `MainActivity.java`用`OnBackPressedDispatcher`执行`window.__handleBackButton()`；不要退回`onBackPressed()`。
2. `www/index.html`按“最上层先关”调用modal或各`window.__az*Back`；没有任何层消费时返回`false`，原生才退出。
3. React组件在effect里注册自己的`__az*Back: () => boolean`，卸载时删除。组件内部更高层状态（picker、排序sheet、AI历史sheet等）必须先关闭，再关闭外层screen。

新增或重排surface时同步：

- `react/src/sheets/App.tsx`的渲染顺序；
- `www/index.html`的`__handleBackButton`判断顺序；
- `react/src/calcGlobals.d.ts`的可选全局声明；
- 组件测试里的“关闭时false、打开时true、卸载后清理”。

这里的两套顺序方向相反：JSX后出现者在上；返回链则要先检查上层。使用一次注册但需要读取最新state的回调时，用ref保持最新值，避免闭包停在初始状态。`#loginGate`不可关闭，故意不注册返回处理。

## 维护挂载、脚本和构建

`react/vite.config.ts`使用库模式多入口，输出到gitignored的`www/js/react-debts/`。保持：

- 入口名与`<script type="module" src="js/react-debts/{name}.js">`、挂载点和对应`main.tsx`一致。
- 多入口不能重新启用`inlineDynamicImports`；让Rollup自动拆共享React/state chunk。
- `process.env.NODE_ENV="production"`只在`command === "build"`时定义；若影响Vitest，会摇掉测试所需的React API。
- `react/__tests__`不要改回`react/test`；根`npm test`已显式锁在`test/*.test.js`。

脚本运行边界：

- `js/calc.js`和定义`__azBridge`的主classic script会在延迟执行的React module入口前完成。
- pdf.js行内module必须排在外部React module入口前，保证`sheets`读取`window.pdfjsLib`时已就绪。
- 新增或删除入口时，在同一次改动中同步Vite entry、宿主root、module script和入口`main.tsx`。
- 删除宿主DOM前先搜索其id的vanilla顶层事件绑定；遗留`$("id").addEventListener`会对`null`抛错，使IIFE在创建bridge前中断。

构建顺序固定为：

```bash
npm run build:react
npx cap sync android
```

不要直接编辑`www/js/react-debts/**`或`android/app/src/main/assets/public/**`。只做文档改动时无需重建或sync。

## 修改与验证工作流

1. 读`PROGRESS.md`最近自然日、检查`git status --short`，保留用户已有改动。
2. 从真实消费者反查状态所有权；不要凭旧注释或迁移阶段编号决定。
3. 先改最窄边界；bridge、共享状态和全局返回函数都只暴露实际消费者需要的表面。
4. 同步运行时、类型、mock、事件派发、挂载和返回链中受影响的所有契约。
5. 至少运行：

   ```bash
   npm run test:react
   npx tsc --noEmit --project react/tsconfig.json
   npm run build:react
   git diff --check
   ```

6. 改到`calc.js`或债务变换时另跑`npm test`；改到打包进Android的Web源码时在build后跑`npx cap sync android`。
7. bridge初始化、vanilla DOM、脚本顺序和console错误没有完整jsdom覆盖；涉及这些边界时用localhost实际加载页面。硬件返回、原生能力和真实触摸手势仍需Android真机或模拟器验证。
