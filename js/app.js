// File: js/app.js
import { timerUI } from './ui/timerUI.js';
import { audioEngine } from './core/audioEngine.js';
import { StateManager } from './core/stateManager.js';
import { PlaylistUI } from './ui/playlistUI.js';
import { PlayerUI } from './ui/playerUI.js';
import { storage } from './core/storage.js';
import { EqUI } from './ui/eqUI.js';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('[App] Initialization started...');
    
    // 1. เรียกฐานข้อมูล
    await storage.initDB();
    const state = new StateManager();
    
    // 2. ผูก UI
    const playerUi = new PlayerUI(state, audioEngine);
    const playlistUi = new PlaylistUI(state, audioEngine);
    
    // ปลุกระบบ EQ ให้พร้อมใช้งาน
    const eqUi = new EqUI();
    
    // 3. Override เพื่อส่งต่อข้อมูลระหว่างโมดูล (Playlist -> Player)
    const originalPlay = playlistUi.playTrack.bind(playlistUi);
    playlistUi.playTrack = async (track) => {
      await originalPlay(track);
      const trackName = track.name.replace(/\.[^/.]+$/, "");
      playerUi.updateTitle(trackName);
    };
    
    // 4. Fallback เวลาเพลงเกิดข้อผิดพลาด
    window.nextTrackFallback = () => {
      console.log('[App] Track error/fallback. Moving to next track...');
      if (playerUi && typeof playerUi.playNext === 'function') {
        playerUi.playNext();
      }
    };
    
    // 5. ปิดหน้าจอโหลด (ถ้ามี)
    const loadingOverlay = document.getElementById('loading-overlay');
    const appContainer = document.getElementById('app-container');
    
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    if (appContainer) appContainer.classList.remove('hidden');
    
    console.log('[App] Initialized Successfully.');
  } catch (error) {
    console.error('[App] Init Error:', error);
    alert('Failed to initialize application. Please check console.');
  }
});
