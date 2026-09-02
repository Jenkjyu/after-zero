// 测useSyncExternalStore桥接本身：window.__azBridge变了之后，只有真的派发了az:state-changed
// 事件，React才会重新读取——这是AGENTS.md"React 迁移"一节里"renderAll()是唯一的通知渠道"
// 这条设计的核心断言，值得单独测，不能只靠组件测试间接覆盖。
//
// useDebts()的断言用toEqual不用toBe：getDebtsSnapshot()返回的是浅拷贝(见shared/state.ts
// 注释——debts数组常被原地mutate、不整体重新赋值，直接返回底层引用会让useSyncExternalStore
// 认为"没变"而跳过重渲染，这是真实踩过的坑)，所以快照引用不等于window.__azBridge.getDebts()
// 返回的原始数组，但内容应该始终一致。
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { clearAiImportDraft, closeAiImportScreen, closeDetailSheet, closeEditSheet, closePremiumScreen, NEW_DEBT_ID, openAiImportScreen, openDetailSheet, openEditSheet, setAiImportDraft, useAccount, useAiImportDraft, useAiImportScreenOpen, useDebts, useDetailSheetId, useEditSheetId, usePremium, usePremiumScreenOpen } from "../src/shared/state";
import type { Premium } from "../src/types";
import { makeMockBridge, makeDebt } from "./mockBridge";

describe("useDebts / usePremium / useAccount", () => {
  it("初始渲染读取__azBridge当前值", () => {
    const debts = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts, premium: { premium: null }, account: null });
    const { result } = renderHook(() => useDebts());
    expect(result.current).toEqual(debts);
  });

  it("不派发az:state-changed事件时，即使bridge底层数据变了也不会重新渲染", () => {
    const first = [makeDebt({ name: "第一批" })];
    window.__azBridge = makeMockBridge({ debts: first });
    const { result } = renderHook(() => useDebts());
    expect(result.current).toEqual(first);
    // 直接换掉bridge的getDebts实现，模拟"vanilla数据变了但忘记/还没派发事件"的情况
    const second = [makeDebt({ name: "第二批" })];
    window.__azBridge.getDebts = () => second;
    expect(result.current).toEqual(first); // 还没重新render，快照应该还是旧的，不是second
    expect(result.current).not.toEqual(second);
  });

  it("派发az:state-changed事件后，useDebts/usePremium/useAccount都会重新读取最新值", () => {
    window.__azBridge = makeMockBridge({ debts: [], premium: { premium: null }, account: null });
    const debtsHook = renderHook(() => useDebts());
    const premiumHook = renderHook(() => usePremium());
    const accountHook = renderHook(() => useAccount());

    const newDebts = [makeDebt({ name: "新债务" })];
    const newPremium = { premium: { method: "onetime" as const, at: "2026-01-01" } };
    const newAccount = { userId: "o1", openid: "o1", provider: "wechat" as const, providers: ["wechat" as const], nickname: "测试", avatarUrl: "https://x/y.png", loggedInAt: 1 };
    window.__azBridge.getDebts = () => newDebts;
    window.__azBridge.getPremium = () => newPremium;
    window.__azBridge.getAccount = () => newAccount;

    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(debtsHook.result.current).toEqual(newDebts);
    expect(premiumHook.result.current).toEqual(newPremium);
    expect(premiumHook.result.current).not.toBe(newPremium);
    expect(accountHook.result.current).toBe(newAccount);
  });

  it("回归测试：debts数组引用不变、只是原地mutate某个元素，派发az:state-changed后依然能读到最新值", () => {
    // 这是真实踩过的bug：如果getDebtsSnapshot()直接返回底层引用，这种"引用没变、内容变了"
    // 的场景会被useSyncExternalStore误判成"没变"，整个订阅者(不只是useDebts()本身，包括
    // DetailSheet/DebtList/PayList等所有用到它的组件)完全不会重渲染，卡在旧画面上。
    const d = makeDebt({ name: "原地mutate测试" });
    const debts = [d];
    window.__azBridge = makeMockBridge({ debts });
    const { result } = renderHook(() => useDebts());
    expect(result.current[0].settled).toBe(false);

    d.settled = true; // 原地mutate，debts数组引用完全不变
    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(result.current[0].settled).toBe(true);
  });

  it("回归测试：premium对象引用不变、原地写入权益后仍会生成新快照并刷新", () => {
    const premium: Premium = { premium: null };
    window.__azBridge = makeMockBridge({ premium });
    const { result } = renderHook(() => usePremium());
    const before = result.current;
    expect(before).toEqual({ premium: null });
    expect(before).not.toBe(premium);

    premium.premium = { method: "onetime", at: "2026-08-11T00:00:00.000Z" };
    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(result.current).toEqual(premium);
    expect(result.current).not.toBe(before);
    expect(result.current).not.toBe(premium);
    expect(result.current.premium).not.toBe(premium.premium);
  });

  it("premium值未变化时复用同一快照引用", () => {
    const premium: Premium = {
      premium: { method: "onetime", at: "2026-08-11T00:00:00.000Z" },
    };
    window.__azBridge = makeMockBridge({ premium });
    const { result } = renderHook(() => usePremium());
    const before = result.current;

    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(result.current).toBe(before);
  });
});

describe("AI 识图 screen 与草稿共享状态", () => {
  it("screen 开关和草稿各自通过独立事件更新", () => {
    closeAiImportScreen(); clearAiImportDraft();
    const screenHook = renderHook(() => useAiImportScreenOpen());
    const draftHook = renderHook(() => useAiImportDraft());
    act(() => { openAiImportScreen(); });
    expect(screenHook.result.current).toBe(true);
    act(() => { setAiImportDraft({
      sessionId: "ais_state",
      draft: { productHint: "测试贷", funderHint: "", typeHint: "", notes: "", warnings: [], sourceStatuses: [], plan: [] },
    }); });
    expect(draftHook.result.current?.sessionId).toBe("ais_state");
    act(() => { closeAiImportScreen(); clearAiImportDraft(); });
    expect(screenHook.result.current).toBe(false);
    expect(draftHook.result.current).toBe(null);
  });
});

describe("useDetailSheetId / openDetailSheet / closeDetailSheet", () => {
  it("初始值为null(没有sheet开着)", () => {
    closeDetailSheet(); // 重置——detailSheetId是模块级状态，不同it()之间会残留上一次的值
    const { result } = renderHook(() => useDetailSheetId());
    expect(result.current).toBe(null);
  });

  it("openDetailSheet(id)后重新渲染读到id，closeDetailSheet()后读到null——都不依赖az:state-changed事件", () => {
    closeDetailSheet();
    const { result } = renderHook(() => useDetailSheetId());
    expect(result.current).toBe(null);
    act(() => { openDetailSheet("d3"); });
    expect(result.current).toBe("d3");
    act(() => { closeDetailSheet(); });
    expect(result.current).toBe(null);
  });

  it("跟useDebts/usePremium/useAccount是各自独立的事件，互相不触发对方重渲染", () => {
    window.__azBridge = makeMockBridge({ debts: [makeDebt()] });
    closeDetailSheet();
    const debtsHook = renderHook(() => useDebts());
    const sheetHook = renderHook(() => useDetailSheetId());
    const before = debtsHook.result.current;
    act(() => { openDetailSheet("d1"); });
    expect(sheetHook.result.current).toBe("d1");
    expect(debtsHook.result.current).toBe(before); // 没有派发az:state-changed，debts快照不变
  });
});

describe("vanilla tabbar Premium intent", () => {
  it("az:premium-required打开React拥有的订阅页", () => {
    closePremiumScreen();
    const { result } = renderHook(() => usePremiumScreenOpen());
    expect(result.current).toBe(false);
    act(() => { window.dispatchEvent(new CustomEvent("az:premium-required")); });
    expect(result.current).toBe(true);
  });
});

describe("useEditSheetId / openEditSheet / closeEditSheet", () => {
  it("初始值为null(没有sheet开着)", () => {
    closeEditSheet();
    const { result } = renderHook(() => useEditSheetId());
    expect(result.current).toBe(null);
  });

  it("openEditSheet(NEW_DEBT_ID)是新增模式，openEditSheet(id)是编辑模式，closeEditSheet()回到null", () => {
    closeEditSheet();
    const { result } = renderHook(() => useEditSheetId());
    act(() => { openEditSheet(NEW_DEBT_ID); });
    expect(result.current).toBe(NEW_DEBT_ID);
    act(() => { openEditSheet("d2"); });
    expect(result.current).toBe("d2");
    act(() => { closeEditSheet(); });
    expect(result.current).toBe(null);
  });

  it("跟useDetailSheetId是各自独立的事件，互相不触发对方重渲染", () => {
    closeDetailSheet();
    closeEditSheet();
    const detailHook = renderHook(() => useDetailSheetId());
    const editHook = renderHook(() => useEditSheetId());
    act(() => { openEditSheet("d0"); });
    expect(editHook.result.current).toBe("d0");
    expect(detailHook.result.current).toBe(null);
  });
});
