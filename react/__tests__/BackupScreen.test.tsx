import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { BackupScreen } from "../src/sheets/BackupScreen";
import { closeBackupScreen, openBackupScreen, useBackupScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";
import type { BackupRecord } from "../src/types";

afterEach(() => {
  closeBackupScreen(); // backupScreenOpen是模块级状态，重置避免测试间互相污染
});

const rec: BackupRecord = { id: "b1", createdAt: 1700000000000, debtsCount: 3, filesCount: 2, totalSizeBytes: 2 * 1024 * 1024 };

describe("BackupScreen", () => {
  it("未打开时不带open class，不请求列表", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<BackupScreen />);
    expect(container.querySelector("#backupScreen")).not.toHaveClass("open");
    expect(window.__azBridge.listBackups).not.toHaveBeenCalled();
  });

  it("打开时读取上次备份时间+拉取备份列表", async () => {
    window.__azBridge = makeMockBridge({ backups: [rec], lastBackupAt: 1650000000000 });
    const { container } = render(<BackupScreen />);
    await act(async () => { openBackupScreen(); });
    expect(window.__azBridge.listBackups).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".sync-status-value")).toHaveTextContent(new Date(1650000000000).toLocaleString());
    expect(screen.getByText(new Date(1700000000000).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText("3 笔债务 · 2 个文件 · 2.0 MB")).toBeInTheDocument();
  });

  it("从未备份过时显示「从未备份」", async () => {
    window.__azBridge = makeMockBridge({ backups: [] });
    render(<BackupScreen />);
    await act(async () => { openBackupScreen(); });
    expect(screen.getByText("从未备份")).toBeInTheDocument();
    expect(screen.getByText("还没有备份记录，点上面的按钮创建第一条")).toBeInTheDocument();
  });

  it("获取列表失败时显示错误文案", async () => {
    const bridge = makeMockBridge();
    bridge.listBackups = vi.fn(() => Promise.reject(new Error("网络错误")));
    window.__azBridge = bridge;
    render(<BackupScreen />);
    await act(async () => { openBackupScreen(); });
    expect(screen.getByText("获取备份列表失败：网络错误")).toBeInTheDocument();
  });

  it("创建备份成功：调用createBackup后刷新上次备份时间+列表", async () => {
    const bridge = makeMockBridge({ backups: [] });
    let resolveFn!: (v: boolean) => void;
    bridge.createBackup = vi.fn(() => new Promise<boolean>((resolve) => { resolveFn = resolve; }));
    window.__azBridge = bridge;
    render(<BackupScreen />);
    await act(async () => { openBackupScreen(); });
    fireEvent.click(screen.getByText("创建备份"));
    expect(screen.getByText("创建备份")).toBeDisabled();
    bridge.listBackups = vi.fn(() => Promise.resolve([rec]));
    bridge.getBackupMeta = vi.fn(() => ({ lastBackupAt: 1650000000000 }));
    await act(async () => { resolveFn(true); });
    expect(screen.getByText("创建备份")).not.toBeDisabled();
    expect(bridge.listBackups).toHaveBeenCalled();
    expect(screen.getByText(new Date(1650000000000).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText(new Date(1700000000000).toLocaleString())).toBeInTheDocument();
  });

  it("创建备份失败：不刷新列表(vanilla已经toast失败文案)", async () => {
    const bridge = makeMockBridge({ backups: [] });
    bridge.createBackup = vi.fn(() => Promise.resolve(false));
    window.__azBridge = bridge;
    render(<BackupScreen />);
    await act(async () => { openBackupScreen(); });
    const callsBefore = (bridge.listBackups as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => { fireEvent.click(screen.getByText("创建备份")); });
    expect((bridge.listBackups as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it("恢复：确认后调用restoreBackup(id)，取消不调用", async () => {
    window.__azBridge = makeMockBridge({ backups: [rec] });
    const first = render(<BackupScreen />);
    await act(async () => { openBackupScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("恢复")); });
    expect(window.__azBridge.confirmAsync).toHaveBeenCalledWith("恢复这条备份？", expect.stringContaining("覆盖本机当前的全部债务"));
    expect(window.__azBridge.restoreBackup).toHaveBeenCalledWith("b1");
    first.unmount();

    const bridge2 = makeMockBridge({ backups: [rec] });
    bridge2.confirmAsync = vi.fn(() => Promise.resolve(false));
    window.__azBridge = bridge2;
    render(<BackupScreen />);
    await act(async () => { openBackupScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("恢复")); });
    expect(bridge2.restoreBackup).not.toHaveBeenCalled();
  });

  it("删除：确认后调用deleteBackup(id)并刷新列表，取消不调用", async () => {
    const bridge = makeMockBridge({ backups: [rec] });
    window.__azBridge = bridge;
    const first = render(<BackupScreen />);
    await act(async () => { openBackupScreen(); });
    bridge.listBackups = vi.fn(() => Promise.resolve([]));
    await act(async () => { fireEvent.click(screen.getByText("删除")); });
    expect(window.__azBridge.confirmAsync).toHaveBeenCalledWith("删除这条备份记录？", expect.stringContaining("无法恢复"));
    expect(bridge.deleteBackup).toHaveBeenCalledWith("b1");
    expect(bridge.listBackups).toHaveBeenCalled();
    first.unmount();

    const bridge2 = makeMockBridge({ backups: [rec] });
    bridge2.confirmAsync = vi.fn(() => Promise.resolve(false));
    window.__azBridge = bridge2;
    render(<BackupScreen />);
    await act(async () => { openBackupScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("删除")); });
    expect(bridge2.deleteBackup).not.toHaveBeenCalled();
  });

  it("硬件返回键：打开时关闭并返回true，关闭时返回false", async () => {
    window.__azBridge = makeMockBridge();
    render(<BackupScreen />);
    expect(window.__azBackupScreenBack!()).toBe(false);
    await act(async () => { openBackupScreen(); });
    expect(window.__azBackupScreenBack!()).toBe(true);
  });

  it("点返回箭头关闭", async () => {
    window.__azBridge = makeMockBridge();
    const hook = renderHook(() => useBackupScreenOpen());
    render(<BackupScreen />);
    await act(async () => { openBackupScreen(); });
    fireEvent.click(screen.getByLabelText("返回"));
    expect(hook.result.current).toBe(false);
  });
});
