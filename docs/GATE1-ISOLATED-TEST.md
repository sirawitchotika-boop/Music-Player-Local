# Human Gate 1 — isolated GT SoundMaster test app

**Status:** Test-build workflow reference, not a release or authorization to install.

## What is isolated

The GitHub Actions workflow **Gate 1 isolated test APK** builds from the
current GT SoundMaster code but changes the *generated* Android application ID
to `com.gt.soundmaster.gate1`, launcher name to **GT SoundMaster TEST**,
and app icon to show a TEST badge. Android stores its imported music, app
preferences, and WebView IndexedDB under this separate package, not under
`com.gt.soundmaster`.

Production **Build Android APK** remains available as before. Pull requests
compile and inspect the isolated version but do not upload APK artifacts.

## Limits

- The test APK is **debug-signed with a temporary CI-generated certificate**,
  not with Boss's existing certificate or a permanent release identity.
- Builds from different GitHub runners may have different certificates; never
  assume a later test APK is an in-place update over an earlier test APK.
- No APK is installed or distributed automatically. A manually initiated
  isolated workflow can produce a short-lived private GitHub Actions artifact.
- Do not install this APK over the original app. Do not uninstall, clear data
  from, or overwrite the original GT SoundMaster or Noctune.
- Test with **disposable music files only**. Device behavior has not been
  validated by CI. Human Gate 1 requires an explicit, separate approval.

## Before phone testing

After PR approval and merge, review the isolated artifact's APK identity and
confirm it displays **GT SoundMaster TEST** and package
`com.gt.soundmaster.gate1`. If Android presents any uninstall,
replace-existing-app, data-clear, or certificate-mismatch prompt, **stop**
without proceeding. Human Gate 1 groups Play, notification clock, Bluetooth
disconnect/reconnect, manual resume, and reopen-paused checks.
