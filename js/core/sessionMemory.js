// Lightweight session metadata only. Never stores or removes audio files.
export const SESSION_KEY = 'gt_last_session_v1';
const MAX_QUEUE_IDS = 10000;
const validId = id => Number.isSafeInteger(id) && id > 0;
const validPosition = position => Number.isFinite(position) && position >= 0;

export class SessionMemory {
  constructor(getStore = () => (typeof localStorage === 'undefined' ? null : localStorage),
              clock = () => Date.now()) {
    this.getStore = getStore;
    this.clock = clock;
    this.lastWriteMs = -Infinity;
  }

  read() {
    try {
      const raw = this.getStore()?.getItem(SESSION_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (!value || value.version !== 1 || !validId(value.trackId) ||
          !validPosition(value.position)) return null;
      const playlistId = typeof value.playlistId === 'string' && value.playlistId.length <= 256
        ? value.playlistId : 'all';
      const queueIds = Array.isArray(value.queueIds) && value.queueIds.length <= MAX_QUEUE_IDS
        ? [...new Set(value.queueIds.filter(validId))] : [];
      return { version: 1, trackId: value.trackId, position: value.position,
        playlistId, queueIds };
    } catch {
      return null; // Corrupt/unavailable preferences must not break the music player.
    }
  }

  _write(value) {
    try {
      const store = this.getStore();
      if (!store) return false;
      store.setItem(SESSION_KEY, JSON.stringify(value));
      this.lastWriteMs = this.clock();
      return true;
    } catch {
      return false; // Quota/private-storage errors must never interrupt playback.
    }
  }

  saveSelection(trackId, playlistId, queue, position = 0) {
    if (!validId(trackId)) return false;
    const ids = Array.isArray(queue) ? queue.map(track => track?.id) : [];
    return this._write({
      version: 1,
      trackId,
      playlistId: typeof playlistId === 'string' && playlistId.length <= 256
        ? playlistId : 'all',
      queueIds: ids.length <= MAX_QUEUE_IDS ? [...new Set(ids.filter(validId))] : [],
      position: validPosition(position) ? position : 0
    });
  }

  savePosition(trackId, position, force = false) {
    if (!validId(trackId) || !validPosition(position)) return false;
    const saved = this.read();
    if (!saved || saved.trackId !== trackId) return false;
    if (Math.abs(position - saved.position) < 0.25) return false;
    if (!force && (this.clock() - this.lastWriteMs < 10000 ||
                   Math.abs(position - saved.position) < 5)) return false;
    return this._write({ ...saved, position });
  }

  clearForDeletedTrack(trackId) {
    if (!validId(trackId) || this.read()?.trackId !== trackId) return;
    try {
      this.getStore()?.removeItem(SESSION_KEY);
    } catch {
      // Never affect the deletion confirmation or other stored songs.
    }
  }
}

export const sessionMemory = new SessionMemory();

// Restore only an existing local track; never start audio or select a substitute.
export async function restoreLastSession({
  session = sessionMemory, state, playlistUI, playerUI, audio, storage,
  mediaSession, notify = () => {}
}) {
  const saved = session.read();
  if (!saved) return false;

  let track;
  let blob;
  try {
    track = (await storage.getAllTracks()).find(t => t.id === saved.trackId);
    if (!track) {
      notify('Last song is unavailable. Choose a song to play.');
      return false;
    }
    blob = await storage.getTrackBlob(track.id);
    if (!blob) {
      notify('Last song could not be loaded. Your library was not changed.');
      return false;
    }
  } catch {
    notify('Unable to restore the last song. Your library was not changed.');
    return false;
  }

  const selectedContext = saved.playlistId;
  const contextHasTrack = selectedContext === 'all' ||
    (selectedContext === 'favorites' && playlistUI.likedTracks.includes(track.id)) ||
    (playlistUI.playlists.some(pl =>
      pl.id === selectedContext && Array.isArray(pl.tracks) && pl.tracks.includes(track.id)));
  const context = contextHasTrack ? selectedContext : 'all';

  try {
    if (playlistUI.currentPlaylistId !== context) await playlistUI.selectPlaylist(context);
    if (!state.queue.some(t => t.id === track.id) && context !== 'all') {
      await playlistUI.selectPlaylist('all');
    }
    if (!state.queue.some(t => t.id === track.id)) {
      notify('Last song is unavailable in the current library.');
      return false;
    }

    // src assignment loads audio metadata but must never invoke play().
    state.restoringSession = true;
    audio.audioElement.autoplay = false;
    if (!audio.audioElement.paused) await audio.pause(true);
    await audio.load(blob);
    if (!audio.audioElement.paused) await audio.pause(true);
    if (!state.restoreSelection(track.id, saved.queueIds)) return false;
    state.loadedTrackId = track.id;

    const element = audio.audioElement;
    const loadedSrc = element.src;
    const applyPosition = () => {
      if (session.read()?.trackId !== track.id || element.src !== loadedSrc) {
        state.restoringSession = false;
        return;
      }
      const duration = element.duration;
      if (Number.isFinite(duration) && duration > 0) {
        element.currentTime = Math.min(saved.position, Math.max(0, duration - 0.25));
      }
      playerUI.updateSeekBar?.();
      mediaSession.updatePositionState?.();
      state.restoringSession = false;
    };
    if (element.readyState >= 1) applyPosition();
    else element.addEventListener('loadedmetadata', applyPosition, { once: true });

    playerUI.updateTitle(track.name.replace(/\.[^/.]+$/, ''));
    playerUI.refreshLikeButtonState?.();
    // This is UI/browser metadata only; don't start an Android service here.
    mediaSession.updateMetadata(track, { syncAndroid: false });
    return true;
  } catch {
    state.restoringSession = false;
    notify('Unable to restore the last song. Nothing was deleted.');
    return false;
  }
}
