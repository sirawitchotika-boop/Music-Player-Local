import { modalUI } from './modalUI.js';
import { mediaSessionManager } from '../core/mediaSessionManager.js';
import { storage } from '../core/storage.js';

export class PlayerUI {
  constructor(stateManager, audioEngine) {
    this.state = stateManager;
    this.audio = audioEngine;
    this.audioEl = audioEngine.audioElement;
    
    this.titleDisplay = document.getElementById('now-playing-title');
    this.artistDisplay = document.getElementById('now-playing-artist');
    this.playBtn = document.getElementById('play-btn');
    this.seekBar = document.getElementById('seek-bar');
    this.timeCurrent = document.getElementById('time-current');
    this.timeTotal = document.getElementById('time-total');
    
    this.playlistToggleBtn = document.getElementById('playlist-toggle-btn');
    this.closePlaylistBtn = document.getElementById('close-playlist-btn');
    this.playlistSection = document.getElementById('playlist-section');
    
    this.playModeBtn = document.getElementById('play-mode-btn');
    this.nextBtn = document.getElementById('next-btn');
    this.prevBtn = document.getElementById('prev-btn');
    
    this.favoriteBtn = document.getElementById('favorite-btn');
    this.likedTracks = JSON.parse(localStorage.getItem('gt_liked_tracks')) || [];
    this.likeDebounceTimer = null;
    
    this.playIcon = '<svg id="icon-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    this.pauseIcon = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    
    this.modeIcons = {
      0: '<svg viewBox="0 0 24 24"><path d="M17 17H7v-3l-4 4 4 4v-3h12v-6h-2v4zM7 7h10V4l4 4-4 4V9H5v6h2V7z"/></svg>',
      1: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>',
      2: '<svg viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>'
    };
    
    this.isDragging = false;
    this.init();
  }
  
  init() {
    this.bindEvents();
    this.updateModeIcon(this.state.playMode);
  }
  
  bindEvents() {
    if (this.playBtn) this.playBtn.addEventListener('click', () => this.togglePlay());
    if (this.playModeBtn) this.playModeBtn.addEventListener('click', () => this.cycleMode());
    
    if (this.nextBtn) this.bindHoldToSeek(this.nextBtn, 'next');
    if (this.prevBtn) this.bindHoldToSeek(this.prevBtn, 'prev');
    
    if (this.favoriteBtn) {
      this.favoriteBtn.addEventListener('click', () => this.handleLikeClick());
    }
    
    window.addEventListener('gt-liked-updated', () => {
      this.likedTracks = JSON.parse(localStorage.getItem('gt_liked_tracks')) || [];
      this.refreshLikeButtonState();
    });
    
    if (this.seekBar) {
      this.seekBar.addEventListener('mousedown', () => this.isDragging = true);
      this.seekBar.addEventListener('touchstart', () => this.isDragging = true, { passive: true });
      this.seekBar.addEventListener('change', (e) => {
        if (!this.audioEl.duration) return;
        const seekTime = (e.target.value / 100) * this.audioEl.duration;
        this.audio.seek(seekTime);
        mediaSessionManager.updatePositionState();
        this.isDragging = false;
      });
      this.seekBar.addEventListener('touchend', () => this.isDragging = false);
    }
    
    if (this.playlistToggleBtn && this.playlistSection) {
      this.playlistToggleBtn.addEventListener('click', () => this.playlistSection.classList.remove('hidden'));
    }
    if (this.closePlaylistBtn && this.playlistSection) {
      this.closePlaylistBtn.addEventListener('click', () => this.playlistSection.classList.add('hidden'));
    }
    
    this.audioEl.addEventListener('timeupdate', () => this.updateSeekBar());
    this.audioEl.addEventListener('play', () => this.updatePlayState(true));
    this.audioEl.addEventListener('pause', () => this.updatePlayState(false));
    this.audioEl.addEventListener('loadedmetadata', () => this.updateDuration());
    
    this.audioEl.addEventListener('ended', () => this.playNext());
  }
  
  handleLikeClick() {
    if (!this.audioEl.src || this.state.currentTrackIndex === -1) {
      this.showToast('[ERROR] ไม่พบเพลงที่กำลังเล่น', 'error');
      return;
    }
    
    const currentTrack = this.state.queue[this.state.currentTrackIndex];
    if (!currentTrack) return;
    
    const isLiked = this.likedTracks.includes(currentTrack.id);
    const willLike = !isLiked;
    
    if (willLike) {
      this.favoriteBtn.classList.add('active');
      this.showToast('[FAVORITE] เพิ่มในรายการโปรด', 'info');
    } else {
      this.favoriteBtn.classList.remove('active');
      this.showToast('[FAVORITE] นำออกจากรายการโปรด', 'error');
    }
    
    clearTimeout(this.likeDebounceTimer);
    this.likeDebounceTimer = setTimeout(() => {
      if (willLike) {
        if (!this.likedTracks.includes(currentTrack.id)) {
          this.likedTracks.push(currentTrack.id);
        }
      } else {
        this.likedTracks = this.likedTracks.filter(id => id !== currentTrack.id);
      }
      localStorage.setItem('gt_liked_tracks', JSON.stringify(this.likedTracks));
      window.dispatchEvent(new CustomEvent('gt-liked-updated'));
    }, 400);
  }
  
  refreshLikeButtonState() {
    if (!this.favoriteBtn || this.state.currentTrackIndex === -1) return;
    const currentTrack = this.state.queue[this.state.currentTrackIndex];
    
    if (!currentTrack) {
      this.favoriteBtn.classList.remove('active');
      return;
    }
    
    if (this.likedTracks.includes(currentTrack.id)) {
      this.favoriteBtn.classList.add('active');
    } else {
      this.favoriteBtn.classList.remove('active');
    }
  }
  
  bindHoldToSeek(button, direction) {
    let pressTimer;
    let seekInterval;
    let isHolding = false;
    
    const startHold = (e) => {
      if (e.cancelable) e.preventDefault();
      isHolding = false;
      pressTimer = setTimeout(() => {
        isHolding = true;
        this.showToast(direction === 'next' ? '[SEEK] Fast Forward >>>' : '[SEEK] <<< Rewind', 'info');
        seekInterval = setInterval(() => {
          if (this.audioEl.duration) {
            this.audioEl.currentTime += (direction === 'next' ? 3 : -3);
            mediaSessionManager.updatePositionState();
          }
        }, 150);
      }, 400);
    };
    
    const endHold = (e) => {
      clearTimeout(pressTimer);
      if (seekInterval) {
        clearInterval(seekInterval);
        seekInterval = null;
      }
      if (!isHolding) {
        if (direction === 'next') this.playNext();
        else this.playPrev();
      }
      isHolding = false;
    };
    
    button.addEventListener('mousedown', startHold);
    button.addEventListener('touchstart', startHold, { passive: false });
    button.addEventListener('mouseup', endHold);
    button.addEventListener('touchend', endHold);
    button.addEventListener('mouseleave', endHold);
  }
  
  async playNext() {
    const track = this.state.nextTrack();
    if (track) await this.loadAndPlay(track);
    else this.showToast('[STATUS] สิ้นสุดคิวเล่นเพลง', 'error');
  }
  
  async playPrev() {
    const track = this.state.prevTrack();
    if (track) await this.loadAndPlay(track);
    else this.showToast('[STATUS] จุดเริ่มต้นของคิว', 'error');
  }
  
  async loadAndPlay(track) {
    try {
      let blob = track.blob;
      if (!blob && track.id) {
        blob = await storage.getTrackBlob(track.id);
      }
      if (!blob) throw new Error("Audio blob not found");
      await this.audio.load(blob);
      await this.audio.play();
      this.updateTitle(track.name.replace(/\.[^/.]+$/, ""));
      this.refreshLikeButtonState();
      mediaSessionManager.updateMetadata(track);
    } catch (error) {
      this.showToast('[ERROR] เล่นเพลงไม่สำเร็จ กำลังข้าม...', 'error');
      setTimeout(() => this.playNext(), 1500);
    }
  }
  
  cycleMode() {
    const newMode = this.state.cyclePlayMode();
    this.updateModeIcon(newMode);
  }
  
  updateModeIcon(mode) {
    if (this.playModeBtn) {
      this.playModeBtn.innerHTML = this.modeIcons[mode];
      this.playModeBtn.style.color = mode === 0 ? '#7a7a8c' : '#ffffff';
    }
  }
  
  togglePlay() {
    if (!this.audioEl.src) {
      this.showToast('[WARN] ไม่มีเพลงในคิวเล่น', 'error');
      return;
    }
    if (this.audioEl.paused) this.audio.play();
    else this.audio.pause();
  }
  
  updatePlayState(isPlaying) {
    if (this.playBtn) {
      this.playBtn.innerHTML = isPlaying ? this.pauseIcon : this.playIcon;
      const visualizerRing = document.querySelector('.visualizer-ring');
      if (visualizerRing) {
        if (isPlaying) visualizerRing.classList.add('playing');
        else visualizerRing.classList.remove('playing');
      }
    }
  }
  
  formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
  
  updateDuration() {
    if (this.timeTotal && this.audioEl.duration) {
      this.timeTotal.textContent = this.formatTime(this.audioEl.duration);
    }
  }
  
  updateSeekBar() {
    if (this.seekBar && this.audioEl.duration && !this.isDragging) {
      const progress = (this.audioEl.currentTime / this.audioEl.duration) * 100;
      this.seekBar.value = progress || 0;
    }
    if (this.timeCurrent && !this.isDragging) {
      this.timeCurrent.textContent = this.formatTime(this.audioEl.currentTime);
    }
  }
  
  updateTitle(title) {
    if (this.titleDisplay) this.titleDisplay.textContent = title;
    if (this.artistDisplay) this.artistDisplay.textContent = 'LOCAL SOURCE';
  }
  
  showToast(message, type = 'success') {
    modalUI.showToast(message, type);
  }
}