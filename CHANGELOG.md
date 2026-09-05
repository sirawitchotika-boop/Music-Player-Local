# Changelog

All notable changes to the **GT SoundMaster** project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-09-05

### Added
- **Android Native Foreground Service:** เพิ่มบริการเล่นเพลงเบื้องหลัง `MediaPlaybackService` ที่สืบทอดจาก `android.app.Service` กำหนด `foregroundServiceType="mediaPlayback"` พร้อมถือ CPU `WakeLock` ป้องกันระบบ Android OS และ Battery Optimization สั่ง Freeze หรือ Kill Process ขณะปิดหน้าจอหรือสลับแอป
- **Active EQ State Persistence:** ระบบบันทึกและกู้คืนสถานะ Active EQ ข้าม Session อัตโนมัติผ่าน `localStorage` ครอบคลุมแถบความถี่ 10-Band, ค่า Pre-Amp Gain, โหมด Pure Direct (Bypass) และชื่อ Preset ล่าสุด
- **Play Mode Memory:** บันทึกและจดจำโหมดการเล่นเพลงล่าสุดของผู้ใช้ข้าม Session ไม่ให้รีเซ็ตกลับเป็นค่าเริ่มต้น

### Changed
- **Default Play Mode to Shuffle:** ปรับค่าเริ่มต้นของโหมดเล่นเพลงใน `StateManager` จากเดิมแบบเรียงตามลำดับ (By Order) ให้เป็นแบบสุ่มเพลง (Shuffle Mode) เป็นค่ามาตรฐานทันทีที่เริ่มใช้งาน

### Fixed
- **Storage Architecture & High I/O Latency:** แก้ไขปัญหาคอขวดการนำเข้าเพลง (ลดเวลานำเข้า 60 เพลงจากเดิม 15 วินาที เหลือประมาณ 7 วินาที) โดยอัปเกรดฐานข้อมูล IndexedDB เป็น Version 4 แยก ObjectStore ระหว่าง Metadata (`audioTracks`) และ Binary Data (`audioBlobs`) ขจัดปัญหาการโหลดไฟล์เสียงทั้งหมดขึ้น RAM จนเครื่องหน่วง และเปลี่ยนไปใช้ระบบสตรีม Blob เฉพาะแทร็กที่กำลังเล่นจริง

---

## [1.0.0] - 2026-09-04

### Added
- **Core DSP & Equalizer:** วงจรกรองความถี่ 10-Band BiquadFilter (32Hz - 16kHz) พร้อมระบบปรับแต่ง Pre-Amp Headroom และ Safety Limiter ป้องกัน Clipping
- **Pure Direct Mode:** ระบบบายพาสสัญญาณเสียง (Bypass DSP) เพื่อการส่งผ่านสัญญาณแบบ Bit-Perfect
- **Visualizer Engine:** ระบบประมวลผลสัญญาณเสียง Real-time วิเคราะห์ย่านความถี่ต่ำเพื่อสั่งการ Pulse Ring และแถบความถี่นีออนผ่าน HTML5 Canvas
- **Sleep Timer Daemon:** ตัวจับเวลาระงับการทำงานอัตโนมัติ พร้อมระบบ Preset, โหมดแก้ไขรายการ, Haptic Feedback และการแจ้งเตือนแบบ Breathe Animation
- **Persistent Storage:** สถาปัตยกรรมจัดเก็บไฟล์เสียงแบบ Local 100% ด้วย IndexedDB และระบบแคชการตั้งค่าผ่าน LocalStorage
- **Playlist Management:** ระบบจัดการเพลย์ลิสต์แบบไดนามิก รองรับระบบ Favorites ป้องกันการลบข้อมูล (Protected Pool) และตัวกรองค้นหาแทร็ก
- **Android Media Bridge:** ผสานการควบคุมระดับ Native OS ผ่าน MediaSession API และ Foreground Notification Service ควบคุมการเล่น กรอแทร็ก (Seekbar) จากหน้าจอล็อค

### Changed
- ปรับสถาปัตยกรรม UI Dropdown ในโมดูล EQ จาก Native `<select>` เป็น Custom Cyberpunk Dropdown เพื่อขจัดปัญหา White Dialog กวนใจบน Android WebView
- ปรับสำนวนและข้อความตอบสนองของระบบทั้งหมดเป็น Terminal System Log Format (Robot Tone)
- ปรับแต่งการแสดงผล Safe Area ให้สอดคล้องกับ Notch และรูกล้อง (Cutout) ของอุปกรณ์แบบ Edge-to-Edge

### Fixed
- แก้ไขปัญหาคีย์ข้อมูลและไฟล์ซ้ำซ้อนในคลังข้อมูลเสียง (Duplicate Key Collision)
- แก้ไขสถานะการเล่นและการกดย้ายแทร็กไม่ซิงก์ระหว่าง Notification Controller กับ Audio State ภายในแอปพลิเคชัน
- แก้ไขปัญหา AudioContext ถูกระงับการทำงาน (Suspended) ขณะสลับหน้าจอหรือพักหน้าจอใน Android WebView