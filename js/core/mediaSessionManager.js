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
    
    if (this.isSupported) {
      this._bindAudioEvents();
    }
  }
  
  init({ onNext, onPrev }) {
    this.onNextTrack = onNext;
    this.onPrevTrack = onPrev;
    
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
    
    this.audioEl.addEventListener('timeupdate', () => {
      if (this.audioEl.duration && !isNaN(this.audioEl.duration)) {
        this.updatePositionState();
      }
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
  
  updateMetadata(track) {
    if (!this.isSupported || !track) return;
    this.currentTrack = track;
    
    const cleanTitle = track.name ? track.name.replace(/\.[^/.]+$/, '') : 'GT Track';
    
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
    } catch (e) {
      // ป้องกันข้อผิดพลาดระหว่าง reset audio buffer
    }
  }
}

export const mediaSessionManager = new MediaSessionManager();