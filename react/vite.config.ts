// React迁移("在还债务"页)的Vite库模式构建配置——不是普通Vite app模式，因为这次不是造一个
// 独立SPA，是"把一个React组件挂进现有www/index.html的某个节点"，build.lib正是为这个场景设计的：
// 产出一个可以直接<script type="module" src="...">引入的单文件bundle，不需要自己的index.html。
//
// 用 vitest/config 的 defineConfig（不是 vite 的）——这样同一份配置文件里的 `test` 字段
// 才有类型支持，build配置和test配置合并在一个文件里，不用另外维护一份 vitest.config.ts。
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // 库模式默认不会把process.env.NODE_ENV替换成"production"(这是留给"库的使用者"决定的)，
  // 但这次产出的bundle本质是直接内嵌进www/index.html的自包含"app"，不是给别人import的库——
  // 不显式定义这个的话react/react-dom会在运行时判断走开发版分支(体积大好几倍、还会在
  // console打一堆开发模式警告)，构建产物明显偏大就是这个原因，加上这行才会被摇树摇掉。
  // ⚠️只在command==="build"时定义——`vitest run`跟这份配置共用同一个文件(见下面test字段
  // 的注释)，如果这条也套用到测试环境，会把react-dom测试专用的act()等API一起摇掉，
  // 表现为"React.act is not a function"，是真实踩过的坑，别把这行挪到条件判断外面。
  define: command === "build" ? { "process.env.NODE_ENV": JSON.stringify("production") } : {},
  build: {
    outDir: resolve(__dirname, "../www/js/react-debts"),
    emptyOutDir: true,
    lib: {
      // 三个tab三个独立入口，各自产出main.js/pay.js/report.js，index.html里各配一个
      // <script type="module">。inlineDynamicImports只支持单入口，多入口后必须去掉——
      // Rollup对ES格式的多入口构建会自动把react/react-dom这类公共依赖拆成共享chunk，
      // 三个入口各自import它，不会各自打包一份重复的react/react-dom。
      entry: {
        debts: resolve(__dirname, "src/debts/main.tsx"),
        pay: resolve(__dirname, "src/pay/main.tsx"),
        report: resolve(__dirname, "src/report/main.tsx"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
  },
  test: {
    // 目录故意不叫"test"、叫"__tests__"——Node自带的node:test跑`npm test`(见package.json)
    // 时，默认会把项目里任何名叫"test"的目录当成它自己的测试文件递归扫进去，不管扩展名/
    // 命名规则，真的把这里的.tsx/.ts当成node:test用例去跑过、报一堆莫名其妙的失败。
    // 改名成"__tests__"(Jest/Vitest生态的常见叫法)后node:test的默认发现规则不会碰它，
    // 两套测试工具(node --test 测calc.js，vitest测React组件)才能真正互不干扰。
    root: __dirname,
    include: ["__tests__/**/*.{test,spec}.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
    setupFiles: [resolve(__dirname, "__tests__/setup.ts")],
  },
}));
