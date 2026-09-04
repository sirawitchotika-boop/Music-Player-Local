# Project Architecture & Dependency Matrix

## 1. Project Overview & Architecture (ภาพรวมและสถาปัตยกรรม)
- Description: GT SoundMaster เป็นแอปพลิเคชันเครื่องเล่นเพลงระดับ Audiophile บนเว็บและอุปกรณ์มือถือ (Local Client-Side 100%) มีภาคประมวลผลเสียงระดับสตูดิโอ 10-Band EQ, Pre-Amp Headroom Management, Pure Direct Mode, Safety Limiter, Sleep Timer, ระบบแสดงผลคลื่นเสียงแบบ Neon Circular Visualizer และเชื่อมต่อสองทางกับ Android Native Media Notification Service และ Intent File Resolver ทำให้สามารถเปิดเล่นไฟล์เพลงจาก File Manager ได้ทันทีและควบคุมเพลงบนหน้าจอล็อคได้สมบูรณ์
- Tech Stack: HTML5, CSS3 (Glassmorphism), Vanilla JavaScript (ES6 Modules), Web Audio API, Media Session API, IndexedDB API, Capacitor Android SDK, Native Android Framework (MediaSession, Notification.MediaStyle), Sharp, Node.js 22, Java JDK 21 (Zulu), Gradle Wrapper
- Architecture Pattern: Modular Component Architecture (Separation of Concerns: Core Audio Engines, Native Android Media Service Bridge, State Management, Local Persistence Layer, UI Component Controllers, Autonomous CI/CD Mobile Build Pipeline)

## 2. Directory Tree (โครงสร้างโฟลเดอร์)
/ (Root)
|-- .github/
|   `-- workflows/
|       `-- build-apk.yml
|-- css/
|   |-- eq.css
|   |-- help.css
|   |-- main.css
|   |-- player.css
|   |-- playlist.css
|   `-- timer.css
|-- js/
|   |-- app.js
|   |-- core/
|   |   |-- audioEffect.js
|   |   |-- audioEngine.js
|   |   |-- mediaSessionManager.js
|   |   |-- stateManager.js
|   |   `-- storage.js
|   `-- ui/
|       |-- eqUI.js
|       |-- helpUI.js
|       |-- modalUI.js
|       |-- playerUI.js
|       |-- playlistUI.js
|       `-- timerUI.js
|-- icon.svg
|-- icon.png (สร้างอัตโนมัติขณะคอมไพล์ใน CI)
|-- index.html
|-- manifest.json
`-- Structure file.md

## 3. Data Flow & State Management (การไหลของข้อมูล)
- External Intent File Resolution:
  ผู้ใช้กดไฟล์เพลงใน File Manager -> Android OS ยิง Intent ACTION_VIEW สู่ MainActivity -> MainActivity คัดลอก Stream สู่แคชในตัวแอปแล้วแปลงเป็น Local URL -> ส่งผ่าน AndroidBridge เข้าสู่ window.handleExternalTrack หรือ getPendingTrack() -> audioEngine.load() โหลดและเริ่มเล่นเพลงทันทีโดยไม่ต้องรอเพิ่มลงเพลย์ลิสต์
- Native Lock Screen & Notification Shade Control Flow:
  - ทิศทางขาออก (App สู่ Native OS): เมื่อเพลงเริ่มเล่น mediaSessionManager.js จะส่ง Title และ Artist ผ่าน AndroidBridge.updatePlayback() -> Native Android Service สร้าง NotificationCompat ด้วย Notification.MediaStyle และ MediaSession Token ทันที ทำให้ปุ่ม Play/Pause, Next, Previous ปรากฏบนหน้าจอล็อค
  - ทิศทางขาเข้า (Native OS สู่ App): เมื่อผู้ใช้กดปุ่มบนหน้าจอล็อคหรือแถบแจ้งเตือน -> BroadcastReceiver รับ Action และประมวลผลคำสั่ง window.mediaControlAction() กลับมายัง PlayerUI เพื่อควบคุมการเล่นเพลงแบบเรียลไทม์
- Audiophile Audio Processing Graph:
  audioEngine.audioElement -> MediaElementAudioSourceNode
  - เส้นทางสัญญาณ Wet Path: wetGain -> preampNode -> BiquadFilterNode Cascade (10 ย่านความถี่: 32Hz..16kHz) -> DynamicsCompressorNode (Safety Limiter ที่ -0.1dB) -> audioCtx.destination และ analyserNode
  - เส้นทางสัญญาณ Dry Path (Pure Direct / Bypass): dryGain -> audioCtx.destination และ analyserNode

## 4. Module Connections & Dependencies (สายสัมพันธ์ของไฟล์)

### App Configuration & CI/CD Pipeline
- **.github/workflows/build-apk.yml**: จัดการการคอมไพล์ Android Debug APK แบบอัตโนมัติ แปลงไอคอน ฉีดสิทธิ์ Android Permissions (READ_MEDIA_AUDIO, READ_EXTERNAL_STORAGE, FOREGROUND_SERVICE_MEDIA_PLAYBACK, WAKE_LOCK, POST_NOTIFICATIONS) และแพตช์ MainActivity.java ให้มี MediaSession และ Intent Resolution
  - *ดึงค่าจาก (Imports):* actions/checkout@v4, actions/setup-java@v4, actions/setup-node@v4, actions/upload-artifact@v4, @capacitor/core, @capacitor/cli, @capacitor/android, @capacitor/assets, sharp, python3
  - *ถูกเรียกใช้โดย (Used By):* GitHub Actions Platform
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* ./gradlew assembleDebug, Android Manifest & Java Native Source Injection
- **manifest.json**: Web App Manifest กำหนดค่า Standalone Mode และระบุไอคอนระบบ
  - *ดึงค่าจาก (Imports):* icon.png, icon.svg
  - *ถูกเรียกใช้โดย (Used By):* index.html, Capacitor Android WebView Framework
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* Web Application Installation Manifest
- **icon.svg / icon.png**: ไฟล์ไอคอนเวกเตอร์และบิตแมปความละเอียดสูง
  - *ดึงค่าจาก (Imports):* icon.svg (Single Source of Truth)
  - *ถูกเรียกใช้โดย (Used By):* index.html, manifest.json, .github/workflows/build-apk.yml, js/core/mediaSessionManager.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* Launcher Icon, Notification Icon

### Entry Point & Application Core
- **index.html**: โครงสร้าง Single Page Application
  - *ดึงค่าจาก (Imports):* manifest.json, icon.svg, css/*.css, js/app.js
  - *ถูกเรียกใช้โดย (Used By):* เบราว์เซอร์, Capacitor Android WebView
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* DOM Container Elements
- **js/app.js**: Application Bootstrap เริ่มต้นระบบและผูกการรับไฟล์ภายนอกจาก Android Intent
  - *ดึงค่าจาก (Imports):* js/core/storage.js, js/core/stateManager.js, js/core/audioEngine.js, js/core/mediaSessionManager.js, js/ui/playerUI.js, js/ui/playlistUI.js, js/ui/eqUI.js, js/ui/timerUI.js, js/ui/helpUI.js
  - *ถูกเรียกใช้โดย (Used By):* index.html
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* window.handleExternalTrack, window.AndroidBridge.getPendingTrack(), window.nextTrackFallback
- **js/core/mediaSessionManager.js**: สะพานเชื่อมต่อระหว่าง Web Audio กับ Native Media Notification Service
  - *ดึงค่าจาก (Imports):* js/core/audioEngine.js
  - *ถูกเรียกใช้โดย (Used By):* js/app.js, js/ui/playerUI.js, js/ui/playlistUI.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* window.AndroidBridge.updatePlayback(), window.mediaControlAction(), navigator.mediaSession
- **js/core/audioEngine.js**: จัดการ AudioContext และ HTML5 Audio Element
  - *ดึงค่าจาก (Imports):* js/core/audioEffect.js
  - *ถูกเรียกใช้โดย (Used By):* js/app.js, js/core/mediaSessionManager.js, js/ui/playerUI.js, js/ui/playlistUI.js, js/ui/timerUI.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* load(fileOrUrl), play(), pause(), seek(seconds), visibilitychange auto-resume

### UI Controllers & Persistence
- **js/ui/playerUI.js**: จัดการเครื่องเล่นเพลงหลัก
  - *ดึงค่าจาก (Imports):* js/ui/modalUI.js, js/core/mediaSessionManager.js
  - *ถูกเรียกใช้โดย (Used By):* js/app.js
- **js/ui/playlistUI.js**: จัดการเพลย์ลิสต์และการนำเข้าเพลง
  - *ดึงค่าจาก (Imports):* js/core/storage.js, js/ui/modalUI.js, js/core/mediaSessionManager.js
  - *ถูกเรียกใช้โดย (Used By):* js/app.js
- **js/ui/eqUI.js**: จัดการ Audiophile Equalizer
  - *ดึงค่าจาก (Imports):* js/core/audioEffect.js, js/core/storage.js, js/ui/modalUI.js
  - *ถูกเรียกใช้โดย (Used By):* js/app.js
- **js/ui/timerUI.js**: จัดการ Sleep Timer
  - *ดึงค่าจาก (Imports):* js/core/storage.js, js/ui/modalUI.js, js/core/audioEngine.js
  - *ถูกเรียกใช้โดย (Used By):* js/app.js
- **js/ui/helpUI.js**: จัดการ User Guide Modal
  - *ดึงค่าจาก (Imports):* ไม่มี
  - *ถูกเรียกใช้โดย (Used By):* js/app.js
- **js/ui/modalUI.js**: กล่องข้อความแจ้งเตือนและ Dialog ส่วนกลาง
  - *ดึงค่าจาก (Imports):* ไม่มี
  - *ถูกเรียกใช้โดย (Used By):* UI Controllers ทั้งหมด

## 5. Scalability & Refactoring Notes (แผนการขยายสเกล)
- Native Intent Stream Optimization:
  ปัจจุบัน Intent Stream ทำการสำเนาไฟล์เข้าสู่แอปแคชเพื่อความปลอดภัยของสิทธิ์การเข้าถึงไฟล์แบบ Scoped Storage หากในอนาคตมีไฟล์เพลงความละเอียดสูงพิเศษ (เช่น DSD หรือ FLAC ขนาดเกิน 200MB) สามารถปรับปรุงเป็นการอ่านผ่าน ContentProvider แบบ Direct File Descriptor เพื่อลดพื้นที่แคชชั่วคราวได้