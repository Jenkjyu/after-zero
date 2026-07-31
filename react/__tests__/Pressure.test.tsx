// 未来还款压力：面积/柱状两种模式 + 点月看明细。
//
// 重点锁两件在原型阶段真出过问题的事：
//  ① 切换模式时**卡片结构不变**——头顶空间放在两种模式共用的 .pcanvas，
//     只给一种模式加的话，切过去卡片会整体拉长、刻度线跟着跳。
//  ② 柱高必须由 total 决定、本金/利息只按比例切分——手动逐行编辑时 amount 和
//     principal+interest 可能对不上（已知的数据模型缺口⑤），各自独立算高度会让柱子
//     画到 total 之外（实测过 amount=100 而 principal+interest=2194、柱高 2194% 的例子）。
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Pressure } from "../src/report/Pressure";
import type { UpcomingPressure, UpcomingPressureMonth } from "../src/types";

function month(over: Partial<UpcomingPressureMonth> & { month: string }): UpcomingPressureMonth {
  return {
    principal: 0, interest: 0, total: 0, items: [],
    ...over,
  };
}

function data(over?: Partial<UpcomingPressure>): UpcomingPressure {
  const months = over?.months ?? [
    month({ month: "2026-08", principal: 800, interest: 200, total: 1000, items: [{ id: "a", name: "A", amount: 1000 }] }),
    month({ month: "2026-09", principal: 2400, interest: 600, total: 3000, items: [
      { id: "a", name: "A", amount: 2000 }, { id: "b", name: "B", amount: 1000 },
    ] }),
    month({ month: "2026-10", principal: 400, interest: 100, total: 500, items: [] }),
  ];
  return {
    overdue: { amount: 0, principal: 0, interest: 0, count: 0 },
    months,
    currentMonth: "2026-08",
    totalAhead: months.reduce((s, m) => s + m.total, 0),
    monthlyAvg: 1500,
    peak: { month: "2026-09", total: 3000 },
    ...over,
  } as UpcomingPressure;
}

beforeEach(() => {
  window.niceCeil = (v: number) => Math.ceil(v / 1000) * 1000 || 1;
  window.fmt = (n: number) => Math.round(n).toLocaleString("en-US");
  window.truncateLabel = (s: string) => s;
});

describe("Pressure", () => {
  it("默认是面积模式，画 4 条 path（本金面积/利息带/本金线/总额线）", () => {
    render(<Pressure data={data()} />);
    expect(document.querySelector(".pmode button.on")?.textContent).toBe("面积");
    expect(document.querySelectorAll(".achart svg path").length).toBe(4);
    expect(document.querySelector(".pbars")).toBeNull();
  });

  it("切到柱状：柱子数等于月份数，峰值月带标注，且卡片骨架（.pcanvas/.agrid/.axaxis）不变", () => {
    render(<Pressure data={data()} />);
    const before = {
      canvas: !!document.querySelector(".pcanvas"),
      grid: document.querySelectorAll(".agrid .gridline").length,
      ticks: document.querySelectorAll(".axtick").length,
    };
    fireEvent.click(screen.getByText("柱状"));
    expect(document.querySelectorAll(".pcol").length).toBe(3);
    expect(document.querySelectorAll(".pcol.peak").length).toBe(1);
    expect(document.querySelector(".achart")).toBeNull();
    // 骨架三件套完全一致——切换不该改变卡片高度和坐标轴
    expect(!!document.querySelector(".pcanvas")).toBe(before.canvas);
    expect(document.querySelectorAll(".agrid .gridline").length).toBe(before.grid);
    expect(document.querySelectorAll(".axtick").length).toBe(before.ticks);
  });

  it("面积模式也标峰值（连续曲线会把局部起伏平滑掉，肉眼挑不出最高点）", () => {
    render(<Pressure data={data()} />);
    expect(document.querySelectorAll(".apeak").length).toBe(1);
  });

  it("点某个月出明细，再点一次收起", () => {
    render(<Pressure data={data()} />);
    expect(document.querySelector(".abd")).toBeNull();
    const hit = document.querySelectorAll(".ahit button");
    fireEvent.click(hit[1]);                       // 2026-09，有 2 笔
    expect(document.querySelectorAll(".abd-r").length).toBe(2);
    fireEvent.click(document.querySelectorAll(".ahit button")[1]);
    expect(document.querySelector(".abd")).toBeNull();
  });

  it("切换模式时保留当前选中的月份（换个画法看同一个月，不该把选择清掉）", () => {
    render(<Pressure data={data()} />);
    fireEvent.click(document.querySelectorAll(".ahit button")[1]);
    expect(document.querySelectorAll(".abd-r").length).toBe(2);
    fireEvent.click(screen.getByText("柱状"));
    expect(document.querySelectorAll(".abd-r").length).toBe(2);
    expect(document.querySelectorAll(".pcol.active").length).toBe(1);
  });

  it("柱高由 total 决定，本金/利息只按比例切分——amount 与本金+利息对不上时也不会冲出画布", () => {
    // 已知的数据模型缺口⑤：手动逐行编辑时两者可能不一致
    const d = data({
      months: [month({ month: "2026-08", total: 100, principal: 2000, interest: 194, items: [] })],
      peak: { month: "2026-08", total: 100 },
      monthlyAvg: 100,
      totalAhead: 100,
    });
    render(<Pressure data={d} />);
    fireEvent.click(screen.getByText("柱状"));
    const segs = [...document.querySelectorAll<HTMLElement>(".pstack .seg")];
    const sum = segs.reduce((s, el) => s + parseFloat(el.style.height || "0"), 0);
    // niceCeil(100)=1000 → 柱高应该是 10%，两段加起来也是 10%，不是 219%
    expect(sum).toBeCloseTo(10, 1);
    segs.forEach((el) => expect(parseFloat(el.style.height || "0")).toBeLessThanOrEqual(100));
  });

  it("逾期单独成一句说明，不混进月份柱子", () => {
    render(<Pressure data={data({ overdue: { amount: 555, principal: 500, interest: 55, count: 2 } })} />);
    expect(document.querySelector(".sec-note")!.textContent).toContain("已逾期");
    expect(document.querySelector(".sec-note")!.textContent).toContain("未计入下方");
    expect(document.querySelectorAll(".ahit button").length).toBe(3);   // 还是 3 个月，没多一根
  });

  it("完全没有待还款项时给明确的完成态", () => {
    render(<Pressure data={data({ months: [], totalAhead: 0, peak: null })} />);
    expect(screen.getByText("未来没有待还款项")).toBeInTheDocument();
  });
});
