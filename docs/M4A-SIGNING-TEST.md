# Signed GT SoundMaster update (formerly SIGN TEST)

**Status:** The existing signed SIGN TEST installation is now the chosen everyday-app identity. The rebranding applies only after an approved PR is merged and a new signed APK is built and installed. This document describes the build path, not permission to install or uninstall.

## Identity that stays the same

- Android package: `com.gt.soundmaster.signingtest` (historical suffix retained for in-place updates)
- Signing key: the existing approved signing-test keystore, unchanged
- Certificate check: uses the existing `GT_SIGNING_TEST_CERT_SHA256` GitHub Variable
- Update order: versionCode `10000 + workflow run number`, increasing with subsequent builds
- On-screen name/icon: **GT SoundMaster** and the normal app icon, without TEST badge
- Version name: from `app-version.json`

A name or icon change does not move or delete data within the same installed Android package. Android also requires an identical signing identity for updating. No new signing key or GitHub Secret is needed for this change.

## Build

Run **Actions → GT SoundMaster signed app update** manually on `main` after approved changes merge. It uses the existing `GT_SIGNING_TEST_*` secrets, assembles a release APK, verifies the package and expected public signing-certificate fingerprint, then uploads `GT-SoundMaster-SIGNED-APP-release-only` for seven days.

Pull requests only do a debug-signed preview compilation of this package and run the identity checks. They do not receive secrets, create signed builds, or upload APKs.

## Distinct app identities and safety

The old original `com.gt.soundmaster` and the Gate 1 `com.gt.soundmaster.gate1` remain separate installations with separate app-private data. **This signed workflow cannot update the original package or migrate its imported songs and playlists.** The user may retire the original only after checking that needed source audio files still exist outside its private storage. Uninstalling the original deletes its app-private IndexedDB, Favorites and settings; it does not delete independent source files in Music/Downloads.

If an update requests uninstall, data clearing, or reports a certificate mismatch, stop. Never publish signing secrets, upload key material, generate replacement keys in CI, or change the signing fingerprint casually. App-store distribution with a different package ID requires separate consideration.
