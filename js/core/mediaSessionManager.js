// js/core/mediaSessionManager.js
import { audioEngine } from './audioEngine.js';

export class MediaSessionManager {
  constructor() {
    this.audio = audioEngine;
    this.audioEl = audioEngine.audioElement;
    this.isSupported = 'mediaSession' in navigator;
    this.onNextTrack = null;
    this.onPrevTrack = null;
    this.currentTrack = null;
    
    this._syncTimer = null;
    this._bindNativeSync();
    
    if (this.isSupported) {
      this._bindAudioEvents();
    }
  }
  
  init({ onNext, onPrev }) {
    this.onNextTrack = onNext;
    this.onPrevTrack = onPrev;
    
    window.mediaControlAction = (action, value) => {
      if (action === 'playpause') {
        this.audioEl.paused ? this.audio.play() : this.audio.pause();
      } else if (action === 'play') {
        this.audio.play();
      } else if (action === 'pause') {
        this.audio.pause();
      } else if (action === 'next') {
        if (typeof this.onNextTrack === 'function') this.onNextTrack();
      } else if (action === 'prev') {
        if (typeof this.onPrevTrack === 'function') this.onPrevTrack();
      } else if (action === 'seekto' && typeof value === 'number') {
        this.audio.seek(value);
        this.updatePositionState();
      }
    };
    
    if (!this.isSupported) return;
    this._setupActionHandlers();
  }
  
  _bindAudioEvents() {
    this.audioEl.addEventListener('play', () => {
      this.setPlaybackState('playing');
      this.updatePositionState();
    });
    
    this.audioEl.addEventListener('pause', () => {
      this.setPlaybackState('paused');
      this.updatePositionState();
    });
    
    this.audioEl.addEventListener('seeked', () => {
      this.updatePositionState();
    });
    
    this.audioEl.addEventListener('durationchange', () => {
      this.updatePositionState();
    });
  }
  
  _setupActionHandlers() {
    const ms = navigator.mediaSession;
    
    const registerHandler = (action, handler) => {
      try {
        ms.setActionHandler(action, handler);
      } catch (e) {
        console.warn(`[MediaSession] Action '${action}' is not supported on this platform.`);
      }
    };
    
    registerHandler('play', async () => {
      await this.audio.play();
      this.setPlaybackState('playing');
    });
    
    registerHandler('pause', () => {
      this.audio.pause();
      this.setPlaybackState('paused');
    });
    
    registerHandler('previoustrack', () => {
      if (typeof this.onPrevTrack === 'function') {
        this.onPrevTrack();
      }
    });
    
    registerHandler('nexttrack', () => {
      if (typeof this.onNextTrack === 'function') {
        this.onNextTrack();
      }
    });
    
    registerHandler('seekto', (details) => {
      if (details.seekTime !== undefined && details.seekTime !== null) {
        this.audio.seek(details.seekTime);
        this.updatePositionState();
      }
    });
    
    registerHandler('seekforward', (details) => {
      const offset = details.seekOffset || 10;
      this.audio.seek(this.audio.currentTime + offset);
      this.updatePositionState();
    });
    
    registerHandler('seekbackward', (details) => {
      const offset = details.seekOffset || 10;
      this.audio.seek(Math.max(0, this.audio.currentTime - offset));
      this.updatePositionState();
    });
    
    registerHandler('stop', () => {
      this.audio.pause();
      this.setPlaybackState('none');
    });
  }
  
  // Android เดินเวลาในการ์ดต่อเองจาก "ภาพนิ่งล่าสุด" ที่เราส่งไป
  // จึงต้องส่งภาพนิ่งใหม่ทุกครั้งที่ เล่น/หยุด/เลื่อนเวลา/จบเพลง ไม่งั้นการ์ดจะเดินเองไม่ตรงกับเพลงจริง
  _bindNativeSync() {
    const nowSync = () => this._queueSync(0);
    const laterSync = () => this._queueSync(150);
    this.audioEl.addEventListener('play', nowSync);
    this.audioEl.addEventListener('pause', nowSync);
    this.audioEl.addEventListener('ended', nowSync);
    this.audioEl.addEventListener('seeked', laterSync);
    this.audioEl.addEventListener('durationchange', laterSync);
  }
  
  // รวมเหตุการณ์ที่มาติด ๆ กัน (เช่นลาก Seeker) ให้ส่งไป Android แค่ครั้งเดียว อ่านค่าสดตอนส่ง
  _queueSync(delayMs) {
    if (this._syncTimer) clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => {
      this._syncTimer = null;
      this.syncWithAndroidBridge();
    }, delayMs);
  }
  
  syncWithAndroidBridge(force = false) {
    if (!window.AndroidBridge || typeof window.AndroidBridge.updatePlayback !== 'function') return;
    
    const cleanTitle = this.currentTrack ? (this.currentTrack.name || '').replace(/\.[^/.]+$/, '') : 'GT Track';
    const isPlaying = !this.audioEl.paused;
    const posSec = isFinite(this.audioEl.currentTime) && !isNaN(this.audioEl.currentTime) && this.audioEl.currentTime >= 0 ?
      this.audioEl.currentTime :
      0;
    const durSec = isFinite(this.audioEl.duration) && !isNaN(this.audioEl.duration) && this.audioEl.duration > 0 ?
      this.audioEl.duration :
      0;
    
    try {
      window.AndroidBridge.updatePlayback(cleanTitle, 'GT SoundMaster', isPlaying, posSec, durSec);
    } catch (e) {
      console.warn('[MediaSession] AndroidBridge sync error:', e);
    }
  }
  
  updateMetadata(track) {
    if (!track) return;
    this.currentTrack = track;
    
    const cleanTitle = track.name ? track.name.replace(/\.[^/.]+$/, '') : 'GT Track';
    
    // ส่งสัญญาณไปฝั่ง Android Native รอบเดียวตอนเปลี่ยนเพลงอย่างมั่นคง
    this.syncWithAndroidBridge(true);
    
    if (this.isSupported) {
      const pngArtworkUrl = new URL('icon.png', window.location.href).href;
      const svgArtworkUrl = new URL('icon.svg', window.location.href).href;
      
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: cleanTitle,
          artist: 'GT SoundMaster',
          album: 'Local Audiophile Library',
          artwork: [
            { src: pngArtworkUrl, sizes: '512x512', type: 'image/png' },
            { src: svgArtworkUrl, sizes: '512x512', type: 'image/svg+xml' }
          ]
        });
      } catch (e) {
        console.warn('[MediaSession] Metadata update error:', e);
      }
      
      this.setPlaybackState('playing');
      this.updatePositionState();
    }
  }
  
  setPlaybackState(state) {
    if (!this.isSupported) return;
    try {
      navigator.mediaSession.playbackState = state;
    } catch (e) {
      console.warn('[MediaSession] playbackState update error:', e);
    }
  }
  
  updatePositionState() {
    if (!this.isSupported || !('setPositionState' in navigator.mediaSession)) return;
    
    const duration = this.audio.duration;
    if (!duration || isNaN(duration) || duration <= 0) return;
    
    try {
      navigator.mediaSession.setPositionState({
        duration: duration,
        playbackRate: this.audioEl.playbackRate || 1.0,
        position: Math.min(this.audio.currentTime, duration)
      });
    } catch (e) {}
  }
}

export const mediaSessionManager = new MediaSessionManager();