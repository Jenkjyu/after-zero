import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Popover } from "../src/shared/Popover";

function renderPopover() {
  return render(
    <Popover
      renderTrigger={({ toggle }) => (
        <button type="button" onClick={toggle}>
          触发器
        </button>
      )}
      renderContent={({ close }) => (
        <div>
          <span>面板内容</span>
          <button type="button" onClick={close}>
            关闭
          </button>
        </div>
      )}
    />
  );
}

describe("Popover", () => {
  it("默认关闭", () => {
    renderPopover();
    expect(screen.queryByText("面板内容")).not.toBeInTheDocument();
  });

  it("点触发器打开", () => {
    renderPopover();
    fireEvent.click(screen.getByText("触发器"));
    expect(screen.getByText("面板内容")).toBeInTheDocument();
  });

  it("点外面关闭", () => {
    renderPopover();
    fireEvent.click(screen.getByText("触发器"));
    expect(screen.getByText("面板内容")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("面板内容")).not.toBeInTheDocument();
  });

  it("再点一次触发器关闭", () => {
    renderPopover();
    fireEvent.click(screen.getByText("触发器"));
    expect(screen.getByText("面板内容")).toBeInTheDocument();
    fireEvent.click(screen.getByText("触发器"));
    expect(screen.queryByText("面板内容")).not.toBeInTheDocument();
  });

  it("renderContent拿到的close()能关闭面板", () => {
    renderPopover();
    fireEvent.click(screen.getByText("触发器"));
    fireEvent.click(screen.getByText("关闭"));
    expect(screen.queryByText("面板内容")).not.toBeInTheDocument();
  });
});

// ===== 面板按视口钳制（2026-07-29，真机上"加权平均利率"那个问号点开后内容溢出屏幕）=====
// jsdom不做布局：offsetWidth/offsetHeight恒为0、getBoundingClientRect全是0，所以这组
// 几何测试必须把这两样显式打桩，否则钳制逻辑拿到的全是0、什么都验不出来。
describe("Popover 视口钳制", () => {
  const PANEL_W = 220, PANEL_H = 120, VW = 390, VH = 800;

  function setupGeometry(triggerRect: Partial<DOMRect>) {
    const origW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    const origH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    const origRect = Element.prototype.getBoundingClientRect;
    const origVW = window.innerWidth, origVH = window.innerHeight;

    Object.defineProperty(window, "innerWidth", { value: VW, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: VH, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get(this: HTMLElement) { return this.classList.contains("popover-panel") ? PANEL_W : 0; },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) { return this.classList.contains("popover-panel") ? PANEL_H : 0; },
    });
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.classList.contains("popover-root")) return { ...triggerRect } as DOMRect;
      return origRect.call(this);
    };

    return () => {
      if (origW) Object.defineProperty(HTMLElement.prototype, "offsetWidth", origW);
      if (origH) Object.defineProperty(HTMLElement.prototype, "offsetHeight", origH);
      Element.prototype.getBoundingClientRect = origRect;
      Object.defineProperty(window, "innerWidth", { value: origVW, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: origVH, configurable: true });
    };
  }

  function openAndReadPanel() {
    fireEvent.click(screen.getByText("触发器"));
    const panel = document.querySelector(".popover-panel") as HTMLElement;
    expect(panel).toBeTruthy();
    return panel;
  }

  it("align=end 且触发器靠近左边时，面板不会溢出左边缘", () => {
    // 理想位置 = 触发器右边 - 面板宽 = 60 - 220 = -160，整块跑到屏幕外
    const restore = setupGeometry({ left: 40, right: 60, top: 100, bottom: 120 });
    try {
      render(
        <Popover
          renderTrigger={({ toggle }) => <button type="button" onClick={toggle}>触发器</button>}
          renderContent={() => <div>面板内容</div>}
        />
      );
      const panel = openAndReadPanel();
      expect(parseFloat(panel.style.left)).toBe(10); // 钳到左边距
      expect(panel.style.visibility).toBe("visible");
    } finally { restore(); }
  });

  it("align=start 且触发器靠近右边时，面板不会溢出右边缘", () => {
    const restore = setupGeometry({ left: 300, right: 340, top: 100, bottom: 120 });
    try {
      render(
        <Popover
          align="start"
          renderTrigger={({ toggle }) => <button type="button" onClick={toggle}>触发器</button>}
          renderContent={() => <div>面板内容</div>}
        />
      );
      const panel = openAndReadPanel();
      // 理想位置300会让右边缘跑到520，钳到 视口宽-面板宽-边距 = 390-220-10 = 160
      expect(parseFloat(panel.style.left)).toBe(160);
    } finally { restore(); }
  });

  it("下方放不下时翻到触发器上方", () => {
    // 触发器底边在760，下面只剩40px，放不下120高的面板
    const restore = setupGeometry({ left: 40, right: 260, top: 740, bottom: 760 });
    try {
      render(
        <Popover
          renderTrigger={({ toggle }) => <button type="button" onClick={toggle}>触发器</button>}
          renderContent={() => <div>面板内容</div>}
        />
      );
      const panel = openAndReadPanel();
      // 翻到上方：触发器顶边740 - 面板高120 - 间隙6 = 614
      expect(parseFloat(panel.style.top)).toBe(614);
    } finally { restore(); }
  });
});
