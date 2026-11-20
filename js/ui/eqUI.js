import { audioEngine } from '../core/audioEngine.js';

const STORAGE_KEY = 'gt_soundmaster_equalizer';
const BANDS = ['bass', 'mid', 'treble'];
const DEFAULTS = Object.freeze({ bass: 0, mid: 0, treble: 0 });

const clampDb = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(-6, Math.min(6, Math.round(numeric)));
};

export class EqualizerUI {
    constructor() {
        this.modal = document.getElementById('eq-modal');
        this.openBtn = document.getElementById('eq-btn');
        this.closeBtn = document.getElementById('close-eq-btn');
        this.resetBtn = document.getElementById('eq-reset-btn');
        this.sliders = Object.fromEntries(BANDS.map(band => [
            band,
            document.getElementById(`eq-${band}`)
        ]));
        this.outputs = Object.fromEntries(BANDS.map(band => [
            band,
            document.getElementById(`eq-${band}-value`)
        ]));
        this.values = { ...DEFAULTS };
        this.initialized = false;
    }

    init() {
        if (!this.modal || this.initialized) return;
        this.initialized = true;
        this.values = this.loadSettings();
        this.updateControls();
        audioEngine.setEqualizer(this.values);
        this.bindEvents();
    }

    bindEvents() {
        this.openBtn?.addEventListener('click', () => this.openModal());
        this.closeBtn?.addEventListener('click', () => this.closeModal());
        this.resetBtn?.addEventListener('click', () => this.reset());

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

    saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
        } catch (error) {
            console.warn('[Equalizer] Could not save settings:', error);
        }
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
    }

    reset() {
        this.values = audioEngine.resetEqualizer();
        this.updateControls();
        this.saveSettings();
    }

    openModal() {
        this.modal?.classList.remove('hidden');
    }

    closeModal() {
        this.modal?.classList.add('hidden');
    }
}

export const eqUI = new EqualizerUI();
