# Project Architecture & Dependency Matrix

## 1. Project Overview & Architecture
- **Description:** GT SoundMaster - Audiophile Local Music Player (100% Client-Side Local Storage) ออกแบบด้วยสถาปัตยกรรมแบบ Minimalist High-Fidelity เล่นเพลงผ่านฮาร์ดแวร์ถอดรหัสของ Android โดยตรง พร้อมระบบ Micro-Gain Ramp ป้องกันเสียงกึก/สะดุด ควบคุมด้วย Sleep Timer และผสานการทำงานร่วมกับ Android Native Media Notification Service (ควบคุมผ่านแถบแจ้งเตือนและหน้าจอล็อกสกรีน)
- **Tech Stack:** HTML5, CSS3 (Minimalist Cyberpunk Theme), Vanilla JavaScript (ES6 Modules), Web Audio API (Micro-Gain Controller), Media Session API, IndexedDB API, Capacitor Android SDK, Native Android Framework (MediaSession, Notification.MediaStyle, Foreground Service), Node.js 22, Java JDK 21 (Zulu), Gradle Wrapper
- **Architecture Pattern:** Modular Component Architecture (Clean separation between Storage, Audio Engine, UI Controllers, and Android Native Bridge)

## 2. Directory Tree
```text
/ (Root)
|-- .github/
|   `-- workflows/
|       `-- build-apk.yml
|-- css/
|   |-- help.css
|   |-- main.css
|   |-- player.css
|   |-- playlist.css
|   `-- timer.css
|-- js/
|   |-- app.js
|   |-- core/
|   |   |-- audioEngine.js
|   |   |-- mediaSessionManager.js
|   |   |-- stateManager.js
|   |   `-- storage.js
|   `-- ui/
|       |-- helpUI.js
|       |-- modalUI.js
|       |-- playerUI.js
|       |-- playlistUI.js
|       `-- timerUI.js
|-- icon.svg
|-- icon.png
|-- index.html
|-- manifest.json
|-- CHANGELOG.md
|-- README.md
`-- Structure file.md
```

## 3. Data Flow & State Management
- **Audio Playback Pipeline (Zero-Click Micro-Gain Architecture):**
  `audioEngine.audioElement` -> `MediaElementAudioSourceNode` -> `GainNode (Sample-level Ramp: 35ms)` -> `audioCtx.destination`
  - *Play:* Ramp Gain 0.0001 -> 1.0 (ป้องกันเสียงกึกที่จุดเริ่มต้นของไฟล์เสียง)
  - *Pause:* Ramp Gain 1.0 -> 0.0001 แล้วสั่ง Pause (ป้องกันการตัดคลื่นเสียงกะทันหัน)
  - *Next/Prev:* Pause (Fade-out) -> Swap ObjectURL -> Play (Fade-in)
- **Two-Way Notification & MediaSession Sync:**
  - *App -> Native OS:* ส่ง Metadata (ชื่อเพลง, ศิลปิน, ตำแหน่งเวลา) ผ่าน `AndroidBridge.updatePlayback()` เข้าสู่ Native `MediaPlaybackService`
  - *Native OS -> App:* รับคำสั่งกดปุ่มควบคุมจากหน้า Lock Screen / Notification Panel ผ่าน `MediaSession.Callback` ส่งกลับเข้ามาสั่งงานที่ `window.mediaControlAction`
- **Touch Gesture Control & Concurrency:**
  - ปุ่ม Next/Prev รองรับการแตะเพื่อเปลี่ยนเพลง และกดค้าง (Hold > 450ms) เพื่อกรอเพลง (Seek)
  - มีระบบตรวจจับ Touch Cancellation เมื่อผู้ใช้เลื่อนนิ้วออกจากปุ่ม จะยกเลิกคำสั่งทันที ป้องกันการสั่งเปลี่ยนเพลงโดยไม่ตั้งใจ
  - มีตัวแปร `isChangingTrack` คอยล็อกป้องกันการสั่งเปลี่ยนเพลงซ้อนกันในเสี้ยววินาที

## 4. Module Connections & Dependencies
- **.github/workflows/build-apk.yml:** เวิร์กโฟลว์ CI/CD สำหรับบิลด์ไฟล์ Android Debug APK (v1.2.0, versionCode 3)
- **index.html:** หน้าโครงสร้างหลักแบบ Single Page Application (SPA)
- **js/app.js:** จุดเริ่มต้นการทำงาน (Bootstrap) เชื่อมต่อ Controller ต่างๆ
- **js/core/audioEngine.js:** เอนจินควบคุมเสียงหลัก ผสานระบบ Micro-Gain Ramp
- **js/core/mediaSessionManager.js:** จัดการ MediaSession API และสื่อสารกับ Native Android Bridge
- **js/core/stateManager.js:** จัดการคิวเพลงและโหมดการเล่น (Order, Repeat One, Shuffle)
- **js/core/storage.js:** จัดการฐานข้อมูล IndexedDB จัดเก็บ Metadata และไฟล์เสียงแบบ Blob ในเครื่อง
- **js/ui/playerUI.js:** จัดการปุ่มกด Seekbar และการแสดงผลหน้า Now Playing
- **js/ui/playlistUI.js:** จัดการนำเข้าไฟล์เสียงและสร้างเพลย์ลิสต์
- **js/ui/timerUI.js:** จัดการระบบตั้งเวลาปิดเพลงอัตโนมัติ (Sleep Timer)
- **js/ui/helpUI.js:** จัดการหน้าต่างคู่มือ System Manual