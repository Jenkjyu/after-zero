import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { HistoryTeaser } from "../src/report/HistoryTeaser";
import { closeHistoryScreen, useHistoryScreenOpen } from "../src/shared/state";
import type { DebtSummary } from "../src/types";

function makeSummary(overrides?: Partial<DebtSummary>): DebtSummary {
  return { total: 0, monthly: 0, active: 0, settled: 0, paidPrincipal: 0, paidInterest: 0, pct: 0, ...overrides };
}

afterEach(() => {
  closeHistoryScreen(); // historyScreenOpen是模块级状态，重置避免测试间互相污染
});

describe("HistoryTeaser", () => {
  it("一笔都没结清、累计已还本金也没到1万时不渲染", () => {
    const { container } = render(<HistoryTeaser s={makeSummary({ settled: 0, paidPrincipal: 500 })} />);
    expect(container.firstChild).toBeNull();
  });

  it("有已结清债务时渲染，显示笔数和累计已还本金", () => {
    render(<HistoryTeaser s={makeSummary({ settled: 2, paidPrincipal: 38000 })} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("¥38,000")).toBeInTheDocument();
  });

  it("没有已结清债务但累计已还本金到1万时也渲染", () => {
    const { container } = render(<HistoryTeaser s={makeSummary({ settled: 0, paidPrincipal: 10000 })} />);
    expect(container.firstChild).not.toBeNull();
  });

  it("点「查看完整历程」打开HistoryScreen", () => {
    render(<HistoryTeaser s={makeSummary({ settled: 1, paidPrincipal: 20000 })} />);
    const hook = renderHook(() => useHistoryScreenOpen());
    fireEvent.click(screen.getByText("查看完整历程"));
    expect(hook.result.current).toBe(true);
  });
});
