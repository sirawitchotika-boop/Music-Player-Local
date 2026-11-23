// js/core/preferences.js
// Single validated persistence layer for lightweight localStorage preferences.
// Never throws on unavailable, full, or corrupted storage.

export const PLAYLISTS_KEY = 'gt_playlists';
export const LIKED_TRACKS_KEY = 'gt_liked_tracks';
export const PLAY_MODE_KEY = 'gt_play_mode';

const DEFAULT_PLAY_MODE = 2; // 0: Order, 1: Repeat One, 2: Shuffle

const resolveStore = (store) => {
  if (store !== undefined) return store;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

const isValidTrackId = (id) => Number.isSafeInteger(id) && id > 0;

export function readString(key, fallback = null, store) {
  try {
    const target = resolveStore(store);
    if (!target) return fallback;
    const raw = target.getItem(key);
    return typeof raw === 'string' ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function writeString(key, value, store) {
  try {
    const target = resolveStore(store);
    if (!target) return false;
    target.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

export function readBool(key, fallback = false, store) {
  const raw = readString(key, null, store);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

export function writeBool(key, value, store) {
  return writeString(key, Boolean(value) ? 'true' : 'false', store);
}

export function readJson(key, fallback = null, store) {
  const raw = readString(key, null, store);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value, store) {
  try {
    return writeString(key, JSON.stringify(value), store);
  } catch {
    return false;
  }
}

export function loadPlaylists(store) {
  const parsed = readJson(PLAYLISTS_KEY, null, store);
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  const playlists = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' && item.id.trim() ? item.id : null;
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : null;
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const tracks = Array.isArray(item.tracks)
      ? [...new Set(item.tracks.filter(isValidTrackId))]
      : [];
    playlists.push({ id, name, tracks });
  }
  return playlists;
}

export function savePlaylists(playlists, store) {
  const safe = Array.isArray(playlists) ? playlists : [];
  return writeJson(PLAYLISTS_KEY, safe, store);
}

export function loadLikedTracks(store) {
  const parsed = readJson(LIKED_TRACKS_KEY, null, store);
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.filter(isValidTrackId))];
}

export function saveLikedTracks(likedTracks, store) {
  const safe = Array.isArray(likedTracks)
    ? [...new Set(likedTracks.filter(isValidTrackId))]
    : [];
  return writeJson(LIKED_TRACKS_KEY, safe, store);
}

export function loadPlayMode(store) {
  const raw = readString(PLAY_MODE_KEY, null, store);
  if (raw === null) return DEFAULT_PLAY_MODE;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 2
    ? parsed
    : DEFAULT_PLAY_MODE;
}

export function savePlayMode(mode, store) {
  const safe = Number.isInteger(mode) && mode >= 0 && mode <= 2
    ? mode
    : DEFAULT_PLAY_MODE;
  return writeString(PLAY_MODE_KEY, String(safe), store);
}
