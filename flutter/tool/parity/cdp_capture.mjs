#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    endpoint: "http://127.0.0.1:9222",
    label: "legacy",
    waitMs: 900,
    freezeAnimations: true,
    timeoutMs: 10000,
    keepSeededState: false,
    includeStorageValues: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--endpoint") args.endpoint = argv[++i];
    else if (value === "--output-dir") args.outputDir = argv[++i];
    else if (value === "--label") args.label = argv[++i];
    else if (value === "--seed-state") args.seedState = argv[++i];
    else if (value === "--evaluate-file") args.evaluateFile = argv[++i];
    else if (value === "--wait-ms") args.waitMs = Number(argv[++i]);
    else if (value === "--allow-animations") args.freezeAnimations = false;
    else if (value === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else if (value === "--target-url-contains") args.targetUrlContains = argv[++i];
    else if (value === "--target-title-contains") args.targetTitleContains = argv[++i];
    else if (value === "--keep-seeded-state") args.keepSeededState = true;
    else if (value === "--include-storage-values") args.includeStorageValues = true;
    else throw new Error(`unknown argument: ${value}`);
  }
  if (!args.outputDir) throw new Error("--output-dir is required");
  return args;
}

class CdpClient {
  constructor(url, timeoutMs) {
    this.socket = new WebSocket(url);
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`CDP WebSocket open timed out after ${this.timeoutMs}ms`)),
        this.timeoutMs,
      );
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", (event) => {
        clearTimeout(timer);
        reject(event);
      }, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
    const rejectPending = (event) => {
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`CDP socket closed with request ${id} pending: ${event.type}`));
      }
      this.pending.clear();
    };
    this.socket.addEventListener("close", rejectPending);
    this.socket.addEventListener("error", rejectPending);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`Runtime.evaluate failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result?.value;
}

async function waitForReady(client, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const state = await evaluate(client, `({
        ready: document.readyState,
        fonts: !document.fonts || document.fonts.status,
        bridge: Boolean(window.__azBridge),
        reactRoots: [
          "react-debts-root", "react-pay-root", "react-report-root",
          "react-mine-root", "react-sheets-root",
        ].every((id) => document.getElementById(id)?.childElementCount > 0),
      })`);
      if (state?.ready === "complete" && state?.fonts === "loaded" && state?.bridge && state?.reactRoots) return;
    } catch {
      // A reload briefly destroys the execution context; retry on the same page.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`page did not reach readyState=complete in ${timeoutMs}ms`);
}

const freezeAnimationsExpression = String.raw`(() => {
  let style = document.getElementById("after-zero-parity-freeze");
  if (!style) {
    style = document.createElement("style");
    style.id = "after-zero-parity-freeze";
    style.textContent = [
      "*, *::before, *::after {",
      "  animation-play-state: paused !important;",
      "  transition: none !important;",
      "  scroll-behavior: auto !important;",
      "  caret-color: transparent !important;",
      "}",
    ].join("\n");
    document.documentElement.appendChild(style);
  }
  const animations = document.getAnimations ? document.getAnimations() : [];
  window.__afterZeroParityAnimationState = animations.map((animation) => ({
    animation,
    currentTime: animation.currentTime,
    playbackRate: animation.playbackRate,
    playState: animation.playState,
  }));
  let finishedAnimations = 0;
  let resetInfiniteAnimations = 0;
  for (const animation of animations) {
    try {
      const timing = animation.effect?.getComputedTiming?.();
      if (timing?.iterations === Infinity || !Number.isFinite(timing?.endTime)) {
        animation.currentTime = 0;
        animation.pause();
        resetInfiniteAnimations += 1;
      } else {
        animation.finish();
        finishedAnimations += 1;
      }
    } catch {
      animation.pause();
    }
  }
  return { styleInstalled: true, finishedAnimations, resetInfiniteAnimations };
})()`;

const restoreAnimationsExpression = String.raw`(() => {
  document.getElementById("after-zero-parity-freeze")?.remove();
  const states = window.__afterZeroParityAnimationState || [];
  for (const state of states) {
    try {
      state.animation.playbackRate = state.playbackRate;
      state.animation.currentTime = state.currentTime;
      if (state.playState === "running") state.animation.play();
      else if (state.playState === "paused") state.animation.pause();
      else if (state.playState === "finished") state.animation.finish();
      else state.animation.cancel();
    } catch {
      // A removed element may invalidate its animation; the freeze style is
      // still removed and a seeded run reloads immediately afterwards.
    }
  }
  delete window.__afterZeroParityAnimationState;
  return { restoredAnimations: states.length };
})()`;

const inventoryExpression = String.raw`(() => {
  const clean = (value, max = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const rectValue = (rect) => ({
    x: rect.x, y: rect.y, left: rect.left, top: rect.top,
    right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height,
  });
  const interactiveSelector = [
    "button", "a", "input", "select", "textarea", "[role]", "[tabindex]",
    "[contenteditable=true]", ".sheet", ".subpage", ".popover-panel", ".scrim",
  ].join(",");
  const isTopmostAtVisibleCenter = (element, rect) => {
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(innerWidth, rect.right);
    const bottom = Math.min(innerHeight, rect.bottom);
    if (right <= left || bottom <= top) return false;
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return Boolean(hit && (hit === element || element.contains(hit)));
  };
  const visibleText = () => {
    const values = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = clean(node.nodeValue);
      const element = node.parentElement;
      if (!value || !element || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(element.tagName)) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) <= 0) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const visible = [...range.getClientRects()].some((rect) =>
        rect.width > 0 && rect.height > 0 && isTopmostAtVisibleCenter(element, rect));
      if (visible) values.push(value);
    }
    return clean(values.join(" "), 100000);
  };
  const nodes = [...document.querySelectorAll(interactiveSelector)].map((element, index) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const intersectsViewport = rect.right > 0 && rect.bottom > 0 &&
      rect.left < innerWidth && rect.top < innerHeight;
    let cssVisible = style.display !== "none" && style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0;
    if (element.checkVisibility) {
      try {
        cssVisible = element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      } catch {
        // Older Android WebViews expose checkVisibility with fewer options.
      }
    }
    const visible = rect.width > 0 && rect.height > 0 && intersectsViewport && cssVisible &&
      isTopmostAtVisibleCenter(element, rect);
    return {
      index,
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: [...element.classList],
      role: element.getAttribute("role"),
      ariaLabel: element.getAttribute("aria-label"),
      ariaSelected: element.getAttribute("aria-selected"),
      ariaExpanded: element.getAttribute("aria-expanded"),
      ariaHidden: element.getAttribute("aria-hidden"),
      disabled: Boolean(element.disabled) || element.getAttribute("aria-disabled") === "true",
      name: element.getAttribute("name"),
      type: element.getAttribute("type"),
      value: "value" in element ? clean(element.value, 200) : null,
      text: clean(element.innerText || element.textContent),
      visible,
      rect: rectValue(rect),
      style: {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        zIndex: style.zIndex,
        color: style.color,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        border: style.border,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        padding: style.padding,
        margin: style.margin,
        transform: style.transform,
        overflow: style.overflow,
      },
    };
  });
  const roots = [...document.querySelectorAll(".view, .sheet, .subpage, #loginGate, .scrim")].map((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const intersectsViewport = rect.right > 0 && rect.bottom > 0 &&
      rect.left < innerWidth && rect.top < innerHeight;
    return {
      tag: element.tagName.toLowerCase(), id: element.id || null,
      classes: [...element.classList], visible: rect.width > 0 && rect.height > 0 &&
        intersectsViewport && style.display !== "none" && style.visibility !== "hidden" &&
        Number(style.opacity || 1) > 0 && isTopmostAtVisibleCenter(element, rect),
      rect: rectValue(rect), transform: style.transform, zIndex: style.zIndex,
    };
  });
  return {
    capturedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    viewport: {
      innerWidth, innerHeight, outerWidth, outerHeight,
      devicePixelRatio, scrollX, scrollY,
      visualViewport: window.visualViewport ? {
        width: visualViewport.width, height: visualViewport.height,
        offsetLeft: visualViewport.offsetLeft, offsetTop: visualViewport.offsetTop,
        scale: visualViewport.scale,
      } : null,
    },
    media: {
      dark: matchMedia("(prefers-color-scheme: dark)").matches,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    },
    visibleBodyText: visibleText(),
    activeElement: document.activeElement ? {
      tag: document.activeElement.tagName.toLowerCase(), id: document.activeElement.id || null,
    } : null,
    localStorage: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
    roots,
    nodes,
  };
})()`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.outputDir, { recursive: true });
  const pagesResponse = await fetch(`${args.endpoint.replace(/\/$/, "")}/json`, {
    signal: AbortSignal.timeout(args.timeoutMs),
  });
  if (!pagesResponse.ok) throw new Error(`CDP page list failed: ${pagesResponse.status}`);
  const pages = await pagesResponse.json();
  let candidates = pages.filter((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (args.targetUrlContains) {
    candidates = candidates.filter((item) => String(item.url).includes(args.targetUrlContains));
  }
  if (args.targetTitleContains) {
    candidates = candidates.filter((item) => String(item.title).includes(args.targetTitleContains));
  }
  if (candidates.length !== 1) {
    throw new Error(
      `expected exactly one CDP page, found ${candidates.length}; ` +
      `use --target-url-contains/--target-title-contains. candidates=${JSON.stringify(
        candidates.map(({ id, title, url }) => ({ id, title, url })),
      )}`,
    );
  }
  const [page] = candidates;

  const client = new CdpClient(page.webSocketDebuggerUrl, args.timeoutMs);
  await client.open();
  let originalLocalStorage = null;
  let preseedBackupPath = null;
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await waitForReady(client, args.timeoutMs);
    if (args.seedState) {
      const state = JSON.parse(await readFile(args.seedState, "utf8"));
      if (state.fixture?.storage_status !== "materialized") {
        throw new Error("seed state must be produced from a materialized storage fixture");
      }
      if (!state.fixture?.implemented_drivers?.includes("legacy_local_storage_seed")) {
        throw new Error("fixture does not declare the legacy localStorage seed driver");
      }
      const localStorageState = state.legacy?.localStorage ?? state.localStorage;
      if (!localStorageState || typeof localStorageState !== "object") {
        throw new Error("seed state must contain legacy.localStorage or localStorage");
      }
      const serialized = JSON.stringify(localStorageState);
      originalLocalStorage = await evaluate(
        client,
        "Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]))",
      );
      preseedBackupPath = path.join(args.outputDir, `${args.label}.preseed.localStorage.json`);
      await writeFile(
        preseedBackupPath,
        `${JSON.stringify(originalLocalStorage, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      );
      await evaluate(client, `(() => {
        const state = ${serialized};
        localStorage.clear();
        for (const [key, value] of Object.entries(state)) {
          localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
        }
        return true;
      })()`);
      await client.send("Page.reload", { ignoreCache: true });
      await waitForReady(client, args.timeoutMs);
    }
    if (args.evaluateFile) {
      const expression = await readFile(args.evaluateFile, "utf8");
      await evaluate(client, expression);
    }
    await new Promise((resolve) => setTimeout(resolve, args.waitMs));
    const animationFreeze = args.freezeAnimations
      ? await evaluate(client, freezeAnimationsExpression)
      : { styleInstalled: false, finishedAnimations: 0, resetInfiniteAnimations: 0 };
    if (args.freezeAnimations) await new Promise((resolve) => setTimeout(resolve, 50));
    const inventory = await evaluate(client, inventoryExpression);
    if (!args.includeStorageValues && !args.seedState) {
      inventory.localStorageKeys = Object.keys(inventory.localStorage);
      delete inventory.localStorage;
    }
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const metadata = {
      page: { id: page.id, title: page.title, url: page.url },
      endpoint: args.endpoint,
      label: args.label,
      animationFreeze,
      storageValuesIncluded: Boolean(args.includeStorageValues || args.seedState),
      seedRestorePolicy: args.seedState
        ? (args.keepSeededState ? "keep-explicitly-requested" : "restore-original-in-finally")
        : "not-seeded",
      inventory,
    };
    await writeFile(
      path.join(args.outputDir, `${args.label}.runtime.json`),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(args.outputDir, `${args.label}.png`),
      Buffer.from(screenshot.data, "base64"),
    );
    process.stdout.write(`${JSON.stringify({
      page: page.url,
      nodes: inventory.nodes.length,
      visibleNodes: inventory.nodes.filter((item) => item.visible).length,
      outputDir: args.outputDir,
      label: args.label,
    }, null, 2)}\n`);
  } finally {
    let animationRestoreError = null;
    try {
      if (args.freezeAnimations) {
        try {
          await evaluate(client, restoreAnimationsExpression);
        } catch (error) {
          animationRestoreError = error;
        }
      }
      if (originalLocalStorage && !args.keepSeededState) {
        const serialized = JSON.stringify(originalLocalStorage);
        await evaluate(client, `(() => {
          const state = ${serialized};
          localStorage.clear();
          for (const [key, value] of Object.entries(state)) localStorage.setItem(key, value);
          return true;
        })()`);
        await client.send("Page.reload", { ignoreCache: true });
        await waitForReady(client, args.timeoutMs);
        const restoredStorage = await evaluate(
          client,
          "Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]))",
        );
        if (JSON.stringify(restoredStorage) !== JSON.stringify(originalLocalStorage)) {
          throw new Error("localStorage restore read-back mismatch; private backup retained");
        }
        const restoredSha256 = createHash("sha256")
          .update(JSON.stringify(restoredStorage))
          .digest("hex");
        if (preseedBackupPath) await unlink(preseedBackupPath);
        await writeFile(
          path.join(args.outputDir, `${args.label}.restore.json`),
          `${JSON.stringify({
            restored: true,
            reloaded: true,
            readBackVerified: true,
            canonicalSha256: restoredSha256,
            keys: Object.keys(originalLocalStorage).sort(),
          }, null, 2)}\n`,
          "utf8",
        );
      }
      if (animationRestoreError) throw animationRestoreError;
    } finally {
      client.close();
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
