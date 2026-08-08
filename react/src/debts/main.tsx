// 入口——挂进 www/index.html 里的 #react-debts-root(在#view-debts内部)。
// Vite库模式构建成单文件ESM bundle，index.html用<script type="module" src="js/react-debts/main.js">
// 引入，见 react/vite.config.ts 和 AGENTS.md "React 迁移"一节。
import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("react-debts-root");
if (container) {
  createRoot(container).render(<App />);
}
