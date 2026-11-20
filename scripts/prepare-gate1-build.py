#!/usr/bin/env python3
"""Convert generated Android builds to the Gate 1 or signed-app identity.

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
SIGNING_TEST_ID = "com.gt.soundmaster.signingtest"
SIGNING_TEST_NAME = "GT SoundMaster"


def change_once(text, pattern, replacement, label):
    updated, count = re.subn(pattern, replacement, text)
    if count != 1:
        raise ValueError(f"Expected one {label}; found {count}. Refusing unsafe build.")
    return updated


def prepare(root, signing_test=False):
    root = Path(root)
    target_id = SIGNING_TEST_ID if signing_test else TEST_ID
    target_name = SIGNING_TEST_NAME if signing_test else TEST_NAME
    gradle = root / "android/app/build.gradle"
    manifest = root / "android/app/src/main/AndroidManifest.xml"
    strings = root / "android/app/src/main/res/values/strings.xml"
    activity = root / "android/app/src/main/java/com/gt/soundmaster/MainActivity.java"
    service = root / "android/app/src/main/java/com/gt/soundmaster/MediaPlaybackService.java"
    version_path = root / "app-version.json"

    # Check every input before writing, avoiding a partially converted app.
    for path in [gradle, manifest, strings, activity, service, version_path]:
        if not path.is_file():
            raise ValueError(f"Missing generated Android file: {path}")
    if "package com.gt.soundmaster;" not in activity.read_text(encoding="utf-8"):
        raise ValueError("Unexpected MainActivity namespace")
    if "package com.gt.soundmaster;" not in service.read_text(encoding="utf-8"):
        raise ValueError("Unexpected playback service namespace")

    version_config = json.loads(version_path.read_text(encoding="utf-8"))
    version_name = version_config.get("versionName")
    version_code = version_config.get("versionCode")
    if not isinstance(version_name, str) or not re.fullmatch(r"\d+\.\d+\.\d+", version_name):
        raise ValueError("Invalid versionName in app-version.json")
    if isinstance(version_code, bool) or not isinstance(version_code, int) or version_code < 1:
        raise ValueError("Invalid versionCode in app-version.json")

    updated = {}
    gradle_source = gradle.read_text(encoding="utf-8")
    updated_gradle = change_once(
        gradle_source,
        r'(?m)^(\s*applicationId\s+["\x27])com\.gt\.soundmaster(["\x27])',
        lambda match: match.group(1) + target_id + match.group(2),
        "original Android applicationId",
    )
    expected_code = rf"(?m)^\s*versionCode\s+{version_code}\s*$"
    expected_name = rf'(?m)^\s*versionName\s+["\x27]{re.escape(version_name)}["\x27]\s*$'
    if not re.search(expected_code, gradle_source) or not re.search(expected_name, gradle_source):
        raise ValueError("Generated Android app version does not match app-version.json")

    if signing_test:
        # Only the isolated signing-test app gets an increasing version code.
        import os
        number_text = os.environ.get("GT_SIGNING_TEST_BUILD_NUMBER", "1")
        if not number_text.isdecimal() or not (1 <= int(number_text) <= 1000000):
            raise ValueError("Invalid signing-test build number")
        number = int(number_text)
        updated_gradle = change_once(
            updated_gradle,
            rf"(?m)^(\s*versionCode\s+){version_code}(\s*)$",
            lambda match: match.group(1) + str(10000 + number) + match.group(2),
            "signing-test versionCode",
        )
    updated[gradle] = updated_gradle

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
        lambda match: match.group(1) + target_name + match.group(2),
        "launcher app name",
    )
    updated_strings = re.sub(
        r'(<string\s+name="title_activity_main"\s*>)GT SoundMaster(</string>)',
        lambda match: match.group(1) + target_name + match.group(2),
        updated_strings,
    )
    for name in ("package_name", "custom_url_scheme"):
        updated_strings = re.sub(
            r'(<string\s+name="' + name + r'"\s*>)' + ORIGINAL_ID + r'(</string>)',
            lambda match: match.group(1) + target_id + match.group(2),
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
        config["appId"] = target_id
        config["appName"] = target_name
        updated[config_path] = json.dumps(config, indent=2) + "\n"
    else:
        config_source = config_path.read_text(encoding="utf-8")
        config_source = change_once(
            config_source,
            r'(appId:\s*["\x27])com\.gt\.soundmaster(["\x27])',
            lambda match: match.group(1) + target_id + match.group(2),
            "Capacitor application ID",
        )
        config_source = change_once(
            config_source,
            r'(appName:\s*["\x27])GT SoundMaster(["\x27])',
            lambda match: match.group(1) + target_name + match.group(2),
            "Capacitor app name",
        )
        updated[config_path] = config_source

    for path, content in updated.items():
        path.write_text(content, encoding="utf-8")
    print(f"Prepared Android identity: {target_id} ({target_name})")


if __name__ == "__main__":
    args = sys.argv[1:]
    signing_test = bool(args and args[0] == "--signing-test")
    if signing_test:
        args = args[1:]
    if len(args) > 1 or (args and args[0].startswith("-")):
        raise SystemExit("Usage: prepare-gate1-build.py [--signing-test] [generated-project-root]")
    prepare(Path(args[0]) if args else Path.cwd(), signing_test=signing_test)
