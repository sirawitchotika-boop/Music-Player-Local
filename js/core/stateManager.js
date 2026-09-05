// js/core/stateManager.js
export class StateManager {
  constructor() {
    this.isPlaying = false;
    // โหลดค่าโหมดการเล่นเพลงจาก localStorage โดยตั้งค่าเริ่มต้นเป็น 2 (Shuffle)
    const savedMode = typeof localStorage !== 'undefined' ? localStorage.getItem('gt_play_mode') : null;
    this.playMode = savedMode !== null ? parseInt(savedMode, 10) : 2; // 0: Order, 1: Repeat One, 2: Shuffle
    this.currentTrackIndex = -1;
    this.queue = [];
    this.originalQueue = [];
  }
  
  setQueue(tracks) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
      this.queue = [];
      this.originalQueue = [];
      this.currentTrackIndex = -1;
      return false;
    }
    this.originalQueue = [...tracks];
    this.queue = [...tracks];
    
    if (this.playMode === 2) {
      this.queue = this.shuffleArray([...this.queue]);
    }
    if (this.currentTrackIndex === -1 || this.currentTrackIndex >= this.queue.length) {
      this.currentTrackIndex = 0;
    }
    return true;
  }
  
  togglePlay() {
    this.isPlaying = !this.isPlaying;
    return this.isPlaying;
  }
  
  nextTrack() {
    if (this.queue.length === 0) return null;
    
    if (this.playMode === 1) {
      return this.queue[this.currentTrackIndex];
    } else {
      this.currentTrackIndex++;
      if (this.currentTrackIndex >= this.queue.length) {
        this.currentTrackIndex = 0;
      }
    }
    return this.queue[this.currentTrackIndex];
  }
  
  prevTrack() {
    if (this.queue.length === 0) return null;
    
    if (this.playMode === 1) {
      return this.queue[this.currentTrackIndex];
    } else {
      this.currentTrackIndex--;
      if (this.currentTrackIndex < 0) {
        this.currentTrackIndex = this.queue.length - 1;
      }
    }
    return this.queue[this.currentTrackIndex];
  }
  
  cyclePlayMode() {
    this.playMode = (this.playMode + 1) % 3;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gt_play_mode', this.playMode.toString());
    }
    const currentTrack = this.queue[this.currentTrackIndex];
    
    if (this.playMode === 2) {
      this.queue = this.shuffleArray([...this.originalQueue]);
    } else {
      this.queue = [...this.originalQueue];
    }
    
    if (currentTrack) {
      this.currentTrackIndex = this.queue.findIndex(t => t.id === currentTrack.id);
      if (this.currentTrackIndex === -1) this.currentTrackIndex = 0;
    }
    
    return this.playMode;
  }
  
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}