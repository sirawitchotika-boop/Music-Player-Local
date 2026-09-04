# Project Architecture & Dependency Matrix

## 1. Project Overview & Architecture (ภาพรวมและสถาปัตยกรรม)
- Description: GT SoundMaster คือเครื่องเล่นเพลงระดับพรีเมียมทำงานแบบ Local Client-Side 100% เล่นไฟล์เสียงในเครื่องโดยไม่ต้องพึ่งพาเซิร์ฟเวอร์ พร้อมระบบ 10-Band Audiophile EQ, Pre-Amp Headroom Management, Pure Direct Mode, Transparent Safety Limiter, Sleep Timer, วงแหวน Audio Visualizer ตอบสนองความถี่เสียงแบบเรียลไทม์, ระบบแนะนำการใช้งาน (User Guide) และรองรับการคอมไพล์เป็น Android APK อัตโนมัติผ่าน GitHub Actions
- Tech Stack: HTML5, CSS3 (Glassmorphism), Vanilla JavaScript (ES6 Modules), Web Audio API, IndexedDB API, LocalStorage API, Web App Manifest, Capacitor Android SDK
- Architecture Pattern: Modular Component Architecture (Separation of Concerns: Core Audio Engines, State Management, Local Persistence, UI Layer, และ CI/CD Mobile Build Pipeline)

## 2. Directory Tree (โครงสร้างโฟลเดอร์)
/ (Root)
├── index.html
├── manifest.json
├── icon.svg
├── Structure file.md
├── Project Roadmap
├── .github/
│   └── workflows/
│       └── build-apk.yml
├── css/
│   ├── eq.css
│   ├── help.css
│   ├── main.css
│   ├── player.css
│   ├── playlist.css
│   └── timer.css
└── js/
    ├── app.js
    ├── core/
    │   ├── audioEffect.js
    │   ├── audioEngine.js
    │   ├── stateManager.js
    │   └── storage.js
    └── ui/
        ├── eqUI.js
        ├── helpUI.js
        ├── modalUI.js
        ├── playerUI.js
        ├── playlistUI.js
        └── timerUI.js

## 3. Data Flow & State Management (การไหลของข้อมูล)
- การนำเข้าและจัดเก็บไฟล์: ผู้ใช้เลือกไฟล์ผ่าน `<input type="file">` -> ตรวจสอบ MIME type ใน `storage.js` -> จัดเก็บ Blob ลงใน IndexedDB (`audioTracks`) -> คืนค่ารายการเพลง -> ส่งต่อให้ `stateManager.js` และ `playlistUI.js`
- เส้นทางสัญญาณเสียง (Audiophile Audio Graph):
  `audioElement` -> `MediaElementAudioSourceNode`
  ├── Wet Path -> `wetGain` -> `preampNode` -> `BiquadFilterNode` (32Hz..16kHz) -> `limiter` (DynamicsCompressorNode -0.1dB) -> `audioCtx.destination` + `analyser`
  └── Dry Path (Pure Direct) -> `dryGain` -> `audioCtx.destination` + `analyser`
- การควบคุมสถานะการเล่น: Event Listeners ใน `playerUI.js` สั่งการผ่าน `audioEngine.js` และ `stateManager.js` -> ควบคุมคิวเพลง ลูป สุ่มเพลง และอัปเดตสถานะแบบเรียลไทม์
- ระบบตัวช่วยแนะนำการใช้งาน: ปุ่ม `help-btn` ใน `index.html` รับการคลิก -> สั่งการผ่าน `helpUI.js` เพื่อสลับคลาส `hidden` ของโมดอล `help-modal`
- การบรรจุแอปพลิเคชัน (Mobile Packaging Pipeline): โค้ด Web ทั้งหมดถูกรวบรวมลงโฟลเดอร์ `www` ผ่าน GitHub Actions Workflow -> ถูกห่อหุ้มด้วย Capacitor Android Runtime -> คอมไพล์ผ่าน Gradle Wrapper ออกมาเป็น `app-debug.apk`

## 4. Module Connections & Dependencies (สายสัมพันธ์ของไฟล์)

### App Configuration & CI/CD
- **manifest.json**: กำหนดคุณสมบัติ Web App Manifest, การแสดงผลแบบ Standalone, Theme Color และตำแหน่งไอคอน
  - ดึงค่าจาก: `icon.svg`
  - ถูกเรียกใช้โดย: `index.html`, Capacitor Android Build Pipeline
  - จุดเชื่อมต่อ: Web App Install Banner, Android App Launcher Configuration

- **icon.svg**: ไฟล์ภาพไอคอนความละเอียดสูงแบบ Vector สำหรับแอปพลิเคชันและ Favicon
  - ดึงค่าจาก: ไม่มี
  - ถูกเรียกใช้โดย: `index.html`, `manifest.json`, Capacitor Build Pipeline
  - จุดเชื่อมต่อ: หน้าจอแสดงผล Splash Screen และ App Icon

- **.github/workflows/build-apk.yml**: สคริปต์อัตโนมัติบน GitHub Actions สำหรับคอมไพล์โปรเจกต์เว็บเป็นไฟล์ Android APK
  - ดึงค่าจาก: ไฟล์ทั้งหมดในโปรเจกต์ (`index.html`, `css/*`, `js/*`, `manifest.json`, `icon.svg`)
  - ถูกเรียกใช้โดย: GitHub Actions Runner (เมื่อเกิดการ Push ไปยัง Branch `main` หรือ `master`)
  - จุดเชื่อมต่อ: Android SDK Build Tools, Gradle Wrapper (`./gradlew assembleDebug`), GitHub Artifacts Storage

### Entry Point & Application Core
- **index.html**: โครงสร้าง Layout หลักของแอปพลิเคชัน โมดอล EQ, Sleep Timer, Help Guide และคอนเทนเนอร์แสดงผล
  - ดึงค่าจาก: `manifest.json`, `icon.svg`, `css/*.css`, `js/app.js`
  - ถูกเรียกใช้โดย: เว็บบราวเซอร์, Capacitor WebView
  - จุดเชื่อมต่อ: DOM Elements IDs (`#app-container`, `#help-modal`, `#help-btn`, `#eq-modal`, `#timer-modal`, `#playlist-section`)

- **js/app.js**: จุดเริ่มต้นการบูตสแตรปแอปพลิเคชัน ผูกความสัมพันธ์ของ State, Storage, Audio Engine และ UI ทั้งหมด
  - ดึงค่าจาก: `js/core/storage.js`, `js/core/stateManager.js`, `js/core/audioEngine.js`, `js/ui/playerUI.js`, `js/ui/playlistUI.js`, `js/ui/eqUI.js`, `js/ui/timerUI.js`, `js/ui/helpUI.js`
  - ถูกเรียกใช้โดย: `index.html`
  - จุดเชื่อมต่อ: `DOMContentLoaded` Event Listener, `window.nextTrackFallback`

### Core Engine & State Layer
- **js/core/audioEngine.js**: ตัวควบคุม Web Audio Context และ Audio Element ระดับล่าง จัดการคำสั่ง Play, Pause, Seek และ Error Fallback
  - ดึงค่าจาก: `js/core/audioEffect.js`
  - ถูกเรียกใช้โดย: `js/app.js`, `js/ui/playerUI.js`, `js/ui/playlistUI.js`, `js/ui/timerUI.js`
  - จุดเชื่อมต่อ: `load()`, `play()`, `pause()`, `seek()`, Event `onplay`, `onpause`, `onerror`

- **js/core/audioEffect.js**: สถาปัตยกรรมกราฟเสียง Audiophile EQ 10 แบนด์, Pre-Amp Gain, Pure Direct Dry/Wet Switch, Transparent Safety Limiter และ Canvas Visualizer
  - ดึงค่าจาก: ไม่มี
  - ถูกเรียกใช้โดย: `js/core/audioEngine.js`, `js/ui/eqUI.js`
  - จุดเชื่อมต่อ: `init()`, `setPreamp()`, `setBypass()`, `setEqBand()`, `start()`, `stop()`, `draw()`

- **js/core/stateManager.js**: จัดการตรรกะคิวเพลง ลำดับการเล่น โหมดสุ่ม (Shuffle) โหมดเล่นซ้ำ (Repeat One)
  - ดึงค่าจาก: ไม่มี
  - ถูกเรียกใช้โดย: `js/app.js`, `js/ui/playerUI.js`, `js/ui/playlistUI.js`
  - จุดเชื่อมต่อ: `setQueue()`, `nextTrack()`, `prevTrack()`, `cyclePlayMode()`

- **js/core/storage.js**: ติดต่อฐานข้อมูล IndexedDB จัดเก็บและอ่านไฟล์เสียง (Blob), พรีเซ็ต EQ และพรีเซ็ต Sleep Timer
  - ดึงค่าจาก: ไม่มี
  - ถูกเรียกใช้โดย: `js/app.js`, `js/ui/playlistUI.js`, `js/ui/eqUI.js`, `js/ui/timerUI.js`
  - จุดเชื่อมต่อ: `initDB()`, `saveFiles()`, `getAllTracks()`, `deleteTrack()`, `getEqPresets()`, `saveEqPreset()`, `deleteEqPreset()`, `getTimerPresets()`, `saveTimerPreset()`

### UI Layer
- **js/ui/helpUI.js**: ควบคุมการแสดงผลและปิดหน้าต่างคู่มือการใช้งาน
  - ดึงค่าจาก: ไม่มี
  - ถูกเรียกใช้โดย: `js/app.js`
  - จุดเชื่อมต่อ: `init()`, `openModal()`, `closeModal()`, Event click บน `#help-btn` และ `#close-help-btn`

- **js/ui/playerUI.js**: จัดการหน้าจอควบคุมหลัก ปุ่มเล่น เพลงถัดไป ย้อนกลับ กรอเพลง (Hold-to-Seek) แถบ Seekbar และระบบ Favorites
  - ดึงค่าจาก: `js/ui/modalUI.js`
  - ถูกเรียกใช้โดย: `js/app.js`
  - จุดเชื่อมต่อ: Event `timeupdate`, `loadedmetadata`, `ended`, CustomEvent `gt-liked-updated`

- **js/ui/playlistUI.js**: จัดการรายการเพลง การค้นหา การสร้าง/แก้ไข/ลบเพลย์ลิสต์ และการอัปโหลดไฟล์
  - ดึงค่าจาก: `js/core/storage.js`, `js/ui/modalUI.js`
  - ถูกเรียกใช้โดย: `js/app.js`
  - จุดเชื่อมต่อ: `loadPlaylist()`, `playTrack()`, `deleteTrack()`

- **js/ui/eqUI.js**: จัดการหน้าต่างโมดอล Audiophile EQ, แถบสไลเดอร์ Preamp, ฟิลเตอร์ 10 ย่าน, ปุ่ม Direct, และการโหลด/บันทึกพรีเซ็ต
  - ดึงค่าจาก: `js/core/audioEffect.js`, `js/core/storage.js`, `js/ui/modalUI.js`
  - ถูกเรียกใช้โดย: `js/app.js`
  - จุดเชื่อมต่อ: `loadPresets()`, `applyPreset()`, Input Event บนสไลเดอร์

- **js/ui/timerUI.js**: ควบคุมหน้าปัดนับถอยหลัง Sleep Timer, พรีเซ็ตเวลา, และการตัดสัญญาณเสียงเมื่อหมดเวลา
  - ดึงค่าจาก: `js/core/storage.js`, `js/ui/modalUI.js`, `js/core/audioEngine.js`
  - ถูกเรียกใช้โดย: `js/app.js`
  - จุดเชื่อมต่อ: `startTimer()`, `stopTimer()`, `resetTimer()`, `tick()`, `executeSleepAction()`

- **js/ui/modalUI.js**: ระบบไดอะล็อกส่วนกลาง (Alert, Confirm, Prompt, DoublePrompt, Toast) แบบ Glassmorphism
  - ดึงค่าจาก: ไม่มี
  - ถูกเรียกใช้โดย: `js/ui/playerUI.js`, `js/ui/playlistUI.js`, `js/ui/eqUI.js`, `js/ui/timerUI.js`
  - จุดเชื่อมต่อ: `showAlert()`, `showConfirm()`, `showPrompt()`, `showDoublePrompt()`, `showToast()`

## 5. Scalability & Refactoring Notes (แผนการขยายสเกล)
- **APK Release Automation**: เมื่อต้องการแจกจ่าย APK ให้ผู้ใช้อื่น สามารถปรับแต่ง `build-apk.yml` ให้สร้าง GitHub Release พร้อมแนบไฟล์ `.apk` โดยอัตโนมัติเมื่อมีการติดแท็กเวอร์ชันใหม่ (Git Tag)
- **Native Audio Background Playback**: หากต้องการให้แอปในรูปแบบ APK เล่นเพลงต่อเนื่องเมื่อหน้าจอดับลงในอุปกรณ์บางยี่ห้อ สามารถเพิ่ม Capacitor Background Mode Plugin ในขั้นตอนบิลด์ได้
- **Icon Adaptive Generation**: ในอนาคตสามารถใช้คำสั่ง `@capacitor/assets` ภายในเวิร์กโฟลว์เพื่อแปลง `icon.svg` เป็น Adaptive Icon หลากขนาดสำหรับโฟลเดอร์ `res/mipmap-*` ของ Android โดยอัตโนมัติ