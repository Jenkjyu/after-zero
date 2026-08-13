import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { AccountHeader } from "../src/mine/AccountHeader";
import { closeAccountScreen, useAccountScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";
import type { Account } from "../src/types";

afterEach(() => {
  closeAccountScreen(); // accountScreenOpen是模块级状态，重置避免测试间互相污染
});

const account: Account = {
  userId: "test-openid",
  openid: "test-openid",
  provider: "wechat",
  providers: ["wechat"],
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

  it("account为null时头像无src、明确显示本地使用", () => {
    window.__azBridge = makeMockBridge();
    render(<AccountHeader account={null} />);
    expect(screen.getByAltText("")).not.toHaveAttribute("src");
    expect(screen.getByText("本地使用")).toBeInTheDocument();
  });

  it("点头像调用openAccountScreen(纯React状态，不经过__azBridge)", () => {
    window.__azBridge = makeMockBridge();
    render(<AccountHeader account={account} />);
    const hook = renderHook(() => useAccountScreenOpen());
    expect(hook.result.current).toBe(false);
    fireEvent.click(screen.getByLabelText("账户"));
    expect(hook.result.current).toBe(true);
  });
});
