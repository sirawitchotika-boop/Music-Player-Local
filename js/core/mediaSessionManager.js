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
    this._lastBridgeSyncAt = 0;
    this._buffering = false;
    this._bindNativeSync();
    
    if (this.isSupported) {
      this._bindAudioEvents();
    }
  }
  
  init({ onNext, onPrev }) {
    this.onNextTrack = onNext;
    this.onPrevTrack = onPrev;
    
    // Native play requests must never claim success before the audio element plays.
    const requestPlay = () => {
      try {
        Promise.resolve(this.audio.play()).catch(error => {
          console.warn('[MediaSession] Play command failed:', error);
          this._queueSync(0);
        });
      } catch (error) {
        console.warn('[MediaSession] Play command failed:', error);
        this._queueSync(0);
      }
    };
    window.mediaControlAction = (action, value) => {
      if (action === 'playpause') {
        if (this.audioEl.paused) requestPlay();
        else this.audio.pause(true);
      } else if (action === 'play') {
        requestPlay();
      } else if (action === 'pause') {
        // Route loss and lock-screen pause must stop audio immediately.
        this.audio.pause(true);
      } else if (action === 'next') {
        if (typeof this.onNextTrack === 'function') this.onNextTrack();
      } else if (action === 'prev') {
        if (typeof this.onPrevTrack === 'function') this.onPrevTrack();
      } else if (action === 'seekto' && typeof value === 'number') {
        this.audio.seek(value);
        this.updatePositionState();
      }
    };
    
    // The native service may have received a route-loss event before JS was ready.
    window.gtHandleNativeRoutePause = () => this._handleNativeRoutePause();
    this._handleNativeRoutePause();

    if (!this.isSupported) return;
    this._setupActionHandlers();
  }
  
  async _handleNativeRoutePause() {
    const bridge = window.AndroidBridge;
    let sequence = 0;
    try {
      if (bridge && typeof bridge.getPendingRoutePauseSequence === 'function') {
        sequence = bridge.getPendingRoutePauseSequence();
        if (!Number.isInteger(sequence) || sequence <= 0) {
          window.__gtPendingNativeRoutePause = false;
          return;
        }
      } else if (window.__gtPendingNativeRoutePause !== true) {
        return;
      }
    } catch (error) {
      console.warn('[MediaSession] Unable to read pending route pause:', error);
      return;
    }

    window.__gtPendingNativeRoutePause = false;
    try {
      // Immediately invalidate any in-flight Play and pause the real audio element.
      await this.audio.pause(true);
      if (this.audioEl.paused && sequence > 0) {
        bridge?.acknowledgeRoutePause?.(sequence);
      }
    } catch (error) {
      // No acknowledgement: Android must continue to reject stale "playing" snapshots.
      console.warn('[MediaSession] Unable to apply native route pause:', error);
    }
    this._queueSync(0);
  }

  _bindAudioEvents() {
    for (const event of ['play', 'pause', 'seeked', 'durationchange']) {
      this.audioEl.addEventListener(event, () => this.updatePositionState());
    }
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
      try {
        await this.audio.play();
      } catch (error) {
        console.warn('[MediaSession] Play action failed:', error);
        this._queueSync(0);
      }
    });
    
    registerHandler('pause', () => {
      this.audio.pause(true);
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
      this.audio.pause(true);
      this.setPlaybackState('none');
    });
  }
  
  // Android เดินเวลาในการ์ดต่อเองจาก "ภาพนิ่งล่าสุด" ที่เราส่งไป
  // จึงต้องส่งภาพนิ่งใหม่ทุกครั้งที่ เล่น/หยุด/เลื่อนเวลา/จบเพลง ไม่งั้นการ์ดจะเดินเองไม่ตรงกับเพลงจริง
  // Only the HTML audio element may declare whether playback is advancing.
  _isAdvancing() {
    return !this.audioEl.paused && !this.audioEl.ended &&
      !this.audioEl.seeking && !this._buffering;
  }

  _refreshPlaybackState() {
    this.setPlaybackState(this._isAdvancing() ? 'playing' : 'paused');
  }

  _bindNativeSync() {
    const nowSync = () => {
      this._refreshPlaybackState();
      this._queueSync(0);
    };
    const laterSync = () => this._queueSync(150);

    this.audioEl.addEventListener('play', nowSync);
    this.audioEl.addEventListener('pause', () => {
      this._buffering = false;
      nowSync();
    });
    this.audioEl.addEventListener('ended', nowSync);
    this.audioEl.addEventListener('waiting', () => {
      this._buffering = true;
      nowSync();
    });
    this.audioEl.addEventListener('stalled', () => {
      this._buffering = true;
      nowSync();
    });
    this.audioEl.addEventListener('playing', () => {
      this._buffering = false;
      nowSync();
    });
    this.audioEl.addEventListener('seeking', nowSync);
    this.audioEl.addEventListener('seeked', () => {
      this._refreshPlaybackState();
      laterSync();
    });
    this.audioEl.addEventListener('durationchange', laterSync);

    // Correct native clock drift during actual playback, but avoid constant IPC.
    this.audioEl.addEventListener('timeupdate', () => {
      if (this._isAdvancing() && Date.now() - this._lastBridgeSyncAt >= 2000) {
        this._queueSync(0);
      }
    });
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
    const isPlaying = this._isAdvancing();
    const posSec = isFinite(this.audioEl.currentTime) && !isNaN(this.audioEl.currentTime) && this.audioEl.currentTime >= 0 ?
      this.audioEl.currentTime :
      0;
    const durSec = isFinite(this.audioEl.duration) && !isNaN(this.audioEl.duration) && this.audioEl.duration > 0 ?
      this.audioEl.duration :
      0;
    
    try {
      window.AndroidBridge.updatePlayback(cleanTitle, 'GT SoundMaster', isPlaying, posSec, durSec);
      this._lastBridgeSyncAt = Date.now();
    } catch (e) {
      console.warn('[MediaSession] AndroidBridge sync error:', e);
    }
  }
  
  updateMetadata(track, { syncAndroid = true } = {}) {
    if (!track) return;
    this.currentTrack = track;
    
    const cleanTitle = track.name ? track.name.replace(/\.[^/.]+$/, '') : 'GT Track';
    
    // Silent session restoration sets metadata but doesn't start Android playback.
    if (syncAndroid) this.syncWithAndroidBridge(true);
    
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
      
      this._refreshPlaybackState();
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
    if (!Number.isFinite(duration) || duration <= 0) return;
    
    try {
      navigator.mediaSession.setPositionState({
        duration: duration,
        playbackRate: this.audioEl.playbackRate || 1.0,
        position: Number.isFinite(this.audio.currentTime) && this.audio.currentTime >= 0 ?
          Math.min(this.audio.currentTime, duration) : 0
      });
    } catch (e) {}
  }
}

export const mediaSessionManager = new MediaSessionManager();