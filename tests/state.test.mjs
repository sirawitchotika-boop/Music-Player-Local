import test from 'node:test';
import assert from 'node:assert/strict';
import { StateManager } from '../js/core/stateManager.js';

test('changing play mode preserves the selected track by ID', () => {
  const store = new Map([['gt_play_mode', '0']]);
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value))
  };
  const state = new StateManager();
  const tracks = [{ id: 101 }, { id: 204 }, { id: 305 }];
  state.setQueue(tracks);
  state.currentTrackIndex = 1;
  state.cyclePlayMode(); // repeat one
  assert.equal(state.queue[state.currentTrackIndex].id, 204);
  state.cyclePlayMode(); // shuffle
  assert.equal(state.queue[state.currentTrackIndex].id, 204);
  assert.equal(store.get('gt_play_mode'), '2');
});
