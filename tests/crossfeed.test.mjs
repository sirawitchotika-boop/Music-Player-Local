import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CROSSFEED_PRESETS,
    normalizeCrossfeedMode,
    createCrossfeedStage
} from '../js/core/crossfeedNode.js';

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
    constructor() { this.connections = []; this.disconnected = false; }
    connect(node, outputIndex = 0, inputIndex = 0) {
        this.connections.push({ node, outputIndex, inputIndex });
    }
    disconnect() {
        this.disconnected = true;
        this.connections = [];
    }
}

class FakeGain extends FakeNode {
    constructor() { super(); this.gain = new FakeAudioParam(1); }
}

class FakeFilter extends FakeNode {
    constructor() {
        super();
        this.type = '';
        this.frequency = new FakeAudioParam(1000);
        this.Q = { value: 1 };
        this.gain = new FakeAudioParam(0);
    }
}

class FakeDelay extends FakeNode {
    constructor(maxDelayTime = 1) {
        super();
        this.maxDelayTime = maxDelayTime;
        this.delayTime = new FakeAudioParam(0);
    }
}

class StereoAudioContext {
    constructor() {
        this.state = 'running';
        this.currentTime = 12;
        this.destination = new FakeNode();
        this.sourceNode = new FakeNode();
        this.filters = [];
    }
    createMediaElementSource() { return this.sourceNode; }
    createGain() { return new FakeGain(); }
    createBiquadFilter() {
        const f = new FakeFilter();
        this.filters.push(f);
        return f;
    }
    createChannelSplitter(channels) {
        const node = new FakeNode();
        node.channelCount = channels;
        return node;
    }
    createChannelMerger(channels) {
        const node = new FakeNode();
        node.channelCount = channels;
        return node;
    }
    createDelay(maxDelayTime) { return new FakeDelay(maxDelayTime); }
}

class FakeAudio {
    constructor() { this.paused = true; this.volume = 1; this.playCalls = 0; }
    addEventListener() {}
    async play() { this.playCalls++; this.paused = false; }
    pause() { this.paused = true; }
}

class FakeElement {
    constructor() {
        this.value = '0';
        this.checked = false;
        this.textContent = '';
        this.attrs = new Map();
        this.listeners = new Map();
        const classes = new Set(['hidden']);
        this.classList = {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name)
        };
    }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.get(k); }
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
        'eq-leveling-toggle', 'analyze-library-btn', 'analyze-library-status',
        'crossfeed-off-btn', 'crossfeed-subtle-btn', 'crossfeed-room-btn'
    ]) elements.set(id, new FakeElement());
};
resetElements();

const stored = new Map();
globalThis.Audio = FakeAudio;
globalThis.window = { AudioContext: StereoAudioContext, addEventListener() {} };
globalThis.document = { getElementById: id => elements.get(id) ?? null };
globalThis.localStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, String(value))
};

const { audioEngine } = await import('../js/core/audioEngine.js');
const { EqualizerUI } = await import('../js/ui/eqUI.js');

test('normalizeCrossfeedMode clamps invalid values safely to off', () => {
    assert.equal(normalizeCrossfeedMode('off'), 'off');
    assert.equal(normalizeCrossfeedMode('SUBTLE'), 'subtle');
    assert.equal(normalizeCrossfeedMode(' room '), 'room');
    assert.equal(normalizeCrossfeedMode('invalid'), 'off');
    assert.equal(normalizeCrossfeedMode(null), 'off');
});

test('crossfeed stage sits between EQ and leveling/fade and uses unity passthrough when off', () => {
    audioEngine.isAudioCtxInit = false;
    audioEngine.setCrossfeedMode('off', { immediate: true });
    audioEngine._initAudioContext();

    assert.ok(audioEngine.crossfeedStage, 'Crossfeed stage should initialize on stereo AudioContext');
    const { nodes } = audioEngine.crossfeedStage;
    assert.equal(nodes.directL.gain.value, 1.0);
    assert.equal(nodes.directR.gain.value, 1.0);
    assert.equal(nodes.crossGainLR.gain.value, 0.0);
    assert.equal(nodes.crossGainRL.gain.value, 0.0);

    assert.equal(audioEngine.eqFilters.treble.connections[0].node, audioEngine.crossfeedStage.input);
    assert.equal(audioEngine.crossfeedStage.output.connections[0].node, audioEngine.levelingGainNode);
    assert.equal(audioEngine.levelingGainNode.connections[0].node, audioEngine.gainNode);
    assert.equal(audioEngine.gainNode.connections[0].node, audioEngine.audioCtx.destination);
});

test('switching between off, subtle, and room ramps stereo blend smoothly without altering fade gain', () => {
    audioEngine.setCrossfeedMode('subtle');
    const { nodes } = audioEngine.crossfeedStage;
    assert.equal(audioEngine.getCrossfeedMode(), 'subtle');
    assert.equal(nodes.directL.gain.value, CROSSFEED_PRESETS.subtle.directGain);
    assert.equal(nodes.crossGainLR.gain.value, CROSSFEED_PRESETS.subtle.crossGain);
    assert.equal(nodes.crossFilterLR.frequency.value, CROSSFEED_PRESETS.subtle.cutoffHz);
    assert.equal(nodes.crossDelayLR.delayTime.value, CROSSFEED_PRESETS.subtle.delaySec);
    assert.ok(nodes.crossGainLR.gain.events.some(e => e[0] === 'ramp'));
    assert.equal(audioEngine.gainNode.gain.value, 1);

    audioEngine.setCrossfeedMode('room');
    assert.equal(audioEngine.getCrossfeedMode(), 'room');
    assert.equal(nodes.directR.gain.value, CROSSFEED_PRESETS.room.directGain);
    assert.equal(nodes.crossGainRL.gain.value, CROSSFEED_PRESETS.room.crossGain);
    assert.equal(nodes.crossFilterRL.frequency.value, CROSSFEED_PRESETS.room.cutoffHz);

    audioEngine.setCrossfeedMode('off');
    assert.equal(nodes.directL.gain.value, 1.0);
    assert.equal(nodes.crossGainLR.gain.value, 0.0);
    assert.equal(audioEngine.gainNode.gain.value, 1);
});

test('crossfeed stage returns null and disconnects cleanly if stereo routing throws', () => {
    class BrokenDelayContext extends StereoAudioContext {
        createDelay() {
            const delay = super.createDelay();
            delay.connect = () => { throw new Error('Simulated crossfeed failure'); };
            return delay;
        }
    }

    const original = window.AudioContext;
    window.AudioContext = BrokenDelayContext;
    audioEngine.isAudioCtxInit = false;
    try {
        audioEngine._initAudioContext();
        assert.equal(audioEngine.isAudioCtxInit, true);
        assert.equal(audioEngine.crossfeedStage, null);
        assert.equal(audioEngine.eqFilters.treble.connections[0].node, audioEngine.levelingGainNode);
        assert.equal(audioEngine.gainNode.connections[0].node, audioEngine.audioCtx.destination);
    } finally {
        window.AudioContext = original;
        audioEngine.isAudioCtxInit = false;
    }

    assert.equal(createCrossfeedStage({ createGain: () => new FakeGain() }), null);
});

test('EqualizerUI defaults crossfeed to off on update, persists selections, and never auto-plays', () => {
    resetElements();
    stored.clear();

    const ui = new EqualizerUI();
    ui.init();

    assert.equal(ui.crossfeedMode, 'off');
    assert.equal(audioEngine.getCrossfeedMode(), 'off');
    assert.equal(elements.get('crossfeed-off-btn').getAttribute('aria-pressed'), 'true');
    assert.equal(elements.get('crossfeed-subtle-btn').getAttribute('aria-pressed'), 'false');

    elements.get('crossfeed-room-btn').click();
    assert.equal(ui.crossfeedMode, 'room');
    assert.equal(audioEngine.getCrossfeedMode(), 'room');
    assert.equal(stored.get('gt_soundmaster_crossfeed'), 'room');
    assert.equal(elements.get('crossfeed-room-btn').getAttribute('aria-pressed'), 'true');
    assert.equal(elements.get('crossfeed-off-btn').getAttribute('aria-pressed'), 'false');
    assert.equal(audioEngine.audioElement.playCalls, 0);
});
