# GT SoundMaster (v1.3.1)

A local music player for Android. Imported audio and music-library data are stored on the device.

For a plain-English, high-level guide to how the whole system fits together, see [docs/OWNER-SYSTEM-OVERVIEW.md](docs/OWNER-SYSTEM-OVERVIEW.md).

## Features

- **Local music library:** Import audio files into the app. Track details and audio blobs are stored in IndexedDB.
- **Playlists and Favorites:** Create playlists and manage Favorites with the heart button. Songs cannot be added to Favorites through the bulk-import action. Clear all Favorites in one confirmed action without deleting music files or changing other playlists.
- **Playback controls:** Play, pause, skip, seek, rewind, fast-forward, and choose Normal, Repeat One, or Shuffle mode.
- **Unified Sound panel & Gear Profiles:** Switch in one tap between four built-in presets (**Pure Flat**, **Earbuds**, **Car / Speaker**, **Late Night**) or save, rename, and delete your own custom sound profiles. Built-in presets stay protected, and unsaved edits are clearly badged.
- **Auto Volume Leveling:** Offline loudness measurement with a peak safety ceiling balances loud and quiet tracks without touching original audio files. New imports and played songs are measured automatically, plus a one-tap **Analyze Library** button covers older tracks.
- **Headphone Crossfeed:** Choose **Off**, **Subtle**, or **Room** for a more natural, less fatiguing stereo soundstage on headphones.
- **Three-band equalizer:** Adjust Bass, Mid, and Treble from −6 to +6 dB. Existing EQ settings are preserved on update; Reset returns to Pure Flat.
- **Paused session restore:** The app remembers the last selected song and playback position. Reopening the app restores that selection without starting playback; press Play when ready.
- **Android media controls:** Use supported lock-screen and notification controls through the Android media session.
- **Bluetooth route safety:** Losing the connected audio route pauses playback. Reconnecting does not automatically resume music.
- **Sleep timer:** Set a countdown, use saved presets, and pause playback when the timer finishes.
- **Help and release notes:** The Help screen includes usage and data-safety guidance plus a collapsed-by-default What's New section.

## App version

The Android app version has one source of truth: app-version.json.

| Field | Current value |
| --- | --- |
| Version name | 1.3.1 |
| Version code | 7 |

The Android build workflow reads this file when generating the app's Gradle configuration. The isolated Gate 1 and signing-test build preparation script validates the same values before changing the generated app identity.

package.json is used for the Node.js safety-test runner; it is not the Android app version.

## Technology

- **User interface:** HTML, CSS, and vanilla JavaScript ES modules
- **Audio:** HTML Audio and Web Audio API with a 3-band EQ, Bauer-style stereo Crossfeed, per-track Auto Volume Leveling, and a 35ms GainNode play/pause ramp (each optional stage falls back cleanly to flat playback if unavailable)
- **Local storage:** IndexedDB (tracks, audio blobs, cached loudness metadata, timer presets) and a centralized validated `localStorage` preferences layer (`js/core/preferences.js`)
- **Android integration:** Capacitor, native Android `MainActivity` and `MediaPlaybackService` (`android-native/`), notification controls, and Bluetooth route-loss protection
- **Automation:** GitHub Actions, Java 21, and Node.js 22

## Repository layout

    .github/workflows/       Android build, signed-update, and safety-test workflows
    android-native/          Native Android Java sources (MainActivity, MediaPlaybackService)
    css/                     Player, playlist, timer, Help, and Sound panel styles
    docs/                    Owner system overview, isolated test-build, and signing-test docs
    js/core/                 Audio engine, loudness analyzer, crossfeed, Gear Profiles, preferences, storage, state, session, media-session
    js/ui/                   Player, playlist, timer, modal, Help, and Sound panel interfaces
    scripts/                 Icon generation, Android project patching, isolated-build, and signing helpers
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
