import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { AiScreen } from "../src/sheets/AiScreen";
import { closeAiScreen, openAiScreen, useAiScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";

const AI_USAGE_KEY = "after-zero-ai-usage-v1";
const AI_CHATLOG_KEY = "after-zero-ai-chatlog-v1";

beforeEach(() => {
  localStorage.removeItem(AI_USAGE_KEY);
  localStorage.removeItem(AI_CHATLOG_KEY);
});
afterEach(() => {
  closeAiScreen(); // aiScreenOpen是模块级状态，重置避免测试间互相污染
});

describe("AiScreen", () => {
  it("未打开时不带open class", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<AiScreen />);
    expect(container.querySelector("#aiScreen")).not.toHaveClass("open");
  });

  it("打开时显示欢迎态+3个快捷芯片", () => {
    window.__azBridge = makeMockBridge();
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    expect(screen.getByText("有什么想聊的？")).toBeInTheDocument();
    expect(screen.getByText("生成分析报告")).toBeInTheDocument();
    expect(screen.getByText("我该先还哪一笔？")).toBeInTheDocument();
    expect(screen.getByText("怎样最快还清所有债务？")).toBeInTheDocument();
  });

  it("点「生成分析报告」芯片：以report模式发送，气泡显示这句话+最终回复", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn(() => Promise.resolve("这是分析报告"));
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("生成分析报告")); });
    expect(bridge.callAiAdvisor).toHaveBeenCalledWith("report", "", []);
    expect(screen.getByText("这是分析报告")).toBeInTheDocument();
  });

  it("点常见问题芯片：以chat模式发送对应问题", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn(() => Promise.resolve("先还利率最高的那笔"));
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });
    expect(bridge.callAiAdvisor).toHaveBeenCalledWith("chat", "我该先还哪一笔？", []);
    expect(screen.getByText("先还利率最高的那笔")).toBeInTheDocument();
  });

  it("手输：空输入toast提示，不发送", () => {
    window.__azBridge = makeMockBridge();
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    fireEvent.click(screen.getByLabelText("发送"));
    expect(window.__azBridge.toast).toHaveBeenCalledWith("请输入你想问的问题");
    expect(window.__azBridge.callAiAdvisor).not.toHaveBeenCalled();
  });

  it("手输：有内容清空输入框并发送", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn(() => Promise.resolve("回复"));
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    const textarea = screen.getByPlaceholderText("发消息给 AI 债务顾问…") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "我该怎么办" } });
    await act(async () => { fireEvent.click(screen.getByLabelText("发送")); });
    expect(bridge.callAiAdvisor).toHaveBeenCalledWith("chat", "我该怎么办", []);
    expect(textarea.value).toBe("");
  });

  it("Enter键(不按shift)发送，Shift+Enter不发送", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn(() => Promise.resolve("回复"));
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    const textarea = screen.getByPlaceholderText("发消息给 AI 债务顾问…");
    fireEvent.change(textarea, { target: { value: "问题A" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(bridge.callAiAdvisor).not.toHaveBeenCalled();
    await act(async () => { fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false }); });
    expect(bridge.callAiAdvisor).toHaveBeenCalledWith("chat", "问题A", []);
  });

  it("今日用量已用完：toast提示且不调用callAiAdvisor", () => {
    localStorage.setItem(AI_USAGE_KEY, JSON.stringify({ date: window.fmtDate(window.today0()), count: 20 }));
    window.__azBridge = makeMockBridge();
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    fireEvent.click(screen.getByText("生成分析报告"));
    expect(window.__azBridge.toast).toHaveBeenCalledWith("今日 AI 分析次数已用完，明天再来");
    expect(window.__azBridge.callAiAdvisor).not.toHaveBeenCalled();
  });

  it("发送失败：显示错误气泡，新对话(从没成功回复过)不出现在历史列表", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn(() => Promise.reject(new Error("网络错误")));
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });
    expect(screen.getByText("网络错误")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "历史对话" }));
    expect(screen.getByText("还没有历史对话——问过一次之后会出现在这里")).toBeInTheDocument();
  });

  it("连续追问：第二次发送带上第一轮的history", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn()
      .mockResolvedValueOnce("第一次回复")
      .mockResolvedValueOnce("第二次回复");
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });
    const textarea = screen.getByPlaceholderText("发消息给 AI 债务顾问…");
    fireEvent.change(textarea, { target: { value: "那第二笔呢" } });
    await act(async () => { fireEvent.click(screen.getByLabelText("发送")); });
    expect(bridge.callAiAdvisor).toHaveBeenLastCalledWith("chat", "那第二笔呢", [
      { role: "user", content: "我该先还哪一笔？" },
      { role: "assistant", content: "第一次回复" },
    ]);
  });

  it("成功回复后持久化进AI_CHATLOG_KEY，历史列表能看到", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn(() => Promise.resolve("回复内容"));
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });
    fireEvent.click(screen.getByRole("button", { name: "历史对话" }));
    const historyList = within(document.getElementById("aiHistoryList")!);
    expect(historyList.getByText("我该先还哪一笔？")).toBeInTheDocument();
    expect(historyList.getByText(/2 条消息/)).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(AI_CHATLOG_KEY) || "[]");
    expect(saved).toHaveLength(1);
    expect(saved[0].messages).toEqual([
      { role: "user", content: "我该先还哪一笔？" },
      { role: "assistant", content: "回复内容" },
    ]);
  });

  it("点历史行加载对话并关闭历史sheet", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn(() => Promise.resolve("回复内容"));
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });
    // "新对话"回到欢迎态
    fireEvent.click(screen.getByRole("button", { name: "历史对话" }));
    fireEvent.click(screen.getByText("新对话"));
    expect(screen.getByText("有什么想聊的？")).toBeInTheDocument();
    // 从历史列表加载回之前那条对话
    fireEvent.click(screen.getByRole("button", { name: "历史对话" }));
    fireEvent.click(within(document.getElementById("aiHistoryList")!).getByText("我该先还哪一笔？"));
    expect(screen.getByText("回复内容")).toBeInTheDocument();
    expect(document.getElementById("aiHistorySheet")).not.toHaveClass("open");
  });

  it("删除历史对话：确认后删除，若是当前对话重置为欢迎态", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn(() => Promise.resolve("回复内容"));
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });
    fireEvent.click(screen.getByRole("button", { name: "历史对话" }));
    await act(async () => { fireEvent.click(screen.getByText("删除")); });
    expect(window.__azBridge.confirmAsync).toHaveBeenCalledWith("删除这条对话", "删除后无法恢复，确定继续吗？");
    expect(screen.getByText("还没有历史对话——问过一次之后会出现在这里")).toBeInTheDocument();
    expect(screen.getByText("有什么想聊的？")).toBeInTheDocument(); // 当前对话被删，回到欢迎态
    expect(JSON.parse(localStorage.getItem(AI_CHATLOG_KEY) || "[]")).toHaveLength(0);
  });

  it("删除历史对话：取消不删除", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn(() => Promise.resolve("回复内容"));
    bridge.confirmAsync = vi.fn(() => Promise.resolve(false));
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });
    fireEvent.click(screen.getByRole("button", { name: "历史对话" }));
    await act(async () => { fireEvent.click(screen.getByText("删除")); });
    expect(within(document.getElementById("aiHistoryList")!).getByText("我该先还哪一笔？")).toBeInTheDocument();
  });

  it("硬件返回键：历史sheet打开时先关历史sheet，再按才关aiScreen", async () => {
    window.__azBridge = makeMockBridge();
    render(<AiScreen />);
    expect(window.__azAiScreenBack!()).toBe(false);
    act(() => { openAiScreen(); });
    fireEvent.click(screen.getByRole("button", { name: "历史对话" }));
    expect(window.__azAiHistorySheetBack!()).toBe(true);
    expect(window.__azAiScreenBack!()).toBe(true);
  });

  it("点返回箭头关闭", () => {
    window.__azBridge = makeMockBridge();
    const hook = renderHook(() => useAiScreenOpen());
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    fireEvent.click(screen.getByLabelText("返回"));
    expect(hook.result.current).toBe(false);
  });

  it("重新打开screen会重置成欢迎态(即使上次退出时还在某个对话里)", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn(() => Promise.resolve("回复内容"));
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });
    act(() => { closeAiScreen(); });
    act(() => { openAiScreen(); });
    expect(screen.getByText("有什么想聊的？")).toBeInTheDocument();
  });
});
