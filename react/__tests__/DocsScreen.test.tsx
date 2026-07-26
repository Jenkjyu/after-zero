import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { DocsScreen } from "../src/sheets/DocsScreen";
import { closeDocsScreen, openDocsScreen, useDocsScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";
import type { FileItem } from "../src/types";

afterEach(() => {
  closeDocsScreen(); // docsScreenOpen是模块级状态，重置避免测试间互相污染
});

const docFile: FileItem = { id: "doc:0", upload: false, name: "note.md", mime: "", label: "我的笔记", content: "# 标题" };
const imgFile: FileItem = { id: "up:1", upload: true, name: "photo.jpg", mime: "image/jpeg", label: "photo.jpg", url: "blob:img" };
const pdfFile: FileItem = { id: "up:2", upload: true, name: "contract.pdf", mime: "application/pdf", label: "contract.pdf", url: "blob:pdf" };
const otherFile: FileItem = { id: "up:3", upload: true, name: "readme.docx", mime: "application/msword", label: "readme.docx", url: "blob:doc" };

describe("DocsScreen", () => {
  it("未打开时不带open class", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<DocsScreen />);
    expect(container.querySelector("#docsScreen")).not.toHaveClass("open");
  });

  it("渲染文件列表(文档+上传文件都有下载/删除按钮)", () => {
    window.__azBridge = makeMockBridge({ files: [docFile, imgFile] });
    render(<DocsScreen />);
    act(() => { openDocsScreen(); });
    expect(screen.getByText("我的笔记")).toBeInTheDocument();
    expect(screen.getAllByText("photo.jpg")).toHaveLength(2); // label和name都是"photo.jpg"
    expect(screen.getAllByText("下载")).toHaveLength(2);
    expect(screen.getAllByText("删除")).toHaveLength(2);
  });

  it("点＋上传文件触发隐藏input的click", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<DocsScreen />);
    act(() => { openDocsScreen(); });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    fireEvent.click(screen.getByText("＋ 上传文件"));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("选择文件后调用uploadArchiveFile(file)", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<DocsScreen />);
    act(() => { openDocsScreen(); });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["hi"], "a.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(window.__azBridge.uploadArchiveFile).toHaveBeenCalledWith(file);
  });

  it("点行切换选中态，再点一次取消选中", () => {
    window.__azBridge = makeMockBridge({ files: [docFile] });
    const { container } = render(<DocsScreen />);
    act(() => { openDocsScreen(); });
    const row = container.querySelector(".file-row")!;
    expect(row).toHaveAttribute("aria-current", "false");
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("预览").parentElement).toBeTruthy();
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-current", "false");
  });

  it("markdown文档预览走mdToHtml", () => {
    window.__azBridge = makeMockBridge({ files: [docFile] });
    const { container } = render(<DocsScreen />);
    act(() => { openDocsScreen(); });
    fireEvent.click(container.querySelector(".file-row")!);
    expect(container.querySelector("#docContent h2")).toBeTruthy(); // calc.js的mdToHtml：单个#是h2(不是h1)
  });

  it("图片预览渲染img，pdf预览渲染embed，其它类型显示分享按钮", () => {
    window.__azBridge = makeMockBridge({ files: [imgFile, pdfFile, otherFile] });
    const { container } = render(<DocsScreen />);
    act(() => { openDocsScreen(); });
    const rows = container.querySelectorAll(".file-row");
    fireEvent.click(rows[0]);
    expect(container.querySelector("#docContent img")).toHaveAttribute("src", "blob:img");
    fireEvent.click(rows[0]); // 取消选中
    fireEvent.click(rows[1]);
    expect(container.querySelector("#docContent embed")).toHaveAttribute("src", "blob:pdf");
    fireEvent.click(rows[1]);
    fireEvent.click(rows[2]);
    expect(screen.getByText("分享 / 保存")).toBeInTheDocument();
    fireEvent.click(screen.getByText("分享 / 保存"));
    expect(window.__azBridge.shareArchiveFile).toHaveBeenCalledWith("up:3");
  });

  it("下载：调用downloadArchiveFile(id)，进行中禁用按钮", async () => {
    let resolveFn!: () => void;
    const bridge = makeMockBridge({ files: [docFile] });
    bridge.downloadArchiveFile = vi.fn(() => new Promise<void>((resolve) => { resolveFn = resolve; }));
    window.__azBridge = bridge;
    render(<DocsScreen />);
    act(() => { openDocsScreen(); });
    fireEvent.click(screen.getByText("下载"));
    expect(window.__azBridge.downloadArchiveFile).toHaveBeenCalledWith("doc:0");
    expect(screen.getByText("下载")).toBeDisabled();
    await act(async () => { resolveFn(); });
    expect(screen.getByText("下载")).not.toBeDisabled();
  });

  it("点行不会因为点了下载/删除按钮而触发选中(stopPropagation)", () => {
    window.__azBridge = makeMockBridge({ files: [docFile] });
    const { container } = render(<DocsScreen />);
    act(() => { openDocsScreen(); });
    fireEvent.click(screen.getByText("下载"));
    expect(container.querySelector(".file-row")).toHaveAttribute("aria-current", "false");
  });

  it("删除：文档标题是删除文档，上传文件标题是删除文件，确认后调用deleteArchiveFile+toast", async () => {
    window.__azBridge = makeMockBridge({ files: [docFile, imgFile] });
    render(<DocsScreen />);
    act(() => { openDocsScreen(); });
    const delBtns = screen.getAllByText("删除");
    await act(async () => { fireEvent.click(delBtns[0]); });
    expect(window.__azBridge.confirmAsync).toHaveBeenCalledWith("删除文档", expect.stringContaining("我的笔记"));
    expect(window.__azBridge.deleteArchiveFile).toHaveBeenCalledWith("doc:0");
    expect(window.__azBridge.toast).toHaveBeenCalledWith("已删除");

    await act(async () => { fireEvent.click(delBtns[1]); });
    expect(window.__azBridge.confirmAsync).toHaveBeenCalledWith("删除文件", expect.stringContaining("photo.jpg"));
    expect(window.__azBridge.deleteArchiveFile).toHaveBeenCalledWith("up:1");
  });

  it("删除：取消确认时不调用deleteArchiveFile", async () => {
    const bridge = makeMockBridge({ files: [docFile] });
    bridge.confirmAsync = vi.fn(() => Promise.resolve(false));
    window.__azBridge = bridge;
    render(<DocsScreen />);
    act(() => { openDocsScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("删除")); });
    expect(window.__azBridge.deleteArchiveFile).not.toHaveBeenCalled();
  });

  it("选中的文件从列表消失(删除/整体替换)后自动清空选中+预览", () => {
    window.__azBridge = makeMockBridge({ files: [docFile] });
    const { container, rerender } = render(<DocsScreen />);
    act(() => { openDocsScreen(); });
    fireEvent.click(container.querySelector(".file-row")!);
    expect(container.querySelector("#docContent h2")).toBeTruthy();
    window.__azBridge = makeMockBridge({ files: [] });
    rerender(<DocsScreen />);
    act(() => { window.dispatchEvent(new CustomEvent("az:files-changed")); });
    expect(container.querySelector("#docContent h2")).toBeFalsy();
  });

  it("硬件返回键：打开时关闭并返回true，关闭时返回false", () => {
    window.__azBridge = makeMockBridge();
    render(<DocsScreen />);
    expect(window.__azDocsScreenBack!()).toBe(false);
    act(() => { openDocsScreen(); });
    expect(window.__azDocsScreenBack!()).toBe(true);
  });

  it("点返回箭头关闭", () => {
    window.__azBridge = makeMockBridge();
    const hook = renderHook(() => useDocsScreenOpen());
    render(<DocsScreen />);
    act(() => { openDocsScreen(); });
    fireEvent.click(screen.getByLabelText("返回"));
    expect(hook.result.current).toBe(false);
  });
});
