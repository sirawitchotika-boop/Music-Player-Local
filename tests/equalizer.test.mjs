import test from 'node:test';
import assert from 'node:assert/strict';

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
        this.currentTime = 10;
        this.destination = new FakeNode();
        this.sourceNode = new FakeNode();
        this.filters = [];
    }
    createMediaElementSource() { return this.sourceNode; }
    createGain() {
        this.gainNode = new FakeGain();
        return this.gainNode;
    }
    createBiquadFilter() {
        const filter = new FakeFilter();
        this.filters.push(filter);
        return filter;
    }
}

class FakeAudio {
    constructor() {
        this.paused = true;
        this.volume = 1;
        this.playCalls = 0;
        this.listeners = new Map();
    }
    addEventListener(name, callback) {
        if (!this.listeners.has(name)) this.listeners.set(name, []);
        this.listeners.get(name).push(callback);
    }
    async play() {
        this.playCalls++;
        this.paused = false;
    }
    pause() { this.paused = true; }
}

class FakeElement {
    constructor(value = '') {
        this.value = value;
        this.textContent = '';
        this.listeners = new Map();
        const classes = new Set(['hidden']);
        this.classList = {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name)
        };
    }
    addEventListener(name, callback) {
        if (!this.listeners.has(name)) this.listeners.set(name, []);
        this.listeners.get(name).push(callback);
    }
    emit(name, extra = {}) {
        for (const callback of this.listeners.get(name) || []) {
            callback({ target: this, ...extra });
        }
    }
    click() { this.emit('click'); }
}

const elements = new Map();
const makeElements = () => {
    elements.clear();
    for (const id of [
        'eq-modal', 'eq-btn', 'close-eq-btn', 'eq-reset-btn',
        'eq-bass', 'eq-mid', 'eq-treble',
        'eq-bass-value', 'eq-mid-value', 'eq-treble-value'
    ]) elements.set(id, new FakeElement());
    return elements;
};
makeElements();

const storedValues = new Map();
globalThis.Audio = FakeAudio;
globalThis.window = { AudioContext: FakeAudioContext, addEventListener() {} };
globalThis.document = { getElementById: id => elements.get(id) ?? null };
globalThis.localStorage = {
    getItem: key => storedValues.get(key) ?? null,
    setItem: (key, value) => storedValues.set(key, String(value))
};

const { audioEngine } = await import('../js/core/audioEngine.js');
const { EqualizerUI } = await import('../js/ui/eqUI.js');

test('three simple EQ filters sit before the existing playback fade gain', () => {
    audioEngine._initAudioContext();

    const [bass, mid, treble] = audioEngine.audioCtx.filters;
    assert.equal(bass.type, 'lowshelf');
    assert.equal(bass.frequency.value, 120);
    assert.equal(mid.type, 'peaking');
    assert.equal(mid.frequency.value, 1000);
    assert.equal(mid.Q.value, 0.7);
    assert.equal(treble.type, 'highshelf');
    assert.equal(treble.frequency.value, 8000);

    assert.deepEqual(audioEngine.audioCtx.sourceNode.connections, [bass]);
    assert.deepEqual(bass.connections, [mid]);
    assert.deepEqual(mid.connections, [treble]);
    assert.deepEqual(treble.connections, [audioEngine.gainNode]);
    assert.deepEqual(audioEngine.gainNode.connections, [audioEngine.audioCtx.destination]);
});

test('EQ changes are limited to plus or minus 6 dB and leave the fade gain alone', () => {
    audioEngine.resetEqualizer();
    const settings = audioEngine.setEqualizer({ bass: 9, mid: -3, treble: -20 });

    assert.deepEqual(settings, { bass: 6, mid: -3, treble: -6 });
    assert.equal(audioEngine.eqFilters.bass.gain.value, 6);
    assert.equal(audioEngine.eqFilters.mid.gain.value, -3);
    assert.equal(audioEngine.eqFilters.treble.gain.value, -6);
    assert.equal(audioEngine.gainNode.gain.value, 1);
    assert.ok(audioEngine.eqFilters.bass.gain.events.some(event => event[0] === 'ramp'));

    assert.deepEqual(audioEngine.resetEqualizer(), { bass: 0, mid: 0, treble: 0 });
    assert.equal(audioEngine.gainNode.gain.value, 1);
});

test('EQ panel restores, saves and resets settings without starting playback', () => {
    makeElements();
    storedValues.set('gt_soundmaster_equalizer', JSON.stringify({ bass: 2, mid: -1, treble: 4 }));

    const ui = new EqualizerUI();
    ui.init();

    assert.equal(elements.get('eq-bass').value, '2');
    assert.equal(elements.get('eq-mid').value, '-1');
    assert.equal(elements.get('eq-treble').value, '4');
    assert.equal(elements.get('eq-bass-value').textContent, '+2 dB');
    assert.deepEqual(audioEngine.getEqualizerSettings(), { bass: 2, mid: -1, treble: 4 });
    assert.equal(audioEngine.audioElement.playCalls, 0);

    elements.get('eq-btn').click();
    assert.equal(elements.get('eq-modal').classList.contains('hidden'), false);
    elements.get('close-eq-btn').click();
    assert.equal(elements.get('eq-modal').classList.contains('hidden'), true);

    elements.get('eq-treble').value = '6';
    elements.get('eq-treble').emit('input');
    assert.equal(audioEngine.getEqualizerSettings().treble, 6);
    assert.equal(JSON.parse(storedValues.get('gt_soundmaster_equalizer')).treble, 6);

    elements.get('eq-reset-btn').click();
    assert.deepEqual(audioEngine.getEqualizerSettings(), { bass: 0, mid: 0, treble: 0 });
    assert.deepEqual(JSON.parse(storedValues.get('gt_soundmaster_equalizer')), { bass: 0, mid: 0, treble: 0 });
    assert.equal(audioEngine.audioElement.playCalls, 0);
});

test('invalid saved EQ values are safely clamped', () => {
    makeElements();
    storedValues.set('gt_soundmaster_equalizer', JSON.stringify({ bass: 99, mid: 'bad', treble: -4 }));

    const ui = new EqualizerUI();
    ui.init();

    assert.deepEqual(ui.values, { bass: 6, mid: 0, treble: -4 });
});

class FakeFlatAudioContext extends FakeAudioContext {
    constructor() {
        super();
        this.createBiquadFilter = undefined;
    }
}

test('falls back to the original flat audio path if EQ filters are unavailable', () => {
    const originalContext = window.AudioContext;
    window.AudioContext = FakeFlatAudioContext;
    audioEngine.isAudioCtxInit = false;
    audioEngine.eqFilters = null;

    audioEngine._initAudioContext();

    assert.equal(audioEngine.eqFilters, null);
    assert.deepEqual(audioEngine.audioCtx.sourceNode.connections, [audioEngine.gainNode]);
    assert.deepEqual(audioEngine.gainNode.connections, [audioEngine.audioCtx.destination]);
    window.AudioContext = originalContext;
});
