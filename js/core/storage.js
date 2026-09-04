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
      request.onerror = (e) => reject(new Error("ระบบไม่สามารถเปิดฐานข้อมูลได้ค่ะ"));
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
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
      }
    }
    return validFiles;
  }
  
  async saveFiles(fileList) {
    if (!this.db) await this.initDB();
    const validFiles = this.validateAudioFiles(fileList);
    if (validFiles.length === 0) throw new Error("ไม่มีไฟล์เสียงที่ถูกต้องให้บันทึกเลยค่ะ");
    
    const existingTracks = await this.getAllTracks();
    const existingMap = new Map();
    existingTracks.forEach(t => existingMap.set(`${t.name}_${t.size}`, t));
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let addedCount = 0;
      let skippedCount = 0;
      const processedTracks = [];
      
      tx.oncomplete = () => {
        resolve({
          success: true,
          count: addedCount,
          skipped: skippedCount,
          processedTracks
        });
      };
      
      tx.onerror = (e) => {
        if (e.target.error && e.target.error.name === 'QuotaExceededError') {
          reject(new Error("พื้นที่ความจำของเครื่องเต็มแล้วค่ะ"));
        } else {
          reject(new Error("เกิดข้อผิดพลาดระหว่างบันทึกไฟล์ลงระบบ"));
        }
      };
      
      validFiles.forEach(file => {
        if (!file.size || file.size <= 0) {
          skippedCount++;
          return;
        }
        
        const key = `${file.name}_${file.size}`;
        if (existingMap.has(key)) {
          skippedCount++;
          processedTracks.push({
            track: existingMap.get(key),
            isNew: false
          });
          return;
        }
        
        const trackData = {
          name: file.name,
          type: file.type,
          size: file.size,
          blob: file,
          addedAt: Date.now()
        };
        const req = store.add(trackData);
        req.onsuccess = (e) => {
          addedCount++;
          const savedTrack = { ...trackData, id: e.target.result };
          existingMap.set(key, savedTrack);
          processedTracks.push({
            track: savedTrack,
            isNew: true
          });
        };
      });
    });
  }
  
  async getAllTracks() {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(new Error("ไม่สามารถดึงข้อมูลคิวเพลงได้ค่ะ"));
    });
  }
  
  async deleteTrack(id) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(new Error("ลบไฟล์เพลงไม่สำเร็จค่ะ"));
    });
  }
  
  async _getAllFromStore(storeName) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(new Error(`ดึงข้อมูล ${storeName} ไม่สำเร็จค่ะ`));
    });
  }
  
  async _putToStore(storeName, data) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readwrite');
      const req = tx.objectStore(storeName).put(data);
      req.onsuccess = () => resolve(data);
      req.onerror = () => reject(new Error(`บันทึก ${storeName} ไม่สำเร็จค่ะ`));
    });
  }
  
  async _deleteFromStore(storeName, id) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readwrite');
      const req = tx.objectStore(storeName).delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(new Error(`ลบจาก ${storeName} ไม่สำเร็จค่ะ`));
    });
  }
  
  async getEqPresets() { return this._getAllFromStore(EQ_STORE); }
  async saveEqPreset(presetData) { return this._putToStore(EQ_STORE, presetData); }
  async deleteEqPreset(id) { return this._deleteFromStore(EQ_STORE, id); }
  
  async getTimerPresets() { return this._getAllFromStore(TIMER_STORE); }
  async saveTimerPreset(presetData) { return this._putToStore(TIMER_STORE, presetData); }
  async deleteTimerPreset(id) { return this._deleteFromStore(TIMER_STORE, id); }
  
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