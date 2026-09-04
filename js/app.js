// js/app.js
import { timerUI } from './ui/timerUI.js';
import { audioEngine } from './core/audioEngine.js';
import { StateManager } from './core/stateManager.js';
import { PlaylistUI } from './ui/playlistUI.js';
import { PlayerUI } from './ui/playerUI.js';
import { storage } from './core/storage.js';
import { EqUI } from './ui/eqUI.js';
import { helpUI } from './ui/helpUI.js';
import { mediaSessionManager } from './core/mediaSessionManager.js';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('[App] Initialization started...');
    
    await storage.initDB();
    const state = new StateManager();
    
    const playerUi = new PlayerUI(state, audioEngine);
    const playlistUi = new PlaylistUI(state, audioEngine);
    const eqUi = new EqUI();
    helpUI.init();
    
    // กำหนด Callback สำหรับ Media Session Control (หน้าจอล็อค & Notification Bar)
    mediaSessionManager.init({
      onNext: () => playerUi.playNext(),
      onPrev: () => playerUi.playPrev()
    });
    
    const originalPlay = playlistUi.playTrack.bind(playlistUi);
    playlistUi.playTrack = async (track) => {
      await originalPlay(track);
      const trackName = track.name.replace(/\.[^/.]+$/, "");
      playerUi.updateTitle(trackName);
      mediaSessionManager.updateMetadata(track);
    };
    
    window.nextTrackFallback = () => {
      console.log('[App] Track error/fallback. Moving to next track...');
      if (playerUi && typeof playerUi.playNext === 'function') {
        playerUi.playNext();
      }
    };
    
    // ฟังก์ชันสั่งเล่นเพลงที่เปิดเข้ามาจากภายนอกแอป (File Manager / Intent)
    const playExternalAudio = async (trackData) => {
      if (!trackData || !trackData.url) return;
      try {
        console.log('[App] Playing external track:', trackData.name);
        await audioEngine.load(trackData.url);
        await audioEngine.play();
        const cleanName = trackData.name ? trackData.name.replace(/\.[^/.]+$/, "") : "External Track";
        playerUi.updateTitle(cleanName);
        mediaSessionManager.updateMetadata({ name: cleanName, blob: null });
      } catch (err) {
        console.error('[App] Failed to play external track:', err);
      }
    };
    
    // รองรับการกดเปิดไฟล์ขณะที่แอปเปิดค้างอยู่แล้ว (Warm Start)
    window.handleExternalTrack = (trackData) => {
      playExternalAudio(trackData);
    };
    
    // ตรวจสอบเพลงที่เปิดค้างไว้ตั้งแต่ตอนเปิดแอปครั้งแรก (Cold Start)
    if (window.AndroidBridge && typeof window.AndroidBridge.getPendingTrack === 'function') {
      try {
        const pendingRaw = window.AndroidBridge.getPendingTrack();
        if (pendingRaw) {
          const pendingTrack = JSON.parse(pendingRaw);
          playExternalAudio(pendingTrack);
        }
      } catch (e) {
        console.warn('[App] Error parsing pending external track:', e);
      }
    }
    
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