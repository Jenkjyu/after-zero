// 集成测试：验证App.tsx跟useAccount()/usePremium()+桥接整条链路接得上，不只是各组件
// 各自正确(那些由AccountHeader/PremiumEntryCard/DataCards各自的单测覆盖)。
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "../src/mine/App";
import { makeMockBridge } from "./mockBridge";
import type { Account } from "../src/types";

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
    expect(screen.getByText("打开云备份")).toBeInTheDocument();
    expect(screen.getByText("打开档案库")).toBeInTheDocument();
    expect(screen.getByText("下载备份文件")).toBeInTheDocument();
    expect(screen.getByText("上传备份文件")).toBeInTheDocument();
  });

  it("点头像→openAccountScreen，点档案库→openDocsScreen，走的是真实useAccount/usePremium读到的桥接", () => {
    window.__azBridge = makeMockBridge({ account, premium: { premium: null } });
    render(<App />);
    fireEvent.click(screen.getByLabelText("账户"));
    expect(window.__azBridge.openAccountScreen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("打开档案库"));
    expect(window.__azBridge.openDocsScreen).toHaveBeenCalledTimes(1);
  });
});
