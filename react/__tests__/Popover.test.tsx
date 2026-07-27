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
