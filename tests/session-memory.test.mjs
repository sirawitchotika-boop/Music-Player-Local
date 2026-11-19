import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SessionMemory, SESSION_KEY, restoreLastSession } from '../js/core/sessionMemory.js';
import { StateManager } from '../js/core/stateManager.js';

const createStore = () => {
  const values = new Map();
  let writes = 0;
  return {
    values,
    get writes() { return writes; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { writes++; values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
};

const setup = (trackId = 2, playlistId = 'all', queueIds = [3, 1, 2], position = 72) => {
  const store = createStore();
  store.values.set('gt_play_mode', '2');
  globalThis.localStorage = store;
  let clock = 10000;
  const session = new SessionMemory(() => store, () => clock);
  session.saveSelection(trackId, playlistId, queueIds.map(id => ({ id })), position);
  return { store, session, advance(ms) { clock += ms; } };
};

class FakeAudioElement {
  constructor() {
    this.paused = true;
    this.autoplay = true;
    this.currentTime = 0;
    this.duration = 100;
    this.readyState = 0;
    this.src = '';
    this.events = new Map();
  }
  addEventListener(event, handler, options = {}) {
    const listeners = this.events.get(event) || [];
    listeners.push({ handler, once: !!options.once });
    this.events.set(event, listeners);
  }
  emit(event) {
    const listeners = this.events.get(event) || [];
    this.events.set(event, listeners.filter(x => !x.once));
    for (const listener of listeners) listener.handler();
  }
}

const makeRestoration = (session, options = {}) => {
  const all = options.tracks ?? [1, 2, 3].map(id => ({ id, name: 'Track ' + id + '.mp3' }));
  const state = new StateManager();
  state.setQueue(all);
  const loaded = [];
  const element = new FakeAudioElement();
  const audio = {
    audioElement: element,
    async load(blob) { loaded.push(blob); element.src = 'blob:track-' + blob.id; },
    async pause() { element.paused = true; },
    async play() { throw new Error('restore must not invoke Play'); }
  };
  const storage = {
    async getAllTracks() { return all; },
    async getTrackBlob(id) { return options.missingBlob ? null : { id }; }
  };
  const playlistUI = {
    currentPlaylistId: 'all',
    likedTracks: options.likedTracks || [],
    playlists: options.playlists || [],
    async selectPlaylist(id) {
      this.currentPlaylistId = id;
      state.playlistId = id;
      let tracks = all;
      if (id === 'favorites') tracks = all.filter(track => this.likedTracks.includes(track.id));
      else if (id !== 'all') {
        const pl = this.playlists.find(item => item.id === id);
        tracks = all.filter(track => pl?.tracks.includes(track.id));
      }
      state.setQueue(tracks);
    }
  };
  const seen = { titles: [], metadata: [], messages: [], seeks: 0 };
  const playerUI = {
    updateTitle(title) { seen.titles.push(title); },
    refreshLikeButtonState() {},
    updateSeekBar() { seen.seeks++; }
  };
  const mediaSession = {
    updateMetadata(...args) { seen.metadata.push(args); },
    updatePositionState() {}
  };
  return {
    state, audio, element, loaded, seen, playlistUI, mediaSession,
    restore: () => restoreLastSession({
      session, state, playlistUI, playerUI, audio, storage, mediaSession,
      notify: message => seen.messages.push(message)
    })
  };
};

test('session stores stable track IDs, playlist context and progress only', () => {
  const { store, session, advance } = setup(2, 'pl_mix');
  const first = session.read();
  assert.deepEqual(first.queueIds, [3, 1, 2]);
  assert.equal(first.trackId, 2);
  assert.equal(first.position, 72);
  assert.equal(first.playlistId, 'pl_mix');
  assert.equal(store.writes, 1);
  advance(1000);
  assert.equal(session.savePosition(2, 80), false);
  assert.equal(store.writes, 1);
  advance(10001);
  assert.equal(session.savePosition(2, 80), true);
  assert.equal(store.writes, 2);
  assert.equal(session.savePosition(999, 90, true), false);
  assert.equal(store.writes, 2);
  assert.equal(session.savePosition(2, NaN, true), false);
  assert.equal(store.writes, 2);
  assert.deepEqual([...store.values.keys()].sort(), [SESSION_KEY, 'gt_play_mode']);
});

test('cold-start restoration loads local blob and title but never plays or writes preferences', async () => {
  const { store, session } = setup();
  const fixture = makeRestoration(session);
  const initialWrites = store.writes;
  assert.equal(await fixture.restore(), true);
  assert.deepEqual(fixture.loaded, [{ id: 2 }]);
  assert.equal(fixture.element.autoplay, false);
  assert.equal(fixture.element.paused, true);
  assert.equal(fixture.state.currentTrackIndex,
    fixture.state.queue.findIndex(track => track.id === 2));
  assert.equal(fixture.state.loadedTrackId, 2);
  assert.equal(fixture.state.restoringSession, true);
  assert.equal(fixture.element.currentTime, 0);
  fixture.element.emit('loadedmetadata');
  assert.equal(fixture.element.currentTime, 72);
  assert.equal(fixture.state.restoringSession, false);
  assert.deepEqual(fixture.seen.titles, ['Track 2']);
  assert.equal(fixture.seen.metadata[0][1].syncAndroid, false);
  assert.equal(store.writes, initialWrites);
});

test('app restart restores saved position and shuffle order with track ID intact', async () => {
  const { store, session, advance } = setup(2, 'pl_mix', [3, 1, 2], 45);
  advance(11000);
  assert.equal(session.savePosition(2, 61), true);
  const newSession = new SessionMemory(() => store);
  const fixture = makeRestoration(newSession, {
    playlists: [{ id: 'pl_mix', tracks: [1, 2, 3] }]
  });
  assert.equal(await fixture.restore(), true);
  fixture.element.emit('loadedmetadata');
  assert.equal(fixture.element.currentTime, 61);
  assert.equal(fixture.playlistUI.currentPlaylistId, 'pl_mix');
  assert.deepEqual(fixture.state.queue.map(track => track.id), [3, 1, 2]);
  assert.equal(fixture.state.queue[fixture.state.currentTrackIndex].id, 2);
  assert.equal(fixture.state.playMode, 2);
});

test('missing or deleted song never chooses another track or starts audio', async () => {
  const { session } = setup(222);
  const fixture = makeRestoration(session);
  assert.equal(await fixture.restore(), false);
  assert.equal(fixture.loaded.length, 0);
  assert.equal(fixture.state.currentTrackIndex, -1);
  assert.equal(fixture.state.loadedTrackId, null);
  assert.equal(fixture.seen.messages.length, 1);
});

test('missing blob retains the saved selection for later recovery and remains paused', async () => {
  const { session, store } = setup();
  const fixture = makeRestoration(session, { missingBlob: true });
  const initialWrites = store.writes;
  assert.equal(await fixture.restore(), false);
  assert.equal(fixture.state.currentTrackIndex, -1);
  assert.equal(fixture.element.paused, true);
  assert.equal(store.writes, initialWrites);
  assert.equal(session.read().trackId, 2);
});

test('missing custom playlist falls back to All Tracks but keeps same valid song', async () => {
  const { session } = setup(2, 'pl_deleted');
  const fixture = makeRestoration(session);
  assert.equal(await fixture.restore(), true);
  assert.equal(fixture.playlistUI.currentPlaylistId, 'all');
  assert.equal(fixture.state.loadedTrackId, 2);
  assert.equal(fixture.state.queue[fixture.state.currentTrackIndex].id, 2);
  assert.equal(fixture.element.paused, true);
});

test('missing track IDs in saved shuffle order are ignored, with new tracks preserved', () => {
  const { session } = setup(2, 'all', [77, 2, 1], 11);
  const fixture = makeRestoration(session);
  fixture.state.restoreSelection(2, [77, 2, 1, 2]);
  assert.deepEqual(fixture.state.queue.map(track => track.id).slice(0, 2), [2, 1]);
  assert.deepEqual(new Set(fixture.state.queue.map(track => track.id)), new Set([1, 2, 3]));
});

test('switching playlists does not replace the current song with another index', () => {
  const { session } = setup();
  const fixture = makeRestoration(session);
  fixture.state.restoreSelection(2, [3, 1, 2]);
  fixture.state.setQueue([{ id: 8 }, { id: 9 }]);
  assert.equal(fixture.state.currentTrackIndex, -1);
  assert.equal(fixture.state.selectedTrackId, 2);
  fixture.state.setQueue([{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.equal(fixture.state.queue[fixture.state.currentTrackIndex].id, 2);
});

test('deleting another song never clears the session; deleting selected ID clears only its preference', () => {
  const { store, session } = setup();
  session.clearForDeletedTrack(999);
  assert.equal(session.read().trackId, 2);
  session.clearForDeletedTrack(2);
  assert.equal(session.read(), null);
  assert.equal(store.getItem('gt_play_mode'), '2');
});

test('malformed sessions and disabled storage cannot break startup', () => {
  const store = createStore();
  store.values.set(SESSION_KEY, '{not json');
  const session = new SessionMemory(() => store);
  assert.equal(session.read(), null);
  assert.equal(session.savePosition(2, 12), false);
  const unavailable = new SessionMemory(() => { throw new Error('storage denied'); });
  assert.equal(unavailable.read(), null);
  assert.equal(unavailable.saveSelection(2, 'all', [{ id: 2 }]), false);
});

test('app launch source never invokes Play while processing pending external audio or restoration', () => {
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('const loadExternalAudio = async');
  const end = app.indexOf('window.handleExternalTrack', start);
  assert.ok(start !== -1 && end > start);
  assert.doesNotMatch(app.slice(start, end), /audioEngine\.play\s*\(/);
  assert.match(app, /await playlistUi\.ready/);
  assert.match(app, /await restoreLastSession\(/);
  assert.match(app, /mediaSessionManager\.updateMetadata\(\{ name: cleanName, blob: null \}, \{ syncAndroid: false \}\)/);
});
