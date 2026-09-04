# Project Architecture & Dependency Matrix

## 1. Project Overview & Architecture (ภาพรวมและสถาปัตยกรรม)
- Description: GT SoundMaster เป็นแอปพลิเคชันเครื่องเล่นเพลงระดับ Audiophile บนเว็บและอุปกรณ์มือถือ (Local Client-Side 100%) ทำงานร่วมกับระบบ IndexedDB เพื่อจัดเก็บไฟล์เสียงแบบออฟไลน์ มีภาคประมวลผลเสียงระดับสตูดิโอ 10-Band EQ, Pre-Amp Headroom Management, Pure Direct Mode, Safety Limiter, Sleep Timer, ระบบแสดงผลคลื่นเสียงแบบ Neon Circular Visualizer และระบบเชื่อมต่อ Media Session API สองทางเพื่อควบคุมการเล่นเพลงผ่านแถบแจ้งเตือนภายนอกและหน้าจอล็อคของระบบปฏิบัติการ Android พร้อมระบบแปลงไอคอนและคอมไพล์ APK อัตโนมัติผ่าน GitHub Actions
- Tech Stack: HTML5, CSS3 (Glassmorphism), Vanilla JavaScript (ES6 Modules), Web Audio API, Media Session API, IndexedDB API, LocalStorage API, Web App Manifest, Capacitor Android SDK, Sharp, Node.js 22, Java JDK 21 (Zulu), Gradle Wrapper
- Architecture Pattern: Modular Component Architecture (Separation of Concerns: Core Audio Engines, System Media Service Bridge, State Management, Local Persistence Layer, UI Component Controllers, Autonomous CI/CD Mobile Build Pipeline)

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
- Audio Ingestion & Storage Pipeline:
  ผู้ใช้เลือกไฟล์เสียงผ่าน input[type="file"] -> storage.js ตรวจสอบ MIME type และป้องกันไฟล์ซ้ำ -> บันทึกไฟล์ลง IndexedDB Store "audioTracks" ในรูป Blob -> ส่งรายการเพลงกลับไปยัง playlistUI.js และ stateManager.js เพื่อตั้งค่าคิวเพลง
- Audiophile Audio Processing Graph:
  audioEngine.audioElement -> MediaElementAudioSourceNode
  - เส้นทางสัญญาณ Wet Path: wetGain -> preampNode -> BiquadFilterNode Cascade (10 ย่านความถี่: 32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz) -> DynamicsCompressorNode (Safety Limiter ที่ -0.1dB) -> audioCtx.destination และ analyserNode
  - เส้นทางสัญญาณ Dry Path (Pure Direct / Bypass): dryGain -> audioCtx.destination และ analyserNode
- System Media Session & Lock Screen Control Flow:
  - ทิศทางขาออก (App สู่ OS): เมื่อเริ่มเล่นเพลงหรือเปลี่ยนเพลง audioEngine และ playerUI จะส่งข้อมูลแทร็กไปยัง mediaSessionManager.js -> อัปเดต navigator.mediaSession.metadata (ชื่อเพลง, ศิลปิน, ภาพปก PNG/SVG) และสถานะ playbackState ("playing"/"paused") รวมถึง positionState ไปยังระบบปฏิบัติการ Android เพื่อแสดงผลบน Notification Shade, Quick Settings Media Panel และ Lock Screen Widget
  - ทิศทางขาเข้า (OS สู่ App): เมื่อผู้ใช้สั่งงานผ่านปุ่มควบคุมภายนอกแอพ เช่น หน้าจอล็อค หูฟังบลูทูธ หรือ Smartwatch ระบบปฏิบัติการจะยิง Action Event (play, pause, previoustrack, nexttrack, seekto, seekforward, seekbackward, stop) เข้ามาที่ mediaSessionManager.js -> ส่งคำสั่งต่อไปยัง audioEngine.js และ playerUI.js ทันทีโดยไม่ต้องเปิดหน้าจอแอพ
- Visualizer Animation Loop:
  analyserNode ดึงค่าความถี่แบบเรียลไทม์ผ่าน getByteFrequencyData -> คำนวณค่าเฉลี่ยย่าน Bass เพื่อสร้าง Bass Pulse ขยายขนาดวงแหวนและไอคอนกลางจอ -> วาดกราฟฟิกแท่ง Equalizer และวงแหวนนีออนลงบน visualizer-canvas ผ่าน requestAnimationFrame
- Sleep Timer Execution Flow:
  timerUI.js คำนวณเวลาถอยหลังแบบ Epoch Timestamp -> แสดงผลนับถอยหลังบนหน้าปัด -> เมื่อหมดเวลาจะเรียก audioEngine.pause() สั่งหยุดเล่นเสียง พร้อมส่งคำสั่ง Haptic Feedback (สั่นเตือน) และแสดงข้อความแจ้งเตือนผ่าน modalUI.js
- Mobile APK Build Pipeline:
  GitHub Push (main/master) -> GitHub Actions Runner ติดตั้ง Node.js, Java JDK, Capacitor และ Sharp -> รัน Node Script แปลง icon.svg เป็น icon.png ขนาด 512x512 -> รวบรวมไฟล์เว็บลงไดเรกทอรี www -> เตรียม assets/ และรัน @capacitor/assets generate --android เพื่อสร้างโฟลเดอร์ mipmap-* และ Adaptive Icons ของ Android ทั้งหมด -> ซิงค์โค้ดด้วย cap sync -> รัน gradlew assembleDebug คอมไพล์เป็น app-debug.apk พร้อมดาวน์โหลดจาก Artifacts

## 4. Module Connections & Dependencies (สายสัมพันธ์ของไฟล์)

### App Configuration & CI/CD Pipeline
- **.github/workflows/build-apk.yml**: กำหนดขั้นตอน CI/CD Pipeline บน GitHub Actions สำหรับคอมไพล์ Android Debug APK แบบอัตโนมัติ พร้อมทั้งรันสคริปต์ Node.js แปลง icon.svg เป็น icon.png และสั่ง @capacitor/assets สร้างโครงสร้าง Android Adaptive Launcher Icons
  - *ดึงค่าจาก (Imports):* actions/checkout@v4, actions/setup-java@v4, actions/setup-node@v4, actions/upload-artifact@v4, @capacitor/core, @capacitor/cli, @capacitor/android, @capacitor/assets, sharp
  - *ถูกเรียกใช้โดย (Used By):* GitHub Actions Platform (ทำงานอัตโนมัติเมื่อ Push ขึ้น Branch main, master หรือสั่งงานผ่าน workflow_dispatch)
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* ./gradlew assembleDebug, อัปโหลดผลลัพธ์ไปที่ android/app/build/outputs/apk/debug/app-debug.apk
- **manifest.json**: กำหนดค่าการติดตั้ง Web App Manifest รองรับการทำงานแบบ Standalone การกำหนดสีธีมระบบ และระบุแหล่งที่อยู่ของไอคอนทั้งรูปแบบ PNG และ SVG
  - *ดึงค่าจาก (Imports):* icon.png, icon.svg
  - *ถูกเรียกใช้โดย (Used By):* index.html, Capacitor Android WebView Framework
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* Web Application Installation Manifest
- **icon.svg**: ไฟล์ภาพกราฟฟิกเวกเตอร์ความละเอียดสูง รูปร่างแผ่นเสียงนีออนและแท่ง Equalizer เป็น Single Source of Truth สำหรับงานกราฟฟิกทั้งหมด
  - *ดึงค่าจาก (Imports):* ไม่มี
  - *ถูกเรียกใช้โดย (Used By):* index.html, manifest.json, .github/workflows/build-apk.yml, js/core/mediaSessionManager.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* Favicon Link, UI Vector Resource, Base Asset สำหรับการแปลงไฟล์
- **icon.png**: ไฟล์ภาพบิตแมปขนาด 512x512 พิกเซลที่สร้างขึ้นอัตโนมัติจาก icon.svg เพื่อใช้เป็นภาพประจำตัวของ Notification Media Style และไอคอนของระบบ Android
  - *ดึงค่าจาก (Imports):* สร้างโดยตรงจาก icon.svg ผ่าน Sharp ใน .github/workflows/build-apk.yml
  - *ถูกเรียกใช้โดย (Used By):* manifest.json, js/core/mediaSessionManager.js, @capacitor/assets
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* Android Notification Artwork, Android App Launcher Bitmap

### Entry Point & Layout Structure
- **index.html**: โครงสร้างหลักของ Single Page Application จัดวางเลย์เอาต์ทั้งหมด เช่น Top Bar, Visualizer Section, Player Controls, Playlist Drawer, Equalizer Modal, Sleep Timer Modal, User Guide Modal และ Toast Notification Container
  - *ดึงค่าจาก (Imports):* manifest.json, icon.svg, css/main.css, css/player.css, css/playlist.css, css/eq.css, css/timer.css, css/help.css, js/app.js
  - *ถูกเรียกใช้โดย (Used By):* เบราว์เซอร์ของผู้ใช้, Capacitor Android WebView
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* DOM Elements IDs (#app-container, #player-section, #playlist-section, #eq-modal, #timer-modal, #help-modal, #toast-container)
- **js/app.js**: จุดเริ่มต้นการบูตแอปพลิเคชัน (Application Bootstrap) ทำหน้าที่เริ่มต้น IndexedDB สร้างอินสแตนซ์ของ StateManager, AudioEngine, MediaSessionManager และผูกการทำงานของ UI Controller ทุกส่วนเข้าด้วยกัน
  - *ดึงค่าจาก (Imports):* js/core/storage.js, js/core/stateManager.js, js/core/audioEngine.js, js/core/mediaSessionManager.js, js/ui/playerUI.js, js/ui/playlistUI.js, js/ui/eqUI.js, js/ui/timerUI.js, js/ui/helpUI.js
  - *ถูกเรียกใช้โดย (Used By):* index.html
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* Event Listener "DOMContentLoaded", window.nextTrackFallback, การดักจับฟังก์ชัน playlistUi.playTrack

### Stylesheet Layer
- **css/main.css**: กำหนดสไตล์ส่วนกลาง Glassmorphism, ธีมสีมืด (#121218), แถบ Top Bar, Visualizer Ring, ปุ่มกดไอคอน และปุ่มกด Favorite
  - *ดึงค่าจาก (Imports):* ไม่มี
  - *ถูกเรียกใช้โดย (Used By):* index.html
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* CSS Classes และ Element IDs ทั่วไป
- **css/player.css**: กำหนดสไตล์ส่วน Player Section แถบเลื่อนเวลา Seek Bar, ปุ่ม Play/Pause, ปุ่มควบคุมเพลง และ Typography แสดงชื่อเพลง/ศิลปิน
  - *ดึงค่าจาก (Imports):* ไม่มี
  - *ถูกเรียกใช้โดย (Used By):* index.html
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* .player-section, #seek-bar, .controls-row, .play-pause-btn
- **css/playlist.css**: กำหนดสไตล์ Drawer รายการเพลง, กล่องค้นหา, Dropdown จัดการเพลย์ลิสต์, แอนิเมชันตอนเล่นเพลง และการแสดงผล Modal/Toast
  - *ดึงค่าจาก (Imports):* ไม่มี
  - *ถูกเรียกใช้โดย (Used By):* index.html
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* .playlist-section, #playlist-container, .playlist-track-item, .gt-modal-overlay, .toast-container
- **css/eq.css**: กำหนดสไตล์หน้าต่าง Audiophile EQ, แถบเลื่อนปรับแต่งสัญญาณ Faders แนวตั้ง, สไลเดอร์ Pre-Amp, ปุ่ม Direct Bypass และสถานะแสงนีออน (Glow)
  - *ดึงค่าจาก (Imports):* ไม่มี
  - *ถูกเรียกใช้โดย (Used By):* index.html
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* .eq-modal, .eq-workspace, .eq-slider, .eq-bypass-btn
- **css/timer.css**: กำหนดสไตล์หน้าต่าง Sleep Timer, หน้าปัดจับเวลาทรงกลม (Dial), ชิปเลือกพรีเซ็ตเวลา, สถานะนับถอยหลัง และแอนิเมชันไฟนีออนกะพริบ
  - *ดึงค่าจาก (Imports):* ไม่มี
  - *ถูกเรียกใช้โดย (Used By):* index.html
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* .timer-modal, .timer-dial, .preset-chip, #sleep-timer-btn.timer-active-neon
- **css/help.css**: กำหนดสไตล์หน้าต่างคู่มือการใช้งาน (User Guide Modal), การ์ดอธิบายฟังก์ชัน, ป้ายแท็กหมวดหมู่ และสไตล์การเลื่อนหน้าจอ
  - *ดึงค่าจาก (Imports):* ไม่มี
  - *ถูกเรียกใช้โดย (Used By):* index.html
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* .help-modal, .help-container, .help-content-scroll, .help-card

### Core Engine & State Layer
- **js/core/audioEngine.js**: ควบคุมและบริหารจัดการ Web AudioContext และ HTML5 Audio Element รวมถึงการโหลดไฟล์เสียง (Object URL / String), เล่น, หยุด, เลื่อนตำแหน่งเพลง และส่งต่อข้อผิดพลาด
  - *ดึงค่าจาก (Imports):* js/core/audioEffect.js
  - *ถูกเรียกใช้โดย (Used By):* js/app.js, js/core/mediaSessionManager.js, js/ui/playerUI.js, js/ui/playlistUI.js, js/ui/timerUI.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* load(fileOrUrl), play(), pause(), seek(seconds), skipToNext(), audioElement.onplay, audioElement.onpause, audioElement.onerror
- **js/core/audioEffect.js**: ภาคประมวลผลเสียงขั้นสูง ประกอบด้วยวงจร 10-Band Biquad Filter, Pre-Amp Gain Node, วงจรตัดวงจร EQ แบบ Pure Direct (Wet/Dry Gain Nodes), Transparent Safety Limiter (DynamicsCompressor) และระบบวาด Neon Audio Visualizer บน Canvas
  - *ดึงค่าจาก (Imports):* ไม่มี
  - *ถูกเรียกใช้โดย (Used By):* js/core/audioEngine.js, js/ui/eqUI.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* init(existingContext, audioElement), setPreamp(gainDb), setBypass(bypassed), setEqBand(index, gainValue), start(), stop(), draw()
- **js/core/mediaSessionManager.js**: บริหารจัดการการผสานรวมระหว่างแอปพลิเคชันกับระบบปฏิบัติการผ่าน W3C Media Session API ทำหน้าที่รับ-ส่งข้อมูลสองทาง (Two-way Bridge) เพื่อให้แสดงสถานะเพลงบนหน้าจอล็อคและแถบแจ้งเตือนของมือถือ พร้อมรับคำสั่งควบคุมภายนอกกลับมาสั่งงาน Audio Engine
  - *ดึงค่าจาก (Imports):* js/core/audioEngine.js
  - *ถูกเรียกใช้โดย (Used By):* js/app.js, js/ui/playerUI.js, js/ui/playlistUI.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* init({ onNext, onPrev }), updateMetadata(track), setPlaybackState(state), updatePositionState(), navigator.mediaSession.setActionHandler
- **js/core/stateManager.js**: จัดการสถานะการเล่นเพลง (State Layer) คิวเพลงปัจจุบัน คิวเพลงต้นฉบับ ลำดับเพลงที่กำลังเล่น และโหมดการเล่น (Order, Repeat One, Shuffle)
  - *ดึงค่าจาก (Imports):* ไม่มี
  - *ถูกเรียกใช้โดย (Used By):* js/app.js, js/ui/playerUI.js, js/ui/playlistUI.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* setQueue(tracks), togglePlay(), nextTrack(), prevTrack(), cyclePlayMode(), shuffleArray(array)
- **js/core/storage.js**: จัดการฐานข้อมูล IndexedDB (LocalMusicDB v3) สำหรับจัดเก็บก้อนข้อมูลเพลง (Blob) พรีเซ็ตของอีควอไลเซอร์ (eqPresets) และพรีเซ็ตของตัวจับเวลานอน (timerPresets)
  - *ดึงค่าจาก (Imports):* ไม่มี
  - *ถูกเรียกใช้โดย (Used By):* js/app.js, js/ui/playlistUI.js, js/ui/eqUI.js, js/ui/timerUI.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* initDB(), saveFiles(fileList), getAllTracks(), deleteTrack(id), getEqPresets(), saveEqPreset(presetData), deleteEqPreset(id), getTimerPresets(), saveTimerPreset(presetData), deleteTimerPreset(id), clearTimerPresets()

### UI Component Layer
- **js/ui/playerUI.js**: ควบคุมองค์ประกอบ UI บนหน้าจอเครื่องเล่นเพลงหลัก เช่น ชื่อเพลง, ศิลปิน, แถบเวลา, ปุ่ม Play/Pause, ปุ่มถัดไป/ย้อนกลับ (พร้อมระบบกดค้างเพื่อกรอเพลง Hold-to-Seek), ปุ่มโหมดการเล่น, ปุ่มเพลงโปรด (Favorites) และส่งข้อมูลสถานะไปยัง Media Session
  - *ดึงค่าจาก (Imports):* js/ui/modalUI.js, js/core/mediaSessionManager.js
  - *ถูกเรียกใช้โดย (Used By):* js/app.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* loadAndPlay(track), playNext(), playPrev(), togglePlay(), cycleMode(), updateTitle(title), updateSeekBar(), handleLikeClick(), CustomEvent "gt-liked-updated"
- **js/ui/playlistUI.js**: จัดการการแสดงผลหน้ารายชื่อเพลง การนำเข้าไฟล์เพลงผ่าน input, การค้นหาเพลง, การสร้าง/แก้ไข/ลบเพลย์ลิสต์, การเลือกเพลงเพื่อเล่น และส่งสัญญาณอัปเดตสถานะเพลงไปยัง Media Session
  - *ดึงค่าจาก (Imports):* js/core/storage.js, js/ui/modalUI.js, js/core/mediaSessionManager.js
  - *ถูกเรียกใช้โดย (Used By):* js/app.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* loadPlaylist(searchQuery), playTrack(track), deleteTrack(id), handleFileUpload(event), handleClearPlaylist(), editPlaylist(id), deletePlaylist(id)
- **js/ui/eqUI.js**: จัดการหน้าต่างปรับแต่งเสียง Audiophile EQ สไลเดอร์ 10 ย่านความถี่, สไลเดอร์ Pre-Amp, ปุ่ม Pure Direct Bypass และการโหลด/บันทึก/ลบพรีเซ็ต EQ ลงฐานข้อมูล
  - *ดึงค่าจาก (Imports):* js/core/audioEffect.js, js/core/storage.js, js/ui/modalUI.js
  - *ถูกเรียกใช้โดย (Used By):* js/app.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* loadPresets(), applyPreset(presetName), _updateBandUI(index, val), _updatePreampUI(val)
- **js/ui/timerUI.js**: จัดการระบบตั้งเวลานอนหลับ (Sleep Timer) หน้าปัดหมุนตั้งเวลา, ระบบนับถอยหลัง, การจัดการพรีเซ็ตเวลา และการสั่งหยุดเพลงพร้อมสั่นเตือนผ่าน Web Vibration API เมื่อหมดเวลา
  - *ดึงค่าจาก (Imports):* js/core/storage.js, js/ui/modalUI.js, js/core/audioEngine.js
  - *ถูกเรียกใช้โดย (Used By):* js/app.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* startTimer(), stopTimer(), resetTimer(), tick(), executeSleepAction(), loadPresets(), createPreset(), editPreset(), managePreset(), clearAllPresets()
- **js/ui/helpUI.js**: จัดการการเปิด-ปิดหน้าต่างคู่มือการใช้งานระบบ (User Guide Modal)
  - *ดึงค่าจาก (Imports):* ไม่มี
  - *ถูกเรียกใช้โดย (Used By):* js/app.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* init(), openModal(), closeModal()
- **js/ui/modalUI.js**: กล่องข้อความแจ้งเตือนและหน้าต่างป๊อปอัปส่วนกลาง รองรับการแจ้งเตือนทั่วไป (Alert), การยืนยัน (Confirm), การกรอกข้อความ (Prompt, DoublePrompt) และข้อความลอย (Toast Notification) สไตล์ Glassmorphism
  - *ดึงค่าจาก (Imports):* ไม่มี
  - *ถูกเรียกใช้โดย (Used By):* js/ui/playerUI.js, js/ui/playlistUI.js, js/ui/eqUI.js, js/ui/timerUI.js
  - *จุดเชื่อมต่อ (Endpoints/Hooks):* showAlert(title, message), showConfirm(title, message), showPrompt(title, placeholder, defaultValue, inputType), showDoublePrompt(title, placeholder1, value1, placeholder2, value2), showToast(message, type)

## 5. Scalability & Refactoring Notes (แผนการขยายสเกล)
- Background Audio Persistence (Android Service Integration):
  แม้ว่า Media Session API จะช่วยให้ระบบปฏิบัติการรู้จักแทร็กเพลงและคงสถานะการเล่นเบื้องหลังไว้ได้ แต่ในรอมที่มีการจัดการพลังงานแบบเข้มงวด (เช่น ColorOS, HyperOS, OneUI) มีโอกาสที่ WebView จะถูกระงับการทำงาน (Freeze) เมื่อจอดับเป็นเวลานาน หากในอนาคตต้องการรองรับการเล่นแบบข้ามวันโดยไม่ต้องตั้งค่า Battery เป็น Unrestricted ให้พิจารณาติดตั้ง Capacitor Native Plugin เช่น @capacitor-community/media หรือ @capgo/capacitor-audio เพื่อรัน Foreground Service แท้จริงบนระบบปฏิบัติการ
- ID3 Tags Parser Integration:
  ปัจจุบันระบบดึงชื่อเพลงจากชื่อไฟล์โดยการตัดนามสกุลออก หากต้องการให้แสดงชื่อศิลปิน ชื่ออัลบั้ม และภาพปกเพลงของแต่ละไฟล์บน Notification Shade ได้ถูกต้องแม่นยำ ควรแยกโมดูล js/core/metadataParser.js เพื่ออ่าน Binary ID3v2/Vorbis Tags จาก Blob ก่อนบันทึกลง IndexedDB
- IndexedDB Large Scale Pagination:
  ฟังก์ชัน getAllTracks() ดึงข้อมูลเพลงทั้งหมดขึ้นมาเก็บในหน่วยความจำพร้อมกัน หากคลังเพลงของผู้ใช้มีขนาดใหญ่เกินกว่า 2,000 แทร็ก การเก็บ Blob ทั้งหมดใน Array อาจทำให้เกิด Memory Spike ได้ ควรปรับปรุงเป็นการเปิด Cursor อ่านข้อมูลเฉพาะ Metadata ก่อน แล้วจึงดึง Blob เมื่อเริ่มเล่นเพลง (Lazy Loading)