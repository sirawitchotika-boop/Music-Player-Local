# GT SoundMaster (v1.2.2)

A local music player for Android. Imported audio and music-library data are stored on the device.

## Features

- **Local music library:** Import audio files into the app. Track details and audio blobs are stored in IndexedDB.
- **Playlists and Favorites:** Create playlists and manage Favorites with the heart button. Songs cannot be added to Favorites through the bulk-import action.
- **Playback controls:** Play, pause, skip, seek, rewind, fast-forward, and choose Normal, Repeat One, or Shuffle mode.
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
- **Audio:** HTML Audio and Web Audio API with a short GainNode ramp for smoother play/pause transitions
- **Local storage:** IndexedDB
- **Android integration:** Capacitor, Android media session, notification controls, and a media-playback foreground service
- **Automation:** GitHub Actions, Java 21, and Node.js 22

## Repository layout

    .github/workflows/       Android build and safety-test workflows
    css/                     Player, playlist, timer, and Help styles
    docs/                    Isolated test-build and signing-test guidance
    js/core/                 Audio, storage, state, session, and media-session logic
    js/ui/                   Player, playlist, timer, modal, and Help interfaces
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

## Build an Android APK

1. Push the reviewed source to GitHub.
2. Open the repository's Actions tab.
3. Select Build Android APK.
4. Choose Run workflow.
5. Download the GT-SoundMaster-APK artifact when the workflow succeeds.

**Signing and installation safety:** The default workflow creates a debug-signed APK using the app package ID com.gt.soundmaster. It is not a production-signed release. Do not assume it can update an existing installation: Android requires the signing certificate to match. If Android reports a signature conflict, stop. Do not uninstall the existing app or clear its data as a workaround.

The separate Gate 1 TEST and SIGN TEST workflows use different package IDs. They are disposable test identities and must not be used to update the original app.

## License

No LICENSE file is currently included. Do not assume that this repository has been granted a particular open-source license.
