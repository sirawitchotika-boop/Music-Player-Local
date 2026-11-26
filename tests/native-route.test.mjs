import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

class FakeAudio {
  constructor() {
    this.events = new Map();
    this.paused = true;
    this.ended = false;
    this.seeking = false;
    this.src = 'disposable-test-audio';
    this.currentTime = 12;
    this.duration = 180;
    this.playbackRate = 1;
    this.playCalls = 0;
  }
  addEventListener(name, handler) {
    if (!this.events.has(name)) this.events.set(name, []);
    this.events.get(name).push(handler);
  }
  emit(name) {
    for (const handler of this.events.get(name) || []) handler();
  }
  async play() {
    this.playCalls++;
    this.paused = false;
    this.emit('play');
    this.emit('playing');
  }
  pause() {
    this.paused = true;
    this.emit('pause');
  }
}

const route = { issued: 0, confirmed: 0, acknowledged: 0, snapshots: [] };
const bridge = {
  getPendingRoutePauseSequence: () =>
    route.issued > route.acknowledged ? route.issued : 0,
  acknowledgeRoutePause(sequence) {
    if (sequence > route.confirmed && sequence <= route.issued) {
      route.confirmed = sequence;
    }
  },
  updatePlayback(...args) {
    route.snapshots.push(args);
    // The real service commits acknowledgement on its first confirmed
    // paused WebView snapshot, never on a stale "playing" report.
    if (!args[2] && route.confirmed >= route.issued) {
      route.acknowledged = route.issued;
    }
  }
};
globalThis.Audio = FakeAudio;
globalThis.window = {
  AndroidBridge: bridge,
  location: { href: 'https://localhost/index.html' }
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true, value: { mediaSession: {
    playbackState: 'none',
    setActionHandler() {},
    setPositionState() {}
  } }
});
const { audioEngine } = await import('../js/core/audioEngine.js');
const { mediaSessionManager } = await import('../js/core/mediaSessionManager.js');
const element = audioEngine.audioElement;
const flush = () => new Promise(resolve => setTimeout(resolve, 15));
const reset = () => {
  route.issued = route.confirmed = route.acknowledged = 0;
  route.snapshots = [];
  element.paused = true;
  element.playCalls = 0;
  element.ended = false;
  element.currentTime = 12;
  window.__gtPendingNativeRoutePause = false;
  if (mediaSessionManager._syncTimer) clearTimeout(mediaSessionManager._syncTimer);
  mediaSessionManager._syncTimer = null;
  mediaSessionManager._buffering = false;
};
mediaSessionManager.init({ onNext() {}, onPrev() {} });

test('native route pause stops audio, acknowledges only after pause, and never calls Play', async () => {
  reset();
  route.issued = 1;
  element.paused = false;
  window.gtHandleNativeRoutePause();
  assert.equal(element.paused, true);
  await flush();
  assert.equal(route.confirmed, 1);
  assert.equal(route.acknowledged, 1);
  assert.equal(element.playCalls, 0);
  assert.equal(route.snapshots.at(-1)[2], false);
});

test('route pause pending on WebView initialization is applied without autoplay', async () => {
  reset();
  route.issued = 2;
  element.paused = false;
  window.__gtPendingNativeRoutePause = true;
  mediaSessionManager.init({ onNext() {}, onPrev() {} });
  assert.equal(element.paused, true);
  await flush();
  assert.equal(route.acknowledged, 2);
  assert.equal(element.playCalls, 0);
});

test('reconnected route by itself does not play; manual Play works after acknowledgement', async () => {
  reset();
  route.issued = 3;
  element.paused = false;
  await window.gtHandleNativeRoutePause();
  await flush();
  assert.equal(route.acknowledged, 3);
  // There is deliberately no native reconnect handler or play call.
  await flush();
  assert.equal(element.paused, true);
  assert.equal(element.playCalls, 0);
  const originalInit = audioEngine._initAudioContext;
  audioEngine._initAudioContext = () => {};
  try {
    window.mediaControlAction('play');
    await flush();
    assert.equal(element.paused, false);
    assert.equal(element.playCalls, 1);
  } finally {
    audioEngine._initAudioContext = originalInit;
  }
});

test('old route-pause notification is ignored after its sequence is already acknowledged', async () => {
  reset();
  route.issued = route.confirmed = route.acknowledged = 4;
  element.paused = false;
  window.__gtPendingNativeRoutePause = true;
  await window.gtHandleNativeRoutePause();
  assert.equal(element.paused, false);
  assert.equal(window.__gtPendingNativeRoutePause, false);
});

test('a pending Play cannot start after a route-loss pause', async () => {
  reset();
  route.issued = 5;
  const originalInit = audioEngine._initAudioContext;
  const originalPlay = element.play;
  let completePlay;
  audioEngine._initAudioContext = () => {};
  element.play = () => new Promise(resolve => {
    completePlay = () => {
      element.paused = false;
      resolve();
    };
  });
  try {
    const starting = audioEngine.play();
    assert.equal(typeof completePlay, 'function');
    await window.gtHandleNativeRoutePause();
    assert.equal(element.paused, true);
    completePlay();
    await assert.rejects(starting, { name: 'AbortError' });
    assert.equal(element.paused, true);
    await flush();
    assert.equal(route.snapshots.at(-1)[2], false);
  } finally {
    audioEngine._initAudioContext = originalInit;
    element.play = originalPlay;
  }
});

test('a late AudioContext resume cannot start playback after the interruption', async () => {
  reset();
  const originalInit = audioEngine._initAudioContext;
  const originalCtx = audioEngine.audioCtx;
  const originalPlay = element.play;
  let completeResume;
  let started = 0;
  audioEngine._initAudioContext = () => {};
  audioEngine.audioCtx = {
    state: 'suspended',
    resume: () => new Promise(resolve => { completeResume = resolve; })
  };
  element.play = async () => { started++; };
  try {
    const starting = audioEngine.play();
    assert.equal(typeof completeResume, 'function');
    await audioEngine.pause(true);
    completeResume();
    await assert.rejects(starting, { name: 'AbortError' });
    assert.equal(started, 0);
  } finally {
    audioEngine._initAudioContext = originalInit;
    audioEngine.audioCtx = originalCtx;
    element.play = originalPlay;
  }
});

test('native build source registers route loss and retains a pending pause until paused acknowledgement', () => {
  const workflow = readFileSync(new URL('../.github/workflows/build-apk.yml', import.meta.url), 'utf8');
  const service = readFileSync(
    new URL('../android-native/java/com/gt/soundmaster/MediaPlaybackService.java', import.meta.url),
    'utf8'
  );
  const activity = readFileSync(
    new URL('../android-native/java/com/gt/soundmaster/MainActivity.java', import.meta.url),
    'utf8'
  );
  const nativeCombined = service + '\n' + activity;

  assert.match(service, /ACTION_AUDIO_BECOMING_NOISY\.equals\(action\)\) \{\s+markPendingRoutePause\(\);\s+pauseNativeState\(\);/);
  assert.match(service, /if \(hasPendingRoutePause\(\)\) \{/);
  assert.match(service, /if \(!isPlaying && confirmed >= pending\)/);
  assert.match(service, /else if \(isPlaying\) \{\s+\/\/ Ignore any in-flight pre-disconnect Play snapshot\.\s+isPlaying = false;/);
  assert.match(activity, /public int getPendingRoutePauseSequence\(\)/);
  assert.match(activity, /public void acknowledgeRoutePause\(int sequence\)/);
  assert.match(activity, /public void onResume\(\)/);
  assert.match(service, /MainActivity\.sendJsCommandToWebview\(/);
  assert.ok(!nativeCombined.includes('ACTION_ACL_CONNECTED'));
  assert.ok(!nativeCombined.includes('ACTION_HEADSET_PLUG'));
  assert.match(workflow, /npx cap init "GT SoundMaster" "com\.gt\.soundmaster"/);
  assert.match(workflow, /android-native\/java\/com\/gt\/soundmaster\/MediaPlaybackService\.java/);
  assert.match(workflow, /android-native\/java\/com\/gt\/soundmaster\/MainActivity\.java/);
});
