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
    this.lastBridgeUpdateTime = 0;
    
    if (this.isSupported) {
      this._bindAudioEvents();
    }
  }
  
  init({ onNext, onPrev }) {
    this.onNextTrack = onNext;
    this.onPrevTrack = onPrev;
    
    // รับคำสั่ง Action สั่งงานจากภายนอก (Lock Screen, Notification Shade และการลาก Seekbar)
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
        this.syncWithAndroidBridge(true);
      }
    };
    
    if (!this.isSupported) return;
    this._setupActionHandlers();
  }
  
  _bindAudioEvents() {
    this.audioEl.addEventListener('play', () => {
      this.setPlaybackState('playing');
      this.updatePositionState();
      this.syncWithAndroidBridge(true);
    });
    
    this.audioEl.addEventListener('pause', () => {
      this.setPlaybackState('paused');
      this.updatePositionState();
      this.syncWithAndroidBridge(true);
    });
    
    this.audioEl.addEventListener('timeupdate', () => {
      const now = Date.now();
      // ลดภาระ IPC: ซิงค์ตำแหน่งเวลากับ Native Android ทุกๆ 4 วินาทีระหว่างเล่นต่อเนื่อง
      if (now - this.lastBridgeUpdateTime > 4000) {
        this.syncWithAndroidBridge(false);
        this.lastBridgeUpdateTime = now;
      }
    });
    
    this.audioEl.addEventListener('seeked', () => {
      this.updatePositionState();
      this.syncWithAndroidBridge(true);
    });
    
    this.audioEl.addEventListener('durationchange', () => {
      this.updatePositionState();
      this.syncWithAndroidBridge(true);
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
        this.syncWithAndroidBridge(true);
      }
    });
    
    registerHandler('seekforward', (details) => {
      const offset = details.seekOffset || 10;
      this.audio.seek(this.audio.currentTime + offset);
      this.updatePositionState();
      this.syncWithAndroidBridge(true);
    });
    
    registerHandler('seekbackward', (details) => {
      const offset = details.seekOffset || 10;
      this.audio.seek(Math.max(0, this.audio.currentTime - offset));
      this.updatePositionState();
      this.syncWithAndroidBridge(true);
    });
    
    registerHandler('stop', () => {
      this.audio.pause();
      this.setPlaybackState('none');
    });
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
      this.lastBridgeUpdateTime = Date.now();
    } catch (e) {
      console.warn('[MediaSession] AndroidBridge sync error:', e);
    }
  }
  
  updateMetadata(track) {
    if (!track) return;
    this.currentTrack = track;
    
    const cleanTitle = track.name ? track.name.replace(/\.[^/.]+$/, '') : 'GT Track';
    
    // ซิงค์ตรงเข้าสู่ Native Android System UI พร้อมตำแหน่งเวลาจริง
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
    const isPlaying = state === 'playing';
    this.syncWithAndroidBridge(true);
    
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
    } catch (e) {
      // ป้องกันข้อผิดพลาดระหว่าง reset audio buffer
    }
  }
}

export const mediaSessionManager = new MediaSessionManager();