// Vitest全局setup——补充jest-dom的匹配器(toBeInTheDocument等)，配置见react/vite.config.ts
// 的test.setupFiles。跟www/js/calc.js的node:test套件是完全独立的两套测试(见package.json
// 的test/test:react两个脚本)，这里只测React组件，不重复测calc.js的纯函数逻辑。
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
// @ts-expect-error calc.js是CommonJS(module.exports)，没有.d.ts，这里只是取运行时的对象，
// 类型交给 react/src/calcGlobals.d.ts 里的环境声明。
import * as calc from "../../www/js/calc.js";

// 组件代码里调用的是window.recompute(d)/window.fmt(n)这类显式写法(见AGENTS.md"React 迁移"
// 一节"为什么显式window.xxx调用"那条)，测试里要用真实的calc.js实现(不是另外手写一份mock，
// 那样容易跟真实实现的行为悄悄分叉)，把它的导出对象整个挂到window上，跟浏览器里
// <script src="js/calc.js">的效果等价。
Object.assign(window, calc);

// jsdom不实现Element.scrollIntoView(真实浏览器/WebView都有)——AiScreen.tsx新消息追加后
// 会调用它把最新气泡滚进视图，测试环境下这个方法压根不存在，直接报
// "el.scrollIntoView is not a function"。补一个空实现，跟真实滚动行为无关，只是让代码
// 能跑，不需要断言滚动位置。
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
});
