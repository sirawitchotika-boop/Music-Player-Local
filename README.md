# 🎵 GT SoundMaster (v1.2.0)

> **Ultra-Lean & High-Fidelity Local Music Player for Android**  
> แอปเล่นเพลงออฟไลน์ระดับ Audiophile เน้นความเสถียรสูงสุด เสียงใส ไร้เสียงสะดุด ไม่เปลืองแบตเตอรี่ และทำงานร่วมกับระบบ Android ได้อย่างสมบูรณ์แบบ

---

## 🌟 ฟีเจอร์หลัก (Key Features)

- 🎧 **Zero-Click Micro-Gain Engine:** ระบบจัดการแรงดันคลื่นเสียงด้วย `GainNode` ระดับฮาร์ดแวร์ ป้องกันปัญหาเสียง "กึก" (Zero-Crossing Pop) ตอนกด Play, Pause และเปลี่ยนเพลง ทำงานนุ่มนวลเทียบเท่าแอปเครื่องเล่นเพลง Native ของระบบ Android
- 📱 **Android Native Media Service:** รองรับการควบคุมผ่านหน้าจอล็อก (Lock Screen) และแถบการแจ้งเตือน (Notification Shade) พร้อมแถบ Seekbar แบบสองทาง (Two-way synchronization)
- 🔒 **100% Client-Side Local Storage:** เก็บเพลงและเพลย์ลิสต์ทั้งหมดไว้ในเครื่องผ่าน **IndexedDB** ปลอดภัย ออฟไลน์ 100% ไม่ต้องต่อเน็ต และไม่ส่งข้อมูลออกนอกเครื่อง
- 🌙 **Sleep Timer Daemon:** ระบบตั้งเวลาหยุดเล่นเพลงอัตโนมัติ พร้อมการตัดเสียงแบบนุ่มนวล ไม่ทำให้ตกใจตื่น และมีระบบสั่น Haptic Feedback
- ⚡ **Ultra-Lean & Battery Saving:** ปราศจากโค้ดขยะ (Zero Zombie Code) ตัดการเรนเดอร์ Canvas หนักๆ ออก เพื่อให้ชิปประมวลผลและชิปเสียงทำงานได้เต็มประสิทธิภาพโดยไม่กระตุกแม้สลับแอปไปมา
- 🎨 **Minimalist Cyberpunk UI:** ดีไซน์หน้าจอสีเข้ม Dark Theme เรียบหรู ถนอมสายตา พร้อมไอคอนแสดงสถานะเรืองแสงเบาๆ เมื่อเพลงกำลังเล่น

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

| ส่วนประกอบ | เทคโนโลยี |
| :--- | :--- |
| **Frontend UI** | HTML5, CSS3 (Modern Glassmorphism & Cyberpunk Accent) |
| **Core Architecture** | Vanilla JavaScript (ES6 Modules) |
| **Audio Core** | HTML5 Audio + Web Audio API (`GainNode` Sample Ramp) |
| **Local Database** | IndexedDB API (แยกตาราง Metadata & Blobs) |
| **Native Bridge** | Capacitor Android SDK, MediaSession API |
| **Android Framework** | `MediaSession`, `Notification.MediaStyle`, `ForegroundService` (Type: `mediaPlayback`), `WakeLock` |
| **Automation CI/CD** | GitHub Actions (Ubuntu, Java JDK 21 Zulu, Node.js 22, Gradle) |

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```text
/ (Root)
|-- .github/workflows/
|   `-- build-apk.yml          # CI/CD Automated Android APK Builder
|-- css/
|   |-- help.css               # สไตล์หน้าต่างคู่มือระบบ
|   |-- main.css               # สไตล์โครงสร้างหลักและแผ่น Disc
|   |-- player.css             # สไตล์ปุ่มควบคุมและ Seekbar
|   |-- playlist.css           # สไตล์หน้าต่างเพลย์ลิสต์และค้นหาเพลง
|   `-- timer.css              # สไตล์หน้าปัดนาฬิกา Sleep Timer
|-- js/
|   |-- app.js                 # จุดเริ่มต้นแอปพลิเคชัน (Bootstrap)
|   |-- core/
|   |   |-- audioEngine.js     # เอนจินเสียง Micro-Gain Ramp
|   |   |-- mediaSessionManager.js # เชื่อมต่อระบบแจ้งเตือน Android
|   |   |-- stateManager.js    # คิวเพลงและโหมดการเล่น (Shuffle/Repeat)
|   |   `-- storage.js         # ระบบจัดการฐานข้อมูล IndexedDB
|   `-- ui/
|       |-- helpUI.js          # จัดการหน้าต่างคู่มือ
|       |-- modalUI.js         # ระบบแจ้งเตือน Dialog และ Toast
|       |-- playerUI.js        # ตัวควบคุมหน้าเครื่องเล่นเพลง
|       |-- playlistUI.js      # ตัวควบคุมคลังเพลงและเพลย์ลิสต์
|       `-- timerUI.js         # ตัวควบคุม Sleep Timer
|-- icon.svg                   # ไอคอนหลักความละเอียดสูง
|-- index.html                 # หน้าจอหลัก Single Page Application
|-- manifest.json              # Web App Manifest สำหรับ PWA/Capacitor
|-- CHANGELOG.md               # บันทึกประวัติการพัฒนาแต่ละเวอร์ชัน
`-- Structure file.md          # ผังความสัมพันธ์ของโมดูลในระบบ
```

---

## 🚀 วิธีการ Build เป็น Android APK

โปรเจกต์นี้มีระบบ **Autonomous CI/CD** ผ่าน GitHub Actions ในตัว คุณสามารถสร้างไฟล์ APK ได้โดยไม่ต้องติดตั้ง Android Studio บนคอมพิวเตอร์:

1. Push โค้ดทั้งหมดขึ้นบน GitHub Repository ของคุณ
2. ไปที่แท็บ **Actions** บนหน้า GitHub
3. เลือก Workflow **Build Android APK**
4. กดปุ่ม **Run workflow**
5. เมื่อ Build เสร็จสิ้น สามารถดาวน์โหลดไฟล์ติดตั้งได้จากส่วน **Artifacts** (`GT-SoundMaster-APK`)

---

## 📄 ใบอนุญาต (License)

โปรเจกต์นี้สร้างขึ้นเพื่อการใช้งานส่วนตัวและการศึกษา (Personal Audiophile Local Player) ใช้งานฟรีและเป็นแบบ Open-Source 100%