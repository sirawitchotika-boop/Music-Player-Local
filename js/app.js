// js/app.js
import { timerUI } from './ui/timerUI.js';
import { audioEngine } from './core/audioEngine.js';
import { StateManager } from './core/stateManager.js';
import { PlaylistUI } from './ui/playlistUI.js';
import { PlayerUI } from './ui/playerUI.js';
import { storage } from './core/storage.js';
import { helpUI } from './ui/helpUI.js';
import { eqUI } from './ui/eqUI.js';
import { mediaSessionManager } from './core/mediaSessionManager.js';
import { sessionMemory, restoreLastSession } from './core/sessionMemory.js';
import { modalUI } from './ui/modalUI.js';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('[App] Initialization started...');
    
    await storage.initDB();
    const state = new StateManager();
    
    const playerUi = new PlayerUI(state, audioEngine);
    const playlistUi = new PlaylistUI(state, audioEngine);
    helpUI.init();
    eqUI.init();
    
    mediaSessionManager.init({
      onNext: () => playerUi.playNext(),
      onPrev: () => playerUi.playPrev()
    });
    
    const originalPlay = playlistUi.playTrack.bind(playlistUi);
    playlistUi.playTrack = async (track) => {
      const played = await originalPlay(track);
      if (played) {
        const trackName = track.name.replace(/\.[^/.]+$/, "");
        playerUi.updateTitle(trackName);
      }
      return played;
    };
    
    window.nextTrackFallback = () => {
      if (playerUi && typeof playerUi.playNext === 'function') {
        playerUi.playNext();
      }
    };
    
    const savePosition = (force = false) => {
      if (!state.restoringSession && state.loadedTrackId !== null) {
        sessionMemory.savePosition(state.loadedTrackId, audioEngine.audioElement.currentTime, force);
      }
    };
    audioEngine.audioElement.addEventListener('timeupdate', () => savePosition());
    audioEngine.audioElement.addEventListener('pause', () => savePosition(true));
    audioEngine.audioElement.addEventListener('seeked', () => savePosition(true));
    window.addEventListener('pagehide', () => savePosition(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') savePosition(true);
    });

    // Opening an external audio file must also be silent until Play is pressed.
    const loadExternalAudio = async (trackData) => {
      if (!trackData || !trackData.url) return false;
      try {
        audioEngine.audioElement.autoplay = false;
        await audioEngine.load(trackData.url);
        if (!audioEngine.audioElement.paused) await audioEngine.pause(true);
        state.loadedTrackId = null; // Temporary external URLs aren't recoverable track IDs.
        state.restoringSession = false;
        const cleanName = trackData.name ? trackData.name.replace(/\.[^/.]+$/, "") : "External Track";
        playerUi.updateTitle(cleanName);
        mediaSessionManager.updateMetadata({ name: cleanName, blob: null }, { syncAndroid: false });
        return true;
      } catch (err) {
        console.error('[App] Failed to load external track:', err);
        return false;
      }
    };

    window.handleExternalTrack = (trackData) => {
      void loadExternalAudio(trackData);
    };

    await playlistUi.ready;
    let externalLoaded = false;
    if (window.AndroidBridge && typeof window.AndroidBridge.getPendingTrack === 'function') {
      try {
        const pendingRaw = window.AndroidBridge.getPendingTrack();
        if (pendingRaw) externalLoaded = await loadExternalAudio(JSON.parse(pendingRaw));
      } catch (e) {
        console.warn('[App] Error parsing pending external track:', e);
      }
    }
    if (!externalLoaded) {
      await restoreLastSession({
        state, playlistUI: playlistUi, playerUI: playerUi, audio: audioEngine,
        storage, mediaSession: mediaSessionManager,
        notify: message => modalUI.showToast(message, 'info')
      });
    }
    
    const loadingOverlay = document.getElementById('loading-overlay');
    const appContainer = document.getElementById('app-container');
    
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    if (appContainer) appContainer.classList.remove('hidden');
    
    console.log('[App] Initialized Successfully.');
  } catch (error) {
    console.error('[App] Init Error:', error);
  }
});