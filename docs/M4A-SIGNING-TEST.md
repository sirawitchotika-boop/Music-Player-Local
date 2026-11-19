# Milestone 4A — repeatable signing TEST workflow

**Status:** Workflow preparation only. No keys or GitHub secrets have been created or changed, and no signed APK has been produced.

## What this prepares

**GT SoundMaster SIGN TEST** is a separate, disposable app: `com.gt.soundmaster.signingtest`.
It is not the original `com.gt.soundmaster` or the previous `com.gt.soundmaster.gate1` TEST app.
Android keeps each package's app-private music and preferences separate.

The **Milestone 4A signing TEST APK** workflow has two modes:
- **PR:** Compile an unsigned-for-release, debug-signed signing-test preview and verify its exact package ID and app label. No secrets or APK artifacts.
- **Separate manual run (future approval required):** Use an *existing* approved signing-test keystore from GitHub Actions Secrets, build the release APK, verify the final APK's certificate SHA-256 digest against a GitHub Variable, and retain only a short-lived private artifact. No automatic install or release.

The signing-test package gets a versionCode starting at 10000 and increasing by workflow run number for later update-compatibility testing.

## Future credential setup — NOT authorized or needed now

Only after a separate decision, configure these **GitHub Actions Secrets** (private):
- `GT_SIGNING_TEST_KEYSTORE_B64`: Base64 content of a separately approved signing-test keystore, **never the original app's keystore**
- `GT_SIGNING_TEST_STORE_PASSWORD`
- `GT_SIGNING_TEST_KEY_ALIAS`
- `GT_SIGNING_TEST_KEY_PASSWORD`

Configure one **GitHub Actions Variable** (public information):
- `GT_SIGNING_TEST_CERT_SHA256`: the expected signing certificate SHA-256 fingerprint.

Never share keystore contents, Base64 material or passwords in chat, files, PRs, screenshots, or logs. The manual workflow fails safely when credentials or expected certificate are unavailable. It never generates signing keys or silently falls back to debug signing.

## Safety boundaries

- Never use this test signing identity to update the original GT SoundMaster.
- Do not uninstall, overwrite, update or clear data from the original app, Gate 1 TEST app or Noctune.
- No APK installation or phone testing is authorized by this preparation PR.
- Original installed app certificate remains unverified; **no original-app update is approved**.

After PR review and separately approved signing configuration, run two signing-test builds, compare their public SHA-256 fingerprints, and perform an update test with disposable songs only.
