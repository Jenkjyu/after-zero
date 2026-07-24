// 测useSyncExternalStore桥接本身：window.__azBridge变了之后，只有真的派发了az:state-changed
// 事件，React才会重新读取——这是CLAUDE.md"React 迁移"一节里"renderAll()是唯一的通知渠道"
// 这条设计的核心断言，值得单独测，不能只靠组件测试间接覆盖。
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { keyFor, useAccount, useDebts, usePremium } from "../src/debts/useDebts";
import { makeMockBridge, makeDebt } from "./mockBridge";

describe("useDebts / usePremium / useAccount", () => {
  it("初始渲染读取__azBridge当前值", () => {
    const debts = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts, premium: { premium: null }, account: null });
    const { result } = renderHook(() => useDebts());
    expect(result.current).toBe(debts);
  });

  it("不派发az:state-changed事件时，即使bridge底层数据变了也不会重新渲染", () => {
    const first = [makeDebt({ name: "第一批" })];
    window.__azBridge = makeMockBridge({ debts: first });
    const { result } = renderHook(() => useDebts());
    expect(result.current).toBe(first);
    // 直接换掉bridge的getDebts实现，模拟"vanilla数据变了但忘记/还没派发事件"的情况
    const second = [makeDebt({ name: "第二批" })];
    window.__azBridge.getDebts = () => second;
    expect(result.current).toBe(first); // 还没重新render，快照应该还是旧的
  });

  it("派发az:state-changed事件后，useDebts/usePremium/useAccount都会重新读取最新值", () => {
    window.__azBridge = makeMockBridge({ debts: [], premium: { premium: null }, account: null });
    const debtsHook = renderHook(() => useDebts());
    const premiumHook = renderHook(() => usePremium());
    const accountHook = renderHook(() => useAccount());

    const newDebts = [makeDebt({ name: "新债务" })];
    const newPremium = { premium: { method: "onetime" as const, at: "2026-01-01" } };
    const newAccount = { openid: "o1", nickname: "测试", avatarUrl: "https://x/y.png", loggedInAt: 1 };
    window.__azBridge.getDebts = () => newDebts;
    window.__azBridge.getPremium = () => newPremium;
    window.__azBridge.getAccount = () => newAccount;

    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(debtsHook.result.current).toBe(newDebts);
    expect(premiumHook.result.current).toBe(newPremium);
    expect(accountHook.result.current).toBe(newAccount);
  });
});

describe("keyFor", () => {
  it("同一个债务对象引用多次调用返回同一个key(支撑拖拽重排后React key保持稳定)", () => {
    const d = makeDebt();
    expect(keyFor(d)).toBe(keyFor(d));
  });

  it("不同债务对象返回不同key", () => {
    const a = makeDebt({ name: "a" });
    const b = makeDebt({ name: "b" });
    expect(keyFor(a)).not.toBe(keyFor(b));
  });
});
