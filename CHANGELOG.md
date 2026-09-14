# Changelog

All notable changes to the **GT SoundMaster** project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-09-14

### Fixed
- **Favorites Playlist UX/Logic:** บล็อกการเพิ่มเพลงเข้า "Favorites [PROTECTED]" แบบ Manual ผ่านปุ่ม Add Music โดยเพิ่มการดักจับระดับ Controller ใน `playlistUI.js` (Defense in Depth) หากพบว่าผู้ใช้พยายามเพิ่มเพลงเข้าเพลย์ลิสต์นี้ ระบบจะแจ้งเตือนและตัดจบการทำงานทันทีเพื่อรักษาโครงสร้างข้อมูลให้ถูกต้อง

## [1.2.0] - 2026-09-11

### Added
- **Sample-Accurate Micro-Gain Ramp:** นำระบบ `GainNode` ตัวเดียวมาคุมแรงดันคลื่นเสียงในระดับเสี้ยววินาที (35ms Ramp) ทั้งตอนกด Play, Pause และเปลี่ยนเพลง ป้องกันปัญหา Zero-Crossing Pop และเสียงกึกระดับฮาร์ดแวร์ DAC ได้อย่างสมบูรณ์แบบ เทียบเท่าแอปเล่นเพลง Native ติดเครื่อง
- **Touch Gesture & Event Guard:** ปรับปรุงตรรกะการสัมผัสปุ่ม Next/Prev ใน `playerUI.js` ใหม่ทั้งหมด ป้องกันปัญหาคำสั่ง Touch ซ้อนกับ MouseEvent (Double Trigger) และเพิ่มระบบยกเลิกคำสั่งอัตโนมัติเมื่อนิ้วเลื่อนหลุดออกจากปุ่ม (Mouseleave/Touchcancel = Cancel) ป้องกันการเปลี่ยนเพลงโดยไม่ตั้งใจ
- **Minimalist Center Album Art:** ดีไซน์พื้นที่ตรงกลางใหม่ให้เป็นแผ่น Disc สีเข้มเรียบหรู พร้อมไฟสถานะสีแดงส่องสว่างเมื่อเพลงกำลังเล่น สวยงาม คลีนตา และประหยัดแบตเตอรี่

### Removed
- **Legacy EQ & Heavy Visualizer Pipeline:** ลบโค้ดผี (Zombie Code) ที่เป็นต้นเหตุของ Audio Buffer Underrun ออกจากระบบทั้งหมด ได้แก่ `js/core/audioEffect.js`, `js/ui/eqUI.js`, `css/eq.css`, แท็ก `<canvas>` และหน้าต่าง Modal EQ
- **Erroneous Auto-Skip Logic:** ตัดคำสั่ง `skipToNext()` อัตโนมัติออกจาก `onerror` และบล็อก `catch` ในคอนโทรลเลอร์ ป้องกันไม่ให้แอปแอบเปลี่ยนเพลงเองเมื่อเกิดข้อผิดพลาดในการโหลด
- **Redundant 4-Second IPC Call:** ตัดการส่ง Intent ซ้ำซ้อนทุก 4 วินาทีใน `mediaSessionManager.js` ช่วยลดการสะดุดของซีพียูขณะเล่นเพลง

### Changed
- **System Manual:** อัปเดตเนื้อหาในหน้า Help Modal ให้ตรงกับฟังก์ชันการทำงานจริงในเวอร์ชันปัจจุบัน
- **App Version:** อัปเกรดเวอร์ชันแอปเป็น `1.2.0` (versionCode `3`) ในระบบ CI/CD GitHub Actions

---

## [1.1.0] - 2026-09-05

### Added
- **Android Native Foreground Service:** เพิ่ม `MediaPlaybackService` เพื่อล็อก CPU WakeLock และป้องกันระบบ Android สั่ง Freeze แอป
- **Active EQ State Persistence:** จดจำการตั้งค่าใน LocalStorage
- **Play Mode Memory:** จดจำโหมดการเล่นเพลง

### Changed
- **Default Play Mode to Shuffle:** ตั้งค่าเริ่มต้นการเล่นเพลงเป็นแบบสุ่ม

### Fixed
- **Storage Architecture & High I/O Latency:** แยกตารางเก็บข้อมูล IndexedDB เป็น Metadata และ Blob Data เพื่อแก้ปัญหาหน่วง

---

## [1.0.0] - 2026-09-04

### Added
- เปิดตัวแอปพลิเคชันเวอร์ชันแรก ระบบจัดการเพลงแบบ Local 100% ผ่าน IndexedDB และหน้าต่างเล่นเพลง