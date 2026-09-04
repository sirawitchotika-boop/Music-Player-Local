# Changelog

All notable changes to the **GT SoundMaster** project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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