# GT SoundMaster — Owner System Overview (`v1.3.0`)

> **Who this document is for:** You (the app owner).  
> **Goal:** Understand how GT SoundMaster is put together, where your music and settings live, how the sound engine works, and how updates stay safe — without needing to read source code.  
> For developer build/test details, see [README.md](../README.md).

---

## 1. Big Picture: Three Simple Layers

GT SoundMaster is a **100% offline Android app** built in three cleanly separated layers:

```text
+-------------------------------------------------------------------+
|  1. SCREEN & CONTROLS (HTML + CSS + js/ui/)                       |
|     Player disc, Playlists, Favorites, Sleep Timer, Help,         |
|     and the Unified Sound Panel (Profiles, Leveling, Crossfeed,   |
|     3-Band EQ)                                                    |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|  2. CORE ENGINE & LOCAL DATA (js/core/)                           |
|     - Audio Engine (Web Audio API sound chain)                    |
|     - Loudness Analyzer (offline song volume scanner)             |
|     - Queue, Play Modes & Paused Session Restore                  |
|     - Device Storage (IndexedDB + localStorage)                   |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|  3. ANDROID NATIVE SHELL (Capacitor + MediaPlaybackService)       |
|     - Keeps playback alive when the screen is locked              |
|     - Syncs lock-screen & notification play/pause/next/prev       |
|     - Pauses immediately if Bluetooth headphones disconnect       |
+-------------------------------------------------------------------+
```

**Why this separation matters:** UI changes never risk corrupting your stored music, and Android system events (like lock-screen taps or Bluetooth disconnects) talk to the player through one controlled bridge (`AndroidBridge`).

---

## 2. How Your Music Flows Through the Sound Engine

Every song passes through a lightweight, click-free audio chain inside `js/core/audioEngine.js`:

```text
Stored Audio File
   │
   ▼
[ 3-Band EQ ]             Bass / Mid / Treble (±6 dB, defaults to 0 dB)
   │
   ▼
[ Headphone Crossfeed ]   Off (untouched stereo) · Subtle · Room
   │
   ▼
[ Auto Volume Leveling ]  Per-song gain with peak cap (prevents clipping)
   │
   ▼
[ 35ms Play/Pause Fade ]  Always last — prevents speaker/DAC clicks & pops
   │
   ▼
Headphones / Speakers
```

### Built-in Audio Safety Net
- **Original files are never modified.** Auto Volume Leveling only saves a tiny loudness measurement number alongside the song's metadata.
- **Automatic flat fallback.** If any sound effect stage (EQ, Crossfeed, or Leveling) fails on a device, the engine automatically bypasses that stage so your music still plays cleanly with the 35ms fade intact.
- **Zero surprise changes on update.** Updating the app preserves your existing EQ sliders and leaves Auto Volume Leveling (`Off`) and Crossfeed (`Off`) untouched until you turn them on or pick a Gear Profile.

---

## 3. Unified Sound Panel & Gear Profiles

Tapping the top-left sound button opens one clean **Sound** panel containing:

1. **Gear Profiles** (1-tap presets that switch EQ + Auto Volume Leveling + Crossfeed together):
   - **4 Protected Built-In Presets:** `Pure Flat`, `Earbuds`, `Car / Speaker`, `Late Night`.
   - **Your Custom Profiles:** Create (**Save As**), update (**Save**), **Rename**, or **Delete** your own setups.
   - **Accidental-edit protection:** Built-in presets can never be overwritten. Any tweak shows an **Unsaved** badge with **Save / Save As** and **Revert**, while **Reset** returns everything to `Pure Flat`.
2. **Auto Volume Leveling:** Measures song loudness automatically on new imports and on first play for older tracks, plus a one-tap **Analyze Library** button to scan your whole library at once.
3. **Headphone Crossfeed:** `Off`, `Subtle`, or `Room` to make long headphone sessions feel warmer and less fatiguing.
4. **Three-Band Equalizer:** Simple `Bass`, `Mid`, and `Treble` sliders.

---

## 4. Where Your Data Lives on the Phone

Everything stays strictly on your phone inside app-private storage (nothing is uploaded anywhere):

| Data | Where it lives | Notes |
| --- | --- | --- |
| **Imported audio files** | IndexedDB (`audioBlobs`) | Full copies of your songs. Never altered by EQ or Leveling. |
| **Song list & loudness cache** | IndexedDB (`audioTracks`) | Lightweight metadata so the library loads fast without loading audio into RAM. |
| **Sleep Timer presets** | IndexedDB (`timerPresets`) | Your saved countdown buttons. |
| **Playlists & Favorites** | `localStorage` | Track ID lists only — clearing Favorites or custom playlists never deletes audio files. |
| **Sound settings & Gear Profiles** | `localStorage` | Active EQ, Leveling, Crossfeed, and your custom Gear Profiles. |
| **Last song & position** | `localStorage` | Restores where you left off in a **paused** state (never auto-plays). |

> **Important owner reminder:** Because imported songs live inside app-private storage, always keep backup copies of your original audio files in normal phone storage (e.g., `Music` or `Downloads`). Uninstalling the app or clearing app storage permanently removes app-private data.

---

## 5. Built-In Daily Safety Rules

- **No surprise autoplay:** Reopening the app or reconnecting Bluetooth headphones never starts playback on its own — you always press Play when ready.
- **Instant Bluetooth disconnect pause:** If headphones disconnect, Android immediately pauses audio and stops stale "playing" notifications.
- **Favorites protection:** You cannot accidentally bulk-import 40 songs into Favorites; Favorites is managed via the heart button and can be cleared safely in one confirmed tap without deleting any songs.
- **Delete safety:** Removing a song from a custom playlist or Favorites only removes it from that list. Only deleting from `All Tracks` deletes the stored audio file (with a confirmation warning).

---

## 6. How Updates & Builds Stay Safe

The app version is controlled by a single file: `app-version.json` (`1.3.0`, `versionCode 6`).

GitHub Actions handles all checks and Android APK builds automatically:

1. **`Safety tests`** (runs automatically on every PR and `main` push): Runs the full automated test suite (audio routing, loudness math, profiles, storage safety, UI safety, session restore, signing checks) before anything merges.
2. **`GT SoundMaster signed app update`** (run manually on `main` after a PR merges): Builds your real update APK (`GT-SoundMaster-SIGNED-APP-release-only`) using the **same package ID (`com.gt.soundmaster.signingtest`), same signing certificate, and increasing `versionCode`** — so Android updates your existing app in place **without losing your music, playlists, or settings**.
3. **`Gate 1 TEST`** (optional disposable test build): Installs side-by-side with a visible `TEST` badge if you ever want to try something risky without touching your real app.

> **Golden rule when installing an update:** Android should say **"Update"**. If Android ever warns about a package conflict or asks you to uninstall first, **stop** — do not uninstall.

---

## 7. Quick Folder Map (Owner Cheat Sheet)

- `index.html` + `css/` — What you see on screen.
- `js/ui/` — Button taps, modals, playlists, timer, Help, and the Sound panel.
- `js/core/` — The brains: sound engine, loudness scanner, crossfeed, Gear Profiles, storage, queue, session memory, and Android lock-screen bridge.
- `tests/` — Automated safety nets that verify nothing breaks before updates ship.
- `.github/workflows/` + `scripts/` — Automated testing and safe signed APK builder.
- `app-version.json` & `CHANGELOG.md` — Current app version and history of changes.
