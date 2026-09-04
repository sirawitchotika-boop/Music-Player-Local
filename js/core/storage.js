// js/core/storage.js

const DB_NAME = 'LocalMusicDB';
const DB_VERSION = 3;
const STORE_NAME = 'audioTracks';
const EQ_STORE = 'eqPresets';
const TIMER_STORE = 'timerPresets';

class StorageManager {
  constructor() {
    this.db = null;
  }
  
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.errorCode);
        reject(new Error("ระบบไม่สามารถเปิดฐานข้อมูลได้ค่ะ"));
      };
      
      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(EQ_STORE)) {
          db.createObjectStore(EQ_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(TIMER_STORE)) {
          db.createObjectStore(TIMER_STORE, { keyPath: 'id' });
        }
      };
    });
  }
  
  validateAudioFiles(fileList) {
    const validFiles = [];
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/x-m4a'];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.type && (file.type.startsWith('audio/') || allowedTypes.includes(file.type))) {
        validFiles.push(file);
      } else {
        console.warn(`บล็อกไฟล์: ${file.name} (ไม่ใช่ไฟล์เสียงที่รองรับ)`);
      }
    }
    return validFiles;
  }
  
  async saveFiles(fileList) {
    if (!this.db) await this.initDB();
    const validFiles = this.validateAudioFiles(fileList);
    if (validFiles.length === 0) throw new Error("ไม่มีไฟล์เสียงที่ถูกต้องให้บันทึกเลยค่ะ");
    
    // ตรวจสอบเพลงเดิม ป้องกันเพลงซ้ำ
    const existingTracks = await this.getAllTracks();
    const existingMap = new Set(existingTracks.map(t => `${t.name}_${t.size}`));
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      let addedCount = 0;
      let skippedCount = 0;
      
      transaction.oncomplete = () => resolve({ success: true, count: addedCount, skipped: skippedCount });
      transaction.onerror = (event) => {
        const error = event.target.error;
        if (error.name === 'QuotaExceededError') {
          reject(new Error("พื้นที่ความจำของเครื่องเต็มแล้วค่ะ ไม่สามารถบันทึกเพลงเพิ่มได้"));
        } else {
          reject(new Error("เกิดข้อผิดพลาดระหว่างบันทึกไฟล์ลงระบบ"));
        }
      };
      
      validFiles.forEach(file => {
        const key = `${file.name}_${file.size}`;
        if (existingMap.has(key)) {
          skippedCount++;
          return;
        }
        
        const trackData = {
          name: file.name,
          type: file.type,
          size: file.size,
          blob: file,
          addedAt: new Date().getTime()
        };
        const request = store.add(trackData);
        request.onsuccess = () => {
          addedCount++;
          existingMap.add(key);
        };
      });
    });
  }
  
  async getAllTracks() {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error("ไม่สามารถดึงข้อมูลคิวเพลงจากระบบได้ค่ะ"));
    });
  }
  
  async deleteTrack(id) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(new Error("ลบไฟล์เพลงไม่สำเร็จค่ะ"));
    });
  }
  
  // --- EQ Preset Management ---
  async getEqPresets() {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([EQ_STORE], 'readonly');
      const req = tx.objectStore(EQ_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(new Error("ดึงข้อมูล Preset ไม่สำเร็จค่ะ"));
    });
  }
  
  async saveEqPreset(presetData) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([EQ_STORE], 'readwrite');
      const req = tx.objectStore(EQ_STORE).put(presetData);
      req.onsuccess = () => resolve(presetData);
      req.onerror = () => reject(new Error("บันทึก Preset ไม่สำเร็จค่ะ"));
    });
  }
  
  async deleteEqPreset(id) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([EQ_STORE], 'readwrite');
      const req = tx.objectStore(EQ_STORE).delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(new Error("ลบ Preset ไม่สำเร็จค่ะ"));
    });
  }
  
  // --- Timer Preset Management ---
  async getTimerPresets() {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([TIMER_STORE], 'readonly');
      const req = tx.objectStore(TIMER_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(new Error("ดึงข้อมูล Timer Preset ไม่สำเร็จค่ะ"));
    });
  }
  
  async saveTimerPreset(presetData) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([TIMER_STORE], 'readwrite');
      const req = tx.objectStore(TIMER_STORE).put(presetData);
      req.onsuccess = () => resolve(presetData);
      req.onerror = () => reject(new Error("บันทึก Timer Preset ไม่สำเร็จค่ะ"));
    });
  }
  
  async deleteTimerPreset(id) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([TIMER_STORE], 'readwrite');
      const req = tx.objectStore(TIMER_STORE).delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(new Error("ลบ Timer Preset ไม่สำเร็จค่ะ"));
    });
  }
  
  async clearTimerPresets() {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([TIMER_STORE], 'readwrite');
      const req = tx.objectStore(TIMER_STORE).clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(new Error("ล้างข้อมูล Timer Preset ไม่สำเร็จค่ะ"));
    });
  }
}

export const storage = new StorageManager();
