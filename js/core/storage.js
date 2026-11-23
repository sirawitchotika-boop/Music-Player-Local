const DB_NAME = 'LocalMusicDB';
const DB_VERSION = 4;
const STORE_NAME = 'audioTracks';
const BLOB_STORE = 'audioBlobs';
const EQ_STORE = 'eqPresets';
const TIMER_STORE = 'timerPresets';

class StorageManager {
  constructor() {
    this.db = null;
  }
  
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(new Error('Could not open local music database.'));
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(BLOB_STORE)) {
          db.createObjectStore(BLOB_STORE, { keyPath: 'id' });
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
      } else if (!file.type && /\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(file.name)) {
        validFiles.push(file);
      }
    }
    return validFiles;
  }
  
  async saveFiles(fileList) {
    if (!this.db) await this.initDB();
    const validFiles = this.validateAudioFiles(fileList);
    if (validFiles.length === 0) throw new Error('No supported audio files were selected.');
    
    // Check duplicates using lightweight metadata without loading blobs into RAM.
    const existingTracks = await this.getAllTracks();
    const existingMap = new Map();
    existingTracks.forEach(t => existingMap.set(`${t.name}_${t.size}`, t));
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME, BLOB_STORE], 'readwrite');
      const trackStore = tx.objectStore(STORE_NAME);
      const blobStore = tx.objectStore(BLOB_STORE);
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
          reject(new Error('Not enough storage space on this device.'));
        } else {
          reject(new Error('Could not save audio files.'));
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
        
        const metadata = {
          name: file.name,
          type: file.type || 'audio/mpeg',
          size: file.size,
          addedAt: Date.now()
        };
        
        const req = trackStore.add(metadata);
        req.onsuccess = (e) => {
          addedCount++;
          const id = e.target.result;
          const savedTrack = { ...metadata, id };
          blobStore.put({ id, blob: file });
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
      req.onsuccess = () => {
        // Return metadata only so large audio blobs stay out of RAM until played.
        const tracks = (req.result || []).map(t => ({
          id: t.id,
          name: t.name,
          type: t.type,
          size: t.size,
          addedAt: t.addedAt,
          loudness: t.loudness || null,
          blob: t.blob || null
        }));
        resolve(tracks);
      };
      req.onerror = () => reject(new Error('Could not load song list.'));
    });
  }

  async updateTrackLoudness(id, loudness) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      let updated = false;
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) return;
        updated = true;
        store.put({ ...record, loudness: loudness || null });
      };
      tx.oncomplete = () => resolve(updated);
      tx.onerror = () => reject(new Error('Could not save track loudness metadata.'));
    });
  }
  
  async getTrackBlob(id) {
    if (!this.db) await this.initDB();
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([BLOB_STORE, STORE_NAME], 'readonly');
        const blobReq = tx.objectStore(BLOB_STORE).get(id);
        blobReq.onsuccess = () => {
          if (blobReq.result && blobReq.result.blob) {
            resolve(blobReq.result.blob);
          } else {
            // Fallback for tracks saved in v3 before blobs were moved to audioBlobs.
            const trackReq = tx.objectStore(STORE_NAME).get(id);
            trackReq.onsuccess = () => {
              resolve(trackReq.result && trackReq.result.blob ? trackReq.result.blob : null);
            };
            trackReq.onerror = () => resolve(null);
          }
        };
        blobReq.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }
  
  async deleteTrack(id) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME, BLOB_STORE], 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.objectStore(BLOB_STORE).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(new Error('Could not delete song from storage.'));
    });
  }
  
  async _getAllFromStore(storeName) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(new Error(`Could not read from ${storeName}.`));
    });
  }
  
  async _putToStore(storeName, data) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readwrite');
      const req = tx.objectStore(storeName).put(data);
      req.onsuccess = () => resolve(data);
      req.onerror = () => reject(new Error(`Could not save to ${storeName}.`));
    });
  }
  
  async _deleteFromStore(storeName, id) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readwrite');
      const req = tx.objectStore(storeName).delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(new Error(`Could not delete from ${storeName}.`));
    });
  }
  
  async getTimerPresets() { return this._getAllFromStore(TIMER_STORE); }
  async saveTimerPreset(presetData) { return this._putToStore(TIMER_STORE, presetData); }
  async deleteTimerPreset(id) { return this._deleteFromStore(TIMER_STORE, id); }
  async clearTimerPresets() {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([TIMER_STORE], 'readwrite');
      const req = tx.objectStore(TIMER_STORE).clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(new Error('Could not clear timer presets.'));
    });
  }
}

export const storage = new StorageManager();