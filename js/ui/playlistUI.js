import { storage } from '../core/storage.js';
import { modalUI } from './modalUI.js';
import { mediaSessionManager } from '../core/mediaSessionManager.js';

export class PlaylistUI {
  constructor(stateManager, audioEngine) {
    this.state = stateManager;
    this.audio = audioEngine;
    this.playlistContainer = document.getElementById('playlist-container');
    this.fileInput = document.getElementById('file-upload');
    this.searchInput = document.getElementById('search-input');
    this.clearPlaylistBtn = document.getElementById('clear-playlist-btn');
    this.playlists = JSON.parse(localStorage.getItem('gt_playlists')) || [];
    this.likedTracks = JSON.parse(localStorage.getItem('gt_liked_tracks')) || [];
    this.currentPlaylistId = 'all';
    this.addPlaylistBtn = document.getElementById('add-playlist-btn');
    this.dropdownToggle = document.getElementById('playlist-dropdown-toggle');
    this.dropdownMenu = document.getElementById('playlist-dropdown-menu');
    this.activePlaylistName = document.getElementById('current-playlist-name');
    this.init();
  }

  async init() {
    this.bindEvents();
    this.renderDropdown();
    await this.loadPlaylist();
  }

  bindEvents() {
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    }
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => this.handleSearch(e));
    }
    if (this.clearPlaylistBtn) {
      this.clearPlaylistBtn.addEventListener('click', () => this.handleClearPlaylist());
    }
    if (this.dropdownToggle) {
      this.dropdownToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dropdownMenu.classList.toggle('hidden');
      });
    }
    document.addEventListener('click', () => {
      if (this.dropdownMenu && !this.dropdownMenu.classList.contains('hidden')) {
        this.dropdownMenu.classList.add('hidden');
      }
    });
    if (this.addPlaylistBtn) {
      this.addPlaylistBtn.addEventListener('click', async () => {
        const val = await modalUI.showPrompt('[SYSTEM] สร้าง Playlist ใหม่', 'ชื่อ Playlist:');
        if (val && val.trim()) {
          const newId = 'pl_' + Date.now();
          this.playlists.push({ id: newId, name: val.trim(), tracks: [] });
          this.savePlaylists();
          this.renderDropdown();
          this.selectPlaylist(newId);
          modalUI.showToast(`[STATUS] สร้าง Playlist "${val.trim()}" สำเร็จ`);
        }
      });
    }
    if (this.audio && this.audio.audioElement) {
      this.audio.audioElement.addEventListener('play', () => this.updateActiveHighlight());
    }
    const playlistToggleBtn = document.getElementById('playlist-toggle-btn');
    if (playlistToggleBtn) {
      playlistToggleBtn.addEventListener('click', () => {
        setTimeout(() => this.updateActiveHighlight(true), 300);
      });
    }
    window.addEventListener('gt-liked-updated', () => {
      this.likedTracks = JSON.parse(localStorage.getItem('gt_liked_tracks')) || [];
      if (this.currentPlaylistId === 'favorites') {
        this.loadPlaylist();
      }
    });
  }

  savePlaylists() {
    localStorage.setItem('gt_playlists', JSON.stringify(this.playlists));
  }

  renderDropdown() {
    if (!this.dropdownMenu) return;
    this.dropdownMenu.innerHTML = '';
    const createItem = (id, name, isSystem = false) => {
      const div = document.createElement('div');
      div.className = 'dropdown-item';
      let actionHTML = '';
      if (!isSystem) {
        actionHTML = `
          <div class="pl-actions">
            <button class="pl-action-btn edit-btn" data-id="${id}"><svg viewBox="0 0 24 24" width="16" height="16" fill="#6bc5ff"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
            <button class="pl-action-btn del-btn" data-id="${id}"><svg viewBox="0 0 24 24" width="16" height="16" fill="#ff2a2a"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
          </div>
        `;
      }
      div.innerHTML = `<span style="pointer-events:none;">${name}</span>${actionHTML}`;
      div.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-btn');
        const delBtn = e.target.closest('.del-btn');
        if (editBtn) {
          e.stopPropagation();
          this.editPlaylist(id);
        } else if (delBtn) {
          e.stopPropagation();
          this.deletePlaylist(id);
        } else {
          this.selectPlaylist(id);
        }
      });
      this.dropdownMenu.appendChild(div);
    };
    createItem('all', 'All Tracks', true);
    createItem('favorites', 'Favorites [PROTECTED]', true);
    this.playlists.forEach(pl => createItem(pl.id, pl.name));
  }

  selectPlaylist(id) {
    this.currentPlaylistId = id;
    if (id === 'all') {
      this.activePlaylistName.textContent = 'All Tracks';
    } else if (id === 'favorites') {
      this.activePlaylistName.textContent = 'Favorites [PROTECTED]';
    } else {
      const pl = this.playlists.find(p => p.id === id);
      if (pl) this.activePlaylistName.textContent = pl.name;
    }
    this.loadPlaylist();
  }

  async editPlaylist(id) {
    const pl = this.playlists.find(p => p.id === id);
    if (!pl) return;
    const val = await modalUI.showPrompt('[SYSTEM] แก้ไขชื่อ Playlist', 'ชื่อใหม่:', pl.name);
    if (val && val.trim()) {
      pl.name = val.trim();
      this.savePlaylists();
      this.renderDropdown();
      if (this.currentPlaylistId === id) this.activePlaylistName.textContent = pl.name;
      modalUI.showToast('[STATUS] แก้ไขชื่อเรียบร้อย');
    }
  }

  async deletePlaylist(id) {
    const pl = this.playlists.find(p => p.id === id);
    if (!pl) return;
    const isConfirmed = await modalUI.showConfirm('[CONFIRM] ลบ Playlist', `ต้องการลบ Playlist "${pl.name}" หรือไม่?`);
    if (isConfirmed) {
      this.playlists = this.playlists.filter(p => p.id !== id);
      this.savePlaylists();
      this.renderDropdown();
      if (this.currentPlaylistId === id) this.selectPlaylist('all');
      modalUI.showToast('[STATUS] ลบ Playlist เรียบร้อย');
    }
  }

  async handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    try {
      modalUI.showToast('[SYSTEM] กำลังนำเข้าเพลง...', 'info');
      const result = await storage.saveFiles(files);
      const processed = result.processedTracks || [];
      if (this.currentPlaylistId === 'all') {
        if (result.count > 0) {
          const dupText = result.skipped > 0 ? ` (ซ้ำ ${result.skipped} เพลง)` : '';
          modalUI.showToast(`[STATUS] นำเข้าสำเร็จ ${result.count} เพลง${dupText}`);
        } else {
          modalUI.showToast('[WARN] ไม่มีเพลงใหม่ถูกเพิ่ม (ไฟล์ซ้ำ)', 'info');
        }
} else if (this.currentPlaylistId === 'favorites') {
        // [ตู้เซฟระดับ Controller] บล็อกการ Add เพลงเข้า Favorites แบบ Manual
        modalUI.showToast('[REJECT] เพลย์ลิสต์นี้รับเฉพาะเพลงที่กดหัวใจเท่านั้น', 'error');
        event.target.value = ''; // รีเซ็ต Input ป้องกันไฟล์ค้าง
        return; // ตัดจบวงจรการแอดเพลงทันที
      } else {
        const targetPl = this.playlists.find(p => p.id === this.currentPlaylistId);
        if (targetPl) {
          if (!Array.isArray(targetPl.tracks)) targetPl.tracks = [];
          let addedToPl = 0;
          let dupInPl = 0;
          processed.forEach(({ track }) => {
            if (targetPl.tracks.includes(track.id)) {
              dupInPl++;
            } else {
              targetPl.tracks.push(track.id);
              addedToPl++;
            }
          });
          targetPl.tracks = [...new Set(targetPl.tracks)];
          this.savePlaylists();
          if (addedToPl > 0) {
            const dupText = dupInPl > 0 ? ` (ซ้ำ ${dupInPl} เพลง)` : '';
            modalUI.showToast(`[STATUS] เพิ่มเข้า "${targetPl.name}" ${addedToPl} เพลง${dupText}`);
          } else {
            modalUI.showToast(`[WARN] เพลงทั้งหมดมีใน "${targetPl.name}" แล้ว`, 'info');
          }
        }
      }
      await this.loadPlaylist();
    } catch (error) {
      modalUI.showToast(error.message, 'error');
    } finally {
      event.target.value = '';
    }
  }

  async loadPlaylist(searchQuery = '') {
    if (!this.playlistContainer) return;
    try {
      this.playlistContainer.innerHTML = '<div style="text-align: center; padding: 30px; color: #7a7a8c; font-weight: bold;">[SYSTEM] กำลังโหลดเพลง...</div>';
      const allTracks = await storage.getAllTracks();
      const trackMap = new Map(allTracks.map(t => [t.id, t]));
      let tracks = [];
      if (this.currentPlaylistId === 'favorites') {
        tracks = this.likedTracks
          .map(id => trackMap.get(id))
          .filter(Boolean);
      } else if (this.currentPlaylistId !== 'all') {
        const pl = this.playlists.find(p => p.id === this.currentPlaylistId);
        if (pl) {
          if (!Array.isArray(pl.tracks)) pl.tracks = [];
          const validIds = [...new Set(pl.tracks)].filter(id => trackMap.has(id));
          if (validIds.length !== pl.tracks.length) {
            pl.tracks = validIds;
            this.savePlaylists();
          }
          tracks = pl.tracks.map(id => trackMap.get(id)).filter(Boolean);
        }
      } else {
        tracks = allTracks;
      }
      this.state.setQueue(tracks);
      const filteredTracks = tracks.filter(track =>
        track.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (filteredTracks.length === 0) {
        const emptyMsg = searchQuery 
          ? '[SYSTEM] ไม่พบเพลงที่ค้นหา' 
          : '[SYSTEM] คลังเพลงว่างเปล่า กดปุ่ม ADD MUSIC เพื่อเริ่มนำเข้าเพลง';
        this.playlistContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: #7a7a8c; font-weight: bold;">${emptyMsg}</div>`;
        return;
      }
      this.renderTracks(filteredTracks);
    } catch (error) {
      this.playlistContainer.innerHTML = '<div style="text-align: center; color: #ff2a2a; padding: 20px;">[ERROR] โหลดเพลย์ลิสต์ไม่สำเร็จ</div>';
    }
  }

  handleSearch(event) {
    this.loadPlaylist(event.target.value);
  }

  async handleClearPlaylist() {
    if (!this.state.queue || this.state.queue.length === 0) {
      modalUI.showToast('[WARN] ไม่มีเพลงให้ล้าง', 'info');
      return;
    }
    if (this.currentPlaylistId === 'favorites') {
      modalUI.showToast('[REJECT] เพลย์ลิสต์ Favorites ได้รับการปกป้อง กรุณาลบทีละเพลง', 'error');
      return;
    }
    let title = '[CONFIRM] ล้างเพลงทั้งหมด';
    let desc = 'ต้องการล้างเพลงทั้งหมดในคลังหรือไม่? (เพลงใน Favorites จะถูกเก็บไว้)';
    if (this.currentPlaylistId !== 'all') {
      const pl = this.playlists.find(p => p.id === this.currentPlaylistId);
      if (!pl) return;
      title = `[CONFIRM] ล้างเพลงใน "${pl.name}"`;
      desc = `ต้องการล้างเพลงออกจาก "${pl.name}" หรือไม่? (ไฟล์ต้นฉบับใน All Tracks จะไม่หาย)`;
    }
    const isConfirmed = await modalUI.showConfirm(title, desc);
    if (isConfirmed) {
      try {
        if (this.currentPlaylistId === 'all') {
          const tracks = await storage.getAllTracks();
          let keptCount = 0;
          for (const track of tracks) {
            if (this.likedTracks.includes(track.id)) {
              keptCount++;
              continue;
            }
            await storage.deleteTrack(track.id);
          }
          this.playlists.forEach(pl => {
            pl.tracks = pl.tracks.filter(tid => this.likedTracks.includes(tid));
          });
          this.savePlaylists();
          if (keptCount > 0) {
            modalUI.showToast(`[STATUS] ล้างคลังเรียบร้อย (คงเหลือเพลงใน Favorites ${keptCount} เพลง)`);
          } else {
            modalUI.showToast('[STATUS] ล้างคลังเพลงเรียบร้อย');
          }
        } else {
          const targetPl = this.playlists.find(p => p.id === this.currentPlaylistId);
          if (targetPl) {
            targetPl.tracks = [];
            this.savePlaylists();
            modalUI.showToast('[STATUS] ล้างเพลงในเพลย์ลิสต์สำเร็จ');
          }
        }
        await this.loadPlaylist();
      } catch (error) {
        modalUI.showToast(error.message, 'error');
      }
    }
  }

  renderTracks(tracks) {
    this.playlistContainer.innerHTML = '';
    tracks.forEach(track => {
      const item = document.createElement('div');
      item.className = 'playlist-track-item';
      item.dataset.id = track.id;
      const trackName = track.name.replace(/\.[^/.]+$/, "");
      item.innerHTML = `
        <div class="track-info-area" style="cursor: pointer; flex-grow: 1; overflow: hidden; display: flex; align-items: center; gap: 12px;">
          <div class="track-icon" style="width: 38px; height: 38px; background: #252535; border-radius: 8px; display: flex; justify-content: center; align-items: center; flex-shrink: 0; transition: 0.3s;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#7a7a8c" style="transition: 0.3s;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
          </div>
          <div style="overflow: hidden;">
            <div class="track-title-text" style="color: #fff; font-weight: bold; font-size: 14px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; margin-bottom: 4px; transition: 0.3s;">${trackName}</div>
            <div style="color: #ff2a2a; font-size: 11px; font-weight: 800; letter-spacing: 1px;">LOCAL FILE</div>
          </div>
        </div>
        <button class="delete-btn" data-id="${track.id}" style="margin-left: 10px; background: rgba(255, 42, 42, 0.1); color: #ff2a2a; border: 1px solid rgba(255, 42, 42, 0.3); padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 12px; transition: 0.2s;">DEL</button>
      `;
      const trackInfoArea = item.querySelector('.track-info-area');
      trackInfoArea.addEventListener('click', () => this.playTrack(track));
      const deleteBtn = item.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.deleteTrack(track.id);
      });
      this.playlistContainer.appendChild(item);
    });
    this.updateActiveHighlight();
  }

  updateActiveHighlight(forceScroll = false) {
    if (!this.playlistContainer) return;
    const allItems = this.playlistContainer.querySelectorAll('.playlist-track-item');
    allItems.forEach(item => item.classList.remove('active-playing'));
    if (this.state.currentTrackIndex === -1 || !this.state.queue.length) return;
    const activeTrack = this.state.queue[this.state.currentTrackIndex];
    if (!activeTrack) return;
    const activeItem = this.playlistContainer.querySelector(`.playlist-track-item[data-id="${activeTrack.id}"]`);
    if (activeItem) {
      activeItem.classList.add('active-playing');
      const playlistSection = document.getElementById('playlist-section');
      const isHidden = playlistSection && playlistSection.classList.contains('hidden');
      if (!isHidden || forceScroll) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  async playTrack(track) {
    try {
      const trackIndex = this.state.queue.findIndex(t => t.id === track.id);
      this.state.currentTrackIndex = trackIndex !== -1 ? trackIndex : 0;
      let blob = track.blob;
      if (!blob && track.id) {
        blob = await storage.getTrackBlob(track.id);
      }
      if (!blob) throw new Error("Audio blob not found");
      await this.audio.load(blob);
      await this.audio.play();
      modalUI.showToast(`[PLAYBACK] เล่น: ${track.name}`);
      window.dispatchEvent(new Event('gt-liked-updated'));
      mediaSessionManager.updateMetadata(track);
    } catch (error) {
      modalUI.showToast('[ERROR] เล่นเพลงไม่สำเร็จ', 'error');
    }
  }

  async deleteTrack(id) {
    try {
      if (this.currentPlaylistId === 'favorites') {
        const isConfirmed = await modalUI.showConfirm('[CONFIRM] ยืนยันการลบ', 'ต้องการนำเพลงนี้ออกจาก Favorites หรือไม่?');
        if (!isConfirmed) return;
        this.likedTracks = this.likedTracks.filter(tid => tid !== id);
        localStorage.setItem('gt_liked_tracks', JSON.stringify(this.likedTracks));
        modalUI.showToast('[STATUS] ลบออกจาก Favorites เรียบร้อย');
        window.dispatchEvent(new Event('gt-liked-updated'));
      } else if (this.currentPlaylistId === 'all') {
        const isConfirmed = await modalUI.showConfirm('[CONFIRM] ยืนยันการลบ', 'ต้องการลบเพลงนี้ออกจากระบบถาวรหรือไม่?');
        if (!isConfirmed) return;
        await storage.deleteTrack(id);
        this.playlists.forEach(pl => {
          pl.tracks = pl.tracks.filter(tid => tid !== id);
        });
        this.likedTracks = this.likedTracks.filter(tid => tid !== id);
        localStorage.setItem('gt_liked_tracks', JSON.stringify(this.likedTracks));
        this.savePlaylists();
        modalUI.showToast('[STATUS] ลบเพลงสำเร็จ');
        window.dispatchEvent(new Event('gt-liked-updated'));
      } else {
        const targetPl = this.playlists.find(p => p.id === this.currentPlaylistId);
        if (targetPl) {
          targetPl.tracks = targetPl.tracks.filter(tid => tid !== id);
          this.savePlaylists();
          modalUI.showToast('[STATUS] นำเพลงออกจากเพลย์ลิสต์สำเร็จ');
        }
      }
      await this.loadPlaylist();
    } catch (error) {
      modalUI.showToast('[ERROR] ลบเพลงไม่สำเร็จ', 'error');
    }
  }
}