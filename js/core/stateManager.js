// js/core/stateManager.js
export class StateManager {
  constructor() {
    this.isPlaying = false;
    // โหลดค่าโหมดการเล่นเพลงจาก localStorage โดยตั้งค่าเริ่มต้นเป็น 2 (Shuffle)
    const savedMode = typeof localStorage !== 'undefined' ? localStorage.getItem('gt_play_mode') : null;
    this.playMode = savedMode !== null ? parseInt(savedMode, 10) : 2; // 0: Order, 1: Repeat One, 2: Shuffle
    this.currentTrackIndex = -1;
    this.selectedTrackId = null;
    this.loadedTrackId = null;
    this.playlistId = 'all';
    this.restoringSession = false;
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
    // A new playlist must never silently select an unrelated song.
    const currentId = this.selectedTrackId ?? this.queue[this.currentTrackIndex]?.id ?? null;
    this.selectedTrackId = currentId;
    this.originalQueue = [...tracks];
    this.queue = this.playMode === 2
      ? this.shuffleArray([...tracks]) : [...tracks];
    this.currentTrackIndex = currentId === null ? -1
      : this.queue.findIndex(track => track.id === currentId);
    return true;
  }

  restoreSelection(trackId, savedOrder = []) {
    if (!this.queue.some(track => track.id === trackId)) return false;
    // Restore shuffle ordering without inventing missing or deleted tracks.
    if (this.playMode === 2 && Array.isArray(savedOrder)) {
      const byId = new Map(this.queue.map(track => [track.id, track]));
      const ordered = [];
      for (const id of savedOrder) {
        if (byId.has(id)) {
          ordered.push(byId.get(id));
          byId.delete(id);
        }
      }
      this.queue = [...ordered, ...byId.values()];
    }
    this.selectedTrackId = trackId;
    this.currentTrackIndex = this.queue.findIndex(track => track.id === trackId);
    return this.currentTrackIndex !== -1;
  }
  
  togglePlay() {
    this.isPlaying = !this.isPlaying;
    return this.isPlaying;
  }
  
  nextTrack() {
    if (this.queue.length === 0) return null;
    
    if (this.playMode !== 1 || this.currentTrackIndex === -1) {
      this.currentTrackIndex++;
      if (this.currentTrackIndex >= this.queue.length) {
        this.currentTrackIndex = 0;
      }
    }
    const selected = this.queue[this.currentTrackIndex];
    this.selectedTrackId = selected?.id ?? null;
    return selected;
  }
  
  prevTrack() {
    if (this.queue.length === 0) return null;
    
    if (this.playMode !== 1 || this.currentTrackIndex === -1) {
      this.currentTrackIndex--;
      if (this.currentTrackIndex < 0) {
        this.currentTrackIndex = this.queue.length - 1;
      }
    }
    const selected = this.queue[this.currentTrackIndex];
    this.selectedTrackId = selected?.id ?? null;
    return selected;
  }
  
  cyclePlayMode() {
    this.playMode = (this.playMode + 1) % 3;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gt_play_mode', this.playMode.toString());
    }
    const currentId = this.queue[this.currentTrackIndex]?.id ?? this.selectedTrackId;
    this.selectedTrackId = currentId ?? null;

    if (this.playMode === 2) {
      this.queue = this.shuffleArray([...this.originalQueue]);
    } else {
      this.queue = [...this.originalQueue];
    }
    
    this.currentTrackIndex = this.selectedTrackId === null ? -1
      : this.queue.findIndex(t => t.id === this.selectedTrackId);

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