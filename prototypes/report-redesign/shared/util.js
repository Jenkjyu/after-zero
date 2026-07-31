// 三套原型共用的小工具：格式化 + 图表几何。
// 刻意只放"三套都会用到且算法完全相同"的东西（金额格式化、Y轴取整、折线路径），
// 凡是跟具体设计有关的（柱子怎么排、图例怎么放、卡片什么结构）都留在各自的页面里，
// 否则三套会被这个共享层拽成同一个样子，就失去对比的意义了。

// 跟 www/js/calc.js 的 fmt() 行为一致：千分位、去掉无意义的小数
function fmt(n) {
  n = +n || 0;
  var s = Math.abs(n) >= 1000 || n % 1 === 0 ? Math.round(n) : Math.round(n * 100) / 100;
  return s.toLocaleString("en-US");
}

// 紧凑金额（只在极简方案 C 的坐标轴上用，主体数字一律用完整 fmt）
function fmtK(n) {
  n = +n || 0;
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + "万";
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
  return String(Math.round(n));
}

// Y 轴取整——原样照抄 PressureChart.tsx 里的档位表和算法（那张表的取值理由见
// 那个文件的注释：只有 1/2/2.5/5/10 的话最高的柱子会只有半格高）
var NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceCeil(v) {
  if (v <= 0) return 0;
  var mag = Math.pow(10, Math.floor(Math.log10(v)));
  var n = v / mag;
  var hit = null;
  for (var i = 0; i < NICE_STEPS.length; i++) { if (n <= NICE_STEPS[i]) { hit = NICE_STEPS[i]; break; } }
  return (hit || 10) * mag;
}

// "2026-08" → "26年8月"
function monthLabel(m) { return m.slice(2, 4) + "年" + (+m.slice(5, 7)) + "月"; }
// "2026-08" → "8"（x 轴刻度，宽度不够放年份，跨年靠分隔线表达）
function monthTick(m) { return String(+m.slice(5, 7)); }
// "2026-08-15" → "2026-08"
function ymOf(d) { return d.slice(0, 7); }

// 走势图折线路径：X 轴**按真实时间比例**定位，不是按数组下标等距——
// 这条是正式 App 修过的一个真实缺陷（等距下标会让"两个月"和"两年"在图上一样宽，
// 斜率完全失去意义），原型必须保留同一个正确性，见审计"必须保留的视觉特征"。
function timelineCoords(timeline, W, H, top) {
  var t0 = new Date(timeline[0].date + "T00:00:00").getTime();
  var tEnd = new Date(timeline[timeline.length - 1].date + "T00:00:00").getTime();
  var span = Math.max(1, tEnd - t0);
  return timeline.map(function (p) {
    var t = new Date(p.date + "T00:00:00").getTime();
    return [((t - t0) / span) * W, H - (p.balance / top) * H];
  });
}
function linePath(coords) {
  return coords.map(function (c, i) { return (i ? "L" : "M") + c[0].toFixed(2) + " " + c[1].toFixed(2); }).join(" ");
}
function areaPath(coords, H) {
  return linePath(coords) + " L" + coords[coords.length - 1][0].toFixed(2) + " " + H + " L" + coords[0][0].toFixed(2) + " " + H + " Z";
}

// 主题切换（三套页面 + 总览页共用）。总览页通过 postMessage 同步 iframe 里的主题。
function initTheme() {
  var saved = null;
  try { saved = localStorage.getItem("az-proto-theme"); } catch (e) {}
  var q = new URLSearchParams(location.search).get("theme");
  var initial = q || saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  setTheme(initial, false);
  window.addEventListener("message", function (e) {
    if (e.data && e.data.azTheme) setTheme(e.data.azTheme, false);
  });
}
function setTheme(t, persist) {
  document.documentElement.setAttribute("data-theme", t);
  if (persist !== false) { try { localStorage.setItem("az-proto-theme", t); } catch (e) {} }
}
function toggleTheme() {
  var cur = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  setTheme(cur, true);
}

// 右上角主题按钮（三套页面共用的同一段 markup）
var THEME_BTN_HTML =
  '<button class="theme-btn" type="button" onclick="toggleTheme()" aria-label="切换深浅色">' +
  '<svg class="ic-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>' +
  '<svg class="ic-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' +
  "</button>";

// 底部 tabbar（原样复刻正式 App 的四个图标，统计那个是选中态）
var TABBAR_HTML =
  '<nav class="tabbar">' +
  '<button type="button" aria-label="债务"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><line x1="2.5" y1="9.5" x2="21.5" y2="9.5"/></svg></button>' +
  '<button type="button" aria-label="还款日"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="15" rx="2.5"/><path d="M3 9.5h18"/><path d="M8 3.5v4M16 3.5v4"/></svg></button>' +
  '<button type="button" class="on" aria-label="统计"><svg viewBox="0 0 24 24"><rect x="2.8" y="11" width="4.2" height="8" rx="1.4" fill="currentColor"/><rect x="9.9" y="5" width="4.2" height="14" rx="1.4" fill="currentColor"/><rect x="17" y="8.5" width="4.2" height="10.5" rx="1.4" fill="currentColor"/></svg></button>' +
  '<button type="button" aria-label="我的"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.3"/><path d="M4.5 19.5c0-3.6 3.3-6 7.5-6s7.5 2.4 7.5 6"/></svg></button>' +
  "</nav>";
