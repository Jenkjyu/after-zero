#!/usr/bin/env python3
"""Deterministic Android evidence capture and fixture injection for parity work."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape, quoteattr


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_ADB = Path(
    os.environ.get(
        "AFTER_ZERO_ADB",
        "/opt/homebrew/share/android-commandlinetools/platform-tools/adb",
    )
)


def run(
    args: list[str],
    *,
    adb: Path,
    serial: str | None = None,
    check: bool = True,
    text: bool = True,
    timeout: int = 60,
) -> subprocess.CompletedProcess[Any]:
    command = [str(adb)]
    if serial:
        command.extend(["-s", serial])
    command.extend(args)
    return subprocess.run(
        command,
        check=check,
        capture_output=True,
        text=text,
        timeout=timeout,
    )


def shell(
    command: str,
    *,
    adb: Path,
    serial: str | None,
    check: bool = True,
    timeout: int = 60,
) -> str:
    result = run(["shell", command], adb=adb, serial=serial, check=check, timeout=timeout)
    return result.stdout.strip()


def device_environment(*, adb: Path, serial: str | None) -> dict[str, Any]:
    locale = shell("getprop persist.sys.locale", adb=adb, serial=serial, check=False)
    if not locale or locale == "null":
        locale = shell("getprop ro.product.locale", adb=adb, serial=serial, check=False)
    props = {
        "serial": shell("getprop ro.serialno", adb=adb, serial=serial),
        "model": shell("getprop ro.product.model", adb=adb, serial=serial),
        "sdk": shell("getprop ro.build.version.sdk", adb=adb, serial=serial),
        "release": shell("getprop ro.build.version.release", adb=adb, serial=serial),
        "fingerprint": shell("getprop ro.build.fingerprint", adb=adb, serial=serial),
        "locale": locale,
        "timezone": shell("getprop persist.sys.timezone", adb=adb, serial=serial),
        "date": shell("date '+%Y-%m-%dT%H:%M:%S%z'", adb=adb, serial=serial),
        "wm_size": shell("wm size", adb=adb, serial=serial),
        "wm_density": shell("wm density", adb=adb, serial=serial),
        "font_scale": shell("settings get system font_scale", adb=adb, serial=serial),
        "window_animation_scale": shell("settings get global window_animation_scale", adb=adb, serial=serial),
        "transition_animation_scale": shell("settings get global transition_animation_scale", adb=adb, serial=serial),
        "animator_duration_scale": shell("settings get global animator_duration_scale", adb=adb, serial=serial),
        "night_mode": shell("cmd uimode night", adb=adb, serial=serial, check=False),
        "screen_off_timeout": shell("settings get system screen_off_timeout", adb=adb, serial=serial, check=False),
        "stay_on_while_plugged_in": shell("settings get global stay_on_while_plugged_in", adb=adb, serial=serial, check=False),
    }
    return props


def configure_device(*, adb: Path, serial: str | None, animations: float) -> None:
    commands = [
        "settings put system font_scale 1.0",
        f"settings put global window_animation_scale {animations}",
        f"settings put global transition_animation_scale {animations}",
        f"settings put global animator_duration_scale {animations}",
        "settings put system screen_off_timeout 2147483647",
        "svc power stayon true",
    ]
    for command in commands:
        shell(command, adb=adb, serial=serial)
    print(json.dumps(device_environment(adb=adb, serial=serial), ensure_ascii=False, indent=2))


def verify_installed_apk(
    package: str,
    expected_sha256: str,
    *,
    adb: Path,
    serial: str | None,
    output: Path | None,
) -> dict[str, Any]:
    if not re.fullmatch(r"[0-9a-f]{64}", expected_sha256):
        raise ValueError("expected APK SHA-256 must be 64 lowercase hex characters")
    package_paths = [
        line.removeprefix("package:").strip()
        for line in shell(f"pm path {package}", adb=adb, serial=serial).splitlines()
        if line.startswith("package:")
    ]
    if len(package_paths) != 1:
        raise ValueError(
            f"expected one installed base APK for {package}, found {len(package_paths)}: {package_paths}"
        )
    apk = run(
        ["exec-out", "cat", package_paths[0]],
        adb=adb,
        serial=serial,
        text=False,
        timeout=180,
    ).stdout
    actual = hashlib.sha256(apk).hexdigest()
    result = {
        "package": package,
        "installed_path": package_paths[0],
        "expected_sha256": expected_sha256,
        "actual_sha256": actual,
        "bytes": len(apk),
        "match": actual == expected_sha256,
    }
    if not result["match"]:
        raise ValueError(
            f"installed APK mismatch for {package}: expected={expected_sha256} actual={actual}"
        )
    if output is not None:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def launch_package(package: str, *, adb: Path, serial: str | None, wait_ms: int) -> None:
    shell(f"am force-stop {package}", adb=adb, serial=serial)
    resolved = shell(
        f"cmd package resolve-activity --brief -c android.intent.category.LAUNCHER {package}",
        adb=adb,
        serial=serial,
        check=False,
    )
    components = [line.strip() for line in resolved.splitlines() if "/" in line]
    if not components:
        raise ValueError(f"no launcher activity for {package}: {resolved}")
    component = components[-1]
    result = run(
        ["shell", "am", "start", "-W", "-n", component],
        adb=adb,
        serial=serial,
        check=False,
    )
    combined = f"{result.stdout}\n{result.stderr}".strip()
    if result.returncode != 0 or "Status: ok" not in combined:
        raise ValueError(
            f"failed to launch {package} ({component}), exit={result.returncode}: {combined}"
        )
    time.sleep(wait_ms / 1000)
    _require_foreground(package, adb=adb, serial=serial)


def _focus(*, adb: Path, serial: str | None) -> str:
    return shell(
        "dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'",
        adb=adb,
        serial=serial,
        check=False,
    )


def _require_foreground(package: str, *, adb: Path, serial: str | None) -> str:
    focus = _focus(adb=adb, serial=serial)
    current_focus = next(
        (line for line in focus.splitlines() if "mCurrentFocus" in line),
        "",
    )
    focused_packages = re.findall(r"\b([A-Za-z][A-Za-z0-9_.]*)/", current_focus)
    if package not in focused_packages:
        raise ValueError(f"target package is not foreground: expected={package!r}, focus={focus!r}")
    return focus


def _dump_ui(*, adb: Path, serial: str | None) -> bytes:
    remote = f"/sdcard/parity_ui_{os.getpid()}_{time.time_ns()}.xml"
    last_error = ""
    attempts = [
        ["shell", "uiautomator", "dump", remote],
        ["shell", "uiautomator", "dump", remote],
        ["shell", "uiautomator", "dump", "--compressed", remote],
    ]
    try:
        for attempt, command in enumerate(attempts, start=1):
            try:
                result = run(
                    command,
                    adb=adb,
                    serial=serial,
                    check=False,
                    timeout=45,
                )
            except subprocess.TimeoutExpired:
                last_error = f"attempt {attempt}/{len(attempts)} timed out after 45s"
                time.sleep(0.8)
                continue
            last_error = f"{result.stdout}\n{result.stderr}".strip()
            if result.returncode == 0:
                pulled = run(
                    ["exec-out", "cat", remote],
                    adb=adb,
                    serial=serial,
                    check=True,
                    text=False,
                )
                if pulled.stdout:
                    return pulled.stdout
            time.sleep(0.8)
        raise ValueError(f"uiautomator dump failed: {last_error}")
    finally:
        shell(f"rm -f {remote}", adb=adb, serial=serial, check=False)


def capture(
    package: str,
    label: str,
    output_dir: Path,
    *,
    adb: Path,
    serial: str | None,
    include_preferences: bool,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    focus_before = _require_foreground(package, adb=adb, serial=serial)
    environment_before = device_environment(adb=adb, serial=serial)
    ui_dump_started = time.monotonic()
    ui_xml = _dump_ui(adb=adb, serial=serial)
    ui_dump_elapsed_ms = round((time.monotonic() - ui_dump_started) * 1000)
    focus_after_dump = _require_foreground(package, adb=adb, serial=serial)
    screenshot = run(
        ["exec-out", "screencap", "-p"],
        adb=adb,
        serial=serial,
        text=False,
        timeout=30,
    ).stdout
    screenshot_path = output_dir / f"{label}.device.png"
    focus_after_capture = _require_foreground(package, adb=adb, serial=serial)
    environment_after = device_environment(adb=adb, serial=serial)

    evidence: dict[str, Any] = {
        "label": label,
        "package": package,
        "captured_at": environment_after["date"],
        "environment_before": environment_before,
        "environment_after": environment_after,
        "current_focus_before": focus_before,
        "current_focus_after_dump": focus_after_dump,
        "current_focus_after_capture": focus_after_capture,
        "ui_dump_elapsed_ms": ui_dump_elapsed_ms,
        "capture_elapsed_ms": round((time.monotonic() - started) * 1000),
        "screenshot_sha256": hashlib.sha256(screenshot).hexdigest(),
        "ui_sha256": hashlib.sha256(ui_xml).hexdigest(),
        "activity_top": shell("dumpsys activity top", adb=adb, serial=serial, check=False),
        "package_info": shell(f"dumpsys package {package}", adb=adb, serial=serial, check=False),
    }
    prefs_path = "shared_prefs/FlutterSharedPreferences.xml"
    prefs = shell(
        f"run-as {package} cat {prefs_path}",
        adb=adb,
        serial=serial,
        check=False,
    )
    if prefs.startswith("<?xml") or prefs.startswith("<map"):
        evidence["preferences_sha256"] = hashlib.sha256(prefs.encode("utf-8")).hexdigest()
        if include_preferences:
            evidence["preferences_file"] = f"{label}.preferences.xml"
    files: dict[str, bytes] = {
        f"{label}.ui.xml": ui_xml,
        f"{label}.device.png": screenshot,
        f"{label}.device.json": (
            json.dumps(evidence, ensure_ascii=False, indent=2) + "\n"
        ).encode("utf-8"),
    }
    if include_preferences and (prefs.startswith("<?xml") or prefs.startswith("<map")):
        files[f"{label}.preferences.xml"] = (prefs + "\n").encode("utf-8")
    existing = [name for name in files if (output_dir / name).exists()]
    if existing:
        raise ValueError(f"capture output already exists for label {label!r}: {existing}")
    with tempfile.TemporaryDirectory(prefix=f".{label}.staging-", dir=output_dir) as directory:
        staging = Path(directory)
        for name, content in files.items():
            (staging / name).write_bytes(content)
        committed: list[Path] = []
        try:
            for name in files:
                destination = output_dir / name
                os.replace(staging / name, destination)
                committed.append(destination)
        except OSError:
            for destination in committed:
                destination.unlink(missing_ok=True)
            raise
    return {
        "label": label,
        "package": package,
        "screenshot": str(screenshot_path),
        "ui": str(output_dir / f"{label}.ui.xml"),
    }


def _storage_xml(storage: dict[str, Any]) -> str:
    lines = ["<?xml version='1.0' encoding='utf-8' standalone='yes' ?>", "<map>"]
    for key in sorted(storage):
        value = storage[key]
        if not isinstance(value, str):
            value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        lines.append(f"    <string name={quoteattr('flutter.' + key)}>{escape(value)}</string>")
    lines.append("</map>")
    return "\n".join(lines) + "\n"


def _read_flutter_preferences(
    package: str, *, adb: Path, serial: str | None
) -> str | None:
    prefs = shell(
        f"run-as {package} cat shared_prefs/FlutterSharedPreferences.xml",
        adb=adb,
        serial=serial,
        check=False,
    )
    return prefs if prefs.startswith("<?xml") or prefs.startswith("<map") else None


def _install_flutter_preferences(
    package: str,
    xml: str | None,
    *,
    adb: Path,
    serial: str | None,
) -> None:
    shell(f"am force-stop {package}", adb=adb, serial=serial)
    if xml is None:
        shell(
            f"run-as {package} rm -f shared_prefs/FlutterSharedPreferences.xml",
            adb=adb,
            serial=serial,
            check=False,
        )
        return
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".xml", delete=False) as handle:
        handle.write(xml)
        local_path = Path(handle.name)
    remote_path = f"/data/local/tmp/after_zero_parity_preferences_{os.getpid()}.xml"
    try:
        run(["push", str(local_path), remote_path], adb=adb, serial=serial)
        shell(f"run-as {package} mkdir -p shared_prefs", adb=adb, serial=serial)
        shell(
            f"run-as {package} cp {remote_path} shared_prefs/FlutterSharedPreferences.xml",
            adb=adb,
            serial=serial,
        )
    finally:
        local_path.unlink(missing_ok=True)
        shell(f"rm -f {remote_path}", adb=adb, serial=serial, check=False)


def seed_flutter(
    package: str,
    state_file: Path,
    *,
    adb: Path,
    serial: str | None,
    backup_path: Path,
) -> None:
    state = json.loads(state_file.read_text(encoding="utf-8"))
    fixture = state.get("fixture")
    if not isinstance(fixture, dict) or fixture.get("storage_status") != "materialized":
        raise ValueError("state must be produced from a materialized storage fixture")
    implemented = fixture.get("implemented_drivers", [])
    if "flutter_shared_preferences_seed" not in implemented:
        raise ValueError("fixture does not declare the Flutter SharedPreferences seed driver")
    storage = state.get("flutter", {}).get("sharedPreferences", state.get("sharedPreferences"))
    if not isinstance(storage, dict):
        raise ValueError("state must contain flutter.sharedPreferences or sharedPreferences")
    xml = _storage_xml(storage)
    existing = _read_flutter_preferences(package, adb=adb, serial=serial)
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    with backup_path.open("x", encoding="utf-8") as handle:
        handle.write(
            json.dumps({"present": existing is not None, "xml": existing}, ensure_ascii=False)
        )
    backup_path.chmod(0o600)
    _install_flutter_preferences(package, xml, adb=adb, serial=serial)
    print(f"seeded {len(storage)} SharedPreferences values for {package}")


def restore_flutter(
    package: str,
    backup_path: Path,
    *,
    adb: Path,
    serial: str | None,
    keep_backup: bool,
) -> dict[str, Any]:
    payload = json.loads(backup_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("present"), bool):
        raise ValueError(f"invalid preferences backup: {backup_path}")
    xml = payload.get("xml") if payload["present"] else None
    if xml is not None and not isinstance(xml, str):
        raise ValueError(f"invalid XML in preferences backup: {backup_path}")
    _install_flutter_preferences(package, xml, adb=adb, serial=serial)
    read_back = _read_flutter_preferences(package, adb=adb, serial=serial)
    if read_back != xml:
        raise ValueError("SharedPreferences restore read-back mismatch; private backup retained")
    result = {
        "restored": True,
        "read_back_verified": True,
        "sha256": hashlib.sha256((read_back or "").encode("utf-8")).hexdigest(),
        "present": read_back is not None,
    }
    if not keep_backup:
        backup_path.unlink()
    print(f"restored SharedPreferences for {package}")
    return result


def capture_flutter_fixture(
    package: str,
    state_file: Path,
    label: str,
    output_dir: Path,
    *,
    adb: Path,
    serial: str | None,
    wait_ms: int,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    backup_path = output_dir / f"{label}.preseed.preferences.backup.json"
    seed_flutter(
        package,
        state_file,
        adb=adb,
        serial=serial,
        backup_path=backup_path,
    )
    restored = False
    try:
        launch_package(package, adb=adb, serial=serial, wait_ms=wait_ms)
        return capture(
            package,
            label,
            output_dir,
            adb=adb,
            serial=serial,
            include_preferences=True,
        )
    finally:
        restore_result = restore_flutter(
            package,
            backup_path,
            adb=adb,
            serial=serial,
            keep_backup=False,
        )
        restored = True
        (output_dir / f"{label}.restore.json").write_text(
            json.dumps(restore_result | {"restored": restored}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


def _bounds_center(value: str) -> tuple[int, int]:
    numbers = [int(item) for item in re.findall(r"\d+", value)]
    if len(numbers) != 4:
        raise ValueError(f"invalid bounds: {value}")
    return ((numbers[0] + numbers[2]) // 2, (numbers[1] + numbers[3]) // 2)


def tap_label(
    label: str,
    *,
    adb: Path,
    serial: str | None,
    contains: bool,
) -> None:
    xml_bytes = _dump_ui(adb=adb, serial=serial)
    root = ET.fromstring(xml_bytes)
    matches: list[ET.Element] = []
    for node in root.iter("node"):
        values = [node.attrib.get("text", ""), node.attrib.get("content-desc", "")]
        if any((label in value if contains else label == value) for value in values):
            matches.append(node)
    if not matches:
        raise ValueError(f"no UI node matched label {label!r}")
    if len(matches) > 1:
        clickable = [item for item in matches if item.attrib.get("clickable") == "true"]
        if len(clickable) == 1:
            matches = clickable
        else:
            raise ValueError(f"multiple UI nodes matched label {label!r}: {len(matches)}")
    x, y = _bounds_center(matches[0].attrib.get("bounds", ""))
    shell(f"input tap {x} {y}", adb=adb, serial=serial)
    print(json.dumps({"label": label, "x": x, "y": y}, ensure_ascii=False))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", type=Path, default=DEFAULT_ADB)
    parser.add_argument("--serial")
    commands = parser.add_subparsers(dest="command", required=True)

    configure = commands.add_parser("configure")
    configure.add_argument("--animations", type=float, default=1.0)

    environment = commands.add_parser("environment")

    verify_apk = commands.add_parser("verify-install")
    verify_apk.add_argument("--package", required=True)
    verify_apk.add_argument("--expected-sha256", required=True)
    verify_apk.add_argument("--output", type=Path)

    launch = commands.add_parser("launch")
    launch.add_argument("--package", required=True)
    launch.add_argument("--wait-ms", type=int, default=1200)

    capture_parser = commands.add_parser("capture")
    capture_parser.add_argument("--package", required=True)
    capture_parser.add_argument("--label", required=True)
    capture_parser.add_argument("--output-dir", type=Path, required=True)
    capture_parser.add_argument(
        "--include-preferences",
        action="store_true",
        help="write raw SharedPreferences (synthetic fixture runs only; may contain private data)",
    )

    seed = commands.add_parser("seed-flutter")
    seed.add_argument("--package", default="io.github.jenkjyu.after_zero")
    seed.add_argument("--state", type=Path, required=True)
    seed.add_argument(
        "--backup",
        type=Path,
        required=True,
        help="mandatory private backup used by restore-flutter",
    )

    restore = commands.add_parser("restore-flutter")
    restore.add_argument("--package", default="io.github.jenkjyu.after_zero")
    restore.add_argument("--backup", type=Path, required=True)
    restore.add_argument("--keep-backup", action="store_true")

    fixture_capture = commands.add_parser("capture-flutter-fixture")
    fixture_capture.add_argument("--package", default="io.github.jenkjyu.after_zero")
    fixture_capture.add_argument("--state", type=Path, required=True)
    fixture_capture.add_argument("--label", required=True)
    fixture_capture.add_argument("--output-dir", type=Path, required=True)
    fixture_capture.add_argument("--wait-ms", type=int, default=1200)

    tap = commands.add_parser("tap-label")
    tap.add_argument("label")
    tap.add_argument("--contains", action="store_true")

    args = parser.parse_args(argv)
    if not args.adb.is_file():
        print(f"adb not found: {args.adb}", file=sys.stderr)
        return 2
    try:
        if args.command == "configure":
            configure_device(adb=args.adb, serial=args.serial, animations=args.animations)
        elif args.command == "environment":
            print(json.dumps(device_environment(adb=args.adb, serial=args.serial), ensure_ascii=False, indent=2))
        elif args.command == "verify-install":
            print(json.dumps(verify_installed_apk(args.package, args.expected_sha256, adb=args.adb, serial=args.serial, output=args.output), ensure_ascii=False, indent=2))
        elif args.command == "launch":
            launch_package(args.package, adb=args.adb, serial=args.serial, wait_ms=args.wait_ms)
        elif args.command == "capture":
            print(json.dumps(capture(args.package, args.label, args.output_dir, adb=args.adb, serial=args.serial, include_preferences=args.include_preferences), ensure_ascii=False, indent=2))
        elif args.command == "seed-flutter":
            seed_flutter(args.package, args.state, adb=args.adb, serial=args.serial, backup_path=args.backup)
        elif args.command == "restore-flutter":
            restore_flutter(args.package, args.backup, adb=args.adb, serial=args.serial, keep_backup=args.keep_backup)
        elif args.command == "capture-flutter-fixture":
            print(json.dumps(capture_flutter_fixture(args.package, args.state, args.label, args.output_dir, adb=args.adb, serial=args.serial, wait_ms=args.wait_ms), ensure_ascii=False, indent=2))
        elif args.command == "tap-label":
            tap_label(args.label, adb=args.adb, serial=args.serial, contains=args.contains)
    except (OSError, ValueError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
