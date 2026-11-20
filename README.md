# GT SoundMaster (v1.2.2)

A local music player for Android. Imported audio and music-library data are stored on the device.

## Features

- **Local music library:** Import audio files into the app. Track details and audio blobs are stored in IndexedDB.
- **Playlists and Favorites:** Create playlists and manage Favorites with the heart button. Songs cannot be added to Favorites through the bulk-import action. Clear all Favorites in one confirmed action without deleting music files or changing other playlists.
- **Playback controls:** Play, pause, skip, seek, rewind, fast-forward, and choose Normal, Repeat One, or Shuffle mode.
- **Three-band equalizer:** Adjust Bass, Mid, and Treble from −6 to +6 dB. Settings stay on this device; Reset returns the sound to flat.
- **Paused session restore:** The app remembers the last selected song and playback position. Reopening the app restores that selection without starting playback; press Play when ready.
- **Android media controls:** Use supported lock-screen and notification controls through the Android media session.
- **Bluetooth route safety:** Losing the connected audio route pauses playback. Reconnecting does not automatically resume music.
- **Sleep timer:** Set a countdown, use saved presets, and pause playback when the timer finishes.
- **Help and release notes:** The Help screen includes usage and data-safety guidance plus a collapsed-by-default What's New section.

## App version

The Android app version has one source of truth: app-version.json.

| Field | Current value |
| --- | --- |
| Version name | 1.2.2 |
| Version code | 5 |

The Android build workflow reads this file when generating the app's Gradle configuration. The isolated Gate 1 and signing-test build preparation script validates the same values before changing the generated app identity.

package.json is used for the Node.js safety-test runner; it is not the Android app version.

## Technology

- **User interface:** HTML, CSS, and vanilla JavaScript ES modules
- **Audio:** HTML Audio and Web Audio API with a three-band EQ and a short GainNode ramp for smoother play/pause transitions
- **Local storage:** IndexedDB
- **Android integration:** Capacitor, Android media session, notification controls, and a media-playback foreground service
- **Automation:** GitHub Actions, Java 21, and Node.js 22

## Repository layout

    .github/workflows/       Android build and safety-test workflows
    css/                     Player, playlist, timer, Help, and EQ styles
    docs/                    Isolated test-build and signing-test guidance
    js/core/                 Audio, storage, state, session, and media-session logic
    js/ui/                   Player, playlist, timer, modal, Help, and EQ interfaces
    scripts/                 Isolated-build and signing verification helpers
    tests/                   Node.js regression and safety tests
    app-version.json         Android version name and version code
    CHANGELOG.md             Version history
    index.html               Main application interface
    manifest.json            Web app metadata
    Structure file.md        Module relationship reference

## Run the automated tests

Use Node.js 22 or newer and run: npm test

The test suite runs without installing application dependencies.

## Build an update for your existing GT SoundMaster app

Use **Actions → GT SoundMaster signed app update → Run workflow** on `main`, after an approved PR has merged. Download the `GT-SoundMaster-SIGNED-APP-release-only` artifact from the successful run.

This workflow builds a normal-looking **GT SoundMaster** app with the original icon (no TEST badge). It intentionally keeps the existing signed installation's Android package ID `com.gt.soundmaster.signingtest`, signing key, and an increasing versionCode so future builds can update that installation **without uninstalling it or losing its app data**. The production-looking app has a legacy internal `signingtest` package suffix; a public store release would need separate planning.

The old original installation `com.gt.soundmaster` is **a different app**. This workflow does not update it or transfer its private music and playlists. Do not uninstall the old original unless any songs you need still exist as accessible files in normal device storage (e.g. Music or Downloads). Removing it permanently erases its app-private IndexedDB music copies, Favorites, playlists, and settings.

**Do not use** the generic **Build Android APK** workflow as an update for this signed app: it creates a debug-signed `com.gt.soundmaster` APK with an unrelated certificate. The Gate 1 TEST workflow also remains a separate disposable test app. If Android displays a signing mismatch or asks for an uninstall/data clear to proceed, **stop**.

## License

No LICENSE file is currently included. Do not assume that this repository has been granted a particular open-source license.
