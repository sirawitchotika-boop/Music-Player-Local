import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ACTIVE_PROFILE_STORAGE_KEY,
    BUILTIN_PROFILES,
    PROFILES_STORAGE_KEY,
    createCustomProfile,
    deleteCustomProfile,
    renameCustomProfile,
    soundSettingsEqual,
    updateCustomProfileSettings
} from '../js/core/soundProfiles.js';

class FakeAudioParam {
    constructor(value = 0) { this.value = value; this.events = []; }
    cancelScheduledValues(time) { this.events.push(['cancel', time]); }
    setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
    linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['ramp', value, time]); }
}

class FakeNode {
    constructor() { this.connections = []; }
    connect(node) { this.connections.push(node); }
    disconnect() { this.connections = []; }
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

class FakeAudioContext {
    constructor() {
        this.state = 'running';
        this.currentTime = 1;
        this.destination = new FakeNode();
        this.sourceNode = new FakeNode();
    }
    createMediaElementSource() { return this.sourceNode; }
    createGain() { return new FakeGain(); }
    createBiquadFilter() { return new FakeFilter(); }
}

class FakeAudio {
    constructor() { this.paused = true; this.volume = 1; this.playCalls = 0; }
    addEventListener() {}
    async play() { this.playCalls++; this.paused = false; }
    pause() { this.paused = true; }
}

class FakeElement {
    constructor(tagName = 'div') {
        this.tagName = tagName;
        this.value = '0';
        this.checked = false;
        this.disabled = false;
        this.textContent = '';
        this.children = [];
        this.attrs = new Map();
        this.listeners = new Map();
        const classes = new Set();
        this.classList = {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name)
        };
    }
    set innerHTML(val) {
        if (val === '') this.children = [];
    }
    appendChild(child) {
        this.children.push(child);
        return child;
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
        'crossfeed-off-btn', 'crossfeed-subtle-btn', 'crossfeed-room-btn',
        'sound-profiles-list', 'sound-unsaved-badge',
        'sound-save-btn', 'sound-save-as-btn', 'sound-revert-btn',
        'sound-rename-btn', 'sound-delete-btn'
    ]) {
        const el = new FakeElement();
        if (id === 'eq-modal' || id === 'sound-unsaved-badge') el.classList.add('hidden');
        elements.set(id, el);
    }
};
resetElements();

const stored = new Map();
globalThis.Audio = FakeAudio;
globalThis.window = { AudioContext: FakeAudioContext, addEventListener() {} };
globalThis.document = {
    getElementById: id => elements.get(id) ?? null,
    createElement: tag => new FakeElement(tag)
};
globalThis.localStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, String(value))
};

const { audioEngine } = await import('../js/core/audioEngine.js');
const { EqualizerUI } = await import('../js/ui/eqUI.js');

test('ships 4 protected built-in Gear Profiles and rejects overwriting or deleting them', () => {
    assert.deepEqual(BUILTIN_PROFILES.map(p => p.name), [
        'Pure Flat',
        'Earbuds',
        'Car / Speaker',
        'Late Night'
    ]);
    assert.ok(updateCustomProfileSettings('earbuds', { eq: { bass: 5 } }, []).error);
    assert.ok(renameCustomProfile('pure-flat', 'Other', [], BUILTIN_PROFILES).error);
    assert.ok(deleteCustomProfile('late-night', []).error);
    assert.ok(createCustomProfile('Earbuds', {}, BUILTIN_PROFILES).error);
});

test('update continuity preserves saved 3-band EQ, keeps leveling & crossfeed OFF, and marks unsaved', () => {
    resetElements();
    stored.clear();
    stored.set('gt_soundmaster_equalizer', JSON.stringify({ bass: 3, mid: -1, treble: 2 }));

    const ui = new EqualizerUI({ modal: { showToast() {} } });
    ui.init();

    assert.deepEqual(ui.values, { bass: 3, mid: -1, treble: 2 });
    assert.equal(ui.volumeLevelingEnabled, false);
    assert.equal(ui.crossfeedMode, 'off');
    assert.equal(ui.activeProfileId, 'pure-flat');
    assert.equal(ui.isUnsaved(), true);
    assert.equal(elements.get('sound-unsaved-badge').classList.contains('hidden'), false);
    assert.equal(elements.get('sound-save-btn').classList.contains('hidden'), true);
    assert.equal(elements.get('sound-revert-btn').classList.contains('hidden'), false);
    assert.equal(audioEngine.audioElement.playCalls, 0);
});

test('selecting a built-in profile applies EQ, leveling, and crossfeed together and clears unsaved', () => {
    resetElements();
    stored.clear();

    const ui = new EqualizerUI({ modal: { showToast() {} } });
    ui.init();

    ui.selectProfile('earbuds');
    assert.equal(ui.activeProfileId, 'earbuds');
    assert.deepEqual(audioEngine.getEqualizerSettings(), { bass: 2, mid: 0, treble: 1 });
    assert.equal(audioEngine.getVolumeLevelingEnabled(), true);
    assert.equal(audioEngine.getCrossfeedMode(), 'subtle');
    assert.equal(ui.isUnsaved(), false);
    assert.equal(elements.get('sound-unsaved-badge').classList.contains('hidden'), true);
    assert.equal(stored.get(ACTIVE_PROFILE_STORAGE_KEY), 'earbuds');

    // Dragging bass shows Unsaved badge and Revert restores Earbuds without overwriting it.
    elements.get('eq-bass').value = '5';
    elements.get('eq-bass').emit('input');
    assert.equal(ui.isUnsaved(), true);
    assert.equal(elements.get('sound-unsaved-badge').classList.contains('hidden'), false);
    assert.equal(ui.saveActiveProfile(), false, 'Built-in profile cannot be overwritten');

    elements.get('sound-revert-btn').click();
    assert.equal(ui.isUnsaved(), false);
    assert.deepEqual(audioEngine.getEqualizerSettings(), { bass: 2, mid: 0, treble: 1 });
});

test('custom Gear Profiles support Save As, Update, Rename, Delete, and render names as plain text', async () => {
    resetElements();
    stored.clear();

    let nextPrompt = '<img src=x onerror=alert(1)> IEM';
    let confirmResult = true;
    const toasts = [];
    const mockModal = {
        showPrompt: async () => nextPrompt,
        showConfirm: async () => confirmResult,
        showToast: (msg, type) => toasts.push({ msg, type })
    };

    const ui = new EqualizerUI({ modal: mockModal });
    ui.init();

    ui.setVolumeLeveling(true);
    ui.setCrossfeedMode('room');
    ui.updateBand('bass', 4);

    assert.equal(await ui.saveAsNewProfile(), true);
    const createdId = ui.activeProfileId;
    assert.ok(createdId.startsWith('sp_'));
    assert.equal(ui.isUnsaved(), false);

    // Chip textContent holds literal string (never innerHTML markup injection).
    const chips = elements.get('sound-profiles-list').children;
    const customChip = chips.find(c => c.textContent === '<img src=x onerror=alert(1)> IEM');
    assert.ok(customChip, 'Custom profile name should render as literal text');

    // Tweak custom profile -> Save becomes enabled and updates stored settings.
    ui.updateBand('treble', -2);
    assert.equal(ui.isUnsaved(), true);
    assert.equal(elements.get('sound-save-btn').disabled, false);
    assert.equal(ui.saveActiveProfile(), true);
    assert.equal(ui.isUnsaved(), false);

    const savedCustom = JSON.parse(stored.get(PROFILES_STORAGE_KEY));
    assert.equal(savedCustom.length, 1);
    assert.equal(soundSettingsEqual(savedCustom[0].settings, {
        eq: { bass: 4, mid: 0, treble: -2 },
        leveling: true,
        crossfeed: 'room'
    }), true);

    // Rename custom profile.
    nextPrompt = 'My Studio IEM';
    assert.equal(await ui.renameActiveProfile(), true);
    assert.equal(ui.getActiveProfile().name, 'My Studio IEM');

    // Delete custom profile returns cleanly to Pure Flat.
    confirmResult = true;
    assert.equal(await ui.deleteActiveProfile(), true);
    assert.equal(ui.activeProfileId, 'pure-flat');
    assert.deepEqual(JSON.parse(stored.get(PROFILES_STORAGE_KEY)), []);
    assert.deepEqual(audioEngine.getEqualizerSettings(), { bass: 0, mid: 0, treble: 0 });
    assert.equal(audioEngine.getVolumeLevelingEnabled(), false);
    assert.equal(audioEngine.getCrossfeedMode(), 'off');
    assert.equal(audioEngine.audioElement.playCalls, 0);
    assert.ok(toasts.length >= 3);
});
