import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  loadPlaylists,
  savePlaylists,
  loadLikedTracks,
  saveLikedTracks,
  loadPlayMode,
  savePlayMode
} from '../js/core/preferences.js';
import { StateManager } from '../js/core/stateManager.js';
import { storage } from '../js/core/storage.js';
import { MemoryDB } from './memory-db.mjs';

class FakeElement {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.textContent = '';
    this.rawHTML = '';
    this.selectors = new Map();
    this.listeners = new Map();
    const classes = new Set(['hidden']);
    this.classList = {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name)
    };
  }
  set innerHTML(val) {
    this.rawHTML = val;
    this.children = [];
    this.selectors.clear();
  }
  get innerHTML() { return this.rawHTML; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(name, cb) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(cb);
  }
  click() {
    for (const cb of this.listeners.get('click') || []) cb({ target: this });
  }
  querySelector(selector) {
    if (!this.selectors.has(selector)) this.selectors.set(selector, new FakeElement(selector));
    return this.selectors.get(selector);
  }
}

test('preferences layer recovers safely from corrupted JSON, wrong types, and throwing storage', () => {
  const brokenStore = {
    getItem() { throw new Error('Storage disabled'); },
    setItem() { throw new Error('QuotaExceededError'); }
  };
  assert.deepEqual(loadPlaylists(brokenStore), []);
  assert.deepEqual(loadLikedTracks(brokenStore), []);
  assert.equal(loadPlayMode(brokenStore), 2);
  assert.equal(savePlaylists([], brokenStore), false);
  assert.equal(saveLikedTracks([], brokenStore), false);
  assert.equal(savePlayMode(1, brokenStore), false);

  const map = new Map([
    ['gt_playlists', '{corrupted-json'],
    ['gt_liked_tracks', JSON.stringify([42, 'bad', -5, 42, 7])],
    ['gt_play_mode', '999']
  ]);
  const corruptStore = {
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v))
  };
  assert.deepEqual(loadPlaylists(corruptStore), []);
  assert.deepEqual(loadLikedTracks(corruptStore), [42, 7]);
  assert.equal(loadPlayMode(corruptStore), 2);

  map.set('gt_play_mode', 'NaN');
  assert.equal(loadPlayMode(corruptStore), 2);

  savePlayMode(1, corruptStore);
  assert.equal(loadPlayMode(corruptStore), 1);
});

test('StateManager initializes cleanly even when gt_play_mode is corrupted in localStorage', () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => 'corrupt-value',
    setItem() {}
  };
  try {
    const state = new StateManager();
    assert.equal(state.playMode, 2);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});

test('PlaylistUI.handleSearch filters in memory without re-reading IndexedDB or reshuffling Shuffle queue', async () => {
  const originalDoc = globalThis.document;
  const originalWin = globalThis.window;
  const originalAudio = globalThis.Audio;
  const originalNav = globalThis.navigator;
  const container = new FakeElement();

  globalThis.document = {
    createElement: tag => new FakeElement(tag),
    getElementById: () => null
  };
  globalThis.window = { dispatchEvent() {}, addEventListener() {} };
  globalThis.Audio = class { addEventListener() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

  try {
    const { PlaylistUI } = await import('../js/ui/playlistUI.js');
    const ui = Object.create(PlaylistUI.prototype);
    let dbReads = 0;
    let queueSets = 0;

    const originalGetAll = storage.getAllTracks;
    storage.getAllTracks = async () => {
      dbReads++;
      return [
        { id: 1, name: 'Midnight City.mp3' },
        { id: 2, name: 'Acoustic Sunrise.mp3' },
        { id: 3, name: 'Midnight Rain.mp3' }
      ];
    };

    try {
      const state = new StateManager();
      const origSetQueue = state.setQueue.bind(state);
      state.setQueue = (tracks) => {
        queueSets++;
        return origSetQueue(tracks);
      };

      ui.state = state;
      ui.playlistContainer = container;
      ui.currentPlaylistId = 'all';
      ui.playlists = [];
      ui.likedTracks = [];
      ui.updateActiveHighlight = () => {};
      ui.playTrack = () => {};
      ui.deleteTrack = () => {};

      await ui.loadPlaylist();
      assert.equal(dbReads, 1);
      assert.equal(queueSets, 1);
      const initialShuffleOrder = state.queue.map(t => t.id);

      // Typing into search must filter in memory without DB reads or reshuffling.
      ui.handleSearch({ target: { value: 'mid' } });
      ui.handleSearch({ target: { value: 'midnight' } });
      ui.handleSearch({ target: { value: 'no-such-track' } });
      ui.handleSearch({ target: { value: '' } });

      assert.equal(dbReads, 1, 'Search must not re-query IndexedDB');
      assert.equal(queueSets, 1, 'Search must not call setQueue or reshuffle Shuffle');
      assert.deepEqual(state.queue.map(t => t.id), initialShuffleOrder);
      assert.equal(container.children.length, 3);
    } finally {
      storage.getAllTracks = originalGetAll;
    }
  } finally {
    globalThis.document = originalDoc;
    globalThis.window = originalWin;
    globalThis.Audio = originalAudio;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNav });
  }
});

test('HelpUI.init is idempotent and never attaches duplicate click handlers', async () => {
  const modal = new FakeElement();
  const openBtn = new FakeElement('button');
  const closeBtn = new FakeElement('button');
  const map = new Map([
    ['help-modal', modal],
    ['help-btn', openBtn],
    ['close-help-btn', closeBtn]
  ]);

  const originalDoc = globalThis.document;
  const originalWin = globalThis.window;
  globalThis.document = { getElementById: id => map.get(id) ?? null };
  globalThis.window = { addEventListener() {} };

  try {
    const { HelpUI } = await import('../js/ui/helpUI.js');
    const ui = new HelpUI();
    ui.init();
    ui.init();

    assert.equal(openBtn.listeners.get('click')?.length, 1);
    assert.equal(closeBtn.listeners.get('click')?.length, 1);

    openBtn.click();
    assert.equal(modal.classList.contains('hidden'), false);
    closeBtn.click();
    assert.equal(modal.classList.contains('hidden'), true);
  } finally {
    globalThis.document = originalDoc;
    globalThis.window = originalWin;
  }
});

test('storage error messages are clear English with no leftover Thai strings', async () => {
  const src = readFileSync(new URL('../js/core/storage.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /[\u0E00-\u0E7F]/);

  const db = new MemoryDB();
  storage.db = db;
  await assert.rejects(
    storage.saveFiles([{ name: 'readme.txt', type: 'text/plain', size: 20 }]),
    /No supported audio files were selected/
  );
});
