#!/usr/bin/env python3
"""Convert a generated Android build into an isolated Gate 1 test app.

Only modifies generated files from this CI job. The original app, its local
music, permanent signing settings and repository source remain unchanged.
"""
import json
import re
import sys
from pathlib import Path

ORIGINAL_ID = "com.gt.soundmaster"
TEST_ID = "com.gt.soundmaster.gate1"
TEST_NAME = "GT SoundMaster TEST"


def change_once(text, pattern, replacement, label):
    updated, count = re.subn(pattern, replacement, text)
    if count != 1:
        raise ValueError(f"Expected one {label}; found {count}. Refusing unsafe build.")
    return updated


def prepare(root):
    root = Path(root)
    gradle = root / "android/app/build.gradle"
    manifest = root / "android/app/src/main/AndroidManifest.xml"
    strings = root / "android/app/src/main/res/values/strings.xml"
    activity = root / "android/app/src/main/java/com/gt/soundmaster/MainActivity.java"
    service = root / "android/app/src/main/java/com/gt/soundmaster/MediaPlaybackService.java"

    # Check every input before writing, avoiding a partially converted app.
    for path in [gradle, manifest, strings, activity, service]:
        if not path.is_file():
            raise ValueError(f"Missing generated Android file: {path}")
    if "package com.gt.soundmaster;" not in activity.read_text(encoding="utf-8"):
        raise ValueError("Unexpected MainActivity namespace")
    if "package com.gt.soundmaster;" not in service.read_text(encoding="utf-8"):
        raise ValueError("Unexpected playback service namespace")

    updated = {}
    updated[gradle] = change_once(
        gradle.read_text(encoding="utf-8"),
        r'(?m)^(\s*applicationId\s+["\x27])com\.gt\.soundmaster(["\x27])',
        lambda match: match.group(1) + TEST_ID + match.group(2),
        "original Android applicationId",
    )

    manifest_source = manifest.read_text(encoding="utf-8")
    if 'android:label="@string/app_name"' not in manifest_source:
        raise ValueError("Unexpected Android application label")
    if 'android:name="com.gt.soundmaster.MediaPlaybackService"' not in manifest_source:
        raise ValueError("Expected native playback service missing")
    # Keep the existing Java namespace. Use an explicit launcher class so
    # package-relative resolution cannot target the new applicationId.
    updated[manifest] = change_once(
        manifest_source,
        r'android:name="\.MainActivity"',
        'android:name="com.gt.soundmaster.MainActivity"',
        "Android launcher activity",
    )

    updated_strings = change_once(
        strings.read_text(encoding="utf-8"),
        r'(<string\s+name="app_name"\s*>)GT SoundMaster(</string>)',
        lambda match: match.group(1) + TEST_NAME + match.group(2),
        "launcher app name",
    )
    updated_strings = re.sub(
        r'(<string\s+name="title_activity_main"\s*>)GT SoundMaster(</string>)',
        lambda match: match.group(1) + TEST_NAME + match.group(2),
        updated_strings,
    )
    for name in ("package_name", "custom_url_scheme"):
        updated_strings = re.sub(
            r'(<string\s+name="' + name + r'"\s*>)' + ORIGINAL_ID + r'(</string>)',
            lambda match: match.group(1) + TEST_ID + match.group(2),
            updated_strings,
        )
    updated[strings] = updated_strings

    # Update generated Capacitor configuration so sync cannot revert the ID.
    configs = [root / name for name in ("capacitor.config.json", "capacitor.config.ts", "capacitor.config.js")]
    present = [path for path in configs if path.exists()]
    if len(present) != 1:
        raise ValueError("Expected exactly one generated Capacitor config")
    config_path = present[0]
    if config_path.suffix == ".json":
        config = json.loads(config_path.read_text(encoding="utf-8"))
        if config.get("appId") != ORIGINAL_ID:
            raise ValueError("Unexpected Capacitor application ID")
        config["appId"] = TEST_ID
        config["appName"] = TEST_NAME
        updated[config_path] = json.dumps(config, indent=2) + "\n"
    else:
        config_source = config_path.read_text(encoding="utf-8")
        config_source = change_once(
            config_source,
            r'(appId:\s*["\x27])com\.gt\.soundmaster(["\x27])',
            lambda match: match.group(1) + TEST_ID + match.group(2),
            "Capacitor application ID",
        )
        config_source = change_once(
            config_source,
            r'(appName:\s*["\x27])GT SoundMaster(["\x27])',
            lambda match: match.group(1) + TEST_NAME + match.group(2),
            "Capacitor app name",
        )
        updated[config_path] = config_source

    for path, content in updated.items():
        path.write_text(content, encoding="utf-8")
    print(f"Prepared isolated test identity: {TEST_ID} ({TEST_NAME})")


if __name__ == "__main__":
    if len(sys.argv) > 2:
        raise SystemExit("Usage: prepare-gate1-build.py [generated-project-root]")
    prepare(Path(sys.argv[1]) if len(sys.argv) == 2 else Path.cwd())
