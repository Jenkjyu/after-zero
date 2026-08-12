import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { AgreementScreen } from "../src/sheets/AgreementScreen";
import { closeAgreementScreen, openAgreementScreen, useAgreementScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";

afterEach(() => {
  closeAgreementScreen(); // agreementScreenOpen是模块级状态，重置避免测试间互相污染
});

describe("AgreementScreen", () => {
  it("未打开时不带open class，打开后渲染标题+正文关键内容", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<AgreementScreen />);
    expect(container.querySelector("#agreementScreen")).not.toHaveClass("open");
    act(() => { openAgreementScreen(); });
    expect(container.querySelector("#agreementScreen")).toHaveClass("open");
    expect(screen.getByText("用户服务协议")).toBeInTheDocument();
    expect(screen.getByText(/PolyForm Noncommercial/)).toBeInTheDocument();
    expect(screen.getByText(/无需登录即可使用本地债务/)).toBeInTheDocument();
    expect(screen.getByText(/登录、退出或注销云账号都不会自动上传/)).toBeInTheDocument();
  });

  it("点返回箭头关闭", () => {
    window.__azBridge = makeMockBridge();
    const hook = renderHook(() => useAgreementScreenOpen());
    render(<AgreementScreen />);
    act(() => { openAgreementScreen(); });
    fireEvent.click(screen.getByLabelText("返回"));
    expect(hook.result.current).toBe(false);
  });

  it("硬件返回键：打开时关闭并返回true，关闭时返回false", () => {
    window.__azBridge = makeMockBridge();
    render(<AgreementScreen />);
    expect(window.__azAgreementScreenBack!()).toBe(false);
    act(() => { openAgreementScreen(); });
    expect(window.__azAgreementScreenBack!()).toBe(true);
  });
});
