import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InfoTip } from "../src/shared/InfoTip";

describe("InfoTip", () => {
  it("点\"?\"显示说明文字，点外面消失", () => {
    render(<InfoTip text="按各笔债务当前余额加权平均后的利率。" />);
    expect(screen.queryByText("按各笔债务当前余额加权平均后的利率。")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("说明"));
    expect(screen.getByText("按各笔债务当前余额加权平均后的利率。")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("按各笔债务当前余额加权平均后的利率。")).not.toBeInTheDocument();
  });
});
