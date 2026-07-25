// 测试用的window.__azBridge假实现——用vitest的vi.fn()包一层，方便断言"React调用了正确的
// vanilla桥接函数"，不需要真的挂载一整个vanilla index.html环境。
import { vi } from "vitest";
import type { Account, AzBridge, Debt, NotifySettings, Premium } from "../src/types";

export function makeMockBridge(overrides?: {
  debts?: Debt[];
  premium?: Premium;
  account?: Account | null;
  notify?: NotifySettings;
}): AzBridge {
  const debts = overrides?.debts ?? [];
  const premium = overrides?.premium ?? { premium: null };
  const account = overrides?.account ?? null;
  const notify = overrides?.notify ?? { enabled: false, rules: [] };
  return {
    getDebts: vi.fn(() => debts),
    getPremium: vi.fn(() => premium),
    getAccount: vi.fn(() => account),
    payInstallment: vi.fn(),
    unsettle: vi.fn(),
    commitReorder: vi.fn(),
    saveAll: vi.fn(),
    renderAll: vi.fn(),
    openPremiumScreen: vi.fn(),
    openAiScreen: vi.fn(),
    openAccountScreen: vi.fn(),
    settleFull: vi.fn(),
    openSimScreen: vi.fn(),
    getNotify: vi.fn(() => notify),
    openNotifySheet: vi.fn(),
    exportReportXlsx: vi.fn(),
    exportReportPdf: vi.fn(),
    openDocsScreen: vi.fn(),
    openBackupScreen: vi.fn(),
    downloadBackupFile: vi.fn(),
    triggerImportFilePicker: vi.fn(),
    setDebt: vi.fn(),
    deleteDebt: vi.fn(),
    toast: vi.fn(),
    // 默认"什么都不用弹就直接确认"(有month时返回月份占位值，没有时返回true)，方便大多数
    // 测试用例不用逐个mock；需要测试"用户取消"分支的用例自己用mockResolvedValueOnce覆盖。
    confirmAsync: vi.fn((_title: string, _body: string, opts?: { month?: string }) =>
      Promise.resolve(opts && opts.month !== undefined ? opts.month || "2026-08" : true)
    ),
  };
}

// 造一笔测试用债务对象——只填字段够用，跟真实recompute()产出的形状一致。
export function makeDebt(overrides?: Partial<Debt>): Debt {
  return {
    name: "测试债务",
    plan: [{ date: "2026-08-01", amount: 500, principal: 480, interest: 20, paid: false }],
    settled: false,
    original: 480,
    balance: 480,
    paidPrincipal: 0,
    paidInterest: 0,
    totalTerms: 1,
    paidTerms: 0,
    terms: 1,
    monthly: 500,
    nextDate: "2026-08-01",
    rate: 12,
    ...overrides,
  };
}
