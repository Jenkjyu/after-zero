import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AccountHeader } from "../src/mine/AccountHeader";
import { makeMockBridge } from "./mockBridge";
import type { Account } from "../src/types";

const account: Account = {
  openid: "test-openid",
  nickname: "测试昵称",
  avatarUrl: "https://example.com/a.png",
  loggedInAt: 0,
};

describe("AccountHeader", () => {
  it("account存在时渲染头像src和昵称", () => {
    window.__azBridge = makeMockBridge();
    render(<AccountHeader account={account} />);
    expect(screen.getByAltText("")).toHaveAttribute("src", account.avatarUrl);
    expect(screen.getByText("测试昵称")).toBeInTheDocument();
  });

  it("account为null时头像无src、昵称空文本", () => {
    window.__azBridge = makeMockBridge();
    render(<AccountHeader account={null} />);
    expect(screen.getByAltText("")).not.toHaveAttribute("src");
    expect(screen.getByLabelText("账户").textContent).toBe("");
  });

  it("点头像调用openAccountScreen", () => {
    window.__azBridge = makeMockBridge();
    render(<AccountHeader account={account} />);
    fireEvent.click(screen.getByLabelText("账户"));
    expect(window.__azBridge.openAccountScreen).toHaveBeenCalledTimes(1);
  });
});
