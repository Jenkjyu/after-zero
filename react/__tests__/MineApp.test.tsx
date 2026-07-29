// 集成测试：验证App.tsx跟useAccount()/usePremium()+桥接整条链路接得上，不只是各组件
// 各自正确(那些由AccountHeader/PremiumEntryCard/DataCards各自的单测覆盖)。
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { App } from "../src/mine/App";
import { closeAccountScreen, closeDocsScreen, useAccountScreenOpen, useDocsScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";
import type { Account } from "../src/types";

afterEach(() => {
  closeAccountScreen(); // accountScreenOpen/docsScreenOpen是模块级状态，重置避免测试间互相污染
  closeDocsScreen();
});

const account: Account = {
  openid: "test-openid",
  nickname: "测试昵称",
  avatarUrl: "https://example.com/a.png",
  loggedInAt: 0,
};

describe("mine App", () => {
  it("挂载后基于真实account/premium数据渲染头像昵称+会员卡+4张数据卡", () => {
    window.__azBridge = makeMockBridge({ account, premium: { premium: null } });
    render(<App />);
    expect(screen.getByText("测试昵称")).toBeInTheDocument();
    expect(screen.getByText("升级 Premium")).toBeInTheDocument();
    expect(screen.getByText("云备份")).toBeInTheDocument();
    expect(screen.getByText("档案库")).toBeInTheDocument();
    expect(screen.getByText("下载备份文件")).toBeInTheDocument();
    expect(screen.getByText("上传备份文件")).toBeInTheDocument();
  });

  it("点头像→openAccountScreen，点档案库→openDocsScreen，两个都是纯React状态", () => {
    window.__azBridge = makeMockBridge({ account, premium: { premium: null } });
    render(<App />);
    const accountHook = renderHook(() => useAccountScreenOpen());
    const docsHook = renderHook(() => useDocsScreenOpen());
    fireEvent.click(screen.getByLabelText("账户"));
    expect(accountHook.result.current).toBe(true);
    fireEvent.click(screen.getByText("档案库"));
    expect(docsHook.result.current).toBe(true);
  });
});
