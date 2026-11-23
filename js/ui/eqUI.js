import { audioEngine } from '../core/audioEngine.js';
import { storage } from '../core/storage.js';
import { loudnessCoordinator, isValidLoudness } from '../core/loudnessAnalyzer.js';

const STORAGE_KEY = 'gt_soundmaster_equalizer';
const LEVELING_STORAGE_KEY = 'gt_soundmaster_leveling';
const BANDS = ['bass', 'mid', 'treble'];
const DEFAULTS = Object.freeze({ bass: 0, mid: 0, treble: 0 });

const clampDb = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(-6, Math.min(6, Math.round(numeric)));
};

export class EqualizerUI {
    constructor({ coordinator = loudnessCoordinator, storageClient = storage } = {}) {
        this.coordinator = coordinator;
        this.storage = storageClient;
        this.state = null;
        this.modal = document.getElementById('eq-modal');
        this.openBtn = document.getElementById('eq-btn');
        this.closeBtn = document.getElementById('close-eq-btn');
        this.resetBtn = document.getElementById('eq-reset-btn');
        this.levelingToggle = document.getElementById('eq-leveling-toggle');
        this.analyzeLibraryBtn = document.getElementById('analyze-library-btn');
        this.analyzeLibraryStatus = document.getElementById('analyze-library-status');
        this.sliders = Object.fromEntries(BANDS.map(band => [
            band,
            document.getElementById(`eq-${band}`)
        ]));
        this.outputs = Object.fromEntries(BANDS.map(band => [
            band,
            document.getElementById(`eq-${band}-value`)
        ]));
        this.values = { ...DEFAULTS };
        this.volumeLevelingEnabled = false;
        this.isAnalyzingLibrary = false;
        this.initialized = false;
    }

    init({ state = null } = {}) {
        if (!this.modal || this.initialized) return;
        this.initialized = true;
        this.state = state;
        this.values = this.loadSettings();
        this.volumeLevelingEnabled = this.loadLevelingSetting();
        this.updateControls();
        audioEngine.setEqualizer(this.values);
        audioEngine.setVolumeLeveling(this.volumeLevelingEnabled, { immediate: true });
        this.bindEvents();
    }

    bindEvents() {
        this.openBtn?.addEventListener('click', () => this.openModal());
        this.closeBtn?.addEventListener('click', () => this.closeModal());
        this.resetBtn?.addEventListener('click', () => this.reset());

        this.levelingToggle?.addEventListener('change', (event) => {
            this.setVolumeLeveling(Boolean(event.target.checked));
        });

        this.analyzeLibraryBtn?.addEventListener('click', () => {
            void this.analyzeLibrary();
        });

        this.modal.addEventListener('click', (event) => {
            if (event.target === this.modal) this.closeModal();
        });

        for (const band of BANDS) {
            this.sliders[band]?.addEventListener('input', (event) => {
                this.updateBand(band, event.target.value);
            });
        }

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') this.closeModal();
        });
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved) return { ...DEFAULTS };

            const parsed = JSON.parse(saved);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return { ...DEFAULTS };
            }

            return Object.fromEntries(BANDS.map(band => [band, clampDb(parsed[band])]));
        } catch {
            return { ...DEFAULTS };
        }
    }

    loadLevelingSetting() {
        try {
            return localStorage.getItem(LEVELING_STORAGE_KEY) === 'true';
        } catch {
            return false;
        }
    }

    saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
        } catch (error) {
            console.warn('[Equalizer] Could not save settings:', error);
        }
    }

    saveLevelingSetting() {
        try {
            localStorage.setItem(LEVELING_STORAGE_KEY, this.volumeLevelingEnabled ? 'true' : 'false');
        } catch (error) {
            console.warn('[Equalizer] Could not save leveling setting:', error);
        }
    }

    setVolumeLeveling(enabled) {
        this.volumeLevelingEnabled = audioEngine.setVolumeLeveling(Boolean(enabled));
        this.updateControls();
        this.saveLevelingSetting();
    }

    updateBand(band, rawValue) {
        if (!BANDS.includes(band)) return;
        this.values[band] = clampDb(rawValue);
        audioEngine.setEqualizer(this.values);
        this.updateControls();
        this.saveSettings();
    }

    updateControls() {
        for (const band of BANDS) {
            const value = this.values[band];
            if (this.sliders[band]) this.sliders[band].value = String(value);
            if (this.outputs[band]) {
                this.outputs[band].textContent = `${value > 0 ? '+' : ''}${value} dB`;
            }
        }
        if (this.levelingToggle) {
            this.levelingToggle.checked = this.volumeLevelingEnabled;
        }
    }

    async refreshAnalysisStatus() {
        if (!this.analyzeLibraryStatus || this.isAnalyzingLibrary || !this.storage?.getAllTracks) return;
        try {
            const tracks = await this.storage.getAllTracks();
            if (tracks.length === 0) {
                this.analyzeLibraryStatus.textContent = 'No songs in library yet.';
                return;
            }
            const pending = tracks.filter(t => !isValidLoudness(t.loudness)).length;
            this.analyzeLibraryStatus.textContent = pending === 0
                ? `All ${tracks.length} song(s) measured.`
                : `${pending} of ${tracks.length} song(s) ready to measure.`;
        } catch {
            this.analyzeLibraryStatus.textContent = '';
        }
    }

    async analyzeLibrary() {
        if (this.isAnalyzingLibrary) return null;
        this.isAnalyzingLibrary = true;
        if (this.analyzeLibraryBtn) this.analyzeLibraryBtn.disabled = true;
        if (this.analyzeLibraryStatus) this.analyzeLibraryStatus.textContent = 'Analyzing library...';

        try {
            const result = await this.coordinator.analyzeLibrary({
                storage: this.storage,
                onTrackMeasured: (track, loudness) => {
                    if (this.state?.loadedTrackId === track.id) {
                        audioEngine.setTrackLoudness(loudness, { immediate: false });
                    }
                    if (Array.isArray(this.state?.queue)) {
                        const queued = this.state.queue.find(t => t.id === track.id);
                        if (queued) queued.loudness = loudness;
                    }
                    if (Array.isArray(this.state?.originalQueue)) {
                        const orig = this.state.originalQueue.find(t => t.id === track.id);
                        if (orig) orig.loudness = loudness;
                    }
                },
                onProgress: ({ completed, total }) => {
                    if (this.analyzeLibraryStatus) {
                        this.analyzeLibraryStatus.textContent = `Analyzing ${completed} of ${total}...`;
                    }
                }
            });

            if (this.analyzeLibraryStatus) {
                if (result.total === 0) {
                    this.analyzeLibraryStatus.textContent = 'No songs in library yet.';
                } else if (result.analyzed === 0 && result.failed === 0) {
                    this.analyzeLibraryStatus.textContent = `All ${result.total} song(s) already measured.`;
                } else if (result.failed > 0) {
                    this.analyzeLibraryStatus.textContent = `Measured ${result.analyzed} song(s); ${result.failed} skipped.`;
                } else {
                    this.analyzeLibraryStatus.textContent = `Measured ${result.analyzed} new song(s). All ${result.total} ready.`;
                }
            }
            return result;
        } catch {
            if (this.analyzeLibraryStatus) {
                this.analyzeLibraryStatus.textContent = 'Could not analyze library right now.';
            }
            return null;
        } finally {
            this.isAnalyzingLibrary = false;
            if (this.analyzeLibraryBtn) this.analyzeLibraryBtn.disabled = false;
        }
    }

    reset() {
        this.values = audioEngine.resetEqualizer();
        this.updateControls();
        this.saveSettings();
    }

    openModal() {
        this.modal?.classList.remove('hidden');
        void this.refreshAnalysisStatus();
    }

    closeModal() {
        this.modal?.classList.add('hidden');
    }
}

export const eqUI = new EqualizerUI();
