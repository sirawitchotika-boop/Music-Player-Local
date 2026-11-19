import test from 'node:test';
import assert from 'node:assert/strict';

const snapshots = [];
const actions = new Map();
const positionUpdates = [];
class FakeAudio {
  constructor() {
    this.events = new Map();
    this.paused = true;
    this.ended = false;
    this.seeking = false;
    this.currentTime = 0;
    this.duration = 200;
    this.playbackRate = 1;
    this.src = 'test-audio';
  }
  addEventListener(name, callback) {
    if (!this.events.has(name)) this.events.set(name, []);
    this.events.get(name).push(callback);
  }
  emit(name) {
    for (const callback of this.events.get(name) || []) callback();
  }
  async play() {
    this.paused = false;
    this.emit('play');
    this.emit('playing');
  }
  pause() {
    this.paused = true;
    this.emit('pause');
  }
}
globalThis.Audio = FakeAudio;
globalThis.window = {
  AndroidBridge: { updatePlayback: (...args) => snapshots.push(args) },
  location: { href: 'https://localhost/index.html' },
  dispatchEvent() {}
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { mediaSession: {
    playbackState: 'none',
    metadata: null,
    setActionHandler: (action, handler) => actions.set(action, handler),
    setPositionState: (state) => positionUpdates.push(state)
  } }
});
globalThis.MediaMetadata = class { constructor(data) { Object.assign(this, data); } };

const { audioEngine } = await import('../js/core/audioEngine.js');
const { mediaSessionManager } = await import('../js/core/mediaSessionManager.js');
const { PlayerUI } = await import('../js/ui/playerUI.js');
const { PlaylistUI } = await import('../js/ui/playlistUI.js');
const { storage } = await import('../js/core/storage.js');
const { modalUI } = await import('../js/ui/modalUI.js');
const audio = audioEngine.audioElement;
const flush = () => new Promise(resolve => setTimeout(resolve, 15));
const reset = () => {
  if (mediaSessionManager._syncTimer) clearTimeout(mediaSessionManager._syncTimer);
  mediaSessionManager._syncTimer = null;
  mediaSessionManager._buffering = false;
  mediaSessionManager._lastBridgeSyncAt = 0;
  mediaSessionManager.currentTrack = null;
  audio.paused = true;
  audio.ended = false;
  audio.seeking = false;
  audio.currentTime = 40;
  audio.duration = 200;
  snapshots.length = 0;
  positionUpdates.length = 0;
  navigator.mediaSession.playbackState = 'none';
};
mediaSessionManager.init({ onNext() {}, onPrev() {} });

test('metadata never claims playing when the audio element is paused', () => {
  reset();
  mediaSessionManager.updateMetadata({ name: 'Paused Song.mp3' });
  assert.equal(navigator.mediaSession.playbackState, 'paused');
  assert.equal(snapshots.at(-1)[2], false);
  assert.equal(navigator.mediaSession.metadata.title, 'Paused Song');
});

test('waiting, stalled and seeking freeze native clock; playing resumes it', async () => {
  reset();
  audio.paused = false;
  audio.emit('play');
  audio.emit('playing');
  await flush();
  assert.equal(snapshots.at(-1)[2], true);
  assert.equal(navigator.mediaSession.playbackState, 'playing');

  audio.emit('waiting');
  await flush();
  assert.equal(snapshots.at(-1)[2], false);
  assert.equal(snapshots.at(-1)[3], 40);
  assert.equal(navigator.mediaSession.playbackState, 'paused');

  audio.emit('playing');
  await flush();
  assert.equal(snapshots.at(-1)[2], true);

  audio.emit('stalled');
  await flush();
  assert.equal(snapshots.at(-1)[2], false);

  audio.emit('playing');
  audio.seeking = true;
  audio.currentTime = 65;
  audio.emit('seeking');
  await flush();
  assert.equal(snapshots.at(-1)[2], false);
  assert.equal(snapshots.at(-1)[3], 65);

  audio.seeking = false;
  audio.emit('seeked');
  await new Promise(resolve => setTimeout(resolve, 170));
  assert.equal(snapshots.at(-1)[2], true);
  assert.equal(snapshots.at(-1)[3], 65);

  audio.pause();
  await flush();
  assert.equal(snapshots.at(-1)[2], false);
});

test('periodic timeupdate corrects native position without an always-on interval', async () => {
  reset();
  audio.paused = false;
  audio.emit('playing');
  await flush();
  const sent = snapshots.length;
  audio.currentTime = 44;
  audio.emit('timeupdate');
  await flush();
  assert.equal(snapshots.length, sent, 'frequent timeupdates are throttled');
  mediaSessionManager._lastBridgeSyncAt = Date.now() - 2500;
  audio.currentTime = 47;
  audio.emit('timeupdate');
  await flush();
  assert.equal(snapshots.at(-1)[3], 47);
});

test('native pause is immediate and reconnection alone does not issue play', async () => {
  reset();
  const originalPause = audioEngine.pause;
  const originalPlay = audioEngine.play;
  const pauses = [];
  let plays = 0;
  audioEngine.pause = (immediate) => { pauses.push(immediate); audio.pause(); };
  audioEngine.play = async () => { plays++; };
  try {
    audio.paused = false;
    window.mediaControlAction('pause');
    assert.deepEqual(pauses, [true]);
    assert.equal(plays, 0);
    await flush();
    assert.equal(snapshots.at(-1)[2], false);
    window.mediaControlAction('pause'); // no automatic resume on a second pause
    assert.equal(plays, 0);
  } finally {
    audioEngine.pause = originalPause;
    audioEngine.play = originalPlay;
  }
});

test('audio play/load failures reject, rather than falsely succeeding', async () => {
  reset();
  const originalInit = audioEngine._initAudioContext;
  const originalPlay = audio.play;
  audioEngine._initAudioContext = () => {};
  audio.play = async () => { throw new Error('Device refused audio'); };
  try {
    await assert.rejects(audioEngine.play(), /Device refused audio/);
    await assert.rejects(audioEngine.load({ wrong: 'audio' }), /Unsupported audio source/);
  } finally {
    audioEngine._initAudioContext = originalInit;
    audio.play = originalPlay;
  }
});

test('immediate audio pause skips the fade delay on an interruption', async () => {
  reset();
  audio.paused = false;
  const originalGain = audioEngine.gainNode;
  const originalCtx = audioEngine.audioCtx;
  const calls = [];
  audioEngine.audioCtx = { state: 'running', currentTime: 10 };
  audioEngine.gainNode = { gain: {
    value: 1,
    cancelScheduledValues: () => calls.push('cancel'),
    setValueAtTime: () => calls.push('reset'),
    linearRampToValueAtTime: () => calls.push('fade')
  } };
  try {
    const promise = audioEngine.pause(true);
    assert.equal(audio.paused, true);
    await promise;
    assert.ok(!calls.includes('fade'));
  } finally {
    audioEngine.gainNode = originalGain;
    audioEngine.audioCtx = originalCtx;
  }
});

test('playback button reports a failed start instead of pretending to play', async () => {
  reset();
  const ui = Object.create(PlayerUI.prototype);
  const messages = [];
  ui.audioEl = { src: 'audio', paused: true };
  ui.audio = { play: async () => { throw new Error('Play rejected'); } };
  ui.showToast = (msg) => messages.push(msg);
  await ui.togglePlay();
  assert.equal(messages.length, 1);
  assert.ok(messages[0].includes('ERROR'));
});

test('failed track start does not report success or overwrite media metadata', async () => {
  reset();
  const originalGet = storage.getTrackBlob;
  const originalToast = modalUI.showToast;
  const originalMetadata = mediaSessionManager.updateMetadata;
  let metadataCalls = 0;
  let errorCount = 0;
  storage.getTrackBlob = async () => ({ id: 7 });
  mediaSessionManager.updateMetadata = () => { metadataCalls++; };
  modalUI.showToast = (msg) => { if (msg.includes('ERROR')) errorCount++; };
  try {
    const ui = Object.create(PlaylistUI.prototype);
    ui.state = { currentTrackIndex: -1, queue: [{ id: 7 }] };
    ui.audio = {
      load: async () => {},
      play: async () => { throw new Error('Playback rejected'); }
    };
    const result = await ui.playTrack({ id: 7, name: 'Test.mp3' });
    assert.equal(result, false);
    assert.equal(metadataCalls, 0);
    assert.equal(errorCount, 1);
  } finally {
    storage.getTrackBlob = originalGet;
    modalUI.showToast = originalToast;
    mediaSessionManager.updateMetadata = originalMetadata;
  }
});
