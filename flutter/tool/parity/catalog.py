#!/usr/bin/env python3
"""Build the Stage 8 parity manifest and deterministic scenario catalog.

The compact Python definitions below are the authored source.  ``manifest.json``
and ``scenarios.json`` are deterministic generated artifacts checked in for easy
inspection and consumption by non-Python runners.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import re
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[2]
BASELINE_COMMIT = "6fa1712dcdb2ba6e617810dffa8bbe38193140aa"


def _anchored_source(path: str, anchor: str, **metadata: str) -> dict[str, Any]:
    lines = (REPO_ROOT / path).read_text(encoding="utf-8", errors="replace").splitlines()
    line_index = next(
        (index for index, line in enumerate(lines) if anchor in line),
        None,
    )
    if line_index is None:
        raise ValueError(f"anchor not found in {path}: {anchor!r}")
    context = "\n".join(lines[max(0, line_index - 2) : line_index + 3])
    return {
        "path": path,
        "anchor": anchor,
        "line": line_index + 1,
        "context_sha256": hashlib.sha256(context.encode("utf-8")).hexdigest(),
        **metadata,
    }


def source(path: str, anchor: str) -> dict[str, Any]:
    """Return an exact anchored line; fuzzy or file-fallback lookup is forbidden."""

    target = REPO_ROOT / path
    text = target.read_text(encoding="utf-8", errors="replace")
    if anchor in text:
        return _anchored_source(path, anchor)
    raise ValueError(f"exact anchor not found in {path}: {anchor!r}")


ENTRIES: list[dict[str, Any]] = []


def add_entry(
    entry_id: str,
    domain: str,
    kind: str,
    title: str,
    *,
    priority: str,
    status: str,
    scenarios: list[str],
    selectors: list[str],
    legacy: list[dict[str, str]],
    flutter: list[dict[str, str]],
    notes: str,
    acceptance: str = "同一 fixture、时钟、动作序列下，旧版与 Flutter 的规范化证据完全一致。",
    legacy_behavior: str | None = None,
    flutter_behavior: str | None = None,
    resolution: str | None = None,
    coverage_role: str = "semantic_contract",
) -> None:
    evidence = evidence_for(scenarios)
    if kind == "ui_interaction_contract" and "interaction" not in evidence:
        evidence = sorted([*evidence, "interaction"])
    item: dict[str, Any] = {
        "id": entry_id,
        "domain": domain,
        "kind": kind,
        "title": title,
        "priority": priority,
        "status": status,
        "legacy_sources": legacy,
        "flutter_sources": flutter,
        "inventory_selectors": selectors,
        "scenario_ids": scenarios,
        "evidence": evidence,
        "acceptance": [acceptance],
        "notes": [notes],
        "coverage_role": coverage_role,
    }
    if status in {
        "difference",
        "missing_in_flutter",
        "flutter_extra",
        "user_approved_difference",
        "blocked_external",
    }:
        item.update(
            {
                "legacy_behavior": legacy_behavior or "见旧版源码锚点与运行 oracle。",
                "flutter_behavior": flutter_behavior or "见 Flutter 源码锚点与待采集证据。",
                "resolution": resolution or "后续对齐阶段按旧版行为修复并补齐差分证据。",
            }
        )
    ENTRIES.append(item)


SCENARIO_EVIDENCE: dict[str, list[str]] = {
    "SC-SOURCE-01": ["source", "unit_test"],
    "SC-CALC-01": ["state_before_after", "unit_test"],
    "SC-CALC-02": ["state_before_after", "unit_test"],
    "SC-DEBT-01": ["state_before_after", "storage", "screenshot"],
    "SC-DEBT-02": ["state_before_after", "storage", "screenshot", "interaction"],
    "SC-EDIT-01": ["state_before_after", "storage", "screenshot", "interaction"],
    "SC-EDIT-02": ["state_before_after", "storage", "screenshot", "interaction"],
    "SC-DATA-01": ["state_before_after", "storage", "integration_test"],
    "SC-DATA-02": ["state_before_after", "storage", "artifact"],
    "SC-DATA-03": ["storage", "native", "integration_test"],
    "SC-RESET-01": ["storage", "native", "screenshot"],
    "SC-PAY-01": ["state_before_after", "screenshot", "geometry", "text"],
    "SC-PAY-02": ["state_before_after", "screenshot", "interaction"],
    "SC-SORT-01": ["state_before_after", "storage", "interaction"],
    "SC-REPORT-01": ["state_before_after", "screenshot", "geometry", "text"],
    "SC-REPORT-02": ["state_before_after", "screenshot", "interaction"],
    "SC-AUTH-01": ["network", "storage", "screenshot", "manual_device"],
    "SC-AUTH-02": ["network", "screenshot", "manual_device"],
    "SC-SESSION-01": ["network", "storage", "integration_test", "manual_device"],
    "SC-ACCOUNT-01": ["state_before_after", "storage", "network", "screenshot"],
    "SC-AI-01": ["state_before_after", "network", "storage", "screenshot", "interaction"],
    "SC-AI-02": ["state_before_after", "network", "storage", "screenshot"],
    "SC-AI-03": ["state_before_after", "network", "storage", "screenshot"],
    "SC-BACKUP-01": ["state_before_after", "network", "storage", "artifact"],
    "SC-BACKUP-02": ["state_before_after", "network", "storage", "artifact"],
    "SC-NOTIFY-01": ["state_before_after", "unit_test"],
    "SC-NOTIFY-02": ["state_before_after", "native", "screenshot", "manual_device"],
    "SC-NOTIFY-03": ["state_before_after", "native", "integration_test", "manual_device"],
    "SC-ARCHIVE-01": ["artifact", "screenshot", "native", "interaction"],
    "SC-FILE-01": ["artifact", "native", "screenshot", "manual_device"],
    "SC-EXPORT-01": ["artifact", "state_before_after", "storage"],
    "SC-EXPORT-02": ["artifact", "screenshot", "text"],
    "SC-UI-LOGIN": ["screenshot", "geometry", "text", "semantics", "interaction"],
    "SC-UI-DEBT": ["screenshot", "geometry", "text", "semantics", "interaction"],
    "SC-UI-DETAIL-EDIT": ["screenshot", "geometry", "text", "semantics", "interaction"],
    "SC-UI-PAY-NOTIFY": ["screenshot", "geometry", "text", "semantics", "interaction"],
    "SC-UI-REPORT": ["screenshot", "geometry", "text", "semantics", "interaction"],
    "SC-UI-MINE": ["screenshot", "geometry", "text", "semantics", "interaction"],
    "SC-UI-ARCH-BACKUP": ["screenshot", "geometry", "text", "semantics", "interaction"],
    "SC-UI-AI": ["screenshot", "geometry", "text", "semantics", "interaction"],
    "SC-VISUAL-ALL": ["screenshot", "geometry", "text", "semantics"],
    "SC-LIFE-01": ["state_before_after", "storage", "network", "native", "integration_test"],
    "SC-RELEASE-01": ["artifact", "native", "network", "manual_device"],
}


def evidence_for(scenarios: list[str]) -> list[str]:
    return sorted({kind for item in scenarios for kind in SCENARIO_EVIDENCE[item]})


CALC_FUNCTIONS = [
    "clone", "r2", "fmt", "money", "todayStr", "baseName", "extOf", "pad",
    "parseDate", "addMonths", "fmtDate", "today0", "rateClass", "isActive",
    "genPlan", "npv", "impliedAPR", "rowRemaining", "recompute",
    "shortDateFromISO", "applySettle", "undoSettle", "recordPayment",
    "waivePeriod", "markPaidThrough", "genDebtId", "normalize",
    "interestCoverTolerance", "amortForward", "simulatePrepay",
    "simulateRepaymentOrder", "snowballOrder", "avalancheOrder",
    "detectMatchingSort", "isBadRepeatDay", "offsetLabel", "urgencyTier",
    "relLabel", "dueBucket", "computeReportData", "esc", "inline", "isHr",
    "mdToHtml", "summarizeDebts", "computeMonthlyRepayment",
    "computeUpcomingPressure", "pressureWindowMonths", "computeNotifySchedule",
    "remainingInterest", "hasPremium", "premiumLabel", "findAiConv",
    "bumpAiConvTop", "escSvg", "niceCeil", "truncateLabel",
]


for function_name in CALC_FUNCTIONS:
    status = "difference" if function_name in {"parseDate", "normalize"} else "mapped_unverified"
    notes = "57 个导出函数逐函数登记；既有 Dart 单测不是 JS↔Dart 全域差分证明。"
    kwargs: dict[str, Any] = {}
    if function_name == "parseDate":
        kwargs = {
            "legacy_behavior": "非数字三段日期产生 Invalid Date，由旧版上层按无效值处理。",
            "flutter_behavior": "三段齐全但含非数字时 int.parse 可抛 FormatException。",
            "resolution": "用固定非法输入差分测试确定旧版可观察语义，并让 Flutter 同步。",
        }
    elif function_name == "normalize":
        kwargs = {
            "legacy_behavior": "任意 falsy id 都会补发稳定 id。",
            "flutter_behavior": "只在 id 为 null 时补发，空字符串会保留，错误类型还可能 cast 失败。",
            "resolution": "复刻旧版 falsy/坏数据归一化并增加损坏存储回归。",
        }
    add_entry(
        f"INV-CALC-{function_name.upper()}",
        "计算核心",
        "pure_function",
        function_name,
        priority="P0",
        status=status,
        scenarios=["SC-CALC-01"] + (["SC-CALC-02"] if function_name == "genPlan" else []),
        selectors=[f"legacy.calc_export:{function_name}"],
        legacy=[source("www/js/calc.js", f"{function_name}: {function_name}")],
        flutter=[source("flutter/lib/calc/calc.dart", f"{function_name}(")],
        notes=notes,
        **kwargs,
    )


add_entry(
    "INV-CALC-COERCION",
    "计算核心",
    "runtime_semantics",
    "JS Number coercion、NaN/Infinity 与 Dart _num 语义",
    priority="P0",
    status="difference",
    scenarios=["SC-CALC-01", "SC-CALC-02"],
    selectors=["legacy.file_sha:www/js/calc.js@*", "flutter.dart_source:flutter/lib/calc/calc.dart"],
    legacy=[source("www/js/calc.js", "function r2(x)")],
    flutter=[source("flutter/lib/calc/calc.dart", "num _num(dynamic x) {")],
    notes="合法业务域可能一致，但百分百对齐还必须覆盖 bool、非法数值、NaN/Infinity 和 mutation。",
    legacy_behavior="广泛使用 Number(x)||0、JSON clone 与 JavaScript 浮点特殊值语义。",
    flutter_behavior="_num 对 bool/非法字符串回退 0，jsonEncode 对特殊值的失败形态不同。",
    resolution="建立真实 JS↔Dart differential runner，冻结异常类型与输入 mutation。",
)

add_entry(
    "INV-CALC-DART-EXTRA",
    "计算核心",
    "api_surface",
    "Dart 公开 splitPaidInterestFirst",
    priority="P3",
    status="flutter_extra",
    scenarios=["SC-CALC-01"],
    selectors=["flutter.dart_source:flutter/lib/calc/calc.dart"],
    legacy=[source("www/js/calc.js", "function splitPaidInterestFirst")],
    flutter=[source("flutter/lib/calc/calc.dart", "splitPaidInterestFirst(")],
    notes="JS 中为内部函数，Dart 顶层可见；暂未发现用户可观察影响。",
    legacy_behavior="内部实现，不属于 module.exports 的 57 个契约。",
    flutter_behavior="作为 Dart 顶层函数可被其他库导入。",
    resolution="确认无消费者后保持内部化，或登记为无用户影响的实现细节。",
)


def semantic_entry(
    entry_id: str,
    domain: str,
    title: str,
    *,
    scenario: str | list[str],
    legacy_path: str,
    legacy_anchor: str,
    flutter_path: str | None,
    flutter_anchor: str | None,
    status: str = "difference",
    priority: str = "P1",
    kind: str = "behavior_contract",
    notes: str,
    legacy_behavior: str | None = None,
    flutter_behavior: str | None = None,
    resolution: str | None = None,
    acceptance: str = "按旧版 oracle 执行同一动作序列，状态、文案、交互与证据完全一致。",
    extra_selectors: list[str] | None = None,
) -> None:
    scenario_ids = [scenario] if isinstance(scenario, str) else scenario
    selectors = [f"legacy.file_sha:{legacy_path}@*"]
    flutter_sources: list[dict[str, str]] = []
    if flutter_path and flutter_anchor:
        selectors.append(f"flutter.file_sha:{flutter_path}@*")
        flutter_sources.append(source(flutter_path, flutter_anchor))
    selectors.extend(extra_selectors or [])
    add_entry(
        entry_id,
        domain,
        kind,
        title,
        priority=priority,
        status=status,
        scenarios=scenario_ids,
        selectors=selectors,
        legacy=[source(legacy_path, legacy_anchor)],
        flutter=flutter_sources,
        notes=notes,
        acceptance=acceptance,
        legacy_behavior=legacy_behavior,
        flutter_behavior=flutter_behavior,
        resolution=resolution,
    )


# Static completeness ledger.  More specific semantic entries below are still
# mandatory; these two entries prevent a new source file/string/event/test from
# appearing without an intentional inventory refresh.
add_entry(
    "INV-SOURCE-LEGACY",
    "基准与完整性",
    "source_inventory",
    "受保护旧版完整源码、文案、事件与测试清单",
    priority="P0",
    status="mapped_unverified",
    scenarios=["SC-SOURCE-01"],
    selectors=[
        "legacy.file_sha:*", "legacy.react_source:*", "legacy.react_event:*",
        "legacy.index_function:*", "legacy.index_event:*", "legacy.dom_id:*",
        "legacy.css_token:*", "legacy.keyframes:*", "legacy.ui_text:*",
        "legacy.test_sha:*", "legacy.native_source:*",
    ],
    legacy=[source("www/index.html", "window.__azBridge =")],
    flutter=[source("flutter/tool/parity/parity_tool.py", "def discover_sources")],
    notes="逐文件 SHA 使同名函数的内容改动也会触发门禁；旧版始终只读。",
    acceptance="当前旧版清单与冻结快照逐身份一致，且 git diff 不包含任何受保护路径。",
    coverage_role="drift_guard",
)

add_entry(
    "INV-SOURCE-FLUTTER",
    "基准与完整性",
    "source_inventory",
    "Flutter 源码、文案、事件、依赖、导航与测试清单",
    priority="P0",
    status="mapped_unverified",
    scenarios=["SC-SOURCE-01"],
    selectors=[
        "flutter.file_sha:*", "flutter.dart_source:*", "flutter.event:*",
        "flutter.navigation:*", "flutter.ui_type:*", "flutter.ui_text:*",
        "flutter.color_literal:*", "flutter.dependency:*", "flutter.test_sha:*",
        "flutter.native_source:*", "flutter.method_channel:*",
        "parity.tool_sha:*", "parity.fixture_sha:*",
    ],
    legacy=[source("www/index.html", '<meta charset="UTF-8">')],
    flutter=[source("flutter/lib/main.dart", "runApp")],
    notes="新增文件、UI 文案、手势回调、依赖或测试都会要求显式刷新与重新映射。",
    acceptance="源码扫描零未分类 observation，生成清单可重复且 CI 校验不漂移。",
    coverage_role="drift_guard",
)

BRIDGE_MAPPINGS: dict[str, tuple[str, str, list[str]]] = {
    "addNotifyRule": ("flutter/lib/data/providers.dart", "void addRule", ["SC-NOTIFY-02"]),
    "buildAiSummary": ("flutter/lib/cloud/ai_advisor.dart", "Map<String, dynamic> buildAiSummary", ["SC-AI-03"]),
    "callAiAdvisor": ("flutter/lib/cloud/ai_advisor.dart", "Future<AiAdvisorReply> send", ["SC-AI-01"]),
    "commitReorder": ("flutter/lib/data/providers.dart", "void commitActiveReorder", ["SC-SORT-01"]),
    "confirmAsync": ("flutter/lib/ui/account/account_screen.dart", "Future<bool> _confirm", ["SC-UI-DETAIL-EDIT"]),
    "createBackup": ("flutter/lib/cloud/backup_service.dart", "Future<void> create", ["SC-BACKUP-01"]),
    "deleteAccount": ("flutter/lib/ui/account/account_screen.dart", "Future<void> _accountActions", ["SC-ACCOUNT-01"]),
    "deleteArchiveFile": ("flutter/lib/data/archive_repository.dart", "Future<void> delete", ["SC-ARCHIVE-01"]),
    "deleteBackup": ("flutter/lib/cloud/backup_service.dart", "Future<void> delete", ["SC-BACKUP-01"]),
    "deleteDebt": ("flutter/lib/data/providers.dart", "void deleteDebt", ["SC-DEBT-02"]),
    "deleteNotifyRule": ("flutter/lib/data/providers.dart", "void deleteRule", ["SC-NOTIFY-02"]),
    "downloadArchiveFile": ("flutter/lib/native/system_file_saver.dart", "Future<bool> saveFile", ["SC-FILE-01"]),
    "downloadBackupFile": ("flutter/lib/export/report_export_service.dart", "class LocalBackupService", ["SC-EXPORT-01"]),
    "exportReportPdf": ("flutter/lib/export/report_export_service.dart", "Future<Uint8List> buildPdf", ["SC-EXPORT-02"]),
    "exportReportXlsx": ("flutter/lib/export/report_export_service.dart", "Uint8List buildExcel", ["SC-EXPORT-01"]),
    "getAccount": ("flutter/lib/data/providers.dart", "final accountProvider", ["SC-ACCOUNT-01"]),
    "getBackupMeta": ("flutter/lib/data/local_store.dart", "int readLastBackupAt", ["SC-BACKUP-01"]),
    "getDebts": ("flutter/lib/data/providers.dart", "final debtsProvider", ["SC-DATA-01"]),
    "getFiles": ("flutter/lib/data/providers.dart", "final archiveRepositoryProvider", ["SC-ARCHIVE-01"]),
    "getNotify": ("flutter/lib/data/providers.dart", "final notifyProvider", ["SC-NOTIFY-02"]),
    "getPremium": ("flutter/lib/data/providers.dart", "final premiumProvider", ["SC-ACCOUNT-01"]),
    "listBackups": ("flutter/lib/cloud/backup_service.dart", "Future<List<BackupRecord>> list", ["SC-BACKUP-01"]),
    "payInstallment": ("flutter/lib/data/debt_ops.dart", "PaymentResult? recordPayment", ["SC-DEBT-01"]),
    "redeemCode": ("flutter/lib/ui/mine/premium_screen.dart", "void _redeem", ["SC-ACCOUNT-01"]),
    "renderAll": ("flutter/lib/data/providers.dart", "class DebtsNotifier", ["SC-LIFE-01"]),
    "resetLocalData": ("flutter/lib/ui/account/account_screen.dart", "Future<void> _clearLocal", ["SC-RESET-01"]),
    "restoreBackup": ("flutter/lib/cloud/backup_service.dart", "Future<RestoredBackup> restore", ["SC-BACKUP-02"]),
    "saveAll": ("flutter/lib/data/providers.dart", "void _persist", ["SC-DATA-03"]),
    "sendTestNotification": ("flutter/lib/notifications/reminder_scheduler.dart", "Future<void> scheduleTestNotification", ["SC-NOTIFY-02"]),
    "setDebt": ("flutter/lib/data/providers.dart", "void setDebt", ["SC-DEBT-02"]),
    "setNotifyEnabled": ("flutter/lib/data/providers.dart", "void setEnabled", ["SC-NOTIFY-02"]),
    "settleFull": ("flutter/lib/data/debt_ops.dart", "Debt? applySettle", ["SC-DEBT-01"]),
    "shareArchiveFile": ("flutter/lib/native/system_file_saver.dart", "Future<void> shareFile", ["SC-FILE-01"]),
    "toast": ("flutter/lib/ui/debts/debt_editor.dart", "ScaffoldMessenger.of(context)", ["SC-UI-DETAIL-EDIT"]),
    "triggerImportFilePicker": ("flutter/lib/ui/mine/mine_tab.dart", "FilePicker.platform.pickFiles", ["SC-DATA-02"]),
    "unsettle": ("flutter/lib/data/debt_ops.dart", "Debt undoSettle", ["SC-DEBT-01"]),
    "uploadArchiveFile": ("flutter/lib/ui/mine/archive_screen.dart", "FilePicker.platform.pickFiles", ["SC-ARCHIVE-01"]),
    "waiveInstallment": ("flutter/lib/data/debt_ops.dart", "Debt? waivePeriod", ["SC-DEBT-01"]),
    "wxLogout": ("flutter/lib/cloud/cloud_auth_controller.dart", "Future<void> logout", ["SC-AUTH-01"]),
}

for bridge_index, (bridge_name, mapping) in enumerate(BRIDGE_MAPPINGS.items(), start=1):
    flutter_path, flutter_anchor, bridge_scenarios = mapping
    add_entry(
        f"INV-BRG-{bridge_index:03d}",
        "Bridge 与架构映射",
        "api_surface",
        f"旧 AzBridge.{bridge_name} 能力入口映射",
        priority="P0",
        status="mapped_unverified",
        scenarios=["SC-SOURCE-01", *bridge_scenarios],
        selectors=[f"legacy.bridge:{bridge_name}"],
        legacy=[source("www/index.html", f"{bridge_name}:")],
        flutter=[source(flutter_path, flutter_anchor)],
        notes="Flutter 不保留统一 JS bridge；本项只证明该入口已逐项反查到对应动作，行为一致性仍由关联场景取证。",
        acceptance=f"AzBridge.{bridge_name} 的前置状态、动作、副作用和持久化结果均有双端证据。",
    )


def surface_selectors(*, legacy: list[str], flutter: list[str]) -> list[str]:
    candidate_selectors: list[str] = []
    for path_glob in legacy:
        candidate_selectors.extend(
            [
                f"legacy.react_source:{path_glob}",
                f"legacy.react_event:{path_glob}#*",
                f"legacy.ui_text:{path_glob}#*",
            ]
        )
    for path_glob in flutter:
        candidate_selectors.extend(
            [
                f"flutter.dart_source:{path_glob}",
                f"flutter.event:{path_glob}#*",
                f"flutter.navigation:{path_glob}#*",
                f"flutter.ui_text:{path_glob}#*",
            ]
        )
    inventory_path = SCRIPT_DIR / "source_inventory.json"
    if not inventory_path.is_file():
        return candidate_selectors
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    refs = [item["ref"] for item in inventory.get("observations", [])]
    return [
        selector
        for selector in candidate_selectors
        if any(fnmatch.fnmatchcase(ref, selector) for ref in refs)
    ]


for surface_id, title, legacy_globs, flutter_globs, legacy_source, flutter_source, scenario in [
    ("DEBT", "债务生命周期界面与手势源码面", ["react/src/debts/*", "react/src/sheets/DetailSheet.tsx", "react/src/sheets/EditSheet.tsx", "react/src/sheets/GenPanel.tsx", "react/src/sheets/PlanRows.tsx", "react/src/sheets/BatchBlock.tsx", "react/src/sheets/SimScreen.tsx"], ["flutter/lib/ui/debts/*"], ("react/src/debts/App.tsx", "export function App()"), ("flutter/lib/ui/debts/debts_tab.dart", "class DebtsTab"), "SC-UI-DETAIL-EDIT"),
    ("PAY", "还款日与通知界面源码面", ["react/src/pay/*", "react/src/sheets/NotifySheet.tsx"], ["flutter/lib/ui/pay/*"], ("react/src/pay/App.tsx", "export function App()"), ("flutter/lib/ui/pay/pay_tab.dart", "class PayTab"), "SC-UI-PAY-NOTIFY"),
    ("REPORT", "统计、图表与策略界面源码面", ["react/src/report/*", "react/src/sheets/StrategyCompareScreen.tsx"], ["flutter/lib/ui/report/*", "flutter/lib/report/*"], ("react/src/report/App.tsx", "export function App()"), ("flutter/lib/ui/report/report_tab.dart", "class ReportTab"), "SC-UI-REPORT"),
    ("MINE", "我的、Premium 与法律界面源码面", ["react/src/mine/*", "react/src/sheets/AccountScreen.tsx", "react/src/sheets/PremiumScreen.tsx", "react/src/sheets/AboutScreen.tsx", "react/src/sheets/PrivacyScreen.tsx", "react/src/sheets/AgreementScreen.tsx", "react/src/sheets/TermsScreen.tsx"], ["flutter/lib/ui/mine/*", "flutter/lib/ui/account/*"], ("react/src/mine/App.tsx", "export function App()"), ("flutter/lib/ui/mine/mine_tab.dart", "class MineTab"), "SC-UI-MINE"),
    ("ARCHIVE", "档案与备份界面源码面", ["react/src/sheets/DocsScreen.tsx", "react/src/sheets/BackupScreen.tsx"], ["flutter/lib/ui/mine/archive_screen.dart", "flutter/lib/ui/mine/backup_screen.dart"], ("react/src/sheets/DocsScreen.tsx", "export function DocsScreen()"), ("flutter/lib/ui/mine/archive_screen.dart", "class ArchiveScreen"), "SC-UI-ARCH-BACKUP"),
    ("AI", "AI 助手界面与状态机源码面", ["react/src/sheets/AiScreen.tsx", "react/src/sheets/AiLimitModal.tsx"], ["flutter/lib/ui/ai/*"], ("react/src/sheets/AiScreen.tsx", "export function AiScreen()"), ("flutter/lib/ui/ai/ai_screen.dart", "class AiScreen"), "SC-UI-AI"),
    ("SHARED", "共享状态、弹层与应用壳源码面", ["react/src/shared/*", "react/src/sheets/App.tsx", "react/src/sheets/StrategyChart.tsx", "react/src/sheets/gripDrag.ts", "react/src/sheets/main.tsx", "react/src/sheets/useSettleCelebration.ts", "react/src/types.ts"], ["flutter/lib/ui/app_shell.dart", "flutter/lib/ui/shared/*", "flutter/lib/ui/theme.dart", "flutter/lib/main.dart"], ("react/src/shared/state.ts", "export function useDebts"), ("flutter/lib/ui/app_shell.dart", "class AppShell"), "SC-VISUAL-ALL"),
]:
    add_entry(
        f"INV-SURFACE-{surface_id}",
        "基准与完整性",
        "semantic_source_surface",
        title,
        priority="P0",
        status="mapped_unverified",
        scenarios=[scenario, "SC-SOURCE-01"],
        selectors=surface_selectors(legacy=legacy_globs, flutter=flutter_globs),
        legacy=[source(*legacy_source)],
        flutter=[source(*flutter_source)],
        notes="路径范围是显式业务域分类，不是全仓兜底；新增目录或跨域源码不会被本项自动吞掉。",
        acceptance="该业务域内每个可见文本、事件和导航入口均由更细矩阵项或场景 checkpoint 取证。",
    )

add_entry(
    "INV-SURFACE-LEGACY-RUNTIME",
    "基准与完整性",
    "semantic_source_surface",
    "旧版宿主运行时函数、DOM、事件与动画源码面",
    priority="P0",
    status="mapped_unverified",
    scenarios=["SC-SOURCE-01", "SC-LIFE-01", "SC-VISUAL-ALL"],
    selectors=[
        "legacy.index_function:*",
        "legacy.index_event:www/index.html#*",
        "legacy.dom_id:*",
        "legacy.keyframes:*",
        "legacy.ui_text:www/index.html#*",
    ],
    legacy=[source("www/index.html", "window.__azBridge =")],
    flutter=[source("flutter/lib/main.dart", "Future<void> main()")],
    notes="旧版单文件宿主按运行时职责分类；bridge、storage、cloud/native 能力仍必须各自逐项映射，不能依赖本项。",
    acceptance="宿主函数、DOM 入口、事件和动画均在对应场景中有动作或可见 checkpoint。",
)

add_entry(
    "INV-SURFACE-SERVICES",
    "基准与完整性",
    "semantic_source_surface",
    "Flutter 数据、云端、导出、通知与原生服务源码面",
    priority="P0",
    status="mapped_unverified",
    scenarios=["SC-SOURCE-01", "SC-LIFE-01"],
    selectors=surface_selectors(
        legacy=[],
        flutter=[
            "flutter/lib/data/*",
            "flutter/lib/cloud/*",
            "flutter/lib/export/*",
            "flutter/lib/notifications/*",
            "flutter/lib/native/*",
            "flutter/lib/calc/calc.dart",
        ],
    ),
    legacy=[source("www/index.html", "window.__azBridge =")],
    flutter=[source("flutter/lib/data/providers.dart", "class DebtsNotifier")],
    notes="服务层路径显式列举；用户可观察契约继续由 calc、storage、bridge、cloud/native 细项负责。",
    acceptance="所有服务入口均能反查到至少一个语义矩阵项和执行场景。",
)


# Storage and data model.
add_entry(
    "INV-STO-001", "数据与持久化", "storage_keys", "债务、档案、账户、通知、会员主键",
    priority="P0", status="mapped_unverified", scenarios=["SC-DATA-01"],
    selectors=[
        "legacy.storage:debt-manager-v5", "legacy.storage:debt-manager-docs-v5",
        "legacy.storage:after-zero-account-v1", "legacy.storage:after-zero-notify-v1",
        "legacy.storage:after-zero-premium-v1", "flutter.storage:debt-manager-v5",
        "flutter.storage:debt-manager-docs-v5", "flutter.storage:after-zero-account-v1",
        "flutter.storage:after-zero-notify-v1", "flutter.storage:after-zero-premium-v1",
    ],
    legacy=[source("www/index.html", 'var KEY = "debt-manager-v5"')],
    flutter=[source("flutter/lib/data/local_store.dart", "class LocalStoreKeys")],
    notes="键名映射不意味着 WebView localStorage 会自动迁移到 SharedPreferences。",
)
add_entry(
    "INV-STO-002", "数据与持久化", "storage_key", "债务排序偏好",
    priority="P1", status="mapped_unverified", scenarios=["SC-SORT-01", "SC-DATA-01"],
    selectors=["legacy.storage:debt-manager-sort-v1", "flutter.storage:debt-manager-sort-v1"],
    legacy=[source("react/src/debts/useDebtSort.ts", "debt-manager-sort-v1")],
    flutter=[source("flutter/lib/data/local_store.dart", "debt-manager-sort-v1")],
    notes="需覆盖非法值、自定义顺序和冷启动恢复。",
)
add_entry(
    "INV-STO-003", "数据与持久化", "storage_keys", "AI 用量缓存与会话历史",
    priority="P0", status="mapped_unverified", scenarios=["SC-AI-02", "SC-AI-03"],
    selectors=[
        "legacy.storage:after-zero-ai-usage-v1", "legacy.storage:after-zero-ai-chatlog-v1",
        "flutter.storage:after-zero-ai-usage-v1", "flutter.storage:after-zero-ai-chatlog-v1",
    ],
    legacy=[source("react/src/sheets/AiScreen.tsx", "AI_USAGE_KEY")],
    flutter=[source("flutter/lib/cloud/ai_advisor.dart", "aiChatLogKey")],
    notes="服务端月额度是权威；本地缓存与聊天历史仍要逐状态对齐。",
)

semantic_entry(
    "INV-STO-004", "数据与持久化", "提前还款模拟偏好",
    scenario="SC-DATA-01", legacy_path="react/src/sheets/SimScreen.tsx",
    legacy_anchor="after-zero-simulate-v1", flutter_path="flutter/lib/ui/debts/debt_detail.dart",
    flutter_anchor="_PrepaySheet", status="missing_in_flutter", priority="P1",
    notes="Flutter 每次打开都回到 once/1000，且起始期语义不完整。",
    legacy_behavior="持久化 {mode, extra}，重复打开恢复用户选择。",
    flutter_behavior="没有对应 storage key，每次硬编码初始值。",
    resolution="新增同名兼容键及状态恢复，并对拍所有模拟输入。",
    extra_selectors=["legacy.storage:after-zero-simulate-v1"],
)
semantic_entry(
    "INV-STO-005", "数据与持久化", "AI 首次额度说明标记",
    scenario="SC-AI-03", legacy_path="react/src/sheets/AiScreen.tsx",
    legacy_anchor="AI_LIMIT_NOTICE_KEY", flutter_path="flutter/lib/ui/ai/ai_screen.dart",
    flutter_anchor="class AiScreen", status="missing_in_flutter", priority="P1",
    notes="这是首次进入教育弹窗的一次性持久化契约。",
    legacy_behavior="after-zero-ai-limit-notice-v1 只让说明弹窗出现一次。",
    flutter_behavior="没有对应键，也没有首次进入说明流程。",
    resolution="按旧版延时、文案、关闭与持久化语义实现。",
    extra_selectors=["legacy.storage:after-zero-ai-limit-notice-v1"],
)
semantic_entry(
    "INV-STO-006", "数据与持久化", "云备份元数据键",
    scenario=["SC-DATA-01", "SC-BACKUP-01"], legacy_path="www/index.html",
    legacy_anchor="after-zero-backup-meta-v1", flutter_path="flutter/lib/data/local_store.dart",
    flutter_anchor="after-zero-backup-v1", priority="P0",
    notes="现有清单此前误认为键已对齐。",
    legacy_behavior="使用 after-zero-backup-meta-v1 保存 lastBackupAt。",
    flutter_behavior="使用 after-zero-backup-v1。",
    resolution="恢复旧键名并验证本地导入、云恢复和冷启动读取。",
    extra_selectors=["legacy.storage:after-zero-backup-meta-v1", "flutter.storage:after-zero-backup-v1"],
)
semantic_entry(
    "INV-STO-007", "数据与持久化", "档案二进制持久化形状",
    scenario=["SC-ARCHIVE-01", "SC-DATA-02"], legacy_path="www/index.html",
    legacy_anchor="debtManagerFiles", flutter_path="flutter/lib/data/archive_repository.dart",
    flutter_anchor="class ArchiveRepository", priority="P1",
    notes="底层存储机制可不同，但可观察元数据、文件字节与生命周期必须等价。",
    legacy_behavior="IndexedDB uploads 保存 blob 与 addedAt。",
    flutter_behavior="应用文档目录保存字节，SharedPreferences 保存 path/createdAt 元数据。",
    resolution="规范化平台内部字段，只对用户可观察文件、时间、MIME 与操作做等价验收。",
    extra_selectors=["flutter.storage:after-zero-archive-files-v1"],
)
semantic_entry(
    "INV-STO-008", "数据与持久化", "Flutter 自管 device id 与 CloudBase session",
    scenario=["SC-DATA-01", "SC-SESSION-01"], legacy_path="www/index.html",
    legacy_anchor='persistence: "local"', flutter_path="flutter/lib/cloud/cloud_session_store.dart",
    flutter_anchor="after-zero-cloudbase-session-v1", status="flutter_extra", priority="P1",
    notes="架构所需的额外本地状态，但清理、过期与安全语义必须映射旧 SDK。",
    legacy_behavior="设备与会话持久化由 CloudBase JS SDK 隐式管理。",
    flutter_behavior="显式保存 after-zero-device-id-v1 和 after-zero-cloudbase-session-v1。",
    resolution="将其纳入登出、重置、过期、备份排除和敏感数据验收。",
    extra_selectors=["flutter.storage:after-zero-device-id-v1", "flutter.storage:after-zero-cloudbase-session-v1"],
)
semantic_entry(
    "INV-STO-009", "数据与持久化", "损坏 JSON 容错",
    scenario="SC-DATA-01", legacy_path="www/index.html", legacy_anchor="function loadJSON",
    flutter_path="flutter/lib/data/local_store.dart", flutter_anchor="jsonDecode(raw)", priority="P0",
    notes="损坏偏好可能让 Flutter 冷启动崩溃。",
    legacy_behavior="捕获解析异常并回退 seed。",
    flutter_behavior="通用读取路径可能直接抛 decode/cast 错误。",
    resolution="逐 key 复刻旧版容错与回退并覆盖截断、错误类型、空串。",
)
semantic_entry(
    "INV-STO-010", "数据与持久化", "异步写盘完成时序",
    scenario="SC-DATA-03", legacy_path="www/index.html", legacy_anchor="localStorage.setItem",
    flutter_path="flutter/lib/data/providers.dart", flutter_anchor="unawaited", priority="P0",
    notes="UI 成功与真实持久化之间存在杀进程窗口。",
    legacy_behavior="localStorage setItem 在调用线程同步完成或同步失败。",
    flutter_behavior="多处先更新 state/反馈，SharedPreferences Future 未等待。",
    resolution="建立明确的 durable-write 契约并在 force-stop 场景验收。",
)

add_entry(
    "INV-DATA-001", "数据与持久化", "model_shape", "PlanRow、GenSpec、Debt 主字段",
    priority="P0", status="mapped_unverified", scenarios=["SC-DATA-01", "SC-DEBT-01"],
    selectors=["legacy.react_source:react/src/types.ts", "flutter.dart_source:flutter/lib/data/models.dart"],
    legacy=[source("react/src/types.ts", "export interface PlanRow")],
    flutter=[source("flutter/lib/data/models.dart", "class PlanRow")],
    notes="字段静态映射完成，仍需旧形状、缺字段和 round-trip 证据。",
)
semantic_entry(
    "INV-DATA-002", "数据与持久化", "GenSpec.paid 兼容字段",
    scenario="SC-DATA-01", legacy_path="www/js/calc.js", legacy_anchor="d.gen.paid",
    flutter_path="flutter/lib/data/models.dart", flutter_anchor="final int? paid",
    status="flutter_extra", priority="P3", notes="有益兼容扩展，暂未发现用户可观察差异。",
    legacy_behavior="TS 未声明，但 normalize 会读取旧数据 d.gen.paid。",
    flutter_behavior="GenSpec 显式声明 paid 并 round-trip。",
    resolution="用旧数据 fixture 证明兼容且不改变正常输出后记录为实现差异。",
)
add_entry(
    "INV-DATA-003", "数据与持久化", "model_shape", "Account、Premium、Notify、Doc、AI quota 形状",
    priority="P0", status="mapped_unverified", scenarios=["SC-DATA-01", "SC-AI-03"],
    selectors=["legacy.react_source:react/src/types.ts", "flutter.dart_source:flutter/lib/data/models.dart"],
    legacy=[source("react/src/types.ts", "export interface Premium")],
    flutter=[source("flutter/lib/data/models.dart", "class Premium")],
    notes="主字段已映射，但容错、历史值和空值仍由 fixture 决定。",
)
semantic_entry(
    "INV-DATA-004", "数据与持久化", "legacy premiumPlus 迁移",
    scenario="SC-DATA-01", legacy_path="www/index.html", legacy_anchor="premium.premiumPlus",
    flutter_path="flutter/lib/data/models.dart", flutter_anchor="factory Premium.fromMap",
    status="missing_in_flutter", priority="P0", notes="旧备份恢复可能静默丢失会员权益。",
    legacy_behavior="启动时把 premiumPlus.startedAt 迁入 redeemed premium。",
    flutter_behavior="只读取 premium 字段，忽略 premiumPlus。",
    resolution="复刻迁移并添加旧 v6、本地恢复和云恢复测试。",
)
semantic_entry(
    "INV-DATA-005", "数据与持久化", "v6 uploads addedAt 形状",
    scenario=["SC-DATA-02", "SC-EXPORT-01"], legacy_path="www/index.html",
    legacy_anchor="addedAt: it.addedAt", flutter_path="flutter/lib/export/report_export_service.dart",
    flutter_anchor="'addedAt': file.createdAt", priority="P1", notes="同为 version 6 但时间字段类型不一致。",
    legacy_behavior="uploads[].addedAt 写 M/D 字符串。",
    flutter_behavior="导出 epoch integer。",
    resolution="以旧版 v6 schema 为准恢复字段名与类型，并做双向导入。",
)


# Business state transitions.
add_entry(
    "INV-ACT-001", "债务业务动作", "state_transition", "还款、减免、结清与撤销结清",
    priority="P0", status="mapped_unverified", scenarios=["SC-DEBT-01"],
    selectors=["legacy.file_sha:www/js/calc.js@*", "flutter.dart_source:flutter/lib/data/debt_ops.dart"],
    legacy=[source("www/js/calc.js", "function recordPayment")],
    flutter=[source("flutter/lib/data/debt_ops.dart", "PaymentResult? recordPayment")],
    notes="UI 已复用 calc 桥接，但完整前后状态、partial ledger 与异常输入仍需 differential evidence。",
)
add_entry(
    "INV-ACT-002", "债务业务动作", "state_transition", "只重排 active 债务并保留 settled 槽位",
    priority="P0", status="mapped_unverified", scenarios=["SC-SORT-01", "SC-DEBT-02"],
    selectors=["legacy.file_sha:www/index.html@*", "flutter.dart_source:flutter/lib/data/providers.dart"],
    legacy=[source("www/index.html", "function commitReorder")],
    flutter=[source("flutter/lib/data/providers.dart", "void commitActiveReorder")],
    notes="排序 tie、非法 index、恢复预设及杀进程落盘均要覆盖。",
)
semantic_entry(
    "INV-ACT-003", "债务业务动作", "编辑已结清债务保留状态",
    scenario="SC-DEBT-02", legacy_path="www/index.html", legacy_anchor="obj.settled = old.settled",
    flutter_path="flutter/lib/ui/debts/debt_editor.dart", flutter_anchor="final draft = Debt(",
    priority="P0", notes="编辑保存会把 settled 债务重新变成 active。",
    legacy_behavior="setDebt 明确保留 id、settled、settledDate。",
    flutter_behavior="编辑器构造新 Debt 只保留 id，整体替换时丢结清标记。",
    resolution="保存时保留旧状态并用 fixture 验证列表槽位、详情和持久化。",
)
add_entry(
    "INV-ACT-004", "债务业务动作", "shared_legacy_gap", "编辑提前结清债务的 settleStash 生命周期",
    priority="P2", status="mapped_unverified", scenarios=["SC-DEBT-02"],
    selectors=["legacy.react_source:react/src/sheets/EditSheet.tsx", "flutter.dart_source:flutter/lib/ui/debts/debt_editor.dart"],
    legacy=[source("react/src/sheets/EditSheet.tsx", "const obj")],
    flutter=[source("flutter/lib/ui/debts/debt_editor.dart", "final draft = Debt(")],
    notes="两端编辑器目前都不保留 settleStash；这是旧版共有缺口，不得误报为 Flutter 独有差异。",
)
semantic_entry(
    "INV-ACT-005", "债务业务动作", "provider 数据 invariant",
    scenario=["SC-DEBT-01", "SC-DATA-01"], legacy_path="www/index.html",
    legacy_anchor="recompute(obj)", flutter_path="flutter/lib/data/providers.dart",
    flutter_anchor="void setDebt(String? id, Debt debt)", priority="P1",
    notes="当前 UI 多数先 recompute，但 provider API 本身允许写入失真的派生字段。",
    legacy_behavior="setDebt/全量 render 在写入和展示前重算派生字段。",
    flutter_behavior="setDebt/replaceAll 信任调用方已经重算。",
    resolution="在数据边界统一强制 recompute 或证明所有入口不可绕过。",
)
semantic_entry(
    "INV-ACT-006", "账户与隐私", "服务器注销后的本地数据保留",
    scenario="SC-ACCOUNT-01", legacy_path="www/index.html", legacy_anchor="function deleteAccount()",
    flutter_path="flutter/lib/ui/account/account_screen.dart", flutter_anchor=".callFunction('deleteAccount')",
    priority="P0", notes="Flutter 当前会在服务器注销成功后额外删除用户全部本地债务与档案。",
    legacy_behavior="删除服务器账户并退出，只清 account，会保留本地业务数据。",
    flutter_behavior="成功后调用 _clearLocal，清 SharedPreferences、档案、AI 与债务。",
    resolution="把服务器注销与仅重置本地数据重新分离，并加破坏性回归测试。",
)
add_entry(
    "INV-ACT-007", "账户与隐私", "state_transition", "仅重置本地数据",
    priority="P0", status="mapped_unverified", scenarios=["SC-RESET-01"],
    selectors=["legacy.file_sha:www/index.html@*", "flutter.file_sha:flutter/lib/ui/account/account_screen.dart@*"],
    legacy=[source("www/index.html", "function resetLocalData()")],
    flutter=[source("flutter/lib/ui/account/account_screen.dart", "Future<void> _clearLocal")],
    notes="最终语义接近，但 Flutter 新增 session/device/archive key 后必须核对完整清理集合。",
)
semantic_entry(
    "INV-ACT-008", "导入与恢复", "本地导入文件失败语义",
    scenario="SC-DATA-02", legacy_path="www/index.html", legacy_anchor="上传文件恢复失败",
    flutter_path="flutter/lib/ui/mine/mine_tab.dart", flutter_anchor="导入失败",
    priority="P0", notes="两端都非事务，但失败后的用户数据状态不同。",
    legacy_behavior="先替换业务状态；文件失败时明确提示已导入但附件失败。",
    flutter_behavior="业务状态可能已改、档案可能半清空，却统一显示导入失败。",
    resolution="按旧版可观察顺序和提示对齐，或实现原子回滚且取得用户书面批准。",
)
semantic_entry(
    "INV-ACT-009", "档案库", "内置 Markdown 文档保存与删除",
    scenario="SC-ARCHIVE-01", legacy_path="react/src/sheets/DocsScreen.tsx",
    legacy_anchor="onDelete", flutter_path="flutter/lib/ui/mine/archive_screen.dart",
    flutter_anchor="SelectableText", status="missing_in_flutter", priority="P0",
    notes="旧版内置文档与上传文件在统一档案列表中都可操作。",
    legacy_behavior="Markdown 渲染后可另存为并删除。",
    flutter_behavior="内置文档仅展示，没有保存、删除或分享入口。",
    resolution="恢复统一能力并对拍文案、确认、文件名和持久化。",
)
semantic_entry(
    "INV-ACT-010", "档案库", "HEIC/HEIF/BMP MIME 保留",
    scenario="SC-ARCHIVE-01", legacy_path="www/index.html", legacy_anchor="file.type",
    flutter_path="flutter/lib/data/archive_repository.dart", flutter_anchor="String mimeForName",
    status="missing_in_flutter", priority="P0", notes="选择器允许这些扩展名，但 MIME 映射遗漏会破坏预览和分享。",
    legacy_behavior="保存 picker 返回的 file.type。",
    flutter_behavior="mimeForName 不识别 HEIC/HEIF/BMP，回退 application/octet-stream。",
    resolution="补齐 MIME 映射并用真实样本验证预览、保存与分享。",
)
semantic_entry(
    "INV-ACT-011", "提前还款模拟", "期次约束与结果内容",
    scenario="SC-UI-DETAIL-EDIT", legacy_path="react/src/sheets/SimScreen.tsx",
    legacy_anchor="Math.min(maxPeriod, Math.round(+atPeriod)", flutter_path="flutter/lib/ui/debts/debt_detail.dart",
    flutter_anchor="period == null || period < 1", priority="P1", notes="超出剩余期数时行为和信息展示均不一致。",
    legacy_behavior="期次 clamp 到 1..terms，展示月供、利率、起始期与额外金额。",
    flutter_behavior="只校验 >=1，结果字段更少。",
    resolution="复刻范围限制、持久化与结果字段后做相同输入对拍。",
)


# CloudBase HTTP and cloud functions.
add_entry(
    "INV-CLD-001", "云端与认证", "http_contract", "CloudBase HTTP 登录与函数调用协议",
    priority="P0", status="mapped_unverified", scenarios=["SC-AUTH-01", "SC-SESSION-01"],
    selectors=["flutter.dart_source:flutter/lib/cloud/cloudbase_client.dart"],
    legacy=[source("www/index.html", "ensureCbAuthReady")],
    flutter=[source("flutter/lib/cloud/cloudbase_client.dart", "class CloudBaseClient")],
    notes="URL/header/body 已静态映射，真实非匿名 session、错误码和续期另列差异。",
)

for cloud_id, function_name, anchor, title, scenario in [
    ("002", "wxLogin", "exports.main", "微信 code 换票据与用户资料", "SC-AUTH-01"),
    ("003", "backupUploadFile", "exports.main", "备份文件上传代理", "SC-BACKUP-01"),
    ("004", "backupCreate", "exports.main", "创建备份与 20条/300MB 配额", "SC-BACKUP-01"),
    ("005", "backupList", "exports.main", "备份轻量列表", "SC-BACKUP-01"),
    ("006", "backupRestore", "exports.main", "备份归属校验与恢复载荷", "SC-BACKUP-01"),
    ("007", "backupDelete", "exports.main", "备份归属校验与删除", "SC-BACKUP-01"),
    ("008", "deleteAccount", "exports.main", "服务器账户与备份清理", "SC-ACCOUNT-01"),
    ("009", "aiAdvisor", "exports.main", "AI 月额度与模型响应", "SC-AI-03"),
]:
    client_path = {
        "wxLogin": "flutter/lib/cloud/cloud_auth_controller.dart",
        "backupUploadFile": "flutter/lib/cloud/backup_service.dart",
        "backupCreate": "flutter/lib/cloud/backup_service.dart",
        "backupList": "flutter/lib/cloud/backup_service.dart",
        "backupRestore": "flutter/lib/cloud/backup_service.dart",
        "backupDelete": "flutter/lib/cloud/backup_service.dart",
        "deleteAccount": "flutter/lib/ui/account/account_screen.dart",
        "aiAdvisor": "flutter/lib/cloud/ai_advisor.dart",
    }[function_name]
    add_entry(
        f"INV-CLD-{cloud_id}", "云端与认证", "cloud_function", title,
        priority="P0", status="mapped_unverified", scenarios=[scenario, "SC-LIFE-01"],
        selectors=[f"legacy.cloud_function:{function_name}", f"flutter.file_sha:{client_path}@*"],
        legacy=[source(f"cloudbase/functions/{function_name}/index.js", anchor)],
        flutter=[source(client_path, function_name)],
        notes="服务端函数保持只读；输入、输出、失败与客户端状态仍需网络 transcript 对拍。",
    )

semantic_entry(
    "INV-CLD-010", "云端与认证", "非匿名会话静默续期",
    scenario="SC-SESSION-01", legacy_path="www/index.html", legacy_anchor='persistence: "local"',
    flutter_path="flutter/lib/cloud/cloud_providers.dart", flutter_anchor="if (stored != null && !stored.isExpired) {",
    status="missing_in_flutter", priority="P0", notes="正式会话约 2 小时后要求重登，破坏持续使用。",
    legacy_behavior="CloudBase JS SDK local persistence 自动恢复/续期。",
    flutter_behavior="过期正式 session 被视为无会话，refreshToken 未使用。",
    resolution="确认并实现 HTTP refresh 协议，覆盖前后台、冷启动与 30 天边界。",
)
semantic_entry(
    "INV-CLD-011", "云端与认证", "前台驻留跨过 session expiry",
    scenario="SC-SESSION-01", legacy_path="www/index.html", legacy_anchor="ensureCbAuthReady",
    flutter_path="flutter/lib/cloud/cloudbase_client.dart", flutter_anchor="Future<dynamic> callFunction(",
    priority="P0", notes="客户端可继续携带已过期 Bearer token 发请求。",
    legacy_behavior="SDK 在调用路径管理会话有效性。",
    flutter_behavior="callFunction 只检查 session 非空，不检查 expiresAt。",
    resolution="每次调用前原子 refresh/relogin，并规范化并发刷新和 401 重试。",
)
semantic_entry(
    "INV-CLD-012", "云备份", "备份文件上传并发模型",
    scenario="SC-BACKUP-02", legacy_path="www/index.html", legacy_anchor="Promise.all",
    flutter_path="flutter/lib/cloud/backup_service.dart", flutter_anchor="for (final item in archive.readMetadata()) {",
    priority="P2", notes="功能目标相同，但耗时、失败顺序和多文件体验可观察。",
    legacy_behavior="多个档案文件并行上传。",
    flutter_behavior="逐文件串行上传。",
    resolution="用相同延迟/失败 fixture 确认旧版可观察语义并对齐。",
)
semantic_entry(
    "INV-CLD-013", "云备份", "备份上传 namespace 唯一性",
    scenario="SC-BACKUP-02", legacy_path="www/index.html", legacy_anchor="Math.random",
    flutter_path="flutter/lib/cloud/backup_service.dart", flutter_anchor="millisecondsSinceEpoch",
    priority="P0", notes="多设备同毫秒创建存在 Storage 路径碰撞风险。",
    legacy_behavior="时间戳后追加随机后缀。",
    flutter_behavior="仅毫秒时间戳加债务数。",
    resolution="恢复不可碰撞随机标识并验证并发创建。",
)
semantic_entry(
    "INV-CLD-014", "云备份", "云恢复失败原子性与顺序",
    scenario="SC-BACKUP-02", legacy_path="www/index.html", legacy_anchor="function applyBackupData(data)",
    flutter_path="flutter/lib/cloud/backup_service.dart", flutter_anchor="Future<RestoredBackup> restore(String id) async",
    priority="P0", notes="下载中途失败会留下完全不同的本地状态。",
    legacy_behavior="先覆盖业务数据，再逐文件下载并吞单文件错误。",
    flutter_behavior="先清空并下载档案；任一失败不应用业务数据，却可能留下半档案。",
    resolution="按旧版顺序与反馈对齐，或实现事务恢复并取得用户书面批准。",
)
add_entry(
    "INV-CLD-015", "云备份", "shared_legacy_gap", "backupCreate 失败后的孤儿 Storage 文件",
    priority="P2", status="mapped_unverified", scenarios=["SC-BACKUP-02"],
    selectors=["legacy.cloud_function:backupCreate", "flutter.dart_source:flutter/lib/cloud/backup_service.dart"],
    legacy=[source("www/index.html", "backupUploadFile")],
    flutter=[source("flutter/lib/cloud/backup_service.dart", "backupCreate")],
    notes="两端共有缺口：先上传后 create，后一步失败不回收已上传文件。",
)
add_entry(
    "INV-CLD-016", "账户与隐私", "shared_legacy_gap", "注销后 aiUsage 与认证 principal 残留",
    priority="P1", status="mapped_unverified", scenarios=["SC-ACCOUNT-01"],
    selectors=["legacy.cloud_function:deleteAccount"],
    legacy=[source("cloudbase/functions/deleteAccount/index.js", "exports.main")],
    flutter=[source("flutter/lib/ui/account/account_screen.dart", "deleteAccount")],
    notes="两端客户端调用同一云函数，因此共有服务端隐私缺口；不是 Flutter 独有差异。",
)
add_entry(
    "INV-CLD-017", "AI 顾问", "shared_legacy_gap", "AI quota 并发竞态",
    priority="P1", status="mapped_unverified", scenarios=["SC-AI-03", "SC-LIFE-01"],
    selectors=["legacy.cloud_function:aiAdvisor"],
    legacy=[source("cloudbase/functions/aiAdvisor/index.js", "async function readUsage(openid, month)")],
    flutter=[source("flutter/lib/cloud/ai_advisor.dart", "class AiAdvisorService")],
    notes="同一云函数先读后写，双端并发请求都可能越过额度；留作共有风险，不误报迁移差异。",
)


# Notifications and native platform bridges.
add_entry(
    "INV-NOT-001", "通知", "schedule_contract", "6个月/450条全期提醒计算",
    priority="P0", status="mapped_unverified", scenarios=["SC-NOTIFY-01"],
    selectors=["legacy.file_sha:www/js/calc.js@*", "flutter.dart_source:flutter/lib/notifications/reminder_scheduler.dart"],
    legacy=[source("www/js/calc.js", "function computeNotifySchedule")],
    flutter=[source("flutter/lib/notifications/reminder_scheduler.dart", "computeNotifySchedule")],
    notes="核心纯计算已映射；仍需 tie、450/451、6个月边界和非法规则差分。",
)
semantic_entry(
    "INV-NOT-002", "通知", "冷启动重排提醒",
    scenario="SC-NOTIFY-03", legacy_path="www/index.html", legacy_anchor="renderAll();",
    flutter_path="flutter/lib/main.dart", flutter_anchor="Future<void> main()",
    status="missing_in_flutter", priority="P0", notes="重启后现有债务不会主动恢复未来提醒。",
    legacy_behavior="启动末尾 renderAll 会调用 syncNotifications。",
    flutter_behavior="main 只初始化 preferences 并启动 UI。",
    resolution="在启动接线中初始化 scheduler 并按当前数据全量重排。",
)
semantic_entry(
    "INV-NOT-003", "通知", "通知开关即时调度",
    scenario="SC-NOTIFY-02", legacy_path="www/index.html", legacy_anchor="function setNotifyEnabled",
    flutter_path="flutter/lib/data/providers.dart", flutter_anchor="setEnabled", priority="P1",
    notes="Flutter 行为可能更合理，但用户目标要求旧版行为，除非书面批准差异。",
    legacy_behavior="开关只保存状态，后续统一同步。",
    flutter_behavior="立即清空并重排。",
    resolution="用旧版实际操作冻结时序，再按 oracle 对齐。",
)
semantic_entry(
    "INV-NOT-004", "通知", "测试通知前权限请求",
    scenario="SC-NOTIFY-02", legacy_path="www/index.html", legacy_anchor="function sendTestNotification()",
    flutter_path="flutter/lib/ui/pay/notify_screen.dart", flutter_anchor="Future<void> _sendTest() async",
    status="missing_in_flutter", priority="P0", notes="首次点击测试时 Flutter 可能直接失败或无反馈。",
    legacy_behavior="显式检查并申请通知权限后才发送测试。",
    flutter_behavior="直接调用 scheduler，没有对应权限流程。",
    resolution="复刻允许、拒绝、永久拒绝与重试路径。",
)
semantic_entry(
    "INV-NOT-005", "通知", "测试与正式通知文案/id/日期格式",
    scenario="SC-NOTIFY-02", legacy_path="www/index.html", legacy_anchor='id: 999',
    flutter_path="flutter/lib/notifications/reminder_scheduler.dart", flutter_anchor="id: 900",
    priority="P0", notes="通知属于用户可见内容，不能以功能存在替代逐字对齐。",
    legacy_behavior="999 / 测试通知 / 电池优化说明；正式日期 M月D日。",
    flutter_behavior="900 / After Zero 测试提醒 / 短正文；正式日期补零。",
    resolution="逐字段恢复旧文案、id、channel 与日期格式。",
)
semantic_entry(
    "INV-NOT-006", "通知", "Android channel 描述与创建时机",
    scenario="SC-NOTIFY-02", legacy_path="www/index.html", legacy_anchor="债务还款日提醒",
    flutter_path="flutter/lib/notifications/reminder_scheduler.dart", flutter_anchor="债务到期提醒",
    priority="P1", notes="Android channel 一旦创建后部分字段不可变，必须用干净安装验收。",
    legacy_behavior="启动即建 channel，描述为债务还款日提醒。",
    flutter_behavior="插件首次 initialize 时懒创建，描述不同。",
    resolution="清应用数据/重装后逐字段对账 channel。",
)
semantic_entry(
    "INV-NOT-007", "通知", "exact alarm 请求与降级",
    scenario="SC-NOTIFY-02", legacy_path="www/index.html", legacy_anchor="return LN.schedule({ notifications: [{",
    flutter_path="flutter/lib/notifications/reminder_scheduler.dart", flutter_anchor="requestExactAlarmsPermission",
    status="flutter_extra", priority="P1", notes="平台适配可以不同，但用户可观察权限流程和提醒精度须批准。",
    legacy_behavior="Capacitor 路径没有显式 exact-alarm UI。",
    flutter_behavior="主动请求 exact alarm，拒绝后退回 inexact。",
    resolution="真机对拍并将必要平台差异提交用户书面批准。",
)
semantic_entry(
    "INV-NOT-008", "通知", "exact alarm 授权冷启动恢复",
    scenario="SC-NOTIFY-03", legacy_path="www/index.html", legacy_anchor="return LN.schedule({ notifications: [{",
    flutter_path="flutter/lib/notifications/reminder_scheduler.dart", flutter_anchor="_exactAlarmGranted",
    priority="P0", notes="系统已授权但进程重启后内存标记回 false。",
    legacy_behavior="由平台插件按系统实际能力调度。",
    flutter_behavior="授权只保存在内存，冷启动后可能错误使用 inexact。",
    resolution="每次初始化查询系统授权并覆盖重启/升级场景。",
)
semantic_entry(
    "INV-NOT-009", "通知", "时区识别失败降级",
    scenario="SC-NOTIFY-03", legacy_path="www/js/calc.js", legacy_anchor="new Date",
    flutter_path="flutter/lib/notifications/reminder_scheduler.dart", flutter_anchor="tz.UTC",
    priority="P0", notes="回退 UTC 可让本地提醒整体偏移。",
    legacy_behavior="JavaScript Date 与系统通知使用设备本地时区。",
    flutter_behavior="timezone 识别异常时回退 UTC。",
    resolution="保留设备本地 offset 或安全阻止排程并明确报错，覆盖 DST/未知时区。",
)
semantic_entry(
    "INV-NOT-010", "通知", "reschedule 异步错误处理",
    scenario="SC-NOTIFY-03", legacy_path="www/index.html", legacy_anchor='console.error("syncNotifications failed", e)',
    flutter_path="flutter/lib/data/providers.dart", flutter_anchor="unawaited(", priority="P1",
    notes="原生插件失败可能成为未处理异步错误且 UI 仍显示成功。",
    legacy_behavior="syncNotifications promise 至少捕获并记录错误。",
    flutter_behavior="unawaited reschedule 未统一 catch/反馈。",
    resolution="建立一致的 await、错误记录与用户反馈策略。",
)

add_entry(
    "INV-NAT-001", "原生文件能力", "native_bridge", "Android SAF ACTION_CREATE_DOCUMENT",
    priority="P0", status="mapped_unverified", scenarios=["SC-FILE-01"],
    selectors=["legacy.native_source:android/app/src/main/java/io/github/jenkjyu/afterzero/SaveFilePlugin.java", "flutter.method_channel:after_zero/file_save"],
    legacy=[source("android/app/src/main/java/io/github/jenkjyu/afterzero/SaveFilePlugin.java", "ACTION_CREATE_DOCUMENT")],
    flutter=[source("flutter/android/app/src/main/kotlin/io/github/jenkjyu/after_zero/MainActivity.kt", "ACTION_CREATE_DOCUMENT")],
    notes="核心 intent/流拷贝/临时文件能力已映射，生命周期另列差异。",
)
semantic_entry(
    "INV-NAT-002", "原生文件能力", "SAF Activity 重建与并发保存",
    scenario=["SC-FILE-01", "SC-LIFE-01"], legacy_path="android/app/src/main/java/io/github/jenkjyu/afterzero/SaveFilePlugin.java",
    legacy_anchor="@ActivityCallback", flutter_path="flutter/android/app/src/main/kotlin/io/github/jenkjyu/after_zero/MainActivity.kt",
    flutter_anchor="pendingSave", status="missing_in_flutter", priority="P0",
    notes="Activity 重建/进程回收可丢 callback、Result 和临时文件。",
    legacy_behavior="Capacitor 保存 PluginCall 并由 ActivityCallback 恢复。",
    flutter_behavior="pendingSave 只存在 Activity 内存。",
    resolution="实现可恢复 request 状态与清理策略，真机强制重建验证。",
)
add_entry(
    "INV-NAT-003", "微信登录", "native_bridge", "fluwx manifest 与微信回调路由",
    priority="P0", status="mapped_unverified", scenarios=["SC-AUTH-01", "SC-RELEASE-01"],
    selectors=["legacy.native_source:android/app/src/main/java/io/github/jenkjyu/afterzero/wxapi/WXEntryActivity.java", "flutter.dependency:fluwx"],
    legacy=[source("android/app/src/main/java/io/github/jenkjyu/afterzero/wxapi/WXEntryActivity.java", "WXEntryActivity")],
    flutter=[source("flutter/pubspec.yaml", "fluwx:")],
    notes="插件声明存在不等于新包名、签名和真实回调已验证。",
)
semantic_entry(
    "INV-NAT-004", "微信登录", "OAuth state 随机性与回调校验",
    scenario="SC-AUTH-02", legacy_path="android/app/src/main/java/io/github/jenkjyu/afterzero/WeChatLoginPlugin.java",
    legacy_anchor="boolean stateOk = pendingState != null && pendingState.equals(state);", flutter_path="flutter/lib/cloud/wechat_auth.dart",
    flutter_anchor="NormalAuth", priority="P0", notes="固定/未校验 state 是 OAuth 安全与串话风险。",
    legacy_behavior="每次生成随机 state，并拒绝 callback state 不匹配。",
    flutter_behavior="使用插件默认 state，收到响应后不比较。",
    resolution="显式生成强随机 state、按请求隔离并验证取消/重复/旧回调。",
)
semantic_entry(
    "INV-NAT-005", "微信登录", "微信安装检测与错误反馈",
    scenario="SC-AUTH-02", legacy_path="www/index.html", legacy_anchor="请先安装微信",
    flutter_path="flutter/lib/ui/account/login_gate.dart", flutter_anchor="loginWithWeChat",
    priority="P1", notes="Flutter wrapper 有 isInstalled，但登录门未调用。",
    legacy_behavior="先检查插件和微信安装，给出明确 toast 与正在跳转反馈。",
    flutter_behavior="直接授权，失败统一为内联错误。",
    resolution="恢复检查顺序、busy、toast 和失败分支。",
)
semantic_entry(
    "INV-NAT-006", "微信登录", "新包名与 release SHA1 注册",
    scenario="SC-RELEASE-01", legacy_path="android/app/build.gradle", legacy_anchor="io.github.jenkjyu.afterzero",
    flutter_path="flutter/android/app/build.gradle.kts", flutter_anchor="io.github.jenkjyu.after_zero",
    status="blocked_external", priority="P0", notes="必须在装有微信的 Android 真机和微信开放平台登记状态下验证。",
    legacy_behavior="旧包名+既有 release 签名已登记。",
    flutter_behavior="并存测试包名带下划线，登记状态未知且 release 当前仍用 debug signing。",
    resolution="阶段切换决策后登记最终包名+release SHA1，并完成真实 OAuth。",
)
semantic_entry(
    "INV-NAT-007", "原生文件能力", "iOS 分享面板保存取消语义",
    scenario="SC-FILE-01", legacy_path="www/index.html", legacy_anchor="function saveToDeviceDownloads(blob, filename, mime)",
    flutter_path="flutter/lib/native/system_file_saver.dart", flutter_anchor="await SharePlus.instance.share(",
    status="blocked_external", priority="P2", notes="用户已决定当前阶段暂缓 iOS；不得把未验证写成完成。",
    legacy_behavior="旧版没有 iOS target。",
    flutter_behavior="iOS 用 share sheet，但当前返回后统一 true，不能区分取消。",
    resolution="安装完整 Xcode 后在 iPhone/iOS 模拟器验收并申请平台差异批准。",
)


# Export artifacts.
add_entry(
    "INV-EXP-001", "导出", "artifact_schema", "XLSX 三张表与已结清债务",
    priority="P0", status="mapped_unverified", scenarios=["SC-EXPORT-02"],
    selectors=["legacy.file_sha:www/index.html@*", "flutter.dart_source:flutter/lib/export/report_export_service.dart"],
    legacy=[source("www/index.html", "function exportReportXlsx")],
    flutter=[source("flutter/lib/export/report_export_service.dart", "Uint8List buildExcel")],
    notes="表名大体映射；必须逐 cell、类型、空值、顺序和格式比较。",
)
semantic_entry(
    "INV-EXP-002", "导出", "XLSX KPI 新增在还债务数",
    scenario="SC-EXPORT-02", legacy_path="www/index.html", legacy_anchor="汇总KPI",
    flutter_path="flutter/lib/export/report_export_service.dart", flutter_anchor="在还债务数",
    status="flutter_extra", priority="P1", notes="用户目标不允许未经批准增加导出内容。",
    legacy_behavior="KPI 只有总负债、平均利率、预计还清日期。",
    flutter_behavior="额外写入在还债务数。",
    resolution="移除额外行或取得用户书面批准。",
)
semantic_entry(
    "INV-EXP-003", "导出", "XLSX original 空值",
    scenario="SC-EXPORT-02", legacy_path="www/index.html", legacy_anchor="d.original",
    flutter_path="flutter/lib/export/report_export_service.dart", flutter_anchor="debt.original ?? 0",
    priority="P1", notes="空单元格与数值 0 在表格语义上不同。",
    legacy_behavior="original 为 null 时 SheetJS 留空。",
    flutter_behavior="写数值 0。",
    resolution="恢复空单元格并用 workbook parser 断言单元类型。",
)
semantic_entry(
    "INV-EXP-004", "导出", "PDF 报告内容结构",
    scenario="SC-EXPORT-02", legacy_path="www/index.html", legacy_anchor="function exportReportPdf",
    flutter_path="flutter/lib/export/report_export_service.dart", flutter_anchor="Future<Uint8List> buildPdf",
    priority="P0", notes="可选中文字是实现改进，但不能替代旧版缺失的图表与内容。",
    legacy_behavior="固定浅色报告，包含余额对比、类型占比、负债预测三图及明细/已结清汇总。",
    flutter_behavior="概览、债务表、时间线表、逐期表；缺余额图和类型图。",
    resolution="按旧版页结构、文案、图表、明细和分页逐页复刻，保留可选中文本。",
)
add_entry(
    "INV-EXP-005", "导出", "artifact_contract", "导出文件名与 MIME",
    priority="P1", status="mapped_unverified", scenarios=["SC-EXPORT-01", "SC-EXPORT-02"],
    selectors=["legacy.file_sha:www/index.html@*", "flutter.dart_source:flutter/lib/export/report_export_service.dart"],
    legacy=[source("www/index.html", "AfterZero统计报表")],
    flutter=[source("flutter/lib/export/report_export_service.dart", "'After Zero · 债务统计报告'")],
    notes="需固定日期验证 YYMMDD、MIME、SAF 默认文件名及取消反馈。",
)


# AI conversation state machine beyond the UI surface.
semantic_entry(
    "INV-AI-001", "AI 顾问", "额度缓存月份与本地快路径",
    scenario="SC-AI-03", legacy_path="react/src/sheets/AiScreen.tsx", legacy_anchor="quotaExhaustedLocally",
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor="aiUsageProvider",
    status="missing_in_flutter", priority="P0", notes="旧月份缓存可能被错误展示且必然失败的请求仍会发出。",
    legacy_behavior="按北京时间校验 month，仅当前月且 used>=limit 时本地拦截。",
    flutter_behavior="直接展示缓存，不做同等月份校验/快路径。",
    resolution="复刻北京月边界、本地快路径和服务端回写。",
)
semantic_entry(
    "INV-AI-002", "AI 顾问", "按错误消息保存 RetryCtx",
    scenario="SC-AI-02", legacy_path="react/src/sheets/AiScreen.tsx", legacy_anchor="interface RetryCtx {",
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor="_RetryContext? _retry;",
    status="missing_in_flutter", priority="P0", notes="旧错误后继续提问会让历史错误失去可重试上下文。",
    legacy_behavior="每条失败消息按 msgIndex 持有自己的原始请求上下文。",
    flutter_behavior="只有一组全局 _retry/_errorIndex。",
    resolution="把 retry context 绑定到每条错误消息并覆盖异步乱序。",
)
semantic_entry(
    "INV-AI-003", "AI 顾问", "错误消息不得污染历史与模型上下文",
    scenario="SC-AI-02", legacy_path="react/src/sheets/AiScreen.tsx", legacy_anchor="error: true",
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor="AI 分析失败：$error",
    priority="P0", notes="Flutter 后续成功保存时可能把失败文本作为普通 assistant 内容持久化。",
    legacy_behavior="错误气泡是展示状态，不进入持久会话 history。",
    flutter_behavior="失败文本放进普通 AiChatMessage，后续可能被保存和发给模型。",
    resolution="分离错误展示状态与持久消息，添加失败→继续→冷启动用例。",
)
semantic_entry(
    "INV-AI-004", "AI 顾问", "删除当前历史会话后清空当前画面",
    scenario="SC-AI-02", legacy_path="react/src/sheets/AiScreen.tsx", legacy_anchor="setCurrentConvId(null)",
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor=".delete(item.id)",
    status="missing_in_flutter", priority="P0", notes="下一次成功请求会把已删除会话原 id 复活。",
    legacy_behavior="删除当前记录同步清 current id/messages。",
    flutter_behavior="只删 provider 列表，当前 widget state 仍保留会话。",
    resolution="确认后原子清空当前状态并取消在途 reveal/request。",
)
semantic_entry(
    "INV-AI-005", "AI 顾问", "追问建议 marker 列表兼容",
    scenario="SC-AI-01", legacy_path="react/src/sheets/AiScreen.tsx", legacy_anchor="splitSuggestions",
    flutter_path="flutter/lib/cloud/ai_advisor.dart", flutter_anchor="splitAiSuggestions(String text)",
    priority="P1", notes="模型不保证只用 '- '，宽容解析是旧版设计。",
    legacy_behavior="接受 -、*、• 和普通非空行，最多三条。",
    flutter_behavior="只接受严格 '- '。",
    resolution="复刻宽容 parser 并覆盖 marker 缺失/2/3/4条。",
)
semantic_entry(
    "INV-AI-006", "AI 顾问", "会话 id 与标题生成",
    scenario="SC-AI-02", legacy_path="react/src/sheets/AiScreen.tsx", legacy_anchor="newAiConvId",
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor="millisecondsSinceEpoch",
    priority="P1", notes="并发/同毫秒会话可碰撞，标题截断也改变历史列表内容。",
    legacy_behavior="时间+随机后缀 id，标题保存完整首问。",
    flutter_behavior="仅毫秒 id，标题截 24 字。",
    resolution="恢复唯一 id 与完整标题，长文本视觉另由 UI 场景处理。",
)
semantic_entry(
    "INV-AI-007", "AI 顾问", "复制到外部 AI 的任务指令",
    scenario="SC-AI-01", legacy_path="react/src/sheets/AiScreen.tsx", legacy_anchor="buildCopyPrompt",
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor="复制完整提示词",
    priority="P0", notes="数据全量不代表任务语义一致。",
    legacy_behavior="明确要求雪球/雪崩比较、节省利息数字和可执行顺序。",
    flutter_behavior="只有通用债务分析指令。",
    resolution="逐字恢复旧提示词并验证完整未还计划。",
)
add_entry(
    "INV-AI-008", "AI 顾问", "state_contract", "summary 压缩与完整复制计划",
    priority="P0", status="mapped_unverified", scenarios=["SC-AI-01"],
    selectors=["legacy.file_sha:www/index.html@*", "flutter.dart_source:flutter/lib/cloud/ai_advisor.dart"],
    legacy=[source("www/index.html", "function buildAiSummary")],
    flutter=[source("flutter/lib/cloud/ai_advisor.dart", "buildAiSummary")],
    notes="只压缩已还期次，未还计划始终逐期完整；需大数据 fixture 逐字段验证。",
)


def ui_entry(
    entry_id: str,
    domain: str,
    title: str,
    *,
    scenario: str,
    legacy_path: str,
    legacy_anchor: str,
    flutter_path: str | None,
    flutter_anchor: str | None,
    old: str,
    new: str,
    priority: str = "P1",
    status: str = "difference",
) -> None:
    semantic_entry(
        entry_id,
        domain,
        title,
        scenario=scenario,
        legacy_path=legacy_path,
        legacy_anchor=legacy_anchor,
        flutter_path=flutter_path,
        flutter_anchor=flutter_anchor,
        status=status,
        priority=priority,
        kind="ui_interaction_contract",
        notes=f"旧版：{old}；Flutter：{new}",
        legacy_behavior=old,
        flutter_behavior=new,
        resolution="按状态 checkpoint 执行截图、几何、文本、semantics 与手势证据，对照旧版逐项收敛。",
        acceptance="同一状态、viewport、主题、字体缩放与动作下，视觉、文案、焦点、返回和手势均与旧版一致。",
    )


# Global and system surfaces.
ui_entry(
    "SYS.LOGIN_GATE", "全局系统界面", "登录门",
    scenario="SC-UI-LOGIN", legacy_path="www/index.html", legacy_anchor='id="loginGate"',
    flutter_path="flutter/lib/ui/account/login_gate.dart", flutter_anchor="class LoginGate",
    old="本地 Account 即隐藏，fail-closed，手写动画与 toast 错误", new="同时要求有效正式 session，内联 busy/error，图标与动效不同", priority="P0",
)
ui_entry(
    "SYS.WECHAT_OAUTH", "全局系统界面", "微信 OAuth 可见流程",
    scenario="SC-UI-LOGIN", legacy_path="www/index.html", legacy_anchor="正在跳转微信授权…",
    flutter_path="flutter/lib/ui/account/login_gate.dart", flutter_anchor="Future<void> _login() async",
    old="显式检查插件/安装、toast 跳转、取消与失败分支", new="不先检查安装，busy/error 内联显示", priority="P0",
)
ui_entry(
    "SYS.TAB_BAR", "全局系统界面", "四 Tab 导航与状态收口",
    scenario="SC-VISUAL-ALL", legacy_path="www/index.html", legacy_anchor='document.querySelectorAll(".tabbar button").forEach(function (b) {',
    flutter_path="flutter/lib/ui/app_shell.dart", flutter_anchor="class AppShell",
    old="切换滚顶、关闭 swipe/jiggle、图标 bounce", new="IndexedStack 保留滚动和局部手势状态", priority="P0",
)
ui_entry(
    "SYS.BACK_DISPATCH", "全局系统界面", "Android 系统返回优先链",
    scenario="SC-LIFE-01", legacy_path="www/index.html", legacy_anchor="window.__handleBackButton = function () {",
    flutter_path="flutter/lib/ui/app_shell.dart", flutter_anchor="class AppShell",
    old="AI history→子页→sheet→jiggle 的显式最上层优先链", new="主要依赖 Navigator，无根级 PopScope，局部模式可残留", priority="P0",
)
ui_entry(
    "SYS.ROUTE_TRANSITION", "全局系统界面", "子页与抽屉 surface/过渡",
    scenario="SC-VISUAL-ALL", legacy_path="www/index.html", legacy_anchor=".subpage",
    flutter_path="flutter/lib/ui/debts/debt_detail.dart", flutter_anchor="class DebtDetailScreen",
    old="子页统一右滑，sheet 统一底部滑入", new="平台 Material 路由；详情/编辑由抽屉变全屏", priority="P0",
)
ui_entry(
    "SYS.CONFIRM_HOST", "全局系统界面", "统一确认/输入弹窗宿主",
    scenario="SC-VISUAL-ALL", legacy_path="www/index.html", legacy_anchor="function askAsync",
    flutter_path="flutter/lib/ui/debts/payment_sheet.dart", flutter_anchor="return await showDialog<num>(",
    old="单一 modal 支持第三动作、month/date/amount 与统一关闭", new="多套 AlertDialog，样式、按钮、输入和关闭不一致", priority="P1",
)
ui_entry(
    "SYS.TOAST_HOST", "全局系统界面", "全局 toast 队列与时长",
    scenario="SC-VISUAL-ALL", legacy_path="www/index.html", legacy_anchor="function toast",
    flutter_path="flutter/lib/ui/theme.dart", flutter_anchor="snackBarTheme",
    old="单例绿色 flash，约 1800ms，新消息替换计时器", new="floating Snackbar 可排队，位置/时长/配色不同", priority="P1",
)
ui_entry(
    "SYS.KEYBOARD_FOCUS_A11Y", "全局系统界面", "键盘焦点与无障碍语义",
    scenario="SC-VISUAL-ALL", legacy_path="www/index.html", legacy_anchor="aria-label",
    flutter_path="flutter/lib/ui/app_shell.dart", flutter_anchor="Semantics(",
    old="主导航与部分图表有明确焦点/键盘契约", new="Pressure 裸 GestureDetector、AI 发送缺统一 label，焦点恢复未定义", priority="P0",
)
ui_entry(
    "SYS.REDUCED_MOTION", "全局系统界面", "减少动态效果",
    scenario="SC-VISUAL-ALL", legacy_path="www/index.html", legacy_anchor="prefers-reduced-motion",
    flutter_path="flutter/lib/ui/theme.dart", flutter_anchor="ThemeData",
    old="登录、Premium、tab、jiggle、AI 等广泛跳过动画", new="未发现 MediaQuery.disableAnimations 等对应分支", status="missing_in_flutter", priority="P0",
)
ui_entry(
    "SYS.TEXT_SELECTION_CONTEXT_MENU", "全局系统界面", "文本选择与长按菜单",
    scenario="SC-VISUAL-ALL", legacy_path="www/index.html", legacy_anchor=".pie-wrap { position: relative; touch-action: pan-y; user-select: none; }",
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor="SelectableText",
    old="全局禁选与 context menu，仅输入框例外", new="AI、法律、档案多处可选择并出现系统长按菜单", priority="P1",
)
ui_entry(
    "SYS.HAPTICS", "全局系统界面", "长按与重排触感反馈",
    scenario="SC-UI-DEBT", legacy_path="android/app/src/main/java/io/github/jenkjyu/afterzero/MainActivity.java",
    legacy_anchor="bridge.getWebView().setHapticFeedbackEnabled(false);", flutter_path="flutter/lib/ui/debts/debts_tab.dart",
    flutter_anchor="ReorderableDragStartListener", old="WebView 原生层显式关闭触感", new="Framework 长按/重排可能产生平台触感，未显式抑制", priority="P1",
)
ui_entry(
    "SYS.RESPONSIVE_SAFE_AREA", "全局系统界面", "Safe Area 与 560px 最大宽",
    scenario="SC-VISUAL-ALL", legacy_path="www/index.html", legacy_anchor="max-width: 560px; margin: 0 auto; width: 100%; }",
    flutter_path="flutter/lib/ui/app_shell.dart", flutter_anchor="SafeArea",
    old="主内容、subpage、sheet 在宽屏最大 560px 居中", new="主 tab 没有统一 560px 约束，平板/横屏会铺满", priority="P0",
)
ui_entry(
    "SYS.OVERSCROLL", "全局系统界面", "列表 overscroll/stretch",
    scenario="SC-VISUAL-ALL", legacy_path="android/app/src/main/java/io/github/jenkjyu/afterzero/MainActivity.java",
    legacy_anchor="OVER_SCROLL_NEVER", flutter_path="flutter/lib/ui/app_shell.dart",
    flutter_anchor="class AppShell", old="CSS+WebView 双层禁用 stretch", new="没有自定义 ScrollBehavior/OverscrollIndicator", status="missing_in_flutter", priority="P1",
)
add_entry(
    "SYS.COLOR_SCHEME", "全局系统界面", "theme_tokens", "明暗主题基础色板",
    priority="P0", status="mapped_unverified", scenarios=["SC-VISUAL-ALL"],
    selectors=["legacy.css_token:*", "flutter.color_literal:*"],
    legacy=[source("www/index.html", "--bg:")], flutter=[source("flutter/lib/ui/theme.dart", "ThemeData buildAppTheme")],
    notes="基础 token 已映射；Material 派生色与每个组件状态仍需像素验收。",
)
ui_entry(
    "SYS.FILE_PICKER.BACKUP", "全局系统界面", "本地备份文件选择",
    scenario="SC-EXPORT-01", legacy_path="www/index.html", legacy_anchor="importFileInput",
    flutter_path="flutter/lib/ui/mine/mine_tab.dart", flutter_anchor="FilePicker.platform.pickFiles",
    old="按 legacy array/new object 和当前数据量给精确覆盖提示/错误", new="通用覆盖提示并直接显示异常", priority="P1",
)
ui_entry(
    "SYS.FILE_PICKER.ARCHIVE", "全局系统界面", "档案文件选择反馈",
    scenario="SC-ARCHIVE-01", legacy_path="react/src/sheets/DocsScreen.tsx", legacy_anchor="uploadArchiveFile",
    flutter_path="flutter/lib/ui/mine/archive_screen.dart", flutter_anchor="FilePicker.platform.pickFiles",
    old="成功 toast，不自动选中新上传文件", new="自动选中且没有相同成功 toast", priority="P1",
)
ui_entry(
    "SYS.SAVE_AS", "全局系统界面", "另存为可见反馈",
    scenario="SC-FILE-01", legacy_path="www/index.html", legacy_anchor="downloadBackupFile",
    flutter_path="flutter/lib/native/system_file_saver.dart", flutter_anchor="SystemFileSaver",
    old="统一进度、取消、成功、错误反馈", new="各入口反馈与取消处理不一致", priority="P1",
)
ui_entry(
    "SYS.SHARE_SHEET", "全局系统界面", "分享面板能力检测与取消",
    scenario="SC-FILE-01", legacy_path="www/index.html", legacy_anchor="navigator.share",
    flutter_path="flutter/lib/ui/mine/archive_screen.dart", flutter_anchor="if (action == 'share') {",
    old="先检查能力，取消不报错并有 fallback", new="异常统一可能显示分享失败", priority="P1",
)
add_entry(
    "SYS.EXTERNAL_BROWSER", "全局系统界面", "platform_interop", "法律协议外链",
    priority="P2", status="mapped_unverified", scenarios=["SC-UI-MINE"],
    selectors=["legacy.react_source:react/src/sheets/PrivacyScreen.tsx", "flutter.dart_source:flutter/lib/ui/mine/legal_screens.dart"],
    legacy=[source("react/src/sheets/PrivacyScreen.tsx", "target=\"_blank\"")],
    flutter=[source("flutter/lib/ui/mine/legal_screens.dart", "launchUrl")],
    notes="两端均走外部浏览器，待返回 App 与失败分支真机验证。",
)
ui_entry(
    "SYS.MAILTO", "全局系统界面", "关于页联系邮箱",
    scenario="SC-UI-MINE", legacy_path="react/src/sheets/AboutScreen.tsx", legacy_anchor="mailto:",
    flutter_path="flutter/lib/ui/mine/legal_screens.dart", flutter_anchor="联系邮箱",
    old="点击邮箱打开邮件客户端", new="静态 ListTile，无 onTap", status="missing_in_flutter", priority="P1",
)
add_entry(
    "SYS.NOTIFICATION_RESCHEDULE", "全局系统界面", "integration_wiring", "数据动作后的通知重排接线",
    priority="P0", status="mapped_unverified", scenarios=["SC-NOTIFY-03"],
    selectors=["legacy.file_sha:www/index.html@*", "flutter.dart_source:flutter/lib/data/providers.dart"],
    legacy=[source("www/index.html", "function syncNotifications")],
    flutter=[source("flutter/lib/data/providers.dart", "reschedule")],
    notes="新增/修改/还款/恢复/规则修改都有接线迹象；时序与失败必须真机验证。",
)


# Debt tab, detail and editor surfaces.
ui_entry(
    "TAB.DEBTS", "债务 Tab", "债务主页全部状态",
    scenario="SC-UI-DEBT", legacy_path="react/src/debts/App.tsx", legacy_anchor="export function App",
    flutter_path="flutter/lib/ui/debts/debts_tab.dart", flutter_anchor="class DebtsTab",
    old="空数据仍保留零值 Hero/KPI/AI/口径/列表头；卡片与添加入口固定布局", new="空数据用独立空状态替换主要结构，Hero/KPI/卡片/wordmark/FAB 结构不同", priority="P0",
)
ui_entry(
    "DISCLOSURE.DEBT_CALC_NOTE", "债务 Tab", "债务计算口径折叠",
    scenario="SC-UI-DEBT", legacy_path="react/src/debts/Summary.tsx", legacy_anchor="计算口径",
    flutter_path="flutter/lib/ui/debts/debts_tab.dart", flutter_anchor="计算口径",
    old="所有状态可展开/收起并保持固定位置", new="位置样式不同，完全空态时不存在", priority="P1",
)
ui_entry(
    "SHEET.DEBT_SORT", "债务 Tab", "排序底部抽屉",
    scenario="SC-UI-DEBT", legacy_path="react/src/debts/SortSheet.tsx", legacy_anchor="SortSheet",
    flutter_path="flutter/lib/ui/debts/debts_tab.dart", flutter_anchor="showModalBottomSheet",
    old="自定义 portal picker，当前项/关闭/scrim 语义固定", new="Material bottom sheet，视觉和关闭方式不同", priority="P1",
)
ui_entry(
    "GESTURE.DEBT_SWIPE", "债务 Tab", "债务卡左滑销这期",
    scenario="SC-UI-DEBT", legacy_path="react/src/debts/gestures.ts", legacy_anchor="else closeDebtSwipe(ctx, row);",
    flutter_path="flutter/lib/ui/shared/swipe_reveal.dart", flutter_anchor="class SwipeReveal",
    old="精细 axis/justDragged 状态机、76px、半阈值、只开一行并随 tab 关闭", new="通用 Flutter 手势，切 tab 状态保留", priority="P0",
)
ui_entry(
    "MODE.DEBT_REORDER", "债务 Tab", "jiggle 长按拖拽编辑模式",
    scenario="SC-UI-DEBT", legacy_path="react/src/debts/gestures.ts", legacy_anchor="ctx.exitJiggle();",
    flutter_path="flutter/lib/ui/debts/debts_tab.dart", flutter_anchor="ReorderableDragStartListener",
    old="一次长按进入抖动并继续拖，边缘自动滚、长按退出、tab/back 收口", new="首次长按只进入抖动，需第二次按住才拖；无长按退出且其他动作仍可用", priority="P0",
)
ui_entry(
    "SHEET.DEBT_DETAIL", "债务详情", "债务详情底部抽屉",
    scenario="SC-UI-DETAIL-EDIT", legacy_path="react/src/sheets/DetailSheet.tsx", legacy_anchor="DetailSheet",
    flutter_path="flutter/lib/ui/debts/debt_detail.dart", flutter_anchor="class DebtDetailScreen",
    old="可拖高/下拉关闭的 bottom sheet，债务变更后自动收口", new="全屏路由，编辑再嵌套路由，债务缺失时停留在不存在页", priority="P0",
)
ui_entry(
    "DIALOG.INSTALLMENT_PAYMENT", "债务详情", "销这期/部分还款输入",
    scenario="SC-DEBT-01", legacy_path="www/index.html", legacy_anchor="function payInstallment",
    flutter_path="flutter/lib/ui/debts/payment_sheet.dart", flutter_anchor="return await showDialog<num>(",
    old="展示本金/利息/剩余提示，非法值关闭后 toast", new="信息更少，错误内联", priority="P1",
)
ui_entry(
    "DIALOG.WAIVE_PERIOD", "债务详情", "协商减免输入默认值",
    scenario="SC-DEBT-01", legacy_path="www/index.html", legacy_anchor="function waiveInstallment",
    flutter_path="flutter/lib/ui/debts/debt_detail.dart", flutter_anchor="协商减免",
    old="默认当前期实际欠款，兼容变额与部分还款", new="默认 debt.monthly，可能错误", priority="P0",
)
ui_entry(
    "DIALOG.SETTLE_FULL", "债务详情", "提前结清输入与解释",
    scenario="SC-DEBT-01", legacy_path="www/index.html", legacy_anchor="function settleFull",
    flutter_path="flutter/lib/ui/debts/debt_detail.dart", flutter_anchor="提前结清",
    old="解释额外利息/减免的结清结果", new="只有通用金额提示", priority="P1",
)
ui_entry(
    "DIALOG.PREMIUM_INVITE.SETTLEMENT", "债务详情", "首次结清后的 Premium 庆祝邀请",
    scenario="SC-DEBT-01", legacy_path="react/src/sheets/useSettleCelebration.ts", legacy_anchor="useSettleCelebration",
    flutter_path=None, flutter_anchor=None, old="非 Premium 首次使债务结清后弹庆祝邀请，确认进 Premium", new="完全没有该副作用", status="missing_in_flutter", priority="P0",
)
ui_entry(
    "SUBPAGE.PREPAY_SIM", "提前还款模拟", "提前还款模拟页面与状态",
    scenario="SC-UI-DETAIL-EDIT", legacy_path="react/src/sheets/SimScreen.tsx", legacy_anchor="SimScreen",
    flutter_path="flutter/lib/ui/debts/debt_detail.dart", flutter_anchor="class _PrepaySheet",
    old="先关详情再开全屏，持久化 mode/extra，按剩余期数 clamp，结果完整", new="详情上叠 bottom sheet，每次重置 once/1000，结果字段更少", priority="P0",
)
ui_entry(
    "SHEET.DEBT_EDITOR", "债务编辑器", "新增/编辑债务底部抽屉",
    scenario="SC-UI-DETAIL-EDIT", legacy_path="react/src/sheets/EditSheet.tsx", legacy_anchor="EditSheet",
    flutter_path="flutter/lib/ui/debts/debt_editor.dart", flutter_anchor="class DebtEditorScreen",
    old="bottom sheet，scrim/grip/取消/返回、五种生成与批量状态机", new="全屏页面，surface、关闭、字段可操作范围不同", priority="P0",
)
ui_entry(
    "STATE.EDITOR.PLAN_CONTROLLER_SYNC", "债务编辑器", "逐期输入 controller 与模型同步",
    scenario="SC-EDIT-02", legacy_path="react/src/sheets/PlanRows.tsx", legacy_anchor="updateRow(idx, { amount: parseFloat(v) || 0 });",
    flutter_path="flutter/lib/ui/debts/debt_editor.dart", flutter_anchor="class _PlanRowEditorState",
    old="React 受控输入，批量/重新生成后立即显示模型新值", new="controller 只在 initState 初始化、无 didUpdateWidget，可继续显示旧值", priority="P0",
)
ui_entry(
    "ACTION.EDITOR.ADD_ROW", "债务编辑器", "添加一期按钮可见条件",
    scenario="SC-EDIT-02", legacy_path="react/src/sheets/PlanRows.tsx", legacy_anchor="＋ 加一期",
    flutter_path="flutter/lib/ui/debts/debt_editor.dart", flutter_anchor="加一期",
    old="只在手工模式或一次性零行时允许", new="始终显示", priority="P1",
)
ui_entry(
    "DIALOG.EDITOR.BATCH_AMOUNT_WARNING", "债务编辑器", "批量金额清空构成警告",
    scenario="SC-EDIT-02", legacy_path="react/src/sheets/BatchBlock.tsx", legacy_anchor="会把每期的本金和利息清空为 0",
    flutter_path="flutter/lib/ui/debts/debt_editor.dart", flutter_anchor="void _applyBatch()",
    old="执行前明确二次警告会清空本金/利息", new="直接执行", status="missing_in_flutter", priority="P0",
)
ui_entry(
    "PICKER.EDITOR.DEBT_TYPE", "债务编辑器", "债务类型选择器",
    scenario="SC-EDIT-01", legacy_path="react/src/sheets/EditSheet.tsx", legacy_anchor="借款类型",
    flutter_path="flutter/lib/ui/debts/debt_editor.dart", flutter_anchor="DropdownButtonFormField<String>",
    old="native select", new="Material dropdown，展开/返回/视觉不同", priority="P2",
)
ui_entry(
    "PICKER.EDITOR.GEN_KIND", "债务编辑器", "计息方式选择器",
    scenario="SC-EDIT-01", legacy_path="react/src/sheets/GenPanel.tsx", legacy_anchor="计息方式",
    flutter_path="flutter/lib/ui/debts/debt_editor.dart", flutter_anchor="const _GeneratorPanel(",
    old="带说明的自定义 bottom picker", new="短标签 dropdown", priority="P1",
)
ui_entry(
    "PICKER.EDITOR.BATCH_COLUMN", "债务编辑器", "批量列选择与折叠",
    scenario="SC-EDIT-02", legacy_path="react/src/sheets/BatchBlock.tsx", legacy_anchor="批量设置",
    flutter_path="flutter/lib/ui/debts/debt_editor.dart", flutter_anchor="ExpansionTile",
    old="native select 与固定展开语义", new="dropdown + ExpansionTile", priority="P2",
)
for picker_id, title, legacy_file, legacy_anchor, flutter_anchor in [
    ("PICKER.EDITOR.OPENED_DATE", "借款日选择", "react/src/sheets/EditSheet.tsx", "type=\"date\"", "借款日"),
    ("PICKER.EDITOR.FIRST_DATE", "首期还款日选择", "react/src/sheets/GenPanel.tsx", "type=\"date\"", "首期还款日"),
    ("PICKER.EDITOR.ROW_DATE", "逐期日期选择", "react/src/sheets/PlanRows.tsx", "type=\"date\"", "late final TextEditingController _date"),
]:
    ui_entry(
        picker_id, "债务编辑器", title, scenario="SC-EDIT-01", legacy_path=legacy_file,
        legacy_anchor=legacy_anchor, flutter_path="flutter/lib/ui/debts/debt_editor.dart",
        flutter_anchor=flutter_anchor, old="系统 date picker，取消/无效值有固定语义", new="纯 YYYY-MM-DD 文本输入", priority="P1",
    )
ui_entry(
    "DIALOG.EDITOR.BATCH_FIRST_MONTH", "债务编辑器", "批量还款日首月选择",
    scenario="SC-EDIT-02", legacy_path="react/src/sheets/BatchBlock.tsx", legacy_anchor='const parts = monthVal.split("-");',
    flutter_path="flutter/lib/ui/debts/debt_editor.dart", flutter_anchor="首期年月",
    old="全局 month picker modal", new="内联文本字段", priority="P1",
)
ui_entry(
    "DIALOG.DELETE_DEBT", "债务编辑器", "删除债务确认与反馈",
    scenario="SC-DEBT-02", legacy_path="www/index.html", legacy_anchor="这不是结清",
    flutter_path="flutter/lib/ui/debts/debt_editor.dart", flutter_anchor="删除这笔债务",
    old="强调不是结清，成功 toast", new="短文案，成功静默", priority="P1",
)


# Pay and notification UI.
ui_entry(
    "TAB.PAY", "还款日 Tab", "还款日全部状态",
    scenario="SC-UI-PAY-NOTIFY", legacy_path="react/src/pay/App.tsx", legacy_anchor="export function App",
    flutter_path="flutter/lib/ui/pay/pay_tab.dart", flutter_anchor="class PayTab",
    old="逐期列表，销这期只在左滑后出现", new="每行额外常驻销这期按钮，整体结构/状态不同", priority="P0",
)
ui_entry(
    "PICKER.PAY_CUSTOM_DATE", "还款日 Tab", "自定义日期选择器",
    scenario="SC-PAY-01", legacy_path="react/src/pay/App.tsx", legacy_anchor="const [customDays, setCustomDays]",
    flutter_path="flutter/lib/ui/pay/pay_tab.dart", flutter_anchor="showDatePicker",
    old="全局 native date modal", new="Material showDatePicker", priority="P2",
)
ui_entry(
    "GESTURE.PAY_SWIPE", "还款日 Tab", "还款行左滑",
    scenario="SC-PAY-02", legacy_path="react/src/pay/gestures.ts", legacy_anchor="else closePaySwipe(ctx, row);",
    flutter_path="flutter/lib/ui/shared/swipe_reveal.dart", flutter_anchor="class SwipeReveal",
    old="轴仲裁、半阈值、只开一行、tab 切换关闭", new="通用手势，tab 切换保留", priority="P0",
)
ui_entry(
    "SHEET.NOTIFY_SETTINGS", "通知", "通知设置底部抽屉",
    scenario="SC-UI-PAY-NOTIFY", legacy_path="react/src/sheets/NotifySheet.tsx", legacy_anchor="NotifySheet",
    flutter_path="flutter/lib/ui/pay/notify_screen.dart", flutter_anchor="class NotifyScreen",
    old="bottom sheet，关闭时补默认规则，测试始终可点并自行申请权限", new="全屏/Material 结构，获权后立即加规则，未启用时测试禁用", priority="P0",
)
ui_entry(
    "PICKER.NOTIFY_OFFSET", "通知", "提前天数选择",
    scenario="SC-NOTIFY-02", legacy_path="react/src/sheets/NotifySheet.tsx", legacy_anchor="offsetDays",
    flutter_path="flutter/lib/ui/pay/notify_screen.dart", flutter_anchor="ChoiceChip",
    old="native select", new="ChoiceChip", priority="P2",
)
ui_entry(
    "PICKER.NOTIFY_TIME", "通知", "提醒时间选择",
    scenario="SC-NOTIFY-02", legacy_path="react/src/sheets/NotifySheet.tsx", legacy_anchor="type=\"time\"",
    flutter_path="flutter/lib/ui/pay/notify_screen.dart", flutter_anchor="showTimePicker",
    old="native time input", new="Material time picker", priority="P2",
)
ui_entry(
    "SYS.NOTIFICATION_PERMISSION", "通知", "通知权限全状态",
    scenario="SC-NOTIFY-02", legacy_path="www/index.html", legacy_anchor="requestPermissions",
    flutter_path="flutter/lib/ui/pay/notify_screen.dart", flutter_anchor="通知设置失败：$error",
    old="启用/测试分别有确定检查、提示与默认规则时机", new="前置条件、提示与永久拒绝分支不同", priority="P0",
)


# Report and strategy surfaces.
ui_entry(
    "TAB.REPORT", "统计 Tab", "统计报告全部状态",
    scenario="SC-UI-REPORT", legacy_path="react/src/report/App.tsx", legacy_anchor="export function App",
    flutter_path="flutter/lib/ui/report/report_tab.dart", flutter_anchor="class ReportTab",
    old="在还、仅结清、从未有债都有完整报告/Outro/口径", new="仅结清态少已付利息和完整 Outro，整体版式仍不同", priority="P0",
)
ui_entry(
    "GESTURE.REPORT_JOURNEY_SCRUB", "统计 Tab", "还清路径真实时间轴拖读",
    scenario="SC-REPORT-02", legacy_path="react/src/report/Journey.tsx", legacy_anchor='dot.style.top = latest.py(i) + "px";',
    flutter_path="flutter/lib/ui/report/report_tab.dart", flutter_anchor="class _JourneyCard extends StatefulWidget",
    old="按真实日期比例绘制/命中，轴仲裁，松手复位", new="按数组等距绘制/命中但标签按真实时间，tap 可能粘住", priority="P0",
)
ui_entry(
    "MODE.REPORT_PRESSURE", "统计 Tab", "未来压力面积/柱形模式",
    scenario="SC-REPORT-02", legacy_path="react/src/report/Pressure.tsx", legacy_anchor='useState<PMode>("area")',
    flutter_path="flutter/lib/ui/report/report_tab.dart", flutter_anchor="class _PressureCard extends StatefulWidget",
    old="默认面积，两种模式都可选月，长时间轴横向滚", new="默认柱形，面积不可交互，长轴压进单屏且标题固定", priority="P0",
)
ui_entry(
    "DISCLOSURE.REPORT_RANK_REST", "统计 Tab", "债务排行其余 N 笔展开",
    scenario="SC-REPORT-01", legacy_path="react/src/report/Rank.tsx", legacy_anchor="其余",
    flutter_path="flutter/lib/ui/report/report_tab.dart", flutter_anchor="其余",
    old="可展开/收起完整剩余列表", new="只有静态汇总文字", status="missing_in_flutter", priority="P1",
)
ui_entry(
    "GESTURE.REPORT_TYPE_ROTATE", "统计 Tab", "类型饼图绕圆心旋转",
    scenario="SC-REPORT-02", legacy_path="react/src/report/pieRotate.ts", legacy_anchor="export interface PieRotateOpts {",
    flutter_path="flutter/lib/ui/report/report_tab.dart", flutter_anchor="double _rotation = -.5 * math.pi;",
    old="按圆心角度、有阈值和惯性，标签随图转并与纵滚仲裁", new="累加水平 dx、无惯性、legend 静态", priority="P0",
)
ui_entry(
    "POPOVER.REPORT_EXPORT", "统计 Tab", "导出二选一 popover",
    scenario="SC-UI-REPORT", legacy_path="react/src/report/ExportMenu.tsx", legacy_anchor="ExportMenu",
    flutter_path="flutter/lib/ui/report/report_tab.dart", flutter_anchor="label: const Text('Excel')",
    old="点击导出打开二选一 popover，可点背景关闭", new="Excel/PDF 两按钮常驻", status="missing_in_flutter", priority="P1",
)
ui_entry(
    "DISCLOSURE.REPORT_CALC_NOTE", "统计 Tab", "统计计算口径折叠",
    scenario="SC-REPORT-01", legacy_path="react/src/report/Outro.tsx", legacy_anchor="计算口径",
    flutter_path="flutter/lib/ui/report/report_tab.dart", flutter_anchor="计算口径",
    old="主报告及结清状态都可展开/收起", new="仅结清状态完全缺失", priority="P1",
)
ui_entry(
    "SUBPAGE.STRATEGY_COMPARE", "策略对比", "多策略对比全部状态",
    scenario="SC-REPORT-02", legacy_path="react/src/sheets/StrategyCompareScreen.tsx", legacy_anchor="StrategyCompareScreen",
    flutter_path="flutter/lib/ui/report/strategy_compare_screen.dart", flutter_anchor="class StrategyCompareScreen",
    old="0/1/2+债务文案准确，含精确日期、节省结论、失败信息、图例/起点", new="0笔也写只有1笔，多个字段和图表语义缺失", priority="P0",
)


# Mine, account, Premium, legal, archive and backup surfaces.
ui_entry(
    "TAB.MINE", "我的 Tab", "我的主页全部状态",
    scenario="SC-UI-MINE", legacy_path="react/src/mine/App.tsx", legacy_anchor="export function App",
    flutter_path="flutter/lib/ui/mine/mine_tab.dart", flutter_anchor="class MineTab",
    old="账户/Premium/数据卡固定自定义布局", new="功能入口大体齐，但卡片、标题、间距和图标为 Material 重排", priority="P0",
)
ui_entry(
    "SUBPAGE.ACCOUNT", "账户", "账户信息子页",
    scenario="SC-UI-MINE", legacy_path="react/src/sheets/AccountScreen.tsx", legacy_anchor="AccountScreen",
    flutter_path="flutter/lib/ui/account/account_screen.dart", flutter_anchor="class AccountScreen",
    old="从头像/关于进入，退出后 toast", new="信息大体映射，退出成功静默", priority="P1",
)
ui_entry(
    "DIALOG.ACCOUNT_ACTIONS", "账户", "注销与重置动作选择",
    scenario="SC-ACCOUNT-01", legacy_path="react/src/sheets/AccountScreen.tsx", legacy_anchor="注销后账号数据将从服务器永久删除",
    flutter_path="flutter/lib/ui/account/account_screen.dart", flutter_anchor="Future<void> _accountActions",
    old="第三动作是标题右上弱化链接", new="三个普通 action 同列", priority="P1",
)
ui_entry(
    "DIALOG.ACCOUNT_RESET_CONFIRM", "账户", "仅重置本地数据确认",
    scenario="SC-RESET-01", legacy_path="react/src/sheets/AccountScreen.tsx", legacy_anchor="重置本地数据",
    flutter_path="flutter/lib/ui/account/account_screen.dart", flutter_anchor="确定重置本地数据？",
    old="统一 ask 宿主、固定文案与 reload", new="AlertDialog 文案和完成表现不同", priority="P1",
)
ui_entry(
    "DIALOG.ACCOUNT_DELETE_FINAL", "账户", "注销额外最后确认",
    scenario="SC-ACCOUNT-01", legacy_path="react/src/sheets/AccountScreen.tsx", legacy_anchor="注销后账号数据将从服务器永久删除",
    flutter_path="flutter/lib/ui/account/account_screen.dart", flutter_anchor="最后确认",
    old="首次注销确认即最终确认", new="又增加一层最后确认", status="flutter_extra", priority="P1",
)
ui_entry(
    "SUBPAGE.PREMIUM", "Premium", "Premium 购买/已开通子页",
    scenario="SC-UI-MINE", legacy_path="react/src/sheets/PremiumScreen.tsx", legacy_anchor="PremiumScreen",
    flutter_path="flutter/lib/ui/mine/premium_screen.dart", flutter_anchor="class PremiumScreen",
    old="已开通仍维持购买页和可点购买", new="改为已解锁并禁用购买，入口/文案/布局不同", priority="P0",
)
ui_entry(
    "DISCLOSURE.PREMIUM_REDEEM", "Premium", "兑换码折叠与反馈",
    scenario="SC-UI-MINE", legacy_path="react/src/sheets/PremiumScreen.tsx", legacy_anchor="兑换码",
    flutter_path="flutter/lib/ui/mine/premium_screen.dart", flutter_anchor="兑换码",
    old="展开、错误码、成功与重进有固定状态", new="逻辑相近但布局/反馈不同", priority="P1",
)
ui_entry(
    "DIALOG.PREMIUM_PAYMENT_NOTICE", "Premium", "购买提示弹窗",
    scenario="SC-UI-MINE", legacy_path="react/src/sheets/PremiumScreen.tsx", legacy_anchor="暂未开放真实支付",
    flutter_path="flutter/lib/ui/mine/premium_screen.dart", flutter_anchor="支付功能",
    old="完整购买说明文案", new="提示明显缩短", priority="P1",
)
ui_entry(
    "SUBPAGE.ABOUT", "法律与关于", "关于我们子页",
    scenario="SC-UI-MINE", legacy_path="react/src/sheets/AboutScreen.tsx", legacy_anchor="AboutScreen",
    flutter_path="flutter/lib/ui/mine/legal_screens.dart", flutter_anchor="class AboutScreen",
    old="真实 App 图标、可点邮箱、三协议与账户入口", new="savings 图标，邮箱静态，容器不同", priority="P1",
)
for legal_id, title, legacy_path, legacy_anchor in [
    ("SUBPAGE.PRIVACY", "隐私政策", "react/src/sheets/PrivacyScreen.tsx", "PrivacyScreen"),
    ("SUBPAGE.USER_AGREEMENT", "用户协议", "react/src/sheets/AgreementScreen.tsx", "AgreementScreen"),
    ("SUBPAGE.PREMIUM_TERMS", "会员服务协议", "react/src/sheets/TermsScreen.tsx", "TermsScreen"),
]:
    ui_entry(
        legal_id, "法律与关于", title, scenario="SC-UI-MINE", legacy_path=legacy_path,
        legacy_anchor=legacy_anchor, flutter_path="flutter/lib/ui/mine/legal_screens.dart",
        flutter_anchor="class LegalScreen", old="旧版自定义 subpage 与原文排版", new="异步 asset loader、Material 容器与排版不同；逐字内容仍需机器比较", priority="P0",
    )
ui_entry(
    "SUBPAGE.ARCHIVE", "档案库", "档案库全部状态",
    scenario="SC-UI-ARCH-BACKUP", legacy_path="react/src/sheets/DocsScreen.tsx", legacy_anchor="DocsScreen",
    flutter_path="flutter/lib/ui/mine/archive_screen.dart", flutter_anchor="class ArchiveScreen",
    old="文档/上传统一列表并点行内联预览，保存/分享/删除入口固定", new="上传在前、内置文档为 ExpansionTile，仅上传项可选", priority="P0",
)
ui_entry(
    "ACTION.ARCHIVE.BUILTIN_DOC", "档案库", "内置文档保存/删除",
    scenario="SC-ARCHIVE-01", legacy_path="react/src/sheets/DocsScreen.tsx", legacy_anchor="downloadArchiveFile",
    flutter_path="flutter/lib/ui/mine/archive_screen.dart", flutter_anchor="ExpansionTile",
    old="内置 Markdown 可保存和删除", new="没有这些动作", status="missing_in_flutter", priority="P0",
)
ui_entry(
    "PREVIEW.ARCHIVE.MARKDOWN", "档案库", "Markdown 渲染预览",
    scenario="SC-ARCHIVE-01", legacy_path="react/src/sheets/DocsScreen.tsx", legacy_anchor="dangerouslySetInnerHTML",
    flutter_path="flutter/lib/ui/mine/archive_screen.dart", flutter_anchor="SelectableText",
    old="渲染 Markdown HTML 结构", new="主要显示原始 SelectableText", priority="P0",
)
ui_entry(
    "PREVIEW.ARCHIVE.IMAGE", "档案库", "图片预览与长按提示",
    scenario="SC-ARCHIVE-01", legacy_path="react/src/sheets/DocsScreen.tsx", legacy_anchor="长按图片",
    flutter_path="flutter/lib/ui/mine/archive_screen.dart", flutter_anchor="Image.file",
    old="预览并提示长按保存，保留原 MIME", new="缺长按提示且部分图片 MIME 丢失", priority="P0",
)
ui_entry(
    "SUBPAGE.ARCHIVE_PDF", "档案库", "PDF 预览 surface",
    scenario="SC-ARCHIVE-01", legacy_path="react/src/sheets/DocsScreen.tsx", legacy_anchor="application/pdf",
    flutter_path="flutter/lib/ui/mine/archive_screen.dart", flutter_anchor="class ArchivePdfScreen",
    old="在档案页内联预览全部页", new="另开带页码/加载/错误的路由", status="flutter_extra", priority="P1",
)
ui_entry(
    "MENU.ARCHIVE_ACTIONS", "档案库", "档案三点动作菜单",
    scenario="SC-ARCHIVE-01", legacy_path="react/src/sheets/DocsScreen.tsx", legacy_anchor="保存",
    flutter_path="flutter/lib/ui/mine/archive_screen.dart", flutter_anchor="PopupMenuButton",
    old="行内保存/删除，预览区分享", new="上传项新增三点 PopupMenu", status="flutter_extra", priority="P1",
)
ui_entry(
    "DIALOG.ARCHIVE_DELETE", "档案库", "档案删除确认与反馈",
    scenario="SC-ARCHIVE-01", legacy_path="react/src/sheets/DocsScreen.tsx", legacy_anchor='toast("已删除")',
    flutter_path="flutter/lib/ui/mine/archive_screen.dart", flutter_anchor="title: const Text('删除文件')",
    old="上传和内置文档均支持，成功 toast", new="只支持上传，成功静默", priority="P0",
)
ui_entry(
    "SUBPAGE.BACKUP", "云备份", "云备份全部状态",
    scenario="SC-UI-ARCH-BACKUP", legacy_path="react/src/sheets/BackupScreen.tsx", legacy_anchor="BackupScreen",
    flutter_path="flutter/lib/ui/mine/backup_screen.dart", flutter_anchor="class BackupScreen",
    old="加载/空/列表，恢复删除行内按钮", new="三点菜单，新增 retry，进度和反馈不同", priority="P0",
)
ui_entry(
    "MENU.BACKUP_ACTIONS", "云备份", "备份三点动作菜单",
    scenario="SC-BACKUP-01", legacy_path="react/src/sheets/BackupScreen.tsx", legacy_anchor="恢复",
    flutter_path="flutter/lib/ui/mine/backup_screen.dart", flutter_anchor="PopupMenuButton",
    old="恢复/删除行内按钮", new="多一步 PopupMenu", status="flutter_extra", priority="P1",
)
ui_entry(
    "DIALOG.BACKUP_RESTORE", "云备份", "云恢复确认/进度/反馈",
    scenario="SC-BACKUP-01", legacy_path="react/src/sheets/BackupScreen.tsx", legacy_anchor="恢复这条备份？",
    flutter_path="flutter/lib/ui/mine/backup_screen.dart", flutter_anchor="恢复这条备份？",
    old="统一确认、固定恢复进度与反馈", new="进度呈现和文案不同", priority="P0",
)
ui_entry(
    "DIALOG.BACKUP_DELETE", "云备份", "云备份删除确认/反馈",
    scenario="SC-BACKUP-01", legacy_path="react/src/sheets/BackupScreen.tsx", legacy_anchor="删除这条备份记录？",
    flutter_path="flutter/lib/ui/mine/backup_screen.dart", flutter_anchor="删除这条备份记录？",
    old="成功显示已删除", new="成功无相同反馈", priority="P1",
)
ui_entry(
    "DIALOG.LOCAL_IMPORT_OVERWRITE", "导入与恢复", "本地导入覆盖确认",
    scenario="SC-DATA-02", legacy_path="www/index.html", legacy_anchor='ask("导入覆盖", msg, function () {',
    flutter_path="flutter/lib/ui/mine/mine_tab.dart", flutter_anchor="债务和档案",
    old="按 legacy array/new object 与实际覆盖数量动态说明", new="统一写债务和档案", priority="P1",
)


# AI UI surfaces.
ui_entry(
    "SUBPAGE.AI", "AI 顾问", "AI 主页面全部状态",
    scenario="SC-UI-AI", legacy_path="react/src/sheets/AiScreen.tsx", legacy_anchor="AiScreen",
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor="class AiScreen",
    old="Enter 发送/Shift+Enter 换行，空发送 toast，本地额度快路径，used/left 文案和动画固定", new="Enter 只换行、空发送静默、额度条口径与动效不同", priority="P0",
)
ui_entry(
    "ACTION.AI.NEW_CONVERSATION", "AI 顾问", "主页面新对话按钮",
    scenario="SC-UI-AI", legacy_path="react/src/sheets/AiScreen.tsx", legacy_anchor="新对话",
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor="Icons.add_comment_outlined",
    old="新对话入口只在历史 sheet 内", new="AppBar 增加常驻入口", status="flutter_extra", priority="P1",
)
ui_entry(
    "SHEET.AI_HISTORY", "AI 顾问", "AI 历史底部抽屉",
    scenario="SC-UI-AI", legacy_path="react/src/sheets/AiScreen.tsx", legacy_anchor='id="aiHistorySheet"',
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor="Future<void> _showHistory() async",
    old="显示时间+消息数，sheet 内有新对话，scrim/back 层级固定", new="仅显示时间，新对话入口移位，Material sheet", priority="P0",
)
ui_entry(
    "DIALOG.AI_HISTORY_DELETE", "AI 顾问", "删除历史会话确认与当前态清理",
    scenario="SC-AI-02", legacy_path="react/src/sheets/AiScreen.tsx", legacy_anchor="删除这条对话",
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor=".delete(item.id)",
    old="先确认；删除当前项同步清空当前会话", new="立即删除；当前画面和 id 仍保留", status="missing_in_flutter", priority="P0",
)
ui_entry(
    "DIALOG.AI_FIRST_ENTRY_EDUCATION", "AI 顾问", "首次进入额度说明",
    scenario="SC-AI-03", legacy_path="react/src/sheets/AiLimitModal.tsx", legacy_anchor="AiLimitModal",
    flutter_path=None, flutter_anchor=None, old="首次进入约 900ms 后展示一次额度与复制退路说明", new="完全没有", status="missing_in_flutter", priority="P0",
)
ui_entry(
    "DIALOG.AI_LIMIT_EXHAUSTED", "AI 顾问", "额度耗尽说明与复制",
    scenario="SC-AI-03", legacy_path="react/src/sheets/AiLimitModal.tsx", legacy_anchor="复制完整分析提示词",
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor="复制完整提示词",
    old="专用视觉、完整解释，复制后 modal 保留", new="短 AlertDialog，复制后立即关闭并 Snackbar", priority="P0",
)
ui_entry(
    "CHIPS.AI_SUGGESTIONS", "AI 顾问", "欢迎/追问建议 chips",
    scenario="SC-AI-01", legacy_path="react/src/sheets/AiScreen.tsx", legacy_anchor="suggestions",
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor="suggestions",
    old="只在最后完成回复后显示，动效/排版固定", new="状态大体映射但排版和动画不同", priority="P1",
)
ui_entry(
    "RENDERER.AI_MESSAGE", "AI 顾问", "AI 富文本段落/列表/粗体",
    scenario="SC-AI-01", legacy_path="react/src/sheets/AiScreen.tsx", legacy_anchor="parseAiBlocks",
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor="List<TextSpan> _inlineSpans(String text)",
    old="结构化 p/ul/ol，编号列表语义明确", new="按行拆块并做 bullet/粗体，编号列表语义和间距不同", priority="P1",
)
ui_entry(
    "SYS.CLIPBOARD.AI_PROMPT", "AI 顾问", "复制提示词反馈与弹窗状态",
    scenario="SC-AI-03", legacy_path="react/src/sheets/AiLimitModal.tsx", legacy_anchor="onCopy(): void;",
    flutter_path="flutter/lib/ui/ai/ai_screen.dart", flutter_anchor="Clipboard.setData",
    old="成功后弹窗保留，可继续阅读/再次复制", new="成功后立即关闭并 Snackbar", priority="P1",
)


# Dormant and release-only surfaces are explicitly classified instead of being
# mistaken for missing Flutter behavior.
add_entry(
    "INV-DORMANT-INFOTIP", "基准与完整性", "dormant_legacy", "未被调用的 legacy InfoTip",
    priority="P3", status="mapped_unverified", scenarios=["SC-SOURCE-01"],
    selectors=["legacy.react_source:react/src/shared/InfoTip.tsx"],
    legacy=[source("react/src/shared/InfoTip.tsx", "export function InfoTip")],
    flutter=[source("flutter/tool/parity/catalog.py", "INV-DORMANT-INFOTIP")],
    notes="全仓无调用点，不属于运行 surface；保留在静态源码清单中防止未来启用后漏审。",
)
add_entry(
    "INV-DEBUG-PREVIEW", "基准与完整性", "debug_only", "Debug preview 登录绕过",
    priority="P3", status="mapped_unverified", scenarios=["SC-RELEASE-01"],
    selectors=["flutter.file_sha:flutter/lib/main.dart@*"],
    legacy=[source("www/index.html", "loginGate")],
    flutter=[source("flutter/lib/main.dart", "AFTER_ZERO_PREVIEW")],
    notes="只允许 debug 对齐采集使用；release/profile 必须证明该绕过不可达。",
    acceptance="release/profile 构建即使传入 define 仍展示登录门，debug fixture 可显式绕过。",
)

ui_entry(
    "SYS.TYPOGRAPHY", "全局系统界面", "应用字体、数字等宽、字号与行距",
    scenario="SC-VISUAL-ALL", legacy_path="www/index.html", legacy_anchor="font-family",
    flutter_path="flutter/pubspec.yaml", flutter_anchor="NotoSansSC-wght.ttf",
    old="CSS 字体栈、tabular-nums、字号/行距/字距按组件固定", new="Noto 只作为 PDF asset，App 未注册同等字体族，Material typography 参与派生", priority="P0",
)


MISSING_ABSENCE_QUERIES: dict[str, list[dict[str, str]]] = {
    "INV-STO-004": [{"path_glob": "flutter/lib/**/*.dart", "regex": "after-zero-simulate-v1"}],
    "INV-STO-005": [{"path_glob": "flutter/lib/**/*.dart", "regex": "after-zero-ai-limit-notice-v1"}],
    "INV-DATA-004": [{"path_glob": "flutter/lib/data/*.dart", "regex": "premiumPlus"}],
    "INV-ACT-009": [{"path_glob": "flutter/lib/ui/mine/archive_screen.dart", "regex": "saveBuiltin|deleteBuiltin"}],
    "INV-ACT-010": [{"path_glob": "flutter/lib/data/archive_repository.dart", "regex": "\\.(?:heic|heif|bmp)"}],
    "INV-CLD-010": [{"path_glob": "flutter/lib/cloud/*.dart", "regex": "refreshSession|refreshAccessToken"}],
    "INV-NOT-002": [{"path_glob": "flutter/lib/main.dart", "regex": "reminderSchedulerProvider|reschedule\\("}],
    "INV-NOT-004": [{"path_glob": "flutter/lib/ui/pay/notify_screen.dart", "regex": "requestPermission\\("}],
    "INV-NAT-002": [{"path_glob": "flutter/android/app/src/main/kotlin/**/*.kt", "regex": "onSaveInstanceState|SavedStateHandle"}],
    "INV-AI-001": [{"path_glob": "flutter/lib/ui/ai/ai_screen.dart", "regex": "quotaExhaustedLocally"}],
    "INV-AI-002": [{"path_glob": "flutter/lib/ui/ai/ai_screen.dart", "regex": "retryCtx|retryContexts"}],
    "INV-AI-004": [{"path_glob": "flutter/lib/ui/ai/ai_screen.dart", "regex": "deleteCurrentConversation|clearCurrentAfterDelete"}],
    "SYS.REDUCED_MOTION": [{"path_glob": "flutter/lib/**/*.dart", "regex": "disableAnimations|accessibleNavigation"}],
    "SYS.OVERSCROLL": [{"path_glob": "flutter/lib/**/*.dart", "regex": "ScrollBehavior|OverscrollIndicatorNotification"}],
    "SYS.MAILTO": [{"path_glob": "flutter/lib/ui/mine/legal_screens.dart", "regex": "mailto:"}],
    "DIALOG.PREMIUM_INVITE.SETTLEMENT": [{"path_glob": "flutter/lib/**/*.dart", "regex": "SettleCelebration|还清一笔了"}],
    "DIALOG.EDITOR.BATCH_AMOUNT_WARNING": [{"path_glob": "flutter/lib/ui/debts/debt_editor.dart", "regex": "清空.*本金.*利息|确认.*批量.*金额"}],
    "DISCLOSURE.REPORT_RANK_REST": [{"path_glob": "flutter/lib/ui/report/report_tab.dart", "regex": "rankExpanded|展开其余"}],
    "POPOVER.REPORT_EXPORT": [{"path_glob": "flutter/lib/ui/report/report_tab.dart", "regex": "PopupMenuButton.*(?:Excel|PDF)|showMenu\\("}],
    "ACTION.ARCHIVE.BUILTIN_DOC": [{"path_glob": "flutter/lib/ui/mine/archive_screen.dart", "regex": "builtin.*(?:save|delete|share)"}],
    "DIALOG.AI_HISTORY_DELETE": [{"path_glob": "flutter/lib/ui/ai/ai_screen.dart", "regex": "确认.*删除.*对话|删除后无法恢复"}],
    "DIALOG.AI_FIRST_ENTRY_EDUCATION": [{"path_glob": "flutter/lib/**/*.dart", "regex": "AI_LIMIT_NOTICE|首次.*额度|AiLimitModal"}],
}

for missing_entry in ENTRIES:
    if missing_entry["status"] != "missing_in_flutter":
        continue
    missing_entry["absence_queries"] = MISSING_ABSENCE_QUERIES.get(missing_entry["id"], [])
semantic_entry(
    "INV-RELEASE-001", "发布与安装", "Android release 签名",
    scenario="SC-RELEASE-01", legacy_path="android/app/build.gradle", legacy_anchor="signingConfigs",
    flutter_path="flutter/android/app/build.gradle.kts", flutter_anchor="signingConfig = signingConfigs.getByName(\"debug\")",
    status="blocked_external", priority="P0", notes="当前所谓 release APK 仍是 debug 签名，不能做正式微信/升级验收。",
    legacy_behavior="旧版有既定 release keystore/签名流程。",
    flutter_behavior="release buildType 显式复用 debug signing。",
    resolution="按 release-keystore skill 接入最终签名，检查证书 SHA1、升级与微信登记。",
)
semantic_entry(
    "INV-RELEASE-002", "发布与安装", "Android manifest launchMode/allowBackup",
    scenario="SC-RELEASE-01", legacy_path="android/app/src/main/AndroidManifest.xml",
    legacy_anchor="android:allowBackup=\"false\"", flutter_path="flutter/android/app/src/main/AndroidManifest.xml",
    flutter_anchor="android:launchMode=\"singleTop\"", priority="P0",
    notes="任务栈、OAuth/SAF 回调、系统备份均可能产生可观察差异。",
    legacy_behavior="allowBackup=false，MainActivity singleTask。",
    flutter_behavior="manifest 没有同等 allowBackup，MainActivity singleTop。",
    resolution="逐字段对账 merged manifest，并用回调/后台/重启/系统备份场景验收。",
)
semantic_entry(
    "INV-IOS-001", "发布与安装", "iOS 构建与真机完整验证",
    scenario="SC-RELEASE-01", legacy_path="capacitor.config.json", legacy_anchor="appId",
    flutter_path="flutter/ios/Runner/Info.plist", flutter_anchor="CFBundleDisplayName",
    status="blocked_external", priority="P1", notes="用户明确当前暂缓 iOS；本阶段只能登记，不能宣称完成。",
    legacy_behavior="旧项目实际只运行 Android。",
    flutter_behavior="已有 iOS 工程但本机无完整 Xcode/CocoaPods，未构建、运行或验插件。",
    resolution="用户恢复 iOS 工作后安装工具链，执行模拟器+真机全矩阵并单独审核平台差异。",
)


FIXTURE_DESCRIPTIONS: dict[str, str] = {}


def describe(ids: list[str], prefix: str) -> None:
    for fixture_id in ids:
        FIXTURE_DESCRIPTIONS[fixture_id] = f"{prefix}（{fixture_id}）"


TIME_FIXTURES = [f"FX-T{i:02d}" for i in range(10)]
DEBT_FIXTURES = [f"FX-D{i:02d}" for i in range(13)]
ACCOUNT_FIXTURES = [f"FX-A{i:02d}" for i in range(6)]
PREMIUM_FIXTURES = [f"FX-P{i:02d}" for i in range(5)]
STORAGE_FIXTURES = [f"FX-S{i:02d}" for i in range(6)]
NOTIFY_FIXTURES = [f"FX-N{i:02d}" for i in range(7)]
ARCHIVE_FIXTURES = [f"FX-R{i:02d}" for i in range(6)]
BACKUP_FIXTURES = [f"FX-B{i:02d}" for i in range(6)]
AI_FIXTURES = [f"FX-I{i:02d}" for i in range(6)]
ERROR_FIXTURES = [f"FX-E{i:02d}" for i in range(10)]
WECHAT_FIXTURES = [f"FX-WX{i:02d}" for i in range(4)]
PERMISSION_FIXTURES = [f"FX-PM{i:02d}" for i in range(5)]
VISUAL_FIXTURES = ["FX-V-LIGHT", "FX-V-DARK", "FX-V-SWITCH"]
VIEWPORT_FIXTURES = [
    "FX-VP-320x640", "FX-VP-360x800", "FX-VP-393x852", "FX-VP-412x915",
    "FX-VP-560x900", "FX-VP-720x1024", "FX-VP-800x360",
]
TEXT_SCALE_FIXTURES = ["FX-TS-1.0", "FX-TS-1.3", "FX-TS-2.0"]
INSET_FIXTURES = [
    "FX-INSET-NONE", "FX-INSET-NOTCH", "FX-INSET-3BUTTON",
    "FX-INSET-GESTURE", "FX-INSET-KEYBOARD",
]
MOTION_FIXTURES = ["FX-MOTION-NORMAL", "FX-MOTION-REDUCE"]

# These IDs have an authored storage payload whose contents actually match the
# description. Every other ID is deliberately a case specification until its
# state/network/native/device driver exists; inheriting fixtures/base.json does
# not make a case executable.
MATERIALIZED_STORAGE_FIXTURES = {
    "FX-A00", "FX-A02", "FX-D00", "FX-I00", "FX-N00", "FX-P00",
    "FX-P02", "FX-R00", "FX-R01", "FX-S00", "FX-S01",
}

describe(TIME_FIXTURES, "固定时钟、跨日/月/年/闰年/DST/边界")
describe(DEBT_FIXTURES, "债务计划、舍入、还款、结清、排序、坏数据与长内容")
describe(ACCOUNT_FIXTURES, "账户与 CloudBase session 组合")
describe(PREMIUM_FIXTURES, "Premium 正常、历史与迁移状态")
describe(STORAGE_FIXTURES, "持久化缺失、完整、损坏、旧版、写盘与重置状态")
describe(NOTIFY_FIXTURES, "通知开关、规则、权限、边界和重排状态")
describe(ARCHIVE_FIXTURES, "档案类型、尺寸、损坏与预览状态")
describe(BACKUP_FIXTURES, "云备份列表、配额、恢复和错误状态")
describe(AI_FIXTURES, "AI quota、历史、建议、错误和大计划状态")
describe(ERROR_FIXTURES, "网络成功、离线、超时、HTTP、畸形和并发响应")
describe(WECHAT_FIXTURES, "微信安装、授权、state、取消和回调状态")
describe(PERMISSION_FIXTURES, "通知、exact alarm、picker、SAF 与分享平台状态")
describe(VISUAL_FIXTURES, "明暗主题与运行中主题切换")
describe(VIEWPORT_FIXTURES, "固定 viewport 尺寸")
describe(TEXT_SCALE_FIXTURES, "系统字体缩放")
describe(INSET_FIXTURES, "安全区、系统导航与键盘 inset")
describe(MOTION_FIXTURES, "正常动画与减少动态效果")

FIXTURE_DESCRIPTIONS.update(
    {
        "FX-T00": "2026-08-10 09:00:00 Asia/Shanghai 基准时钟",
        "FX-T01": "23:59:59→00:00:00→00:00:01，覆盖今天/逾期/已错过规则",
        "FX-T02": "2026-12-31→2027-01-01，覆盖跨月跨年",
        "FX-T03": "2028-02-28/29→03-01，覆盖闰年",
        "FX-T04": "首期和逐期日期 28/29/30/31，覆盖重复日期限制与月份溢出",
        "FX-T05": "与基准同一绝对时刻但 timezone=UTC",
        "FX-T06": "America/New_York 2026 春季 DST 前后",
        "FX-T07": "America/New_York 2026 秋季 DST 前后",
        "FX-T08": "通知窗口最后一刻/恰好6个月/超出1秒及第450/451条",
        "FX-T09": "北京时间月末 23:59:59→次月00:00:00，覆盖 AI 月额度",
        "FX-D00": "空债务数组",
        "FX-D01": "五笔标准债务：amort/equalprincipal/equalfee/interestfirst/custom",
        "FX-D02": "500元0%9期、100元36%210期、1分本金、超大金额、n=1 等舍入极端",
        "FX-D03": "未还、少于利息、超过利息但不足、差0.005、足额、超额、旧 paid 无 paidAmount",
        "FX-D04": "最后一期、提前结清等于本金/多付/负利息减免、settleStash 与撤销",
        "FX-D05": "一次性、气球尾款、变额期次、不规律日期及逐期29–31日",
        "FX-D06": "到期差 -1/0/3/4/7/8/14/15/30/31 且同债务多期同窗",
        "FX-D07": "7种类型、多笔同日同名、active/settled 混合，供报告折叠与 Hero 合并",
        "FX-D08": "所有排序字段含 tie，settled 穿插 active 槽位",
        "FX-D09": "历史数据缺 id/plan/gen/派生字段，含空 id 与过期派生值",
        "FX-D10": "空 plan、全 paid、余额0未 settled、无效日期、缺字段和错误类型",
        "FX-D11": "60年期、中文/Latin/emoji、超长债务名与 Markdown/HTML 特殊备注",
        "FX-D12": "451 个有效提醒组合且含相同触发时间",
        "FX-A00": "account/session 均不存在",
        "FX-A01": "只有匿名 CloudBase session",
        "FX-A02": "account + 未过期正式 session",
        "FX-A03": "account/session 单边缺失及匿名标记矛盾组合",
        "FX-A04": "正式 session 恰到期/过期1秒/缺 refresh token/损坏 JSON",
        "FX-A05": "空/超长昵称头像、有效头像、404 与超时头像",
        "FX-P00": "{premium:null}",
        "FX-P01": "onetime Premium",
        "FX-P02": "redeemed Premium",
        "FX-P03": "历史 monthly/yearly method",
        "FX-P04": "只有 legacy premiumPlus.startedAt",
        "FX-S00": "所有持久化 key 缺失",
        "FX-S01": "所有 key 为有效完整状态",
        "FX-S02": "每个 key 分别为截断 JSON、错误顶层/字段类型和空串",
        "FX-S03": "旧版 v6 JSON、原始债务数组、缺 debts/docs/uploads 对象",
        "FX-S04": "写盘成功/false/延迟，写盘中立即杀进程",
        "FX-S05": "债务/排序/SIM/AI/session/device/archive 同时存在用于重置",
        "FX-N00": "通知 disabled 且无规则",
        "FX-N01": "通知 enabled 且无规则",
        "FX-N02": "offset 0/1/2/3，时间00:00/09:00/23:59",
        "FX-N03": "重复规则、相同触发时间和已过去规则",
        "FX-N04": "第450/451条和6个月边界",
        "FX-N05": "非法 offset/time 与损坏持久化",
        "FX-N06": "已排通知后修改债务、导入、恢复与重置",
        "FX-R00": "空档案",
        "FX-R01": "legacy Markdown 内置文档",
        "FX-R02": "JPG/JPEG/PNG/GIF/WebP/HEIC/HEIF/BMP/PDF/MD/markdown/DOC/DOCX",
        "FX-R03": "0B/1B/8MB−1/8MB/8MB+1、长中文文件名与空 MIME",
        "FX-R04": "元数据存在但字节丢失、损坏图片/PDF、重复 id/name",
        "FX-R05": "多页 PDF、超大图片与不可内嵌 Word",
        "FX-B00": "无云备份记录",
        "FX-B01": "一条含 debts/docs/notify/premium/files 的完整记录",
        "FX-B02": "20/21条记录及300MB边界",
        "FX-B03": "历史备份缺字段/临时URL，文件顺序不同",
        "FX-B04": "上传第N个失败、upload完成/create失败、下载中途失败",
        "FX-B05": "不存在/他人 backupId 与删除文件失败",
        "FX-I00": "无额度缓存、无历史",
        "FX-I01": "当前月 used=0/49/50、旧月份与损坏 quota",
        "FX-I02": "0/1/12/13/40/41消息、0/50/51会话与重复id",
        "FX-I03": "建议 marker 正常/缺失、各种 bullet、2/3/4建议、空/富文本/长回复",
        "FX-I04": "首次失败、旧消息失败后继续、重试、切会话/新对话/删除时请求在途",
        "FX-I05": "无 active 债务；大量已还+完整未还计划用于 compact/full prompt",
        "FX-E00": "所有网络请求成功",
        "FX-E01": "offline/SocketException/DNS/TLS失败",
        "FX-E02": "连接与响应 timeout",
        "FX-E03": "HTTP 400 JSON 与纯文本 body",
        "FX-E04": "HTTP 401 session expired",
        "FX-E05": "HTTP 403 EXCEED_AUTHORITY",
        "FX-E06": "QUOTA_EXCEEDED/429",
        "FX-E07": "HTTP 500/502/503",
        "FX-E08": "200空 body、错误顶层、缺字段与无效 JSON",
        "FX-E09": "两请求延迟倒序完成及重复回调",
        "FX-WX00": "微信已安装/注册成功/state正确/授权成功",
        "FX-WX01": "微信未安装/注册失败/无法拉起",
        "FX-WX02": "用户取消/拒绝/code为空",
        "FX-WX03": "state不匹配/超时/重复回调/旧code重试",
        "FX-PM00": "通知权限未询问/允许/拒绝/永久拒绝",
        "FX-PM01": "exact alarm 允许/拒绝",
        "FX-PM02": "picker 取消/只返回URI/字节读取失败",
        "FX-PM03": "SAF成功/取消/无handler/只读URI/磁盘满/Activity重建/并发",
        "FX-PM04": "分享无接收方、返回与杀进程",
        "FX-V-LIGHT": "系统亮色主题",
        "FX-V-DARK": "系统暗色主题",
        "FX-V-SWITCH": "App 前台运行时亮色↔暗色切换",
        "FX-MOTION-NORMAL": "正常动画与手势关键帧",
        "FX-MOTION-REDUCE": "系统减少动态效果开启",
    }
)


TIME_OVERRIDES = {
    "FX-T00": ("2026-08-10T09:00:00+08:00", "Asia/Shanghai"),
    "FX-T01": ("2026-08-10T23:59:59+08:00", "Asia/Shanghai"),
    "FX-T02": ("2026-12-31T23:59:59+08:00", "Asia/Shanghai"),
    "FX-T03": ("2028-02-28T23:59:59+08:00", "Asia/Shanghai"),
    "FX-T04": ("2026-01-28T09:00:00+08:00", "Asia/Shanghai"),
    "FX-T05": ("2026-08-10T01:00:00+00:00", "UTC"),
    "FX-T06": ("2026-03-08T01:59:59-05:00", "America/New_York"),
    "FX-T07": ("2026-11-01T01:59:59-04:00", "America/New_York"),
    "FX-T08": ("2026-08-10T09:00:00+08:00", "Asia/Shanghai"),
    "FX-T09": ("2026-08-31T23:59:59+08:00", "Asia/Shanghai"),
}


def fixture_state_file(fixture_id: str) -> str:
    if fixture_id in {"FX-S02", "FX-N05"}:
        return "fixtures/corrupt.json"
    if fixture_id in {"FX-S00", "FX-A00", "FX-I00"}:
        return "fixtures/empty.json"
    return "fixtures/base.json"


def fixture_overlay(fixture_id: str) -> dict[str, Any]:
    overlay: dict[str, Any] = {"artifacts": {"fixture_profile": fixture_id}}
    if fixture_id == "FX-D00":
        overlay.update(
            {
                "legacy": {"localStorage": {"debt-manager-v5": []}},
                "flutter": {"sharedPreferences": {"debt-manager-v5": []}},
            }
        )
    elif fixture_id == "FX-P00":
        value = {"premium": None}
        overlay.update(
            {
                "legacy": {"localStorage": {"after-zero-premium-v1": value}},
                "flutter": {"sharedPreferences": {"after-zero-premium-v1": value}},
            }
        )
    elif fixture_id == "FX-N00":
        value = {"enabled": False, "rules": []}
        overlay.update(
            {
                "legacy": {"localStorage": {"after-zero-notify-v1": value}},
                "flutter": {"sharedPreferences": {"after-zero-notify-v1": value}},
            }
        )
    elif fixture_id == "FX-R00":
        overlay.update(
            {
                "legacy": {"localStorage": {"debt-manager-docs-v5": []}},
                "flutter": {
                    "sharedPreferences": {
                        "debt-manager-docs-v5": [],
                        "after-zero-archive-files-v1": [],
                    }
                },
            }
        )
    return overlay


def required_drivers(fixture_id: str) -> list[str]:
    drivers = ["deterministic_clock"]
    if fixture_id in MATERIALIZED_STORAGE_FIXTURES:
        drivers.extend(["legacy_local_storage_seed", "flutter_shared_preferences_seed"])
    if fixture_id.startswith("FX-T"):
        drivers.append("clock_boundary_sequence")
    elif fixture_id.startswith("FX-D"):
        drivers.append("debt_state_generator")
    elif fixture_id.startswith("FX-A"):
        drivers.append("account_session_state_generator")
    elif fixture_id.startswith("FX-P") and not fixture_id.startswith("FX-PM"):
        drivers.append("premium_state_generator")
    elif fixture_id.startswith("FX-S"):
        drivers.append("storage_fault_driver")
    elif fixture_id.startswith("FX-N"):
        drivers.extend(["notification_state_generator", "notification_os_driver"])
    elif fixture_id.startswith("FX-R"):
        drivers.append("archive_artifact_generator")
    elif fixture_id.startswith("FX-B"):
        drivers.extend(["backup_state_generator", "cloudbase_stub_driver"])
    elif fixture_id.startswith("FX-I"):
        drivers.extend(["ai_state_generator", "ai_network_stub_driver"])
    elif fixture_id.startswith("FX-E"):
        drivers.append("network_fault_driver")
    elif fixture_id.startswith("FX-WX"):
        drivers.append("wechat_oauth_device_driver")
    elif fixture_id.startswith("FX-PM"):
        drivers.append("android_permission_lifecycle_driver")
    elif fixture_id.startswith("FX-VP"):
        drivers.append("viewport_driver")
    elif fixture_id.startswith("FX-TS"):
        drivers.append("text_scale_driver")
    elif fixture_id.startswith("FX-INSET"):
        drivers.append("window_inset_driver")
    elif fixture_id.startswith("FX-MOTION"):
        drivers.append("reduced_motion_driver")
    elif fixture_id.startswith("FX-V"):
        drivers.append("theme_driver")
    return sorted(set(drivers))


def build_fixtures() -> list[dict[str, Any]]:
    all_ids = sorted(FIXTURE_DESCRIPTIONS)
    fixtures: list[dict[str, Any]] = []
    for fixture_id in all_ids:
        frozen_now, timezone = TIME_OVERRIDES.get(
            fixture_id, ("2026-08-10T09:00:00+08:00", "Asia/Shanghai")
        )
        seed = int(hashlib.sha256(fixture_id.encode()).hexdigest()[:8], 16) or 1
        profiles: dict[str, Any] = {
            "data_profile": fixture_id,
            "network": fixture_id if fixture_id.startswith("FX-E") else "offline_by_default",
            "native": fixture_id if fixture_id.startswith(("FX-PM", "FX-WX")) else "no_permissions_by_default",
            "theme": "dark" if fixture_id == "FX-V-DARK" else "light",
            "text_scale": float(fixture_id.removeprefix("FX-TS-")) if fixture_id.startswith("FX-TS-") else 1.0,
        }
        if fixture_id.startswith("FX-VP-"):
            width, height = fixture_id.removeprefix("FX-VP-").split("x")
            profiles["viewport"] = {"width": int(width), "height": int(height)}
        else:
            profiles["viewport"] = {"width": 393, "height": 852}
        fixtures.append(
            {
                "id": fixture_id,
                "description": FIXTURE_DESCRIPTIONS[fixture_id],
                "state_file": fixture_state_file(fixture_id),
                "overlay": fixture_overlay(fixture_id),
                "storage_status": (
                    "materialized"
                    if fixture_id in MATERIALIZED_STORAGE_FIXTURES
                    else "case_spec_only"
                ),
                "driver_status": "partial" if fixture_id in MATERIALIZED_STORAGE_FIXTURES else "pending",
                "implemented_drivers": (
                    ["legacy_local_storage_seed", "flutter_shared_preferences_seed"]
                    if fixture_id in MATERIALIZED_STORAGE_FIXTURES
                    else []
                ),
                "required_drivers": required_drivers(fixture_id),
                "frozen_now": frozen_now,
                "timezone": timezone,
                "locale": "zh-CN",
                "random_seed": seed,
                "profiles": profiles,
            }
        )
    return fixtures


SCENARIO_FIXTURES: dict[str, list[str]] = {
    "SC-SOURCE-01": ["FX-T00"],
    "SC-CALC-01": TIME_FIXTURES + DEBT_FIXTURES,
    "SC-CALC-02": ["FX-T00", "FX-T04", "FX-D01", "FX-D02"],
    "SC-DEBT-01": ["FX-T00", "FX-D03", "FX-D04"],
    "SC-DEBT-02": ["FX-D04", "FX-D08"],
    "SC-EDIT-01": ["FX-T04", "FX-D01", "FX-D02"],
    "SC-EDIT-02": ["FX-D03", "FX-D05"],
    "SC-DATA-01": STORAGE_FIXTURES + ["FX-D09", "FX-D10", "FX-P03", "FX-P04"],
    "SC-DATA-02": ["FX-S03", "FX-R02", "FX-R04"],
    "SC-DATA-03": ["FX-S04"],
    "SC-RESET-01": ["FX-S05"],
    "SC-PAY-01": TIME_FIXTURES[1:8] + ["FX-D06"],
    "SC-PAY-02": ["FX-D05", "FX-D06"],
    "SC-SORT-01": ["FX-D08", "FX-S01"],
    "SC-REPORT-01": ["FX-T02", "FX-T03", "FX-D00", "FX-D03", "FX-D04", "FX-D07"],
    "SC-REPORT-02": ["FX-D02", "FX-D07", "FX-D11"],
    "SC-AUTH-01": ["FX-A00", "FX-WX00", "FX-E00"],
    "SC-AUTH-02": WECHAT_FIXTURES[1:] + ERROR_FIXTURES[1:9],
    "SC-SESSION-01": ACCOUNT_FIXTURES[2:] + ["FX-E04"],
    "SC-ACCOUNT-01": ["FX-A02", "FX-A05"] + PREMIUM_FIXTURES,
    "SC-AI-01": ["FX-I00", "FX-I03", "FX-I05", "FX-E00"],
    "SC-AI-02": ["FX-I02", "FX-I04", "FX-E01", "FX-E09"],
    "SC-AI-03": ["FX-T09", "FX-I01", "FX-E06"],
    "SC-BACKUP-01": ["FX-B00", "FX-B01", "FX-R02", "FX-E00"],
    "SC-BACKUP-02": ["FX-B02", "FX-B04", "FX-B05"] + ERROR_FIXTURES[1:9],
    "SC-NOTIFY-01": TIME_FIXTURES + ["FX-D06", "FX-D12"] + NOTIFY_FIXTURES[:6],
    "SC-NOTIFY-02": NOTIFY_FIXTURES[:4] + ["FX-PM00", "FX-PM01"],
    "SC-NOTIFY-03": ["FX-N06", "FX-T05", "FX-T06", "FX-T07", "FX-T08"],
    "SC-ARCHIVE-01": ARCHIVE_FIXTURES + ["FX-PM02"],
    "SC-FILE-01": ["FX-R02", "FX-R03", "FX-PM03", "FX-PM04"],
    "SC-EXPORT-01": ["FX-S03", "FX-R02"],
    "SC-EXPORT-02": ["FX-D00", "FX-D03", "FX-D04", "FX-D07"],
    "SC-UI-LOGIN": ACCOUNT_FIXTURES + VISUAL_FIXTURES,
    "SC-UI-DEBT": ["FX-D00", "FX-D07", "FX-D08", "FX-D11"] + VISUAL_FIXTURES,
    "SC-UI-DETAIL-EDIT": ["FX-D01", "FX-D03", "FX-D04", "FX-D11"] + VISUAL_FIXTURES,
    "SC-UI-PAY-NOTIFY": ["FX-D06"] + NOTIFY_FIXTURES + VISUAL_FIXTURES,
    "SC-UI-REPORT": ["FX-D00", "FX-D07", "FX-D11"] + VISUAL_FIXTURES,
    "SC-UI-MINE": ["FX-A02", "FX-A05"] + PREMIUM_FIXTURES + VISUAL_FIXTURES,
    "SC-UI-ARCH-BACKUP": ARCHIVE_FIXTURES + BACKUP_FIXTURES + VISUAL_FIXTURES,
    "SC-UI-AI": AI_FIXTURES + VISUAL_FIXTURES,
    "SC-VISUAL-ALL": VISUAL_FIXTURES + VIEWPORT_FIXTURES + TEXT_SCALE_FIXTURES + INSET_FIXTURES + MOTION_FIXTURES,
    "SC-LIFE-01": ["FX-E09", "FX-PM02", "FX-PM03", "FX-PM04", "FX-A04", "FX-I04"],
    "SC-RELEASE-01": ["FX-WX00", "FX-PM00", "FX-PM01", "FX-PM03", "FX-PM04"],
}


SCENARIO_TITLES = {
    "SC-SOURCE-01": "静态源码、文案、事件、依赖与测试清单门禁",
    "SC-CALC-01": "57 个 JS 导出函数与 Dart 的真实 differential runner",
    "SC-CALC-02": "五种计划生成边界与固定 seed 穷举",
    "SC-DEBT-01": "部分还款→补齐→减免→结清→撤销完整账本链",
    "SC-DEBT-02": "编辑/恢复/删除已结清债务与槽位",
    "SC-EDIT-01": "五种生成器与逐期编辑保存",
    "SC-EDIT-02": "oneTime、批量修改、警告与 controller 同步",
    "SC-DATA-01": "所有 key 的缺失、损坏、旧形状与冷启动",
    "SC-DATA-02": "旧 v6/raw-array 本地备份双向导入",
    "SC-DATA-03": "写操作后立即 force-stop 的 durable-write 验证",
    "SC-RESET-01": "仅重置本地数据后的全 key/文件/通知清理",
    "SC-PAY-01": "下一期与累计窗口、阈值和 DST",
    "SC-PAY-02": "同日 Hero、左滑、禁跳期与部分还款",
    "SC-SORT-01": "预设/非法/自定义拖拽与 settled 槽位",
    "SC-REPORT-01": "统计 KPI、findings 与所有数据分区",
    "SC-REPORT-02": "Journey/Pressure/TypePie 与策略交互",
    "SC-AUTH-01": "真实微信→票据→正式 session→冷启动",
    "SC-AUTH-02": "微信与认证每个失败点",
    "SC-SESSION-01": "正式 session 过期、刷新与前后台",
    "SC-ACCOUNT-01": "退出、兑换、注销和本地数据保留",
    "SC-AI-01": "欢迎、报告、问答、建议与完整复制",
    "SC-AI-02": "历史、删除、并发、失败与按消息重试",
    "SC-AI-03": "北京月额度、首次说明与耗尽退路",
    "SC-BACKUP-01": "创建、列表、整体恢复与删除 happy path",
    "SC-BACKUP-02": "配额、并发及各阶段失败原子性",
    "SC-NOTIFY-01": "通知纯调度 differential",
    "SC-NOTIFY-02": "通知设置、权限、exact alarm 与测试通知",
    "SC-NOTIFY-03": "冷启动、重启、时区、升级后的通知重排",
    "SC-ARCHIVE-01": "所有档案类型、尺寸、损坏与预览操作",
    "SC-FILE-01": "SAF、分享、取消、并发与 Activity 重建",
    "SC-EXPORT-01": "本地 JSON 字节/schema 与双向导入",
    "SC-EXPORT-02": "XLSX 逐 cell 与 PDF 逐页渲染比较",
    "SC-UI-LOGIN": "登录门全部 UI 状态",
    "SC-UI-DEBT": "债务主页、排序、左滑与 jiggle 全状态",
    "SC-UI-DETAIL-EDIT": "详情、编辑器、输入、键盘和弹窗全状态",
    "SC-UI-PAY-NOTIFY": "还款日与通知设置全状态",
    "SC-UI-REPORT": "统计报告各图表默认/交互状态",
    "SC-UI-MINE": "我的、账户、Premium、法律与关于",
    "SC-UI-ARCH-BACKUP": "档案与云备份空/列表/加载/错误状态",
    "SC-UI-AI": "AI welcome/thinking/reveal/error/history/quota",
    "SC-VISUAL-ALL": "全部 checkpoint 的主题/viewport/字体/inset/动效矩阵",
    "SC-LIFE-01": "OAuth/AI/备份/picker/SAF 在途生命周期",
    "SC-RELEASE-01": "release 证书、manifest、安装升级与原生能力",
}

SCENARIO_STEPS = {
    "SC-SOURCE-01": "扫描旧版/Flutter 的文件SHA、UI文案、事件、导航、存储、bridge、依赖与测试；与冻结 inventory 比较并检查零未分类项。",
    "SC-CALC-01": "对57个JS导出函数和Dart对应函数逐个输入相同canonical fixture，记录返回值、异常类型和入参mutation；重复两次。",
    "SC-CALC-02": "遍历五种genPlan全参数边界，并对免息/高息长期/末期零头做固定seed组合扫描。",
    "SC-DEBT-01": "依次部分还、补齐、减免、最后一期、提前结清和撤销；每步冷读完整Debt/PlanRow。",
    "SC-DEBT-02": "编辑已结清债务名称/计划，拖拽active、恢复、删除，再冷启动核对状态与槽位。",
    "SC-EDIT-01": "新增并遍历五种生成器，切换kind返回、生成后逐行修改、保存、重新进入。",
    "SC-EDIT-02": "切换oneTime，批量改本金/利息/金额/日期，以相同key重新生成，核对警告、controller显示和保存值。",
    "SC-DATA-01": "逐key注入缺失/完整/损坏/历史形状，冷启动并记录加载状态、回退、错误和迁移结果。",
    "SC-DATA-02": "分别导入v6对象和raw array，导出后互喂旧版/Flutter，比较业务状态与附件字节。",
    "SC-DATA-03": "每种写操作后在成功反馈前后不同毫秒force-stop，重启读取持久化并记录写失败。",
    "SC-RESET-01": "触发仅重置本地数据，force-stop后重启，枚举全部prefs、档案、session、device、AI、SIM和通知。",
    "SC-PAY-01": "依次选择下一期/逾期/7/15/30天/自定义日期，跨午夜和DST比较逐期集合、顺序、金额与标签。",
    "SC-PAY-02": "检查同日Hero合并，横纵滑动首期/非首期，部分还款并切tab返回。",
    "SC-SORT-01": "选择每个预设和非法值，长按拖拽成自定义，再拖回预设顺序并冷启动。",
    "SC-REPORT-01": "打开空/active/settled/跨年报告，提取KPI、findings、timeline、pressure、rank、type和outro。",
    "SC-REPORT-02": "按不等日期拖Journey，切换并点击Pressure两模式，旋转TypePie，运行雪崩/雪球/自定义策略。",
    "SC-AUTH-01": "从登录门点击微信，完成匿名垫底、wxLogin、custom session，force-stop后恢复并调用受保护函数。",
    "SC-AUTH-02": "在微信安装/注册/拉起/cancel/state/code及每个HTTP/JSON失败点触发登录并重试。",
    "SC-SESSION-01": "在前台、后台和冷启动分别跨过expiry，随后调用AI/备份，记录refresh、401、重试和UI。",
    "SC-ACCOUNT-01": "验证退出、兑换、注销取消/失败/成功与重置，逐项比较本地/服务器数据保留。",
    "SC-AI-01": "从欢迎快捷项发送报告/问答，解析追问建议，点击建议并复制完整外部AI提示词。",
    "SC-AI-02": "进行多轮和历史切换，制造两个不同错误后分别重试，在请求/reveal中删除当前或新建会话。",
    "SC-AI-03": "从used49到50，跨北京月边界和服务端拒绝，验证首次说明、耗尽弹窗、复制与缓存回写。",
    "SC-BACKUP-01": "创建备份、列出、修改本机、整体恢复、校验文件hash并删除记录。",
    "SC-BACKUP-02": "触发20/21条、300MB、8MB边界及upload/create/download/delete各阶段失败与并发。",
    "SC-NOTIFY-01": "用相同now/规则/债务运行两端纯调度，比较触发时刻、内容、id、tie、窗口和450截断。",
    "SC-NOTIFY-02": "切换通知、增删规则、测试通知，遍历通知和exact-alarm所有授权状态并检查系统通知。",
    "SC-NOTIFY-03": "已排程后冷启动、杀进程、重启设备、改时区/日期、修改债务/恢复和更新APK，读取dumpsys alarm。",
    "SC-ARCHIVE-01": "导入全部扩展名/尺寸，选择并预览图片/Markdown/PDF/Word/损坏文件，再保存、分享、删除。",
    "SC-FILE-01": "执行SAF保存成功/取消/并发/Activity重建/磁盘失败和分享返回/杀进程，校验URI与字节。",
    "SC-EXPORT-01": "生成本地JSON，比较schema/字段/时间/MIME/hash，并在旧版与Flutter双向导入。",
    "SC-EXPORT-02": "生成XLSX/PDF，逐cell解析workbook，以固定DPI逐页渲染PDF并比较内容/几何。",
    "SC-UI-LOGIN": "捕获登录门初始化/loading/error/success和长昵称头像，执行点击、取消、返回与重试。",
    "SC-UI-DEBT": "捕获空/active/settled/sort/swipe/jiggle状态，执行横纵滑、长按拖、保存/退出/tab/back。",
    "SC-UI-DETAIL-EDIT": "遍历详情账本/弹窗/模拟/编辑五种公式/批量/oneTime/校验/键盘与关闭方式。",
    "SC-UI-PAY-NOTIFY": "遍历还款筛选/Hero/空态/左滑和通知关闭/规则/权限/picker/测试状态。",
    "SC-UI-REPORT": "捕获报告空/完整/仅结清及每张图表默认、选中、拖动、切换与策略页状态。",
    "SC-UI-MINE": "遍历我的普通/Premium、账户、购买/兑换、三法律页、关于、邮箱与弹窗。",
    "SC-UI-ARCH-BACKUP": "遍历档案/备份空、列表、选择、预览、loading、error、菜单和确认状态。",
    "SC-UI-AI": "捕获welcome/thinking/reveal/error/retry/history/delete/quota/keyboard/长回复和动效状态。",
    "SC-VISUAL-ALL": "对每个UI checkpoint生成light/dark×7viewport×3textScale×5inset×reduce；动画checkpoint另取初/中/末帧。",
    "SC-LIFE-01": "在OAuth/AI/备份/picker/SAF在途时依次background/resume、旋转/Activity重建、back和force-stop。",
    "SC-RELEASE-01": "解析release证书和merged manifest，安装/升级/冷启动，再验证微信、通知、SAF、分享与debug bypass不可达。",
}


NORMALIZATION_RULES = {
    "CAPTURE_METADATA_TIMESTAMPS": {
        "scope": ["captured_at", "environment_before.date", "environment_after.date"],
        "rule": "只从证据 envelope 比较中移除采集时间；产品日期、账务日期和可见时间绝不忽略。",
    },
    "CAPTURE_BORDER_MAX_2PX": {
        "scope": ["screenshot capture frame"],
        "rule": "仅 CDP/ADB 已证明的每维最多2px居中采集边框可裁切；产品内容不得裁切。",
    },
}


def fixture_composition(scenario_id: str) -> dict[str, Any]:
    if scenario_id == "SC-VISUAL-ALL":
        return {
            "mode": "cartesian",
            "axes": {
                "theme": VISUAL_FIXTURES,
                "viewport": VIEWPORT_FIXTURES,
                "text_scale": TEXT_SCALE_FIXTURES,
                "inset": INSET_FIXTURES,
                "motion": MOTION_FIXTURES,
            },
            "expected_combinations": (
                len(VISUAL_FIXTURES)
                * len(VIEWPORT_FIXTURES)
                * len(TEXT_SCALE_FIXTURES)
                * len(INSET_FIXTURES)
                * len(MOTION_FIXTURES)
            ),
        }
    if scenario_id == "SC-AUTH-01":
        return {
            "mode": "required_together",
            "groups": [["FX-A00", "FX-WX00", "FX-E00"]],
            "expected_combinations": 1,
        }
    return {
        "mode": "each_with_baseline",
        "groups": [[fixture_id] for fixture_id in SCENARIO_FIXTURES[scenario_id]],
        "expected_combinations": len(SCENARIO_FIXTURES[scenario_id]),
    }


def comparison_contract(evidence: list[str]) -> list[dict[str, Any]]:
    contracts: list[dict[str, Any]] = []
    for kind in evidence:
        if kind == "screenshot":
            contracts.append(
                {
                    "evidence": kind,
                    "comparator": "compare-images",
                    "pass": "changed_pixels == 0",
                    "threshold": 0,
                    "size_mode": "strict_or_CAPTURE_BORDER_MAX_2PX",
                }
            )
        elif kind in {"state_before_after", "storage", "network", "geometry", "text", "semantics"}:
            contracts.append(
                {
                    "evidence": kind,
                    "comparator": "compare-json",
                    "pass": "equal == true after declared normalization only",
                }
            )
        else:
            contracts.append(
                {
                    "evidence": kind,
                    "comparator": "artifact_or_manual_contract",
                    "pass": "paired legacy/flutter evidence explicitly records pass",
                }
            )
    return contracts


def build_scenarios() -> list[dict[str, Any]]:
    linked: dict[str, list[str]] = {scenario_id: [] for scenario_id in SCENARIO_FIXTURES}
    for entry in ENTRIES:
        for scenario_id in entry["scenario_ids"]:
            linked.setdefault(scenario_id, []).append(entry["id"])
    scenarios: list[dict[str, Any]] = []
    for scenario_id in SCENARIO_FIXTURES:
        scenario_evidence = SCENARIO_EVIDENCE[scenario_id]
        scenarios.append(
            {
                "id": scenario_id,
                "title": SCENARIO_TITLES[scenario_id],
                "fixture_ids": SCENARIO_FIXTURES[scenario_id],
                "matrix_ids": sorted(linked[scenario_id]),
                "preconditions": ["旧版与 Flutter 使用同一 materialized fixture、时钟、locale、viewport 与平台 profile。"],
                "steps": [
                    "先运行受保护旧版并冻结 oracle，再在 Flutter 重放完全相同的入口和动作序列。",
                    SCENARIO_STEPS[scenario_id],
                ],
                "actions": [
                    {"id": f"{scenario_id}-A01", "action": "freeze_legacy_oracle", "checkpoint": "oracle_ready"},
                    {"id": f"{scenario_id}-A02", "action": SCENARIO_STEPS[scenario_id], "checkpoint": "legacy_evidence_complete"},
                    {"id": f"{scenario_id}-A03", "action": "replay_exact_sequence_in_flutter", "checkpoint": "flutter_evidence_complete"},
                    {"id": f"{scenario_id}-A04", "action": "run_declared_comparators", "checkpoint": "comparison_complete"},
                ],
                "fixture_composition": fixture_composition(scenario_id),
                "expected": ["除清单明确列出的规范化字段外，业务状态、持久化、文本、几何、交互和平台证据逐项一致。"],
                "normalization_rule_ids": [
                    "CAPTURE_METADATA_TIMESTAMPS",
                    *(["CAPTURE_BORDER_MAX_2PX"] if "screenshot" in scenario_evidence else []),
                ],
                "comparison_contract": comparison_contract(scenario_evidence),
                "evidence_naming": f"{scenario_id}/<case-id>/<checkpoint>/<legacy|flutter>.<kind>.<ext>",
                "evidence": scenario_evidence,
                "execution_status": "automated" if scenario_id == "SC-SOURCE-01" else "specified",
            }
        )
    return scenarios


def build_documents() -> tuple[dict[str, Any], dict[str, Any]]:
    manifest = {
        "schema_version": 1,
        "phase": "8.1",
        "baseline": {
            "commit": BASELINE_COMMIT,
            "captured_at": "2026-08-10T09:00:00+08:00",
            "oracle": "受保护 legacy 源码与同设备运行表现共同构成唯一 oracle；历史文档与既有测试只作线索。",
            "legacy_package": "io.github.jenkjyu.afterzero",
            "flutter_package": "io.github.jenkjyu.after_zero",
            "legacy_tree": {
                "www": "cc887f9aab26102d07971b2a028fc2e5eceb1e4a",
                "react": "e25e78f605f311d96e387357e8151d3a74cb219f",
                "android": "c1f5c36cc5efc559ef794193523c5ddc69cb0079",
                "cloudbase": "6663f59730741ce05abf34758dfb964e0a098950"
            },
            "flutter_tree": {
                "lib": "fc7d664caf95dbff56c2c5238d9fc85b3658a2f1",
                "android": "6a0dfae41701208f2e41a46d07e05d59369b336c",
                "ios": "461b4232eff0b8622f916c18d4c90d0f5878c223"
            },
            "legacy_debug_apk_sha256": "f72fbb815b153f5e1701e1caef30007d7c10ac0a4ca52713511a4e79cb4ddc6e",
            "flutter_debug_preview_apk_sha256": "9a8cb9cafda31fff387701c0fb8bc1e677b08b7abcf3497ec9c6e55c44a64609"
        },
        "policy": {
            "verified_requires_evidence_refs": True,
            "legacy_read_only": True,
            "mapped_unverified_is_not_parity": True,
            "user_approved_difference_requires_written_approval": True
        },
        "entries": ENTRIES,
    }
    scenarios = {
        "schema_version": 1,
        "fixture_contract": {
            "clock": "frozen_now + timezone",
            "storage": "legacy.localStorage + flutter.sharedPreferences",
            "randomness": "random_seed",
            "platform": "profiles",
            "synthetic_data_only": True,
            "storage_status": "materialized 才允许 materialize/seed；case_spec_only 只是待实现驱动的验收规格。",
            "driver_status": "partial/pending 均不得宣称该 profile 已端到端执行。",
        },
        "normalization_rules": NORMALIZATION_RULES,
        "fixtures": build_fixtures(),
        "scenarios": build_scenarios(),
    }
    return manifest, scenarios


def serialized(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def write_or_check(path: Path, value: Any, *, check: bool) -> None:
    content = serialized(value)
    if check:
        if not path.is_file() or path.read_text(encoding="utf-8") != content:
            raise ValueError(f"generated file is stale: {path}")
        return
    path.write_text(content, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    manifest, scenarios = build_documents()
    try:
        write_or_check(SCRIPT_DIR / "manifest.json", manifest, check=args.check)
        write_or_check(SCRIPT_DIR / "scenarios.json", scenarios, check=args.check)
    except ValueError as error:
        print(error)
        return 1
    print(
        f"catalog {'checked' if args.check else 'wrote'}: "
        f"{len(manifest['entries'])} entries, {len(scenarios['fixtures'])} fixtures, "
        f"{len(scenarios['scenarios'])} scenarios"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
