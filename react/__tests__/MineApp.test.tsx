// 集成测试：验证App.tsx跟useAccount()/usePremium()+桥接整条链路接得上，不只是各组件
// 各自正确(那些由AccountHeader/PremiumEntryCard/DataCards各自的单测覆盖)。
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { App } from "../src/mine/App";
import { closeAboutScreen, closeAccountScreen, closeDocsScreen, closePremiumScreen, useAboutScreenOpen, useAccountScreenOpen, usePremiumScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";
import type { Account } from "../src/types";

afterEach(() => {
  closeAccountScreen(); // accountScreenOpen/docsScreenOpen/aboutScreenOpen是模块级状态，重置避免测试间互相污染
  closeDocsScreen();
  closePremiumScreen();
  closeAboutScreen();
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
    expect(screen.getByText("关于我们")).toBeInTheDocument();
  });

  it("点头像进入账户页；普通用户点档案库跳订阅页", () => {
    window.__azBridge = makeMockBridge({ account, premium: { premium: null } });
    render(<App />);
    const accountHook = renderHook(() => useAccountScreenOpen());
    const premiumHook = renderHook(() => usePremiumScreenOpen());
    fireEvent.click(screen.getByLabelText("账户"));
    expect(accountHook.result.current).toBe(true);
    fireEvent.click(screen.getByText("档案库"));
    expect(premiumHook.result.current).toBe(true);
  });

  it("点关于我们→openAboutScreen", () => {
    window.__azBridge = makeMockBridge({ account, premium: { premium: null } });
    render(<App />);
    const aboutHook = renderHook(() => useAboutScreenOpen());
    fireEvent.click(screen.getByText("关于我们"));
    expect(aboutHook.result.current).toBe(true);
  });
});
