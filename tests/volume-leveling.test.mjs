import test from 'node:test';
import assert from 'node:assert/strict';
import {
    computeLoudnessFromChannels,
    computeSafeGainLinear,
    isValidLoudness,
    LoudnessCoordinator,
    PEAK_CEILING_LINEAR,
    TARGET_LOUDNESS_DB,
    dbToLinear
} from '../js/core/loudnessAnalyzer.js';
import { storage } from '../js/core/storage.js';
import { MemoryDB } from './memory-db.mjs';

class FakeAudioParam {
    constructor(value = 0) { this.value = value; this.events = []; }
    cancelScheduledValues(time) { this.events.push(['cancel', time]); }
    setValueAtTime(value, time) {
        this.value = value;
        this.events.push(['set', value, time]);
    }
    linearRampToValueAtTime(value, time) {
        this.value = value;
        this.events.push(['ramp', value, time]);
    }
}

class FakeNode {
    constructor() { this.connections = []; }
    connect(node) { this.connections.push(node); }
    disconnect() { this.connections = []; }
}

class FakeFilter extends FakeNode {
    constructor() {
        super();
        this.type = '';
        this.frequency = { value: 0 };
        this.Q = { value: 1 };
        this.gain = new FakeAudioParam(0);
    }
}

class FakeGain extends FakeNode {
    constructor() {
        super();
        this.gain = new FakeAudioParam(1);
    }
}

class FakeAudioContext {
    constructor() {
        this.state = 'running';
        this.currentTime = 5;
        this.destination = new FakeNode();
        this.sourceNode = new FakeNode();
        this.gains = [];
    }
    createMediaElementSource() { return this.sourceNode; }
    createGain() {
        const gain = new FakeGain();
        this.gains.push(gain);
        return gain;
    }
    createBiquadFilter() { return new FakeFilter(); }
}

class FakeAudio {
    constructor() {
        this.paused = true;
        this.volume = 1;
        this.playCalls = 0;
    }
    addEventListener() {}
    async play() { this.playCalls++; this.paused = false; }
    pause() { this.paused = true; }
}

class FakeElement {
    constructor() {
        this.value = '0';
        this.checked = false;
        this.disabled = false;
        this.textContent = '';
        this.listeners = new Map();
        const classes = new Set(['hidden']);
        this.classList = {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name)
        };
    }
    addEventListener(name, cb) {
        if (!this.listeners.has(name)) this.listeners.set(name, []);
        this.listeners.get(name).push(cb);
    }
    emit(name, extra = {}) {
        for (const cb of this.listeners.get(name) || []) {
            cb({ target: this, ...extra });
        }
    }
    click() { this.emit('click'); }
}

const elements = new Map();
const resetElements = () => {
    elements.clear();
    for (const id of [
        'eq-modal', 'eq-btn', 'close-eq-btn', 'eq-reset-btn',
        'eq-bass', 'eq-mid', 'eq-treble',
        'eq-bass-value', 'eq-mid-value', 'eq-treble-value',
        'eq-leveling-toggle', 'analyze-library-btn', 'analyze-library-status'
    ]) elements.set(id, new FakeElement());
};
resetElements();

const stored = new Map();
globalThis.Audio = FakeAudio;
globalThis.window = { AudioContext: FakeAudioContext, addEventListener() {} };
globalThis.document = { getElementById: id => elements.get(id) ?? null };
globalThis.localStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, String(value))
};

const { audioEngine } = await import('../js/core/audioEngine.js');
const { EqualizerUI } = await import('../js/ui/eqUI.js');

const makeSine = (amplitude, length = 44100) => {
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        data[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / 44100);
    }
    return data;
};

test('loudness analyzer lowers loud tracks and boosts quiet tracks toward the same loudness', () => {
    const loud = computeLoudnessFromChannels([makeSine(0.8)], 44100);
    const quiet = computeLoudnessFromChannels([makeSine(0.1)], 44100);

    assert.ok(isValidLoudness(loud));
    assert.ok(isValidLoudness(quiet));
    assert.ok(loud.gainDb < 0, 'Loud track should be attenuated');
    assert.ok(quiet.gainDb > 0, 'Quiet track should be boosted');

    const loudAfter = loud.loudnessDb + loud.gainDb;
    const quietAfter = quiet.loudnessDb + quiet.gainDb;
    assert.ok(Math.abs(loudAfter - TARGET_LOUDNESS_DB) < 0.25);
    assert.ok(Math.abs(quietAfter - TARGET_LOUDNESS_DB) < 0.25);
});

test('peak safety cap prevents boosting a quiet dynamic track into clipping', () => {
    const channel = makeSine(0.05, 44100);
    channel[1000] = 0.85; // High transient peak in an otherwise quiet song

    const measured = computeLoudnessFromChannels([channel], 44100);
    assert.ok(isValidLoudness(measured));
    const gainLinear = computeSafeGainLinear(measured);
    assert.ok(gainLinear * measured.peakLinear <= PEAK_CEILING_LINEAR + 1e-4);
});

test('silence gate ignores long dead silence at the start and end of downloaded tracks', () => {
    const active = makeSine(0.5, 44100);
    const padded = new Float32Array(44100 * 5);
    padded.set(active, 44100 * 2);

    const direct = computeLoudnessFromChannels([active], 44100);
    const withSilence = computeLoudnessFromChannels([padded], 44100);
    assert.ok(Math.abs(direct.loudnessDb - withSilence.loudnessDb) < 0.5);
});

test('storage.updateTrackLoudness caches metadata without touching audio blobs or missing tracks', async () => {
    const db = new MemoryDB();
    storage.db = db;
    const blob = { name: 'Termux Track.mp3', type: 'audio/mpeg', size: 2048 };
    const { processedTracks } = await storage.saveFiles([blob]);
    const id = processedTracks[0].track.id;

    const loudness = computeLoudnessFromChannels([makeSine(0.6)], 44100);
    const ok = await storage.updateTrackLoudness(id, loudness);
    assert.equal(ok, true);

    const [savedTrack] = await storage.getAllTracks();
    assert.deepEqual(savedTrack.loudness, loudness);
    assert.strictEqual(await storage.getTrackBlob(id), blob);

    const missing = await storage.updateTrackLoudness(999999, loudness);
    assert.equal(missing, false);
    assert.equal(db.stores.get('audioTracks').size, 1);
});

test('AudioEngine keeps leveling unity when OFF, applies safe gain when ON, and never alters fade gain', () => {
    audioEngine.isAudioCtxInit = false;
    audioEngine.setVolumeLeveling(false, { immediate: true });
    audioEngine.setTrackLoudness(null, { immediate: true });
    audioEngine._initAudioContext();

    const loud = computeLoudnessFromChannels([makeSine(0.8)], 44100);
    audioEngine.setTrackLoudness(loud, { immediate: true });
    assert.equal(audioEngine.getEffectiveLevelingGain(), 1.0);
    assert.equal(audioEngine.levelingGainNode.gain.value, 1.0);

    audioEngine.setVolumeLeveling(true);
    const expected = dbToLinear(loud.gainDb);
    assert.ok(Math.abs(audioEngine.getEffectiveLevelingGain() - expected) < 0.02);
    assert.ok(audioEngine.levelingGainNode.gain.events.some(e => e[0] === 'ramp'));
    assert.equal(audioEngine.gainNode.gain.value, 1);

    audioEngine.setVolumeLeveling(false);
    assert.equal(audioEngine.getEffectiveLevelingGain(), 1.0);
});

test('LoudnessCoordinator deduplicates concurrent analysis and skips already-measured songs', async () => {
    const db = new MemoryDB();
    storage.db = db;
    const fileA = { name: 'A.mp3', type: 'audio/mpeg', size: 100 };
    const fileB = { name: 'B.mp3', type: 'audio/mpeg', size: 200 };
    const { processedTracks } = await storage.saveFiles([fileA, fileB]);
    const trackA = processedTracks[0].track;

    let calls = 0;
    const coordinator = new LoudnessCoordinator({
        analyzeBlob: async () => {
            calls++;
            return computeLoudnessFromChannels([makeSine(0.5)], 44100);
        }
    });

    const [first, second] = await Promise.all([
        coordinator.ensureTrackLoudness(trackA, { storage }),
        coordinator.ensureTrackLoudness(trackA, { storage })
    ]);
    assert.deepEqual(first, second);
    assert.equal(calls, 1);

    const scanResult = await coordinator.analyzeLibrary({ storage });
    assert.equal(scanResult.total, 2);
    assert.equal(scanResult.skipped, 1);
    assert.equal(scanResult.analyzed, 1);
    assert.equal(calls, 2);
});

test('EqualizerUI defaults leveling OFF on update, persists toggle, and analyzes library without playing', async () => {
    resetElements();
    stored.clear();
    stored.set('gt_soundmaster_equalizer', JSON.stringify({ bass: 3, mid: 0, treble: -2 }));

    const db = new MemoryDB();
    storage.db = db;
    const file = { name: 'Quiet.mp3', type: 'audio/mpeg', size: 150 };
    const { processedTracks } = await storage.saveFiles([file]);
    const trackId = processedTracks[0].track.id;

    const measured = computeLoudnessFromChannels([makeSine(0.15)], 44100);
    const coordinator = new LoudnessCoordinator({
        analyzeBlob: async () => measured
    });

    const state = { loadedTrackId: trackId, queue: [{ id: trackId, loudness: null }], originalQueue: [] };
    const ui = new EqualizerUI({ coordinator, storageClient: storage });
    ui.init({ state });

    assert.deepEqual(ui.values, { bass: 3, mid: 0, treble: -2 });
    assert.equal(ui.volumeLevelingEnabled, false);
    assert.equal(elements.get('eq-leveling-toggle').checked, false);
    assert.equal(audioEngine.getVolumeLevelingEnabled(), false);

    elements.get('eq-leveling-toggle').checked = true;
    elements.get('eq-leveling-toggle').emit('change');
    assert.equal(audioEngine.getVolumeLevelingEnabled(), true);
    assert.equal(stored.get('gt_soundmaster_leveling'), 'true');

    const result = await ui.analyzeLibrary();
    assert.equal(result.analyzed, 1);
    assert.deepEqual(state.queue[0].loudness, measured);
    assert.equal(audioEngine.audioElement.playCalls, 0);
    assert.match(elements.get('analyze-library-status').textContent, /Measured 1 new song/);
});

test('AudioEngine falls back cleanly to EQ and 35ms fade if leveling routing fails', async () => {
    const originalContext = window.AudioContext;
    class BrokenLevelingContext extends FakeAudioContext {
        createGain() {
            const gain = super.createGain();
            if (this.gains.length === 1) {
                gain.connect = () => { throw new Error('Simulated leveling route failure'); };
            }
            return gain;
        }
    }

    window.AudioContext = BrokenLevelingContext;
    audioEngine.isAudioCtxInit = false;
    audioEngine.levelingGainNode = null;
    try {
        audioEngine._initAudioContext();
        assert.equal(audioEngine.isAudioCtxInit, true);
        assert.equal(audioEngine.levelingGainNode, null);
        assert.deepEqual(audioEngine.eqFilters.treble.connections, [audioEngine.gainNode]);
        assert.deepEqual(audioEngine.gainNode.connections, [audioEngine.audioCtx.destination]);
    } finally {
        window.AudioContext = originalContext;
        audioEngine.isAudioCtxInit = false;
    }
});
