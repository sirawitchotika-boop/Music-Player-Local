# Project Architecture & Dependency Matrix (v1.3.0)

## 1. Project Overview & Architecture
- **Description:** GT SoundMaster — 100% offline local music player for Android. Audio blobs and track metadata live on-device in IndexedDB, paired with a Web Audio sound pipeline (3-band EQ, Bauer-style Headphone Crossfeed, ReplayGain-style Auto Volume Leveling, and a 35ms click-free play/pause fade) and a native Android `MediaPlaybackService` for lock-screen controls and Bluetooth route-loss safety.
- **Tech Stack:** HTML5, CSS3, Vanilla JavaScript (ES6 Modules), Web Audio API, Media Session API, IndexedDB, `localStorage`, Capacitor Android SDK, Native Android (`MediaSession`, `Notification.MediaStyle`, Foreground Service), Node.js 22 (`node:test`), Java 21, Gradle Wrapper.
- **Owner-Level Guide:** See [docs/OWNER-SYSTEM-OVERVIEW.md](docs/OWNER-SYSTEM-OVERVIEW.md) for a plain-English, high-level system guide.

## 2. Directory Tree
```text
/ (Root)
|-- .github/workflows/
|   |-- build-apk.yml               Reusable Android build workflow (reads app-version.json)
|   |-- gate1-test-apk.yml          Disposable Gate 1 TEST APK build
|   |-- m4-cert-baseline.yml        Signing certificate baseline diagnostic
|   |-- m4-signing-test.yml         GT SoundMaster signed app update workflow
|   `-- safety-tests.yml            Automated Node.js safety tests on PRs and main
|-- css/
|   |-- eq.css                      Unified Sound Panel (Gear Profiles, Leveling, Crossfeed, EQ)
|   |-- help.css                    Help & What's New modal styles
|   |-- main.css                    App layout, top bar, disc stage, Favorite button, theme
|   |-- player.css                  Playback controls and progress bar
|   |-- playlist.css                Library, search, dropdown, and track list
|   `-- timer.css                   Sleep Timer modal styles
|-- docs/
|   |-- OWNER-SYSTEM-OVERVIEW.md    High-level owner guide to the whole system
|   |-- GATE1-ISOLATED-TEST.md      Disposable phone test APK guidance
|   `-- M4A-SIGNING-TEST.md         Update-safe signed APK guidance
|-- js/
|   |-- app.js                      Application bootstrap, external audio hook, session restore
|   |-- core/
|   |   |-- audioEngine.js          Web Audio chain (EQ -> Crossfeed -> Leveling -> 35ms Fade)
|   |   |-- crossfeedNode.js        Bauer-style Headphone Crossfeed (Off / Subtle / Room)
|   |   |-- loudnessAnalyzer.js     Offline RMS loudness + peak safety cap + scan coordinator
|   |   |-- mediaSessionManager.js  MediaSession API & two-way AndroidBridge sync
|   |   |-- sessionMemory.js        Cold-start paused session restore (never auto-plays)
|   |   |-- soundProfiles.js        Gear Profiles model (4 protected built-ins + custom CRUD)
|   |   |-- stateManager.js         Queue & playback modes (Normal, Repeat One, Shuffle)
|   |   `-- storage.js              IndexedDB manager (metadata, blobs, loudness cache, timers)
|   `-- ui/
|       |-- eqUI.js                 Unified Sound Panel controller (Profiles, Leveling, Crossfeed, EQ)
|       |-- helpUI.js               Help & What's New dialog controller
|       |-- modalUI.js              Safe text-only alerts, confirms, prompts, and toasts
|       |-- playerUI.js             Playback controls, hold-to-seek, Favorite button
|       |-- playlistUI.js           Library import, playlists, Favorites protection, clear flows
|       `-- timerUI.js              Sleep Timer countdown and custom presets
|-- scripts/                        Isolated build, icon marking, and APK certificate checks
|-- tests/                          Automated Node.js regression, audio, UI, and CI safety tests
|-- app-version.json                Single source of truth for Android versionName / versionCode (1.3.0 / 6)
|-- CHANGELOG.md                    Release history
|-- index.html                      Main SPA shell
|-- manifest.json                   Web app metadata & theme colors
`-- README.md                       Technical overview & build/test instructions
```

## 3. Audio Pipeline & Fallback Safety
`audioElement` → `MediaElementAudioSourceNode` → `3-Band EQ (Bass/Mid/Treble)` → `Crossfeed (Off/Subtle/Room)` → `Leveling Gain (peak-capped)` → `GainNode (35ms Play/Pause Fade)` → `destination`

- Each optional stage (`EQ`, `Crossfeed`, `Leveling`) is wired downstream-first with error isolation; if any stage is unsupported or fails, audio bypasses that stage cleanly and still reaches the 35ms play/pause fade and output.
- Default behavior on update preserves saved EQ values and keeps Auto Volume Leveling (`false`) and Crossfeed (`off`) untouched until enabled or switched via a Gear Profile.

## 4. Storage Separation
- **IndexedDB (`LocalMusicDB` v4):**
  - `audioTracks`: Track metadata (`id`, `name`, `type`, `size`, `addedAt`, cached `loudness`).
  - `audioBlobs`: Original audio file blobs keyed by `id` (never modified by loudness analysis).
  - `timerPresets`: Saved Sleep Timer presets.
  - `eqPresets`: Reserved store.
- **`localStorage`:**
  - `gt_playlists`, `gt_liked_tracks`, `gt_play_mode`, `gt_last_session_v1`
  - `gt_soundmaster_equalizer`, `gt_soundmaster_leveling`, `gt_soundmaster_crossfeed`
  - `gt_soundmaster_sound_profiles`, `gt_soundmaster_active_profile`