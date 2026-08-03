import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { AiScreen } from "../src/sheets/AiScreen";
import { closeAiScreen, openAiScreen, useAiScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";

const AI_USAGE_KEY = "after-zero-ai-usage-v1";
const AI_CHATLOG_KEY = "after-zero-ai-chatlog-v1";

// 默认让"假流式"打字动画(startReveal)以prefers-reduced-motion的方式直接跳过——回复到达
// 后立刻整段显示，绝大多数测试断言"回复内容"时不用等一段打字动画播完。jsdom本来就没有
// window.matchMedia这个东西，这里补一份，同时也顺带覆盖了castWand()同样查的这条媒体
// 查询(两者都用同一种"reduce=跳过动画"判断，互不冲突)。需要真正验证打字动画本身的
// 测试会在各自用例里临时换成matches:false并配合fake timers。
function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  localStorage.removeItem(AI_USAGE_KEY);
  localStorage.removeItem(AI_CHATLOG_KEY);
  stubMatchMedia(true);
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

  // 真机bug回归(2026-07-29)：发出消息后、AI回复到达之前，两个气泡短暂"挤在中间"，
  // "思考中"三个字被压成竖排，等长回复到了才各自回到两侧。根因在CSS(.ai-thread在
  // flex-column父容器里带margin:0 auto，交叉轴auto margin取消了stretch，宽度退化成
  // fit-content)，已经在www/index.html里补了width:100%。
  // ⚠️jsdom不做布局，这条测试锁不住那个CSS属性本身，它锁的是**另一半契约**：靠左/靠右
  // 完全由.ai-msg上的user/bot两个类决定，而这两个类从消息发出的第一帧起就必须是对的
  // (不是等回复回来才补上)。真正的视觉验证只能靠Playwright/真机截图。
  it("消息发出的那一刻，用户气泡和思考中气泡就已经带上正确的左右类名", async () => {
    const bridge = makeMockBridge();
    let resolveReply: (v: string) => void = () => {};
    bridge.callAiAdvisor = vi.fn(() => new Promise<string>((res) => { resolveReply = res; }));
    window.__azBridge = bridge;
    const { container } = render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });

    // 还在等回复的这一刻
    const pendingMsgs = container.querySelectorAll(".ai-msg");
    expect(pendingMsgs.length).toBe(2);
    expect(pendingMsgs[0]).toHaveClass("user");   // 用户那条靠右
    expect(pendingMsgs[1]).toHaveClass("bot");    // 思考中那条靠左
    expect(pendingMsgs[1]).toHaveClass("pending");
    expect(pendingMsgs[1].textContent).toContain("思考中");

    // 回复到达后，占位气泡原地换成真实回复，类名不变(依然靠左)
    await act(async () => { resolveReply("先还利率最高的那笔"); });
    const doneMsgs = container.querySelectorAll(".ai-msg");
    expect(doneMsgs.length).toBe(2);
    expect(doneMsgs[0]).toHaveClass("user");
    expect(doneMsgs[1]).toHaveClass("bot");
    expect(doneMsgs[1]).not.toHaveClass("pending");
    expect(doneMsgs[1].textContent).toContain("先还利率最高的那笔");
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

  it("回复失败后点「重试」：用相同参数重新调用，不重复追加用户气泡，成功后错误气泡原地替换", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn()
      .mockRejectedValueOnce(new Error("网络错误"))
      .mockResolvedValueOnce("重试后的回复");
    window.__azBridge = bridge;
    const { container } = render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });
    expect(screen.getByText("网络错误")).toBeInTheDocument();
    expect(container.querySelectorAll(".ai-msg")).toHaveLength(2); // 用户+错误气泡，没有多出来

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "重试" })); });
    expect(bridge.callAiAdvisor).toHaveBeenLastCalledWith("chat", "我该先还哪一笔？", []);
    expect(container.querySelectorAll(".ai-msg")).toHaveLength(2); // 原地替换，不是追加新的一轮
    expect(screen.getByText("重试后的回复")).toBeInTheDocument();
    expect(screen.queryByText("网络错误")).not.toBeInTheDocument();
  });

  it("今日用量已用完时点「重试」：toast提示且不再调用callAiAdvisor", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn(() => Promise.reject(new Error("网络错误")));
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });
    localStorage.setItem(AI_USAGE_KEY, JSON.stringify({ date: window.fmtDate(window.today0()), count: 20 }));
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(window.__azBridge.toast).toHaveBeenCalledWith("今日 AI 分析次数已用完，明天再来");
    expect(bridge.callAiAdvisor).toHaveBeenCalledTimes(1); // 只有最初那次失败的调用，重试没有真正发出
  });

  it("回复末尾带###SUGGESTIONS###：正文里不显示marker，解析成可点的追问建议芯片", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn()
      .mockResolvedValueOnce("先还利率最高的那笔。\n###SUGGESTIONS###\n- 如果每月多还500呢？\n- 还有更快的方法吗？")
      .mockResolvedValueOnce("多还500能提前3个月还清");
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });

    expect(screen.getByText("先还利率最高的那笔。")).toBeInTheDocument();
    expect(screen.queryByText(/SUGGESTIONS/)).not.toBeInTheDocument();
    const chip = screen.getByText("如果每月多还500呢？");
    expect(screen.getByText("还有更快的方法吗？")).toBeInTheDocument();

    await act(async () => { fireEvent.click(chip); });
    expect(bridge.callAiAdvisor).toHaveBeenLastCalledWith("chat", "如果每月多还500呢？", [
      { role: "user", content: "我该先还哪一笔？" },
      { role: "assistant", content: "先还利率最高的那笔。" },
    ]);
    expect(screen.getByText("多还500能提前3个月还清")).toBeInTheDocument();
  });

  it("持久化进历史记录的正文已经剥离了###SUGGESTIONS###这段", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn(() => Promise.resolve("答案\n###SUGGESTIONS###\n- 追问A"));
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });
    const saved = JSON.parse(localStorage.getItem(AI_CHATLOG_KEY) || "[]");
    expect(saved[0].messages[1].content).toBe("答案");
  });

  it("追问建议芯片只挂在最后一条回复下面：发出新问题后旧的建议消失", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn()
      .mockResolvedValueOnce("第一次回复\n###SUGGESTIONS###\n- 追问A")
      .mockResolvedValueOnce("第二次回复");
    window.__azBridge = bridge;
    render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });
    expect(screen.getByText("追问A")).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText("发消息给 AI 债务顾问…");
    fireEvent.change(textarea, { target: { value: "那第二笔呢" } });
    await act(async () => { fireEvent.click(screen.getByLabelText("发送")); });
    expect(screen.queryByText("追问A")).not.toBeInTheDocument();
  });

  it("回复里markdown风格的列表(- 开头)渲染成真正的<ul><li>，不是原样文字堆着", async () => {
    const bridge = makeMockBridge();
    bridge.callAiAdvisor = vi.fn(() => Promise.resolve("建议如下：\n- 先还网贷\n- 再还信用卡"));
    window.__azBridge = bridge;
    const { container } = render(<AiScreen />);
    act(() => { openAiScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });
    const list = container.querySelector(".ai-msg-list");
    expect(list?.tagName).toBe("UL");
    const items = list ? within(list as HTMLElement).getAllByRole("listitem") : [];
    expect(items.map((li) => li.textContent)).toEqual(["先还网贷", "再还信用卡"]);
  });

  it("思考中气泡会显示已过去的秒数", async () => {
    vi.useFakeTimers();
    try {
      const bridge = makeMockBridge();
      let resolveReply: (v: string) => void = () => {};
      bridge.callAiAdvisor = vi.fn(() => new Promise<string>((res) => { resolveReply = res; }));
      window.__azBridge = bridge;
      const { container } = render(<AiScreen />);
      act(() => { openAiScreen(); });
      await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });

      act(() => { vi.advanceTimersByTime(3000); });
      const pending = container.querySelector(".ai-msg.pending");
      expect(pending?.textContent).toContain("思考中 3s");

      await act(async () => { resolveReply("答案"); });
    } finally {
      vi.useRealTimers();
    }
  });

  it("回复到达后不是一次性整段出现，而是逐渐揭示，动画结束后显示完整内容", async () => {
    stubMatchMedia(false); // 这条测试要真的验证动画本身，关掉"跳过动画"这个默认桩
    vi.useFakeTimers();
    try {
      const bridge = makeMockBridge();
      bridge.callAiAdvisor = vi.fn(() => Promise.resolve("先还利率最高的那笔"));
      window.__azBridge = bridge;
      const { container } = render(<AiScreen />);
      act(() => { openAiScreen(); });
      await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });

      // 回复刚到达、动画刚起步的这一刻：气泡存在，但还没显示完整文字
      const botMsg = container.querySelectorAll(".ai-msg.bot")[0];
      expect(botMsg.textContent).not.toBe("先还利率最高的那笔");

      act(() => { vi.advanceTimersByTime(500); }); // 足够让这么短的文字揭示完
      expect(botMsg.textContent).toBe("先还利率最高的那笔");
    } finally {
      vi.useRealTimers();
    }
  });

  it("打字动画进行中切换到新对话：不会有残留的interval把新对话的回复截断", async () => {
    stubMatchMedia(false);
    vi.useFakeTimers();
    try {
      const bridge = makeMockBridge();
      bridge.callAiAdvisor = vi.fn()
        .mockResolvedValueOnce("第一段很长很长很长很长很长的回复内容用来确保动画还没播完")
        .mockResolvedValueOnce("短");
      window.__azBridge = bridge;
      const { container } = render(<AiScreen />);
      act(() => { openAiScreen(); });
      await act(async () => { fireEvent.click(screen.getByText("我该先还哪一笔？")); });
      act(() => { vi.advanceTimersByTime(16); }); // 动画刚开始跑几步，远没播完

      // 这时候切到新对话——旧对话那个还在跑的interval理应自行失效，不能污染接下来的新对话
      act(() => { fireEvent.click(screen.getByRole("button", { name: "历史对话" })); });
      act(() => { fireEvent.click(screen.getByText("新对话")); });
      await act(async () => { fireEvent.click(screen.getByText("生成分析报告")); });

      act(() => { vi.advanceTimersByTime(500); }); // 让新对话这次的动画播完
      const botMsg = container.querySelectorAll(".ai-msg.bot")[0];
      expect(botMsg.textContent).toBe("短");
    } finally {
      vi.useRealTimers();
    }
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
