#!/usr/bin/env python3
"""After Zero legacy <-> Flutter parity evidence tooling.

This command deliberately uses only deterministic, inspectable inputs.  The legacy
application is the oracle and remains read-only; generated catalogs and evidence
live under flutter/tool/parity or a caller-provided artifact directory.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[2]
DEFAULT_MANIFEST = SCRIPT_DIR / "manifest.json"
DEFAULT_SCENARIOS = SCRIPT_DIR / "scenarios.json"
DEFAULT_INVENTORY = SCRIPT_DIR / "source_inventory.json"
DEFAULT_MATRIX_DOC = REPO_ROOT / "docs" / "flutter-parity" / "matrix.md"

ALLOWED_STATUSES = {
    "unverified",
    "mapped_unverified",
    "difference",
    "missing_in_flutter",
    "flutter_extra",
    "verified",
    "user_approved_difference",
    "blocked_external",
}
ALLOWED_EVIDENCE = {
    "source",
    "screenshot",
    "geometry",
    "text",
    "semantics",
    "interaction",
    "state_before_after",
    "storage",
    "network",
    "native",
    "artifact",
    "unit_test",
    "widget_test",
    "integration_test",
    "manual_device",
}

DIFFERENCE_STATUSES = {
    "difference",
    "missing_in_flutter",
    "flutter_extra",
    "user_approved_difference",
    "blocked_external",
}

SOURCE_SUFFIXES = {
    ".css",
    ".dart",
    ".gradle",
    ".html",
    ".java",
    ".js",
    ".json",
    ".kt",
    ".kts",
    ".m",
    ".md",
    ".mjs",
    ".mm",
    ".plist",
    ".py",
    ".swift",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}


@dataclass(frozen=True)
class Observation:
    category: str
    key: str
    path: str
    line: int
    anchor: str

    @property
    def ref(self) -> str:
        return f"{self.category}:{self.key}"

    @property
    def identity(self) -> tuple[str, str, str]:
        return (self.category, self.key, self.path)


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _line_for_offset(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _clean_anchor(value: str, limit: int = 180) -> str:
    return " ".join(value.strip().split())[:limit]


def _add_regex_observations(
    out: list[Observation],
    *,
    category: str,
    path: Path,
    pattern: re.Pattern[str],
    key_group: int | str = 1,
    anchor_group: int | str | None = None,
) -> None:
    text = path.read_text(encoding="utf-8")
    rel = _relative(path)
    for match in pattern.finditer(text):
        key = str(match.group(key_group))
        anchor = match.group(anchor_group) if anchor_group is not None else match.group(0)
        out.append(
            Observation(
                category=category,
                key=key,
                path=rel,
                line=_line_for_offset(text, match.start()),
                anchor=_clean_anchor(anchor),
            )
        )


def _add_file_sha_observations(
    out: list[Observation], *, category: str, paths: Iterable[Path]
) -> None:
    """Freeze complete source bytes, not only regex-discovered symbols.

    A path-only inventory would miss a behavior change when a function keeps its
    name.  Including the digest in the observation identity forces every source
    change to refresh the baseline deliberately and keeps the protected legacy
    oracle immutable in practice.
    """

    for path in sorted({item.resolve() for item in paths if item.is_file()}):
        rel = _relative(path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        out.append(
            Observation(
                category=category,
                key=f"{rel}@{digest}",
                path=rel,
                line=1,
                anchor=path.name,
            )
        )


def _tracked_files(paths: list[str]) -> set[Path]:
    output = subprocess.check_output(
        ["git", "ls-files", "-z", "--", *paths],
        cwd=REPO_ROOT,
    )
    return {
        REPO_ROOT / item.decode("utf-8")
        for item in output.split(b"\0")
        if item
    }


_STRING_LITERAL = re.compile(
    r'"(?P<double>(?:\\.|[^"\\])*)"'
    r"|'(?P<single>(?:\\.|[^'\\])*)'"
    r"|`(?P<template>(?:\\.|[^`\\])*)`",
    re.DOTALL,
)
_CJK = re.compile(r"[\u3400-\u9fff]")


def _add_ui_text_observations(
    out: list[Observation], *, category: str, paths: Iterable[Path]
) -> None:
    """Inventory likely user-visible strings.

    After Zero's product copy is overwhelmingly Chinese.  Restricting the
    mechanical pass to CJK-containing literals avoids selectors/imports while
    still making every current visible Chinese phrase traceable.  Runtime text
    capture remains the authority for visibility and interpolation.
    """

    for path in sorted({item.resolve() for item in paths if item.is_file()}):
        text = path.read_text(encoding="utf-8", errors="replace")
        rel = _relative(path)
        for match in _STRING_LITERAL.finditer(text):
            raw = next(
                value
                for value in (match.group("double"), match.group("single"), match.group("template"))
                if value is not None
            )
            if not _CJK.search(raw):
                continue
            line = _line_for_offset(text, match.start())
            anchor = _clean_anchor(raw, limit=240)
            digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
            out.append(
                Observation(
                    category=category,
                    key=f"{rel}#{line}:{digest}",
                    path=rel,
                    line=line,
                    anchor=anchor,
                )
            )


def _extract_object_body(text: str, marker: str) -> tuple[str, int]:
    start = text.index(marker)
    brace = text.index("{", start)
    depth = 0
    quote: str | None = None
    escaped = False
    for index in range(brace, len(text)):
        char = text[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in {"'", '"', "`"}:
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[brace + 1 : index], brace + 1
    raise ValueError(f"unterminated object after {marker!r}")


def _scan_object_members(
    out: list[Observation], *, category: str, path: Path, marker: str
) -> None:
    text = path.read_text(encoding="utf-8")
    body, base = _extract_object_body(text, marker)
    # Export objects often put several `name: value` pairs on one line.  Bridge
    # objects additionally use shorthand `name,` members.  Scan both forms in
    # the already brace-bounded body instead of assuming one member per line.
    matches = [
        *re.finditer(r"\b([A-Za-z_$][\w$]*)\s*:", body),
        *re.finditer(r"(?m)^\s{4,}([A-Za-z_$][\w$]*)\s*,\s*(?://.*)?$", body),
    ]
    seen: set[str] = set()
    for match in sorted(matches, key=lambda item: item.start()):
        key = match.group(1)
        if key in seen:
            continue
        seen.add(key)
        out.append(
            Observation(
                category=category,
                key=key,
                path=_relative(path),
                line=_line_for_offset(text, base + match.start()),
                anchor=_clean_anchor(match.group(0)),
            )
        )


def discover_sources() -> list[Observation]:
    observations: list[Observation] = []

    react_root = REPO_ROOT / "react" / "src"
    react_files = sorted(
        path
        for path in react_root.rglob("*")
        if path.is_file()
        and path.suffix in {".ts", ".tsx"}
        and not path.name.endswith(".d.ts")
    )
    legacy_product_files: set[Path] = {
        REPO_ROOT / "capacitor.config.json",
        REPO_ROOT / "package.json",
        REPO_ROOT / "package-lock.json",
        REPO_ROOT / "www" / "index.html",
        REPO_ROOT / "www" / "js" / "calc.js",
        REPO_ROOT / "android" / "app" / "build.gradle",
        REPO_ROOT / "android" / "app" / "src" / "main" / "AndroidManifest.xml",
    }
    legacy_product_files.update(
        _tracked_files(
            [
                "www",
                "react",
                "android",
                "cloudbase",
                "capacitor.config.json",
                "package.json",
                "package-lock.json",
            ]
        )
    )
    legacy_product_files.update(react_files)
    react_event_pattern = re.compile(
        r"\b(on(?:Click|Change|Submit|Input|KeyDown|KeyUp|PointerDown|PointerMove|PointerUp|"
        r"PointerCancel|TouchStart|TouchMove|TouchEnd|TouchCancel|PanUpdate|LongPress|Tap))\s*="
        r"|addEventListener\(\s*['\"]([^'\"]+)['\"]"
    )
    for path in react_files:
        rel = _relative(path)
        observations.append(
            Observation("legacy.react_source", rel, rel, 1, path.name)
        )
        text = path.read_text(encoding="utf-8")
        for match in react_event_pattern.finditer(text):
            event = match.group(1) or f"listener:{match.group(2)}"
            line = _line_for_offset(text, match.start())
            observations.append(
                Observation(
                    "legacy.react_event",
                    f"{rel}#{line}:{event}",
                    rel,
                    line,
                    _clean_anchor(match.group(0)),
                )
            )

    _add_ui_text_observations(
        observations,
        category="legacy.ui_text",
        paths=[REPO_ROOT / "www" / "index.html", *react_files],
    )

    index_path = REPO_ROOT / "www" / "index.html"
    _add_regex_observations(
        observations,
        category="legacy.dom_id",
        path=index_path,
        pattern=re.compile(r"\bid=[\"']([^\"']+)[\"']"),
    )
    _add_regex_observations(
        observations,
        category="legacy.css_token",
        path=index_path,
        pattern=re.compile(r"(--[A-Za-z0-9_-]+)\s*:"),
    )
    _add_regex_observations(
        observations,
        category="legacy.keyframes",
        path=index_path,
        pattern=re.compile(r"@keyframes\s+([A-Za-z0-9_-]+)"),
    )
    _scan_object_members(
        observations,
        category="legacy.bridge",
        path=index_path,
        marker="window.__azBridge =",
    )
    _add_regex_observations(
        observations,
        category="legacy.index_function",
        path=index_path,
        pattern=re.compile(r"(?m)^\s{2}function\s+([A-Za-z_$][\w$]*)\s*\("),
    )
    index_text = index_path.read_text(encoding="utf-8")
    index_event_pattern = re.compile(
        r"addEventListener\(\s*['\"]([^'\"]+)['\"]|\.on(click|change|input|load|error)\s*="
    )
    for match in index_event_pattern.finditer(index_text):
        event = match.group(1) or f"on{match.group(2)}"
        line = _line_for_offset(index_text, match.start())
        observations.append(
            Observation(
                "legacy.index_event",
                f"www/index.html#{line}:{event}",
                "www/index.html",
                line,
                _clean_anchor(match.group(0)),
            )
        )

    calc_path = REPO_ROOT / "www" / "js" / "calc.js"
    _scan_object_members(
        observations,
        category="legacy.calc_export",
        path=calc_path,
        marker="module.exports =",
    )

    storage_value = r"(?P<quote>['\"])(?P<key>(?:after-zero|debt-manager)-[A-Za-z0-9_-]+)(?P=quote)"
    legacy_storage_declaration = re.compile(
        r"(?:\b(?:var|const)\s+|,\s*)(?:[A-Z][A-Z0-9_]*KEY|KEY|DKEY)\s*=\s*" + storage_value
    )
    legacy_storage_call = re.compile(
        r"localStorage\.(?:getItem|setItem|removeItem)\(\s*" + storage_value
    )
    legacy_storage_seen: set[str] = set()
    for path in [index_path, *react_files]:
        text = path.read_text(encoding="utf-8")
        for pattern in [legacy_storage_declaration, legacy_storage_call]:
            for match in pattern.finditer(text):
                key = match.group("key")
                if key in legacy_storage_seen:
                    continue
                legacy_storage_seen.add(key)
                observations.append(
                    Observation(
                        "legacy.storage",
                        key,
                        _relative(path),
                        _line_for_offset(text, match.start()),
                        key,
                    )
                )

    cloud_root = REPO_ROOT / "cloudbase" / "functions"
    if cloud_root.exists():
        for directory in sorted(path for path in cloud_root.iterdir() if path.is_dir()):
            observations.append(
                Observation(
                    "legacy.cloud_function",
                    directory.name,
                    _relative(directory),
                    1,
                    directory.name,
                )
            )
        legacy_product_files.update(
            path
            for path in cloud_root.rglob("*")
            if path.is_file() and "node_modules" not in path.parts
        )

    legacy_native_root = (
        REPO_ROOT
        / "android"
        / "app"
        / "src"
        / "main"
        / "java"
        / "io"
        / "github"
        / "jenkjyu"
        / "afterzero"
    )
    if legacy_native_root.exists():
        for path in sorted(legacy_native_root.rglob("*.java")):
            legacy_product_files.add(path)
            observations.append(
                Observation(
                    "legacy.native_source",
                    _relative(path),
                    _relative(path),
                    1,
                    path.name,
                )
            )

    _add_file_sha_observations(
        observations,
        category="legacy.file_sha",
        paths=legacy_product_files,
    )

    flutter_root = REPO_ROOT / "flutter" / "lib"
    flutter_files = sorted(flutter_root.rglob("*.dart"))
    ui_type_pattern = re.compile(
        r"(?m)^class\s+([A-Za-z_][A-Za-z0-9_]*)\s+extends\s+"
        r"(?:ConsumerStatefulWidget|ConsumerWidget|StatefulWidget|StatelessWidget|"
        r"ConsumerState<[^>]+>|State<[^>]+>|CustomPainter)\b"
    )
    navigation_pattern = re.compile(
        r"\b(showModalBottomSheet|showDialog|showDatePicker|showTimePicker|MaterialPageRoute|"
        r"showGeneralDialog|showCupertinoModalPopup)\b"
    )
    flutter_event_pattern = re.compile(
        r"\b(on(?:Tap|DoubleTap|LongPress|LongPressStart|LongPressMoveUpdate|LongPressEnd|"
        r"PanStart|PanUpdate|PanEnd|PanCancel|HorizontalDragStart|HorizontalDragUpdate|"
        r"HorizontalDragEnd|HorizontalDragCancel|VerticalDragStart|VerticalDragUpdate|"
        r"VerticalDragEnd|ScaleStart|ScaleUpdate|ScaleEnd|PointerDown|PointerMove|"
        r"PointerUp|PointerCancel|Pressed|Changed|Submitted|EditingComplete|Reorder))\s*:"
    )
    flutter_storage_seen: set[str] = set()
    flutter_storage_declaration = re.compile(
        r"\b(?:static\s+)?const\s+(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*" + storage_value
    )
    for path in flutter_files:
        rel = _relative(path)
        observations.append(
            Observation("flutter.dart_source", rel, rel, 1, path.name)
        )
        text = path.read_text(encoding="utf-8")
        for match in ui_type_pattern.finditer(text):
            observations.append(
                Observation(
                    "flutter.ui_type",
                    match.group(1),
                    rel,
                    _line_for_offset(text, match.start()),
                    _clean_anchor(match.group(0)),
                )
            )
        for match in flutter_event_pattern.finditer(text):
            line = _line_for_offset(text, match.start())
            observations.append(
                Observation(
                    "flutter.event",
                    f"{rel}#{line}:{match.group(1)}",
                    rel,
                    line,
                    _clean_anchor(match.group(0)),
                )
            )
        for match in navigation_pattern.finditer(text):
            line = _line_for_offset(text, match.start())
            observations.append(
                Observation(
                    "flutter.navigation",
                    f"{rel}#{line}:{match.group(1)}",
                    rel,
                    line,
                    _clean_anchor(match.group(0)),
                )
            )
        for match in flutter_storage_declaration.finditer(text):
            key = match.group("key")
            name = match.group("name")
            if path.name != "local_store.dart" and "key" not in name.lower():
                continue
            if key in flutter_storage_seen:
                continue
            flutter_storage_seen.add(key)
            observations.append(
                Observation(
                    "flutter.storage",
                    key,
                    rel,
                    _line_for_offset(text, match.start()),
                    key,
                )
            )

    _add_ui_text_observations(
        observations,
        category="flutter.ui_text",
        paths=flutter_files,
    )

    theme_path = REPO_ROOT / "flutter" / "lib" / "ui" / "theme.dart"
    _add_regex_observations(
        observations,
        category="flutter.color_literal",
        path=theme_path,
        pattern=re.compile(r"Color\((0x[0-9A-Fa-f]{8})\)"),
    )

    flutter_native_files = _tracked_files(
        ["flutter/android/app/src/main", "flutter/ios/Runner"]
    )
    native_suffixes = {".kt", ".java", ".xml", ".swift", ".m", ".mm", ".plist"}
    for path in sorted(
        item
        for item in flutter_native_files
        if item.is_file() and item.suffix in native_suffixes
    ):
        observations.append(
            Observation(
                "flutter.native_source",
                _relative(path),
                _relative(path),
                1,
                path.name,
            )
        )

    pubspec = REPO_ROOT / "flutter" / "pubspec.yaml"
    pubspec_text = pubspec.read_text(encoding="utf-8")
    in_dependencies = False
    for line_no, line in enumerate(pubspec_text.splitlines(), start=1):
        if line == "dependencies:":
            in_dependencies = True
            continue
        if in_dependencies and line and not line.startswith(" "):
            in_dependencies = False
        match = re.match(r"^  ([A-Za-z0-9_]+):", line) if in_dependencies else None
        if match and match.group(1) != "flutter":
            observations.append(
                Observation(
                    "flutter.dependency",
                    match.group(1),
                    _relative(pubspec),
                    line_no,
                    line.strip(),
                )
            )

    method_channel_pattern = re.compile(r"MethodChannel\(\s*['\"]([^'\"]+)['\"]")
    for path in [*flutter_files, *sorted((REPO_ROOT / "flutter" / "android").rglob("*.kt"))]:
        _add_regex_observations(
            observations,
            category="flutter.method_channel",
            path=path,
            pattern=method_channel_pattern,
        )

    legacy_tests = sorted(
        path
        for root in [REPO_ROOT / "test", REPO_ROOT / "react" / "__tests__"]
        if root.exists()
        for path in root.rglob("*")
        if path.is_file()
        and (
            path.name.endswith(".test.js")
            or path.name.endswith(".test.ts")
            or path.name.endswith(".test.tsx")
        )
    )
    flutter_tests = sorted(
        path
        for root in [REPO_ROOT / "flutter" / "test", REPO_ROOT / "flutter" / "integration_test"]
        if root.exists()
        for path in root.rglob("*.dart")
    )
    _add_file_sha_observations(
        observations,
        category="legacy.test_sha",
        paths=legacy_tests,
    )
    _add_file_sha_observations(
        observations,
        category="flutter.test_sha",
        paths=flutter_tests,
    )

    flutter_product_files = _tracked_files(
        [
            "flutter/lib",
            "flutter/android",
            "flutter/ios",
            "flutter/assets",
            "flutter/test",
            "flutter/integration_test",
            "flutter/pubspec.yaml",
            "flutter/pubspec.lock",
            "flutter/analysis_options.yaml",
        ]
    )
    _add_file_sha_observations(
        observations,
        category="flutter.file_sha",
        paths=flutter_product_files,
    )

    parity_tool_files = [
        path
        for path in SCRIPT_DIR.rglob("*")
        if path.is_file()
        and "__pycache__" not in path.parts
        and path.name
        not in {"manifest.json", "scenarios.json", "source_inventory.json"}
        and "fixtures" not in path.parts
    ]
    _add_file_sha_observations(
        observations,
        category="parity.tool_sha",
        paths=parity_tool_files,
    )
    _add_file_sha_observations(
        observations,
        category="parity.fixture_sha",
        paths=(SCRIPT_DIR / "fixtures").rglob("*"),
    )

    unique: dict[tuple[str, str, str], Observation] = {}
    for item in observations:
        unique[item.identity] = item
    return sorted(unique.values(), key=lambda item: (item.category, item.key, item.path))


def _load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"missing file: {path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"invalid JSON in {path}: {error}") from error


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )


def inventory_payload(observations: Iterable[Observation]) -> dict[str, Any]:
    items = [asdict(item) | {"ref": item.ref} for item in observations]
    digest_input = "\n".join(
        f"{item['category']}\0{item['key']}\0{item['path']}" for item in items
    ).encode("utf-8")
    by_category: dict[str, int] = {}
    for item in items:
        by_category[item["category"]] = by_category.get(item["category"], 0) + 1
    return {
        "schema_version": 1,
        "identity_sha256": hashlib.sha256(digest_input).hexdigest(),
        "counts": dict(sorted(by_category.items())),
        "observations": items,
    }


def snapshot_inventory(output: Path) -> None:
    payload = inventory_payload(discover_sources())
    _write_json(output, payload)
    print(f"wrote {len(payload['observations'])} observations to {output}")


def _require(condition: bool, errors: list[str], message: str) -> None:
    if not condition:
        errors.append(message)


def _validate_source_anchor(source: dict[str, Any], owner: str, errors: list[str]) -> None:
    path_value = source.get("path")
    anchor = source.get("anchor")
    _require(isinstance(path_value, str) and bool(path_value), errors, f"{owner}: source path missing")
    _require(isinstance(anchor, str) and bool(anchor), errors, f"{owner}: source anchor missing")
    if not isinstance(path_value, str) or not isinstance(anchor, str):
        return
    target = REPO_ROOT / path_value
    _require(target.is_file(), errors, f"{owner}: source file does not exist: {path_value}")
    if target.is_file():
        text = target.read_text(encoding="utf-8", errors="replace")
        _require(anchor in text, errors, f"{owner}: anchor not found in {path_value}: {anchor!r}")


def validate_files(
    manifest_path: Path = DEFAULT_MANIFEST,
    scenarios_path: Path = DEFAULT_SCENARIOS,
    inventory_path: Path = DEFAULT_INVENTORY,
) -> dict[str, Any]:
    manifest = _load_json(manifest_path)
    scenarios_doc = _load_json(scenarios_path)
    frozen_inventory = _load_json(inventory_path)
    errors: list[str] = []

    _require(manifest.get("schema_version") == 1, errors, "manifest schema_version must be 1")
    _require(scenarios_doc.get("schema_version") == 1, errors, "scenarios schema_version must be 1")
    _require(frozen_inventory.get("schema_version") == 1, errors, "inventory schema_version must be 1")

    baseline = manifest.get("baseline")
    _require(isinstance(baseline, dict), errors, "manifest baseline must be an object")
    if isinstance(baseline, dict):
        for field in [
            "commit",
            "legacy_package",
            "flutter_package",
            "oracle",
            "captured_at",
            "legacy_tree",
            "flutter_tree",
            "legacy_debug_apk_sha256",
            "flutter_debug_preview_apk_sha256",
        ]:
            _require(bool(baseline.get(field)), errors, f"manifest baseline.{field} missing")
        for field in ["legacy_debug_apk_sha256", "flutter_debug_preview_apk_sha256"]:
            _require(
                isinstance(baseline.get(field), str)
                and bool(re.fullmatch(r"[0-9a-f]{64}", baseline[field])),
                errors,
                f"manifest baseline.{field} must be a lowercase SHA-256",
            )
        commit = baseline.get("commit")
        _require(
            isinstance(commit, str) and bool(re.fullmatch(r"[0-9a-f]{40}", commit)),
            errors,
            "manifest baseline.commit must be a full lowercase git SHA",
        )
        if isinstance(commit, str) and re.fullmatch(r"[0-9a-f]{40}", commit):
            for field, paths in {
                "legacy_tree": ["www", "react", "android", "cloudbase"],
                "flutter_tree": ["lib", "android", "ios"],
            }.items():
                tree_map = baseline.get(field)
                _require(isinstance(tree_map, dict), errors, f"manifest baseline.{field} must be an object")
                if not isinstance(tree_map, dict):
                    continue
                for key in paths:
                    repo_path = key if field == "legacy_tree" else f"flutter/{key}"
                    expected = tree_map.get(key)
                    _require(
                        isinstance(expected, str) and bool(re.fullmatch(r"[0-9a-f]{40}", expected)),
                        errors,
                        f"manifest baseline.{field}.{key} must be a full tree SHA",
                    )
                    if isinstance(expected, str):
                        try:
                            actual = subprocess.check_output(
                                ["git", "rev-parse", f"{commit}:{repo_path}"],
                                cwd=REPO_ROOT,
                                text=True,
                                stderr=subprocess.STDOUT,
                            ).strip()
                            _require(
                                actual == expected,
                                errors,
                                f"baseline tree mismatch for {repo_path}: expected={expected} actual={actual}",
                            )
                        except subprocess.CalledProcessError as error:
                            errors.append(f"cannot resolve baseline tree {commit}:{repo_path}: {error.output.strip()}")
            protected = subprocess.check_output(
                [
                    "git", "diff", "--name-only", commit, "--",
                    "www", "react", "android", "cloudbase",
                    "capacitor.config.json", "package.json", "package-lock.json",
                ],
                cwd=REPO_ROOT,
                text=True,
            ).splitlines()
            protected = [
                path
                for path in protected
                if not path.startswith("www/js/react-debts/")
                and not path.startswith("android/app/src/main/assets/")
            ]
            _require(
                not protected,
                errors,
                f"protected legacy oracle differs from baseline commit: {protected}",
            )
            untracked = subprocess.check_output(
                [
                    "git", "ls-files", "--others", "--exclude-standard", "--",
                    "www", "react", "android", "cloudbase",
                    "capacitor.config.json", "package.json", "package-lock.json",
                ],
                cwd=REPO_ROOT,
                text=True,
            ).splitlines()
            untracked = [
                path
                for path in untracked
                if not path.startswith("www/js/react-debts/")
                and not path.startswith("android/app/src/main/assets/")
            ]
            _require(
                not untracked,
                errors,
                f"untracked files exist inside protected legacy oracle: {untracked}",
            )

    entries = manifest.get("entries")
    _require(isinstance(entries, list) and bool(entries), errors, "manifest entries must be a non-empty list")
    entries = entries if isinstance(entries, list) else []
    entry_ids: set[str] = set()
    selectors: list[tuple[str, str]] = []
    scenario_links: dict[str, set[str]] = {}
    verified_entries: list[dict[str, Any]] = []
    for index, entry in enumerate(entries):
        owner = f"entry[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{owner}: must be an object")
            continue
        entry_id = entry.get("id")
        _require(isinstance(entry_id, str) and bool(entry_id), errors, f"{owner}: id missing")
        if not isinstance(entry_id, str):
            continue
        _require(entry_id not in entry_ids, errors, f"duplicate entry id: {entry_id}")
        entry_ids.add(entry_id)
        owner = entry_id
        for field in [
            "domain",
            "kind",
            "title",
            "priority",
            "status",
            "legacy_sources",
            "flutter_sources",
            "inventory_selectors",
            "scenario_ids",
            "evidence",
            "acceptance",
            "notes",
        ]:
            _require(field in entry, errors, f"{owner}: missing {field}")
        _require(entry.get("status") in ALLOWED_STATUSES, errors, f"{owner}: invalid status {entry.get('status')!r}")
        _require(entry.get("status") != "unverified", errors, f"{owner}: raw unverified status is not allowed after 8.1 classification")
        _require(entry.get("priority") in {"P0", "P1", "P2", "P3"}, errors, f"{owner}: invalid priority")
        _require(
            isinstance(entry.get("acceptance"), list) and bool(entry.get("acceptance")),
            errors,
            f"{owner}: acceptance must be a non-empty list",
        )
        _require(
            isinstance(entry.get("notes"), list) and bool(entry.get("notes")),
            errors,
            f"{owner}: notes must be a non-empty list",
        )
        if entry.get("status") in DIFFERENCE_STATUSES:
            for field in ["legacy_behavior", "flutter_behavior", "resolution"]:
                _require(bool(entry.get(field)), errors, f"{owner}: {field} required for difference status")
        for side in ["legacy_sources", "flutter_sources"]:
            sources = entry.get(side)
            _require(isinstance(sources, list), errors, f"{owner}: {side} must be a list")
            if isinstance(sources, list):
                for source in sources:
                    if isinstance(source, dict):
                        _validate_source_anchor(source, owner, errors)
                    else:
                        errors.append(f"{owner}: {side} source must be an object")
        entry_selectors = entry.get("inventory_selectors")
        _require(isinstance(entry_selectors, list) and bool(entry_selectors), errors, f"{owner}: inventory_selectors must be non-empty")
        if isinstance(entry_selectors, list):
            for selector in entry_selectors:
                _require(isinstance(selector, str) and bool(selector), errors, f"{owner}: invalid inventory selector")
                if isinstance(selector, str):
                    selectors.append((owner, selector))
        scenario_ids = entry.get("scenario_ids")
        _require(isinstance(scenario_ids, list) and bool(scenario_ids), errors, f"{owner}: scenario_ids must be non-empty")
        if isinstance(scenario_ids, list):
            scenario_links[owner] = set(item for item in scenario_ids if isinstance(item, str))
        evidence = entry.get("evidence")
        _require(isinstance(evidence, list) and bool(evidence), errors, f"{owner}: evidence must be non-empty")
        if isinstance(evidence, list):
            for kind in evidence:
                _require(kind in ALLOWED_EVIDENCE, errors, f"{owner}: invalid evidence kind {kind!r}")
        if entry.get("status") == "verified":
            _require(
                isinstance(entry.get("evidence_refs"), list) and bool(entry.get("evidence_refs")),
                errors,
                f"{owner}: verified entry requires a non-empty evidence_refs list",
            )
            verified_entries.append(entry)
        if entry.get("status") == "user_approved_difference":
            approval = entry.get("approval_ref")
            _require(isinstance(approval, dict), errors, f"{owner}: approval_ref object required")
            if isinstance(approval, dict):
                approval_path = approval.get("path")
                approval_sha = approval.get("sha256")
                _require(
                    isinstance(approval_path, str) and bool(approval_path),
                    errors,
                    f"{owner}: approval_ref.path missing",
                )
                _require(
                    isinstance(approval_sha, str) and bool(re.fullmatch(r"[0-9a-f]{64}", approval_sha)),
                    errors,
                    f"{owner}: approval_ref.sha256 invalid",
                )
                if isinstance(approval_path, str):
                    target = REPO_ROOT / approval_path
                    _require(target.is_file(), errors, f"{owner}: approval file missing: {approval_path}")
                    if target.is_file() and isinstance(approval_sha, str):
                        _require(
                            hashlib.sha256(target.read_bytes()).hexdigest() == approval_sha,
                            errors,
                            f"{owner}: approval file hash mismatch",
                        )

    fixtures = scenarios_doc.get("fixtures")
    scenarios = scenarios_doc.get("scenarios")
    _require(isinstance(fixtures, list) and bool(fixtures), errors, "scenarios fixtures must be non-empty")
    _require(isinstance(scenarios, list) and bool(scenarios), errors, "scenarios list must be non-empty")
    fixtures = fixtures if isinstance(fixtures, list) else []
    scenarios = scenarios if isinstance(scenarios, list) else []
    fixture_ids: set[str] = set()
    for fixture in fixtures:
        if not isinstance(fixture, dict):
            errors.append("fixture must be an object")
            continue
        fixture_id = fixture.get("id")
        _require(isinstance(fixture_id, str) and bool(fixture_id), errors, "fixture id missing")
        if isinstance(fixture_id, str):
            _require(fixture_id not in fixture_ids, errors, f"duplicate fixture id: {fixture_id}")
            fixture_ids.add(fixture_id)
        for field in [
            "description",
            "state_file",
            "storage_status",
            "driver_status",
            "required_drivers",
            "frozen_now",
            "timezone",
            "locale",
            "random_seed",
            "profiles",
        ]:
            _require(bool(fixture.get(field)), errors, f"fixture {fixture_id}: missing {field}")
        _require(
            isinstance(fixture.get("profiles"), dict) and bool(fixture.get("profiles")),
            errors,
            f"fixture {fixture_id}: profiles must be a non-empty object",
        )
        _require(
            isinstance(fixture.get("overlay", {}), dict),
            errors,
            f"fixture {fixture_id}: overlay must be an object",
        )
        _require(
            fixture.get("storage_status") in {"materialized", "case_spec_only"},
            errors,
            f"fixture {fixture_id}: invalid storage_status",
        )
        _require(
            fixture.get("driver_status") in {"complete", "partial", "pending"},
            errors,
            f"fixture {fixture_id}: invalid driver_status",
        )
        _require(
            isinstance(fixture.get("required_drivers"), list)
            and bool(fixture.get("required_drivers")),
            errors,
            f"fixture {fixture_id}: required_drivers must be non-empty",
        )
        _require(
            isinstance(fixture.get("implemented_drivers"), list),
            errors,
            f"fixture {fixture_id}: implemented_drivers must be a list",
        )
        if isinstance(fixture.get("implemented_drivers"), list) and isinstance(
            fixture.get("required_drivers"), list
        ):
            _require(
                set(fixture["implemented_drivers"]) <= set(fixture["required_drivers"]),
                errors,
                f"fixture {fixture_id}: implemented_drivers must be a subset of required_drivers",
            )
        state_file = fixture.get("state_file")
        if isinstance(state_file, str):
            _require((SCRIPT_DIR / state_file).is_file(), errors, f"fixture {fixture_id}: missing state file {state_file}")
            if (
                (SCRIPT_DIR / state_file).is_file()
                and isinstance(fixture_id, str)
                and fixture.get("storage_status") == "materialized"
            ):
                try:
                    materialized = materialize_fixture(
                        fixture_id,
                        scenarios_path=scenarios_path,
                    )
                    _require(
                        isinstance(materialized.get("legacy", {}).get("localStorage"), dict),
                        errors,
                        f"fixture {fixture_id}: materialized legacy.localStorage missing",
                    )
                    _require(
                        isinstance(materialized.get("flutter", {}).get("sharedPreferences"), dict),
                        errors,
                        f"fixture {fixture_id}: materialized flutter.sharedPreferences missing",
                    )
                except (OSError, ValueError) as error:
                    errors.append(f"fixture {fixture_id}: cannot materialize: {error}")

    scenario_ids: set[str] = set()
    covered_entry_ids: set[str] = set()
    for scenario in scenarios:
        if not isinstance(scenario, dict):
            errors.append("scenario must be an object")
            continue
        scenario_id = scenario.get("id")
        _require(isinstance(scenario_id, str) and bool(scenario_id), errors, "scenario id missing")
        if not isinstance(scenario_id, str):
            continue
        _require(scenario_id not in scenario_ids, errors, f"duplicate scenario id: {scenario_id}")
        scenario_ids.add(scenario_id)
        linked_fixtures = scenario.get("fixture_ids")
        _require(
            isinstance(linked_fixtures, list) and bool(linked_fixtures),
            errors,
            f"{scenario_id}: fixture_ids must be non-empty",
        )
        if isinstance(linked_fixtures, list):
            for fixture_id in linked_fixtures:
                _require(
                    fixture_id in fixture_ids,
                    errors,
                    f"{scenario_id}: unknown fixture {fixture_id!r}",
                )
        matrix_ids = scenario.get("matrix_ids")
        _require(isinstance(matrix_ids, list) and bool(matrix_ids), errors, f"{scenario_id}: matrix_ids must be non-empty")
        if isinstance(matrix_ids, list):
            for entry_id in matrix_ids:
                _require(entry_id in entry_ids, errors, f"{scenario_id}: unknown matrix id {entry_id!r}")
                if isinstance(entry_id, str):
                    covered_entry_ids.add(entry_id)
        for field in ["preconditions", "steps", "expected", "evidence"]:
            value = scenario.get(field)
            _require(isinstance(value, list) and bool(value), errors, f"{scenario_id}: {field} must be non-empty")
        for kind in scenario.get("evidence", []) if isinstance(scenario.get("evidence"), list) else []:
            _require(kind in ALLOWED_EVIDENCE, errors, f"{scenario_id}: invalid evidence kind {kind!r}")
        _require(
            scenario.get("execution_status") in {"automated", "specified"},
            errors,
            f"{scenario_id}: invalid execution_status",
        )

    for entry_id, linked in scenario_links.items():
        for scenario_id in linked:
            _require(scenario_id in scenario_ids, errors, f"{entry_id}: unknown scenario id {scenario_id!r}")
            matching = next(
                (
                    item
                    for item in scenarios
                    if isinstance(item, dict) and item.get("id") == scenario_id
                ),
                {},
            )
            _require(
                entry_id in matching.get("matrix_ids", []),
                errors,
                f"{entry_id}: scenario {scenario_id} does not link back",
            )
    for scenario in scenarios:
        if not isinstance(scenario, dict):
            continue
        for entry_id in scenario.get("matrix_ids", []):
            _require(
                scenario.get("id") in scenario_links.get(entry_id, set()),
                errors,
                f"{scenario.get('id')}: matrix entry {entry_id} does not link back",
            )
    _require(entry_ids <= covered_entry_ids, errors, f"entries without reverse scenario coverage: {sorted(entry_ids - covered_entry_ids)}")

    current = inventory_payload(discover_sources())
    frozen_items = frozen_inventory.get("observations", [])
    frozen_identities = {
        (item.get("category"), item.get("key"), item.get("path"))
        for item in frozen_items
        if isinstance(item, dict)
    }
    current_identities = {
        (item["category"], item["key"], item["path"])
        for item in current["observations"]
    }
    _require(
        frozen_identities == current_identities,
        errors,
        "source inventory changed; refresh intentionally after mapping additions/removals: "
        f"added={sorted(current_identities - frozen_identities)} removed={sorted(frozen_identities - current_identities)}",
    )

    observations_by_ref: dict[str, list[dict[str, Any]]] = {}
    for item in current["observations"]:
        observations_by_ref.setdefault(item["ref"], []).append(item)
    refs = sorted(observations_by_ref)
    matched_refs: set[str] = set()
    selector_hits: dict[tuple[str, str], int] = {}
    for owner, selector in selectors:
        hits = [ref for ref in refs if fnmatch.fnmatchcase(ref, selector)]
        selector_hits[(owner, selector)] = len(hits)
        matched_refs.update(hits)
        _require(bool(hits), errors, f"{owner}: inventory selector matched nothing: {selector}")
    _require(
        set(refs) <= matched_refs,
        errors,
        f"unclassified source observations: {sorted(set(refs) - matched_refs)}",
    )

    if errors:
        raise ValueError("parity validation failed:\n- " + "\n- ".join(errors))

    return {
        "entries": len(entries),
        "fixtures": len(fixtures),
        "materialized_storage_fixtures": sum(
            1 for fixture in fixtures if fixture.get("storage_status") == "materialized"
        ),
        "fully_driven_fixtures": sum(
            1 for fixture in fixtures if fixture.get("driver_status") == "complete"
        ),
        "scenarios": len(scenarios),
        "automated_scenarios": sum(
            1 for scenario in scenarios if scenario.get("execution_status") == "automated"
        ),
        "specified_scenarios": sum(
            1 for scenario in scenarios if scenario.get("execution_status") == "specified"
        ),
        "observations": len(current["observations"]),
        "inventory_counts": current["counts"],
        "statuses": {
            status: sum(1 for entry in entries if entry.get("status") == status)
            for status in sorted(ALLOWED_STATUSES)
            if any(entry.get("status") == status for entry in entries)
        },
    }


def render_matrix(
    manifest_path: Path = DEFAULT_MANIFEST,
    scenarios_path: Path = DEFAULT_SCENARIOS,
    output: Path = DEFAULT_MATRIX_DOC,
) -> None:
    manifest = _load_json(manifest_path)
    scenarios = _load_json(scenarios_path)
    entries = manifest.get("entries", [])
    status_counts: dict[str, int] = {}
    for entry in entries:
        status = str(entry.get("status", "unknown"))
        status_counts[status] = status_counts.get(status, 0) + 1
    lines = [
        "# Flutter 全量对齐矩阵",
        "",
        "> 本文件由 `flutter/tool/parity/parity_tool.py render` 生成；请修改机器可检查的 JSON 源，不要手改本文件。",
        "",
        f"- 基准提交：`{manifest.get('baseline', {}).get('commit', 'unknown')}`",
        f"- 旧版包名：`{manifest.get('baseline', {}).get('legacy_package', 'unknown')}`",
        f"- Flutter 包名：`{manifest.get('baseline', {}).get('flutter_package', 'unknown')}`",
        f"- 矩阵项：{len(entries)}",
        f"- Case profile：{len(scenarios.get('fixtures', []))}",
        "- 可物化 storage seed："
        + str(sum(1 for item in scenarios.get("fixtures", []) if item.get("storage_status") == "materialized")),
        "- 其余 case spec："
        + str(sum(1 for item in scenarios.get("fixtures", []) if item.get("storage_status") == "case_spec_only")),
        "- 完整驱动 profile："
        + str(sum(1 for item in scenarios.get("fixtures", []) if item.get("driver_status") == "complete")),
        f"- 场景：{len(scenarios.get('scenarios', []))}",
        "- 场景执行状态："
        + "，".join(
            f"`{status}` {sum(1 for item in scenarios.get('scenarios', []) if item.get('execution_status') == status)}"
            for status in ["automated", "specified"]
        ),
        "- 状态：" + "，".join(f"`{key}` {value}" for key, value in sorted(status_counts.items())),
        "",
        "状态只表示当前证据结论；`verified` 必须带证据路径。`difference` 不是遗漏，而是已被完整性系统发现、留给后续业务阶段修复。",
        "",
    ]
    domains = sorted({entry.get("domain", "unknown") for entry in entries})
    for domain in domains:
        lines.extend(
            [
                f"## {domain}",
                "",
                "| ID | 优先级 | 类型 | 项目 | 状态 | 场景 | 说明 |",
                "|---|---|---|---|---|---|---|",
            ]
        )
        for entry in [item for item in entries if item.get("domain") == domain]:
            notes = "；".join(str(note) for note in entry.get("notes", []))
            notes = notes.replace("|", "\\|").replace("\n", " ")
            scenario_text = ", ".join(f"`{item}`" for item in entry.get("scenario_ids", []))
            lines.append(
                f"| `{entry.get('id')}` | `{entry.get('priority')}` | {entry.get('kind')} | {entry.get('title')} | "
                f"`{entry.get('status')}` | {scenario_text} | {notes} |"
            )
        lines.append("")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"rendered {len(entries)} entries to {output}")


def compare_images(
    legacy_path: Path,
    flutter_path: Path,
    *,
    output_path: Path | None,
    threshold: int,
    size_mode: str = "strict",
) -> dict[str, Any]:
    if not 0 <= threshold <= 64:
        raise ValueError("image threshold must be between 0 and 64 inclusive")
    try:
        from PIL import Image, ImageChops, ImageEnhance
    except ImportError as error:
        raise ValueError(
            "Pillow is required; install flutter/tool/parity/requirements.txt"
        ) from error
    legacy = Image.open(legacy_path).convert("RGBA")
    flutter = Image.open(flutter_path).convert("RGBA")
    original_sizes = {"legacy": legacy.size, "flutter": flutter.size}
    crop_boxes: dict[str, tuple[int, int, int, int]] | None = None
    if legacy.size != flutter.size:
        if size_mode != "center-crop":
            raise ValueError(
                f"image size mismatch: legacy={legacy.size} flutter={flutter.size}; "
                "use --size-mode center-crop only after confirming the mismatch is capture framing"
            )
        width_delta = abs(legacy.width - flutter.width)
        height_delta = abs(legacy.height - flutter.height)
        if width_delta > 2 or height_delta > 2:
            raise ValueError(
                "center-crop only permits a 2px capture border mismatch: "
                f"legacy={legacy.size} flutter={flutter.size}"
            )
        width = min(legacy.width, flutter.width)
        height = min(legacy.height, flutter.height)

        def box(image: Any) -> tuple[int, int, int, int]:
            left = (image.width - width) // 2
            top = (image.height - height) // 2
            return (left, top, left + width, top + height)

        crop_boxes = {"legacy": box(legacy), "flutter": box(flutter)}
        legacy = legacy.crop(crop_boxes["legacy"])
        flutter = flutter.crop(crop_boxes["flutter"])
    diff = ImageChops.difference(legacy, flutter).convert("RGB")
    pixels = list(diff.getdata())
    changed = sum(1 for pixel in pixels if max(pixel) > threshold)
    total = len(pixels)
    channel_sum = sum(sum(pixel) for pixel in pixels)
    result = {
        "legacy": str(legacy_path),
        "flutter": str(flutter_path),
        "width": legacy.width,
        "height": legacy.height,
        "threshold": threshold,
        "size_mode": size_mode,
        "max_center_crop_delta": 2 if size_mode == "center-crop" else 0,
        "original_sizes": original_sizes,
        "crop_boxes": crop_boxes,
        "changed_pixels": changed,
        "total_pixels": total,
        "changed_ratio": changed / total if total else 0.0,
        "mean_channel_delta": channel_sum / (total * 3) if total else 0.0,
        "max_channel_delta": max((max(pixel) for pixel in pixels), default=0),
        "bbox": diff.getbbox(),
    }
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        heatmap = ImageEnhance.Contrast(diff).enhance(3.0)
        heatmap.save(output_path)
        result["diff_image"] = str(output_path)
    return result


def _remove_ignored(value: Any, ignored: set[str], path: str = "") -> Any:
    if path in ignored:
        return "<ignored>"
    if isinstance(value, dict):
        return {
            key: _remove_ignored(value[key], ignored, f"{path}.{key}" if path else key)
            for key in sorted(value)
        }
    if isinstance(value, list):
        return [
            _remove_ignored(item, ignored, f"{path}[{index}]")
            for index, item in enumerate(value)
        ]
    return value


def _deep_merge(base: Any, overlay: Any) -> Any:
    if isinstance(base, dict) and isinstance(overlay, dict):
        merged = {key: value for key, value in base.items()}
        for key, value in overlay.items():
            merged[key] = _deep_merge(merged[key], value) if key in merged else value
        return merged
    return overlay


def materialize_fixture(
    fixture_id: str,
    *,
    scenarios_path: Path = DEFAULT_SCENARIOS,
    output: Path | None = None,
) -> dict[str, Any]:
    scenarios_doc = _load_json(scenarios_path)
    fixture = next(
        (
            item
            for item in scenarios_doc.get("fixtures", [])
            if isinstance(item, dict) and item.get("id") == fixture_id
        ),
        None,
    )
    if fixture is None:
        raise ValueError(f"unknown fixture: {fixture_id}")
    if fixture.get("storage_status") != "materialized":
        raise ValueError(
            f"fixture {fixture_id} is case_spec_only; implement its state driver before materializing"
        )
    state_file = fixture.get("state_file")
    if not isinstance(state_file, str):
        raise ValueError(f"fixture {fixture_id} has no state_file")
    state = _load_json(SCRIPT_DIR / state_file)
    overlay = fixture.get("overlay", {})
    if not isinstance(overlay, dict):
        raise ValueError(f"fixture {fixture_id} overlay must be an object")
    materialized = _deep_merge(state, overlay)
    materialized["fixture"] = {
        "id": fixture_id,
        "description": fixture.get("description"),
        "frozen_now": fixture.get("frozen_now"),
        "timezone": fixture.get("timezone"),
        "locale": fixture.get("locale"),
        "random_seed": fixture.get("random_seed"),
        "profiles": fixture.get("profiles", {}),
        "storage_status": fixture.get("storage_status"),
        "driver_status": fixture.get("driver_status"),
        "implemented_drivers": fixture.get("implemented_drivers", []),
        "required_drivers": fixture.get("required_drivers", []),
    }
    if output is not None:
        _write_json(output, materialized)
    return materialized


def compare_json_files(legacy_path: Path, flutter_path: Path, ignored: set[str]) -> dict[str, Any]:
    legacy = _remove_ignored(_load_json(legacy_path), ignored)
    flutter = _remove_ignored(_load_json(flutter_path), ignored)
    equal = legacy == flutter
    return {
        "legacy": str(legacy_path),
        "flutter": str(flutter_path),
        "ignored_paths": sorted(ignored),
        "equal": equal,
        "legacy_sha256": hashlib.sha256(
            json.dumps(legacy, ensure_ascii=False, sort_keys=True).encode("utf-8")
        ).hexdigest(),
        "flutter_sha256": hashlib.sha256(
            json.dumps(flutter, ensure_ascii=False, sort_keys=True).encode("utf-8")
        ).hexdigest(),
    }


def _git_commit() -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, text=True
    ).strip()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    snapshot = subparsers.add_parser("snapshot", help="freeze current static source inventory")
    snapshot.add_argument("--output", type=Path, default=DEFAULT_INVENTORY)

    validate = subparsers.add_parser("validate", help="validate inventory, manifest, scenarios and anchors")
    validate.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    validate.add_argument("--scenarios", type=Path, default=DEFAULT_SCENARIOS)
    validate.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    validate.add_argument("--json", action="store_true", help="print JSON summary")

    render = subparsers.add_parser("render", help="render human-readable matrix markdown")
    render.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    render.add_argument("--scenarios", type=Path, default=DEFAULT_SCENARIOS)
    render.add_argument("--output", type=Path, default=DEFAULT_MATRIX_DOC)
    render.add_argument("--check", action="store_true", help="fail if the generated markdown is stale")

    image_parser = subparsers.add_parser("compare-images", help="measure a same-size screenshot pair")
    image_parser.add_argument("legacy", type=Path)
    image_parser.add_argument("flutter", type=Path)
    image_parser.add_argument("--output", type=Path)
    image_parser.add_argument("--threshold", type=int, default=24)
    image_parser.add_argument(
        "--size-mode",
        choices=["strict", "center-crop"],
        default="strict",
        help="explicitly normalize capture-only border differences",
    )
    image_parser.add_argument("--fail-if-changed", action="store_true")

    json_parser = subparsers.add_parser("compare-json", help="compare canonical JSON evidence")
    json_parser.add_argument("legacy", type=Path)
    json_parser.add_argument("flutter", type=Path)
    json_parser.add_argument("--ignore", action="append", default=[])
    json_parser.add_argument("--fail-if-changed", action="store_true")

    fixture_parser = subparsers.add_parser("materialize", help="materialize a fixture base plus overlay")
    fixture_parser.add_argument("fixture_id")
    fixture_parser.add_argument("--scenarios", type=Path, default=DEFAULT_SCENARIOS)
    fixture_parser.add_argument("--output", type=Path)

    args = parser.parse_args(argv)
    try:
        if args.command == "snapshot":
            snapshot_inventory(args.output)
        elif args.command == "validate":
            summary = validate_files(args.manifest, args.scenarios, args.inventory)
            if args.json:
                print(json.dumps(summary, ensure_ascii=False, indent=2))
            else:
                print(
                    "parity manifest valid: "
                    f"{summary['entries']} entries, {summary['scenarios']} scenarios, "
                    f"{summary['observations']} source observations at {_git_commit()[:12]}"
                )
        elif args.command == "render":
            if args.check:
                with tempfile.TemporaryDirectory() as directory:
                    candidate = Path(directory) / "matrix.md"
                    render_matrix(args.manifest, args.scenarios, candidate)
                    if not args.output.is_file() or args.output.read_bytes() != candidate.read_bytes():
                        raise ValueError(f"generated matrix is stale: {args.output}")
                print(f"matrix is current: {args.output}")
            else:
                render_matrix(args.manifest, args.scenarios, args.output)
        elif args.command == "compare-images":
            result = compare_images(
                args.legacy,
                args.flutter,
                output_path=args.output,
                threshold=args.threshold,
                size_mode=args.size_mode,
            )
            print(json.dumps(result, ensure_ascii=False, indent=2))
            if args.fail_if_changed and result["changed_pixels"]:
                return 1
        elif args.command == "compare-json":
            result = compare_json_files(args.legacy, args.flutter, set(args.ignore))
            print(json.dumps(result, ensure_ascii=False, indent=2))
            if args.fail_if_changed and not result["equal"]:
                return 1
        elif args.command == "materialize":
            result = materialize_fixture(
                args.fixture_id,
                scenarios_path=args.scenarios,
                output=args.output,
            )
            if args.output is None:
                print(json.dumps(result, ensure_ascii=False, indent=2))
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
