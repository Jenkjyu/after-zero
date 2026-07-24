import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Stats } from "../src/pay/Stats";
import { makeDebt } from "./mockBridge";
import type { PayItem } from "../src/pay/App";

describe("Stats", () => {
  it("items为空时不渲染任何内容", () => {
    const { container } = render(<Stats items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("7天内/30天内待还是累计口径(30天内包含7天内)，逾期不计入", () => {
    const items: PayItem[] = [
      { d: makeDebt({ monthly: 100 }), i: 0, next: new Date(), diff: -1 }, // 逾期，不计
      { d: makeDebt({ monthly: 200 }), i: 1, next: new Date(), diff: 3 },  // 7天内
      { d: makeDebt({ monthly: 300 }), i: 2, next: new Date(), diff: 20 }, // 30天内但不在7天内
      { d: makeDebt({ monthly: 400 }), i: 3, next: new Date(), diff: 45 }, // 超过30天，不计
    ];
    const { container } = render(<Stats items={items} />);
    expect(container.textContent).toContain("¥200"); // weekAmt
    expect(container.textContent).toContain("共 1 笔"); // weekN
    expect(container.textContent).toContain("¥500"); // monthAmt = 200+300
    expect(container.textContent).toContain("共 2 笔"); // monthN
  });
});
