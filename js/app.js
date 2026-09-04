import { timerUI } from './ui/timerUI.js';
import { audioEngine } from './core/audioEngine.js';
import { StateManager } from './core/stateManager.js';
import { PlaylistUI } from './ui/playlistUI.js';
import { PlayerUI } from './ui/playerUI.js';
import { storage } from './core/storage.js';
import { EqUI } from './ui/eqUI.js';
import { helpUI } from './ui/helpUI.js';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('[App] Initialization started...');
    
    await storage.initDB();
    const state = new StateManager();
    
    const playerUi = new PlayerUI(state, audioEngine);
    const playlistUi = new PlaylistUI(state, audioEngine);
    const eqUi = new EqUI();
    helpUI.init();
    
    const originalPlay = playlistUi.playTrack.bind(playlistUi);
    playlistUi.playTrack = async (track) => {
      await originalPlay(track);
      const trackName = track.name.replace(/\.[^/.]+$/, "");
      playerUi.updateTitle(trackName);
    };
    
    window.nextTrackFallback = () => {
      console.log('[App] Track error/fallback. Moving to next track...');
      if (playerUi && typeof playerUi.playNext === 'function') {
        playerUi.playNext();
      }
    };
    
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