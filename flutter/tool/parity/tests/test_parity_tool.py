"""Regression tests for the deterministic legacy/Flutter parity tooling."""

from __future__ import annotations

import copy
import hashlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from PIL import Image


PARITY_DIR = Path(__file__).resolve().parents[1]
if str(PARITY_DIR) not in sys.path:
    sys.path.insert(0, str(PARITY_DIR))

import parity_tool  # noqa: E402  (the tool is intentionally executable as a script)
import android_capture  # noqa: E402


EXPECTED_CALC_EXPORTS = {
    "addMonths",
    "amortForward",
    "applySettle",
    "avalancheOrder",
    "baseName",
    "bumpAiConvTop",
    "clone",
    "computeMonthlyRepayment",
    "computeNotifySchedule",
    "computeReportData",
    "computeUpcomingPressure",
    "detectMatchingSort",
    "dueBucket",
    "esc",
    "escSvg",
    "extOf",
    "findAiConv",
    "fmt",
    "fmtDate",
    "genDebtId",
    "genPlan",
    "hasPremium",
    "impliedAPR",
    "inline",
    "interestCoverTolerance",
    "isActive",
    "isBadRepeatDay",
    "isHr",
    "markPaidThrough",
    "mdToHtml",
    "money",
    "niceCeil",
    "normalize",
    "npv",
    "offsetLabel",
    "pad",
    "parseDate",
    "premiumLabel",
    "pressureWindowMonths",
    "r2",
    "rateClass",
    "recompute",
    "recordPayment",
    "relLabel",
    "remainingInterest",
    "rowRemaining",
    "shortDateFromISO",
    "simulatePrepay",
    "simulateRepaymentOrder",
    "snowballOrder",
    "summarizeDebts",
    "today0",
    "todayStr",
    "truncateLabel",
    "undoSettle",
    "urgencyTier",
    "waivePeriod",
}

EXPECTED_LEGACY_BRIDGE = {
    "addNotifyRule",
    "buildAiSummary",
    "callAiAdvisor",
    "commitReorder",
    "confirmAsync",
    "createBackup",
    "deleteAccount",
    "deleteArchiveFile",
    "deleteBackup",
    "deleteDebt",
    "deleteNotifyRule",
    "downloadArchiveFile",
    "downloadBackupFile",
    "exportReportPdf",
    "exportReportXlsx",
    "getAccount",
    "getBackupMeta",
    "getDebts",
    "getFiles",
    "getNotify",
    "getPremium",
    "listBackups",
    "payInstallment",
    "redeemCode",
    "renderAll",
    "resetLocalData",
    "restoreBackup",
    "saveAll",
    "sendTestNotification",
    "setDebt",
    "setNotifyEnabled",
    "settleFull",
    "shareArchiveFile",
    "toast",
    "triggerImportFilePicker",
    "unsettle",
    "uploadArchiveFile",
    "waiveInstallment",
    "wxLogout",
}

EXPECTED_LEGACY_STORAGE_KEYS = {
    "after-zero-account-v1",
    "after-zero-ai-chatlog-v1",
    "after-zero-ai-limit-notice-v1",
    "after-zero-ai-usage-v1",
    "after-zero-backup-meta-v1",
    "after-zero-notify-v1",
    "after-zero-premium-v1",
    "after-zero-simulate-v1",
    "debt-manager-docs-v5",
    "debt-manager-sort-v1",
    "debt-manager-v5",
}

EXPECTED_FLUTTER_STORAGE_KEYS = {
    "after-zero-account-v1",
    "after-zero-ai-chatlog-v1",
    "after-zero-ai-usage-v1",
    "after-zero-archive-files-v1",
    "after-zero-backup-v1",
    "after-zero-cloudbase-session-v1",
    "after-zero-device-id-v1",
    "after-zero-notify-v1",
    "after-zero-premium-v1",
    "debt-manager-docs-v5",
    "debt-manager-sort-v1",
    "debt-manager-v5",
}


def _write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


class DiscoveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.observations = parity_tool.discover_sources()

    def _category(self, name: str) -> list[parity_tool.Observation]:
        return [item for item in self.observations if item.category == name]

    def assert_category_keys(self, category: str, expected: set[str]) -> None:
        observations = self._category(category)
        keys = [item.key for item in observations]
        self.assertEqual(len(keys), len(expected), category)
        self.assertEqual(len(keys), len(set(keys)), f"duplicate {category} keys")
        self.assertSetEqual(set(keys), expected, category)
        for item in observations:
            self.assertGreater(item.line, 0)
            self.assertTrue((parity_tool.REPO_ROOT / item.path).is_file())

    def test_discovers_all_57_calc_exports(self) -> None:
        self.assertEqual(len(EXPECTED_CALC_EXPORTS), 57)
        self.assert_category_keys("legacy.calc_export", EXPECTED_CALC_EXPORTS)

    def test_discovers_all_39_legacy_bridge_members(self) -> None:
        self.assertEqual(len(EXPECTED_LEGACY_BRIDGE), 39)
        self.assert_category_keys("legacy.bridge", EXPECTED_LEGACY_BRIDGE)

    def test_discovers_known_legacy_and_flutter_storage_keys(self) -> None:
        self.assert_category_keys("legacy.storage", EXPECTED_LEGACY_STORAGE_KEYS)
        self.assert_category_keys("flutter.storage", EXPECTED_FLUTTER_STORAGE_KEYS)

        legacy_only = EXPECTED_LEGACY_STORAGE_KEYS - EXPECTED_FLUTTER_STORAGE_KEYS
        flutter_only = EXPECTED_FLUTTER_STORAGE_KEYS - EXPECTED_LEGACY_STORAGE_KEYS
        self.assertSetEqual(
            legacy_only,
            {
                "after-zero-ai-limit-notice-v1",
                "after-zero-backup-meta-v1",
                "after-zero-simulate-v1",
            },
        )
        self.assertSetEqual(
            flutter_only,
            {
                "after-zero-archive-files-v1",
                "after-zero-backup-v1",
                "after-zero-cloudbase-session-v1",
                "after-zero-device-id-v1",
            },
        )

    def test_flutter_native_inventory_contains_only_tracked_sources(self) -> None:
        tracked = {
            path.decode("utf-8")
            for path in subprocess.check_output(
                [
                    "git",
                    "ls-files",
                    "-z",
                    "--",
                    "flutter/android/app/src/main",
                    "flutter/ios/Runner",
                ],
                cwd=parity_tool.REPO_ROOT,
            ).split(b"\0")
            if path
        }
        discovered = {
            item.path for item in self._category("flutter.native_source")
        }
        self.assertTrue(discovered)
        self.assertTrue(discovered.issubset(tracked))


class FixtureMaterializationTests(unittest.TestCase):
    def test_materializes_recursive_overlay_and_fixture_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state_path = root / "fixtures" / "base.json"
            scenarios_path = root / "scenarios.json"
            output_path = root / "artifacts" / "materialized.json"
            base = {
                "debts": [{"id": "base-debt", "plan": [1, 2]}],
                "settings": {
                    "theme": "light",
                    "nested": {"enabled": False, "preserved": "yes"},
                },
                "replace_me": {"old": True},
                "untouched": 42,
            }
            fixture = {
                "id": "FX-OVERLAY",
                "description": "synthetic recursive overlay",
                "state_file": "fixtures/base.json",
                "frozen_now": "2026-08-10T08:30:00+08:00",
                "timezone": "Asia/Shanghai",
                "locale": "zh-CN",
                "random_seed": 810,
                "profiles": {"account": "premium", "network": "offline"},
                "storage_status": "materialized",
                "driver_status": "partial",
                "implemented_drivers": ["test_storage_seed"],
                "required_drivers": ["test_clock_driver", "test_storage_seed"],
                "overlay": {
                    "debts": [{"id": "overlay-debt"}],
                    "settings": {
                        "theme": "dark",
                        "nested": {"enabled": True},
                    },
                    "replace_me": "replaced",
                    "added": {"value": 7},
                },
            }
            _write_json(state_path, base)
            _write_json(
                scenarios_path,
                {"schema_version": 1, "fixtures": [fixture], "scenarios": []},
            )

            with mock.patch.object(parity_tool, "SCRIPT_DIR", root):
                result = parity_tool.materialize_fixture(
                    "FX-OVERLAY",
                    scenarios_path=scenarios_path,
                    output=output_path,
                )

            self.assertEqual(result["debts"], [{"id": "overlay-debt"}])
            self.assertEqual(
                result["settings"],
                {
                    "theme": "dark",
                    "nested": {"enabled": True, "preserved": "yes"},
                },
            )
            self.assertEqual(result["replace_me"], "replaced")
            self.assertEqual(result["untouched"], 42)
            self.assertEqual(result["added"], {"value": 7})
            self.assertEqual(
                result["fixture"],
                {
                    "id": "FX-OVERLAY",
                    "description": "synthetic recursive overlay",
                    "frozen_now": "2026-08-10T08:30:00+08:00",
                    "timezone": "Asia/Shanghai",
                    "locale": "zh-CN",
                    "random_seed": 810,
                    "profiles": {"account": "premium", "network": "offline"},
                    "storage_status": "materialized",
                    "driver_status": "partial",
                    "implemented_drivers": ["test_storage_seed"],
                    "required_drivers": ["test_clock_driver", "test_storage_seed"],
                },
            )
            self.assertEqual(json.loads(output_path.read_text(encoding="utf-8")), result)
            self.assertEqual(json.loads(state_path.read_text(encoding="utf-8")), base)

    def test_refuses_to_materialize_a_case_spec_without_a_driver(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state_path = root / "fixtures" / "base.json"
            scenarios_path = root / "scenarios.json"
            _write_json(
                state_path,
                {"legacy": {"localStorage": {}}, "flutter": {"sharedPreferences": {}}},
            )
            _write_json(
                scenarios_path,
                {
                    "schema_version": 1,
                    "fixtures": [
                        {
                            "id": "FX-SPEC",
                            "state_file": "fixtures/base.json",
                            "storage_status": "case_spec_only",
                        }
                    ],
                    "scenarios": [],
                },
            )
            with (
                mock.patch.object(parity_tool, "SCRIPT_DIR", root),
                self.assertRaisesRegex(ValueError, "case_spec_only"),
            ):
                parity_tool.materialize_fixture("FX-SPEC", scenarios_path=scenarios_path)


class AndroidCaptureSafetyTests(unittest.TestCase):
    def test_installed_apk_hash_must_match_frozen_oracle(self) -> None:
        apk = b"synthetic-apk"
        expected = hashlib.sha256(apk).hexdigest()
        completed = subprocess.CompletedProcess(args=[], returncode=0, stdout=apk, stderr=b"")
        with (
            mock.patch.object(android_capture, "shell", return_value="package:/data/app/base.apk"),
            mock.patch.object(android_capture, "run", return_value=completed),
        ):
            result = android_capture.verify_installed_apk(
                "test.pkg",
                expected,
                adb=Path("/fake/adb"),
                serial="serial",
                output=None,
            )
            self.assertTrue(result["match"])
            with self.assertRaisesRegex(ValueError, "installed APK mismatch"):
                android_capture.verify_installed_apk(
                    "test.pkg",
                    "0" * 64,
                    adb=Path("/fake/adb"),
                    serial="serial",
                    output=None,
                )

    def test_storage_xml_uses_flutter_prefix_and_escapes_values(self) -> None:
        xml = android_capture._storage_xml(  # noqa: SLF001 - intentional tool test
            {"plain": "A&B<value>", "object": {"name": "合成"}}
        )
        self.assertIn('name="flutter.plain"', xml)
        self.assertIn("A&amp;B&lt;value&gt;", xml)
        self.assertIn('name="flutter.object"', xml)
        self.assertIn("合成", xml)

    def test_launch_uses_resolved_activity_and_rejects_failed_am_start(self) -> None:
        completed = subprocess.CompletedProcess(
            args=[], returncode=0, stdout="Status: ok\nActivity: test.pkg/.MainActivity\n", stderr=""
        )
        with (
            mock.patch.object(
                android_capture,
                "shell",
                side_effect=["", "test.pkg/.MainActivity", "mCurrentFocus=test.pkg/.MainActivity"],
            ) as shell_mock,
            mock.patch.object(android_capture, "run", return_value=completed) as run_mock,
            mock.patch.object(android_capture.time, "sleep"),
        ):
            android_capture.launch_package(
                "test.pkg", adb=Path("/fake/adb"), serial="serial", wait_ms=0
            )
        self.assertEqual(shell_mock.call_count, 3)
        self.assertEqual(
            run_mock.call_args.args[0],
            ["shell", "am", "start", "-W", "-n", "test.pkg/.MainActivity"],
        )

        failed = subprocess.CompletedProcess(args=[], returncode=1, stdout="Status: error", stderr="boom")
        with (
            mock.patch.object(android_capture, "shell", side_effect=["", "test.pkg/.MainActivity"]),
            mock.patch.object(android_capture, "run", return_value=failed),
        ):
            with self.assertRaisesRegex(ValueError, "failed to launch"):
                android_capture.launch_package(
                    "test.pkg", adb=Path("/fake/adb"), serial=None, wait_ms=0
                )

    def test_ui_dump_retries_after_timeout_and_removes_remote_file(self) -> None:
        timeout = subprocess.TimeoutExpired(cmd=["adb"], timeout=45)
        dumped = subprocess.CompletedProcess(
            args=[], returncode=0, stdout="UI hierchary dumped", stderr=""
        )
        pulled = subprocess.CompletedProcess(
            args=[], returncode=0, stdout=b"<hierarchy />", stderr=b""
        )
        with (
            mock.patch.object(
                android_capture,
                "run",
                side_effect=[timeout, dumped, pulled],
            ) as run_mock,
            mock.patch.object(android_capture, "shell", return_value="") as shell_mock,
            mock.patch.object(android_capture.time, "sleep"),
        ):
            result = android_capture._dump_ui(  # noqa: SLF001 - intentional tool test
                adb=Path("/fake/adb"), serial="serial"
            )

        self.assertEqual(result, b"<hierarchy />")
        self.assertEqual(run_mock.call_count, 3)
        self.assertEqual(run_mock.call_args_list[0].kwargs["timeout"], 45)
        self.assertNotIn("--compressed", run_mock.call_args_list[1].args[0])
        self.assertIn("rm -f /sdcard/parity_ui_", shell_mock.call_args.args[0])


class JsonComparisonTests(unittest.TestCase):
    def test_canonical_json_comparison_and_mutation_failure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            legacy_path = root / "legacy.json"
            flutter_path = root / "flutter.json"
            legacy = {
                "meta": {"generated_at": "legacy-time", "schema": 1},
                "rows": [
                    {"id": "legacy-id", "amount": 100.0, "paid": False},
                    {"id": "stable-id", "amount": 200.0, "paid": True},
                ],
                "summary": {"balance": 100.0, "count": 2},
            }
            flutter = {
                "summary": {"count": 2, "balance": 100.0},
                "rows": [
                    {"paid": False, "amount": 100.0, "id": "flutter-id"},
                    {"paid": True, "amount": 200.0, "id": "stable-id"},
                ],
                "meta": {"schema": 1, "generated_at": "flutter-time"},
            }
            ignored = {"meta.generated_at", "rows[0].id"}
            _write_json(legacy_path, legacy)
            _write_json(flutter_path, flutter)

            equal_result = parity_tool.compare_json_files(
                legacy_path,
                flutter_path,
                ignored,
            )
            self.assertTrue(equal_result["equal"])
            self.assertEqual(
                equal_result["legacy_sha256"], equal_result["flutter_sha256"]
            )
            self.assertEqual(equal_result["ignored_paths"], sorted(ignored))

            mutated = copy.deepcopy(flutter)
            mutated["rows"][0]["amount"] = 100.01
            _write_json(flutter_path, mutated)
            mutation_result = parity_tool.compare_json_files(
                legacy_path,
                flutter_path,
                ignored,
            )
            self.assertFalse(mutation_result["equal"])
            self.assertNotEqual(
                mutation_result["legacy_sha256"],
                mutation_result["flutter_sha256"],
            )

            stdout = io.StringIO()
            with redirect_stdout(stdout):
                exit_code = parity_tool.main(
                    [
                        "compare-json",
                        str(legacy_path),
                        str(flutter_path),
                        "--ignore",
                        "meta.generated_at",
                        "--ignore",
                        "rows[0].id",
                        "--fail-if-changed",
                    ]
                )
            self.assertEqual(exit_code, 1)
            self.assertFalse(json.loads(stdout.getvalue())["equal"])


class ImageComparisonTests(unittest.TestCase):
    def test_rejects_threshold_and_crop_values_that_can_hide_real_differences(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            legacy_path = root / "legacy.png"
            flutter_path = root / "flutter.png"
            Image.new("RGBA", (10, 4), (255, 255, 255, 255)).save(legacy_path)
            Image.new("RGBA", (4, 4), (0, 0, 0, 255)).save(flutter_path)

            with self.assertRaisesRegex(ValueError, "threshold must be between 0 and 64"):
                parity_tool.compare_images(
                    legacy_path,
                    flutter_path,
                    output_path=None,
                    threshold=65,
                )
            with self.assertRaisesRegex(ValueError, "only permits a 2px"):
                parity_tool.compare_images(
                    legacy_path,
                    flutter_path,
                    output_path=None,
                    threshold=0,
                    size_mode="center-crop",
                )

    def test_pixel_comparison_and_mutation_failure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            legacy_path = root / "legacy.png"
            flutter_path = root / "flutter.png"
            diff_path = root / "evidence" / "diff.png"
            baseline = Image.new("RGBA", (4, 4), (255, 255, 255, 255))
            baseline.save(legacy_path)
            baseline.copy().save(flutter_path)

            equal_result = parity_tool.compare_images(
                legacy_path,
                flutter_path,
                output_path=diff_path,
                threshold=0,
            )
            self.assertEqual(equal_result["changed_pixels"], 0)
            self.assertEqual(equal_result["changed_ratio"], 0.0)
            self.assertEqual(equal_result["max_channel_delta"], 0)
            self.assertIsNone(equal_result["bbox"])
            self.assertTrue(diff_path.is_file())

            mutated = baseline.copy()
            mutated.putpixel((2, 1), (0, 0, 0, 255))
            mutated.save(flutter_path)
            mutation_result = parity_tool.compare_images(
                legacy_path,
                flutter_path,
                output_path=diff_path,
                threshold=0,
            )
            self.assertEqual(mutation_result["changed_pixels"], 1)
            self.assertAlmostEqual(mutation_result["changed_ratio"], 1 / 16)
            self.assertEqual(mutation_result["max_channel_delta"], 255)
            self.assertEqual(mutation_result["bbox"], (2, 1, 3, 2))

            stdout = io.StringIO()
            with redirect_stdout(stdout):
                exit_code = parity_tool.main(
                    [
                        "compare-images",
                        str(legacy_path),
                        str(flutter_path),
                        "--threshold",
                        "0",
                        "--fail-if-changed",
                    ]
                )
            self.assertEqual(exit_code, 1)
            cli_result = json.loads(stdout.getvalue())
            self.assertEqual(cli_result["changed_pixels"], 1)

    def test_explicit_center_crop_normalizes_capture_border_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            legacy_path = root / "legacy.png"
            flutter_path = root / "flutter.png"
            legacy = Image.new("RGBA", (6, 6), (255, 0, 0, 255))
            flutter = Image.new("RGBA", (4, 4), (255, 0, 0, 255))
            legacy.save(legacy_path)
            flutter.save(flutter_path)

            with self.assertRaisesRegex(ValueError, "image size mismatch"):
                parity_tool.compare_images(
                    legacy_path,
                    flutter_path,
                    output_path=None,
                    threshold=0,
                )

            result = parity_tool.compare_images(
                legacy_path,
                flutter_path,
                output_path=None,
                threshold=0,
                size_mode="center-crop",
            )
            self.assertEqual(result["changed_pixels"], 0)
            self.assertEqual(result["original_sizes"], {"legacy": (6, 6), "flutter": (4, 4)})
            self.assertEqual(result["crop_boxes"], {"legacy": (1, 1, 5, 5), "flutter": (0, 0, 4, 4)})


if __name__ == "__main__":
    unittest.main()
