import { audioEngine } from '../core/audioEngine.js';
import { storage } from '../core/storage.js';
import { modalUI } from './modalUI.js';
import { loudnessCoordinator, isValidLoudness } from '../core/loudnessAnalyzer.js';
import { CROSSFEED_MODES, normalizeCrossfeedMode } from '../core/crossfeedNode.js';
import {
    ACTIVE_PROFILE_STORAGE_KEY,
    BUILTIN_PROFILES,
    clampEqBand,
    createCustomProfile,
    deleteCustomProfile,
    getAllProfiles,
    isBuiltinProfileId,
    loadCustomProfiles,
    normalizeSoundSettings,
    renameCustomProfile,
    saveCustomProfiles,
    soundSettingsEqual,
    updateCustomProfileSettings
} from '../core/soundProfiles.js';

const STORAGE_KEY = 'gt_soundmaster_equalizer';
const LEVELING_STORAGE_KEY = 'gt_soundmaster_leveling';
const CROSSFEED_STORAGE_KEY = 'gt_soundmaster_crossfeed';
const BANDS = ['bass', 'mid', 'treble'];
const DEFAULTS = Object.freeze({ bass: 0, mid: 0, treble: 0 });

export class EqualizerUI {
    constructor({ coordinator = loudnessCoordinator, storageClient = storage, modal = modalUI } = {}) {
        this.coordinator = coordinator;
        this.storage = storageClient;
        this.modalUI = modal;
        this.state = null;
        this.modal = document.getElementById('eq-modal');
        this.openBtn = document.getElementById('eq-btn');
        this.closeBtn = document.getElementById('close-eq-btn');
        this.resetBtn = document.getElementById('eq-reset-btn');
        this.levelingToggle = document.getElementById('eq-leveling-toggle');
        this.analyzeLibraryBtn = document.getElementById('analyze-library-btn');
        this.analyzeLibraryStatus = document.getElementById('analyze-library-status');
        this.profilesList = document.getElementById('sound-profiles-list');
        this.unsavedBadge = document.getElementById('sound-unsaved-badge');
        this.saveProfileBtn = document.getElementById('sound-save-btn');
        this.saveAsProfileBtn = document.getElementById('sound-save-as-btn');
        this.revertProfileBtn = document.getElementById('sound-revert-btn');
        this.renameProfileBtn = document.getElementById('sound-rename-btn');
        this.deleteProfileBtn = document.getElementById('sound-delete-btn');
        this.crossfeedButtons = Object.fromEntries(CROSSFEED_MODES.map(mode => [
            mode,
            document.getElementById(`crossfeed-${mode}-btn`)
        ]));
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
        this.crossfeedMode = 'off';
        this.customProfiles = [];
        this.activeProfileId = 'pure-flat';
        this.isAnalyzingLibrary = false;
        this.initialized = false;
    }

    init({ state = null } = {}) {
        if (!this.modal || this.initialized) return;
        this.initialized = true;
        this.state = state;
        this.customProfiles = loadCustomProfiles();
        this.values = this.loadSettings();
        this.volumeLevelingEnabled = this.loadLevelingSetting();
        this.crossfeedMode = this.loadCrossfeedSetting();
        this.activeProfileId = this.loadActiveProfileId();
        this.renderProfiles();
        this.updateControls();
        audioEngine.setEqualizer(this.values);
        audioEngine.setVolumeLeveling(this.volumeLevelingEnabled, { immediate: true });
        audioEngine.setCrossfeedMode(this.crossfeedMode, { immediate: true });
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

        this.saveProfileBtn?.addEventListener('click', () => this.saveActiveProfile());
        this.saveAsProfileBtn?.addEventListener('click', () => { void this.saveAsNewProfile(); });
        this.revertProfileBtn?.addEventListener('click', () => this.revertActiveProfile());
        this.renameProfileBtn?.addEventListener('click', () => { void this.renameActiveProfile(); });
        this.deleteProfileBtn?.addEventListener('click', () => { void this.deleteActiveProfile(); });

        for (const mode of CROSSFEED_MODES) {
            this.crossfeedButtons[mode]?.addEventListener('click', () => {
                this.setCrossfeedMode(mode);
            });
        }

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

    getCurrentSoundSettings() {
        return normalizeSoundSettings({
            eq: this.values,
            leveling: this.volumeLevelingEnabled,
            crossfeed: this.crossfeedMode
        });
    }

    getAllProfiles() {
        return getAllProfiles(this.customProfiles);
    }

    getActiveProfile() {
        const all = this.getAllProfiles();
        return all.find(p => p.id === this.activeProfileId) || all[0];
    }

    isUnsaved() {
        const active = this.getActiveProfile();
        if (!active) return false;
        return !soundSettingsEqual(this.getCurrentSoundSettings(), active.settings);
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved) return { ...DEFAULTS };

            const parsed = JSON.parse(saved);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return { ...DEFAULTS };
            }

            return Object.fromEntries(BANDS.map(band => [band, clampEqBand(parsed[band])]));
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

    loadCrossfeedSetting() {
        try {
            return normalizeCrossfeedMode(localStorage.getItem(CROSSFEED_STORAGE_KEY));
        } catch {
            return 'off';
        }
    }

    loadActiveProfileId() {
        try {
            const savedId = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
            const all = this.getAllProfiles();
            if (savedId && all.some(p => p.id === savedId)) {
                return savedId;
            }
            return BUILTIN_PROFILES[0].id;
        } catch {
            return BUILTIN_PROFILES[0].id;
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

    saveCrossfeedSetting() {
        try {
            localStorage.setItem(CROSSFEED_STORAGE_KEY, this.crossfeedMode);
        } catch (error) {
            console.warn('[Equalizer] Could not save crossfeed setting:', error);
        }
    }

    saveActiveProfileId() {
        try {
            localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, this.activeProfileId);
        } catch (error) {
            console.warn('[SoundProfiles] Could not save active profile:', error);
        }
    }

    selectProfile(profileId) {
        const target = this.getAllProfiles().find(p => p.id === profileId);
        if (!target) return false;

        this.activeProfileId = target.id;
        const normalized = normalizeSoundSettings(target.settings);
        this.values = { ...normalized.eq };
        this.volumeLevelingEnabled = audioEngine.setVolumeLeveling(normalized.leveling);
        this.crossfeedMode = audioEngine.setCrossfeedMode(normalized.crossfeed);
        audioEngine.setEqualizer(this.values);

        this.saveSettings();
        this.saveLevelingSetting();
        this.saveCrossfeedSetting();
        this.saveActiveProfileId();
        this.renderProfiles();
        this.updateControls();
        return true;
    }

    saveActiveProfile() {
        const active = this.getActiveProfile();
        if (!active || active.builtin) {
            this.modalUI?.showToast?.('Built-in presets are protected. Use Save As to create a custom profile.', 'info');
            return false;
        }
        const result = updateCustomProfileSettings(active.id, this.getCurrentSoundSettings(), this.customProfiles);
        if (result.error) {
            this.modalUI?.showToast?.(result.error, 'error');
            return false;
        }
        this.customProfiles = result.customProfiles;
        saveCustomProfiles(this.customProfiles);
        this.updateControls();
        this.modalUI?.showToast?.(`Saved "${active.name}".`, 'success');
        return true;
    }

    async saveAsNewProfile() {
        const name = await this.modalUI?.showPrompt?.('Save Gear Profile', 'Profile name:');
        if (name === null || name === undefined) return false;

        const result = createCustomProfile(name, this.getCurrentSoundSettings(), this.getAllProfiles());
        if (result.error) {
            this.modalUI?.showToast?.(result.error, 'error');
            return false;
        }
        this.customProfiles = [...this.customProfiles, result.profile];
        this.activeProfileId = result.profile.id;
        saveCustomProfiles(this.customProfiles);
        this.saveActiveProfileId();
        this.renderProfiles();
        this.updateControls();
        this.modalUI?.showToast?.(`Saved profile "${result.profile.name}".`, 'success');
        return true;
    }

    revertActiveProfile() {
        return this.selectProfile(this.activeProfileId);
    }

    async renameActiveProfile() {
        const active = this.getActiveProfile();
        if (!active || active.builtin) return false;

        const nextName = await this.modalUI?.showPrompt?.('Rename Gear Profile', 'New name:', active.name);
        if (nextName === null || nextName === undefined) return false;

        const result = renameCustomProfile(active.id, nextName, this.customProfiles, this.getAllProfiles());
        if (result.error) {
            this.modalUI?.showToast?.(result.error, 'error');
            return false;
        }
        this.customProfiles = result.customProfiles;
        saveCustomProfiles(this.customProfiles);
        this.renderProfiles();
        this.updateControls();
        this.modalUI?.showToast?.(`Renamed profile to "${result.name}".`, 'success');
        return true;
    }

    async deleteActiveProfile() {
        const active = this.getActiveProfile();
        if (!active || active.builtin) return false;

        const confirmed = await this.modalUI?.showConfirm?.(
            'Delete Gear Profile?',
            `Delete "${active.name}"? Your songs and playlists will not be affected.`
        );
        if (!confirmed) return false;

        const result = deleteCustomProfile(active.id, this.customProfiles);
        if (result.error) {
            this.modalUI?.showToast?.(result.error, 'error');
            return false;
        }
        this.customProfiles = result.customProfiles;
        saveCustomProfiles(this.customProfiles);
        this.selectProfile('pure-flat');
        this.modalUI?.showToast?.('Gear profile deleted.', 'info');
        return true;
    }

    setVolumeLeveling(enabled) {
        this.volumeLevelingEnabled = audioEngine.setVolumeLeveling(Boolean(enabled));
        this.updateControls();
        this.saveLevelingSetting();
    }

    setCrossfeedMode(mode) {
        this.crossfeedMode = audioEngine.setCrossfeedMode(mode);
        this.updateControls();
        this.saveCrossfeedSetting();
    }

    updateBand(band, rawValue) {
        if (!BANDS.includes(band)) return;
        this.values[band] = clampEqBand(rawValue);
        audioEngine.setEqualizer(this.values);
        this.updateControls();
        this.saveSettings();
    }

    renderProfiles() {
        if (!this.profilesList || typeof document.createElement !== 'function') return;
        this.profilesList.innerHTML = '';
        for (const profile of this.getAllProfiles()) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'sound-profile-chip';
            if (profile.id === this.activeProfileId) {
                chip.classList.add('active');
            }
            chip.textContent = profile.name;
            chip.setAttribute?.('aria-pressed', profile.id === this.activeProfileId ? 'true' : 'false');
            chip.addEventListener('click', () => this.selectProfile(profile.id));
            this.profilesList.appendChild(chip);
        }
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
        for (const mode of CROSSFEED_MODES) {
            const btn = this.crossfeedButtons[mode];
            if (!btn) continue;
            const isActive = this.crossfeedMode === mode;
            if (isActive) btn.classList?.add('active');
            else btn.classList?.remove('active');
            btn.setAttribute?.('aria-pressed', isActive ? 'true' : 'false');
        }

        const active = this.getActiveProfile();
        const dirty = this.isUnsaved();
        const isCustom = Boolean(active && !active.builtin && !isBuiltinProfileId(active.id));

        if (this.unsavedBadge) {
            if (dirty) this.unsavedBadge.classList?.remove('hidden');
            else this.unsavedBadge.classList?.add('hidden');
        }
        if (this.saveProfileBtn) {
            this.saveProfileBtn.disabled = !(isCustom && dirty);
            if (isCustom && dirty) this.saveProfileBtn.classList?.remove('hidden');
            else this.saveProfileBtn.classList?.add('hidden');
        }
        if (this.revertProfileBtn) {
            this.revertProfileBtn.disabled = !dirty;
            if (dirty) this.revertProfileBtn.classList?.remove('hidden');
            else this.revertProfileBtn.classList?.add('hidden');
        }
        if (this.renameProfileBtn) {
            this.renameProfileBtn.disabled = !isCustom;
            if (isCustom) this.renameProfileBtn.classList?.remove('hidden');
            else this.renameProfileBtn.classList?.add('hidden');
        }
        if (this.deleteProfileBtn) {
            this.deleteProfileBtn.disabled = !isCustom;
            if (isCustom) this.deleteProfileBtn.classList?.remove('hidden');
            else this.deleteProfileBtn.classList?.add('hidden');
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
        this.activeProfileId = 'pure-flat';
        this.values = audioEngine.resetEqualizer();
        this.volumeLevelingEnabled = audioEngine.setVolumeLeveling(false);
        this.crossfeedMode = audioEngine.setCrossfeedMode('off');
        this.saveSettings();
        this.saveLevelingSetting();
        this.saveCrossfeedSetting();
        this.saveActiveProfileId();
        this.renderProfiles();
        this.updateControls();
    }

    openModal() {
        this.modal?.classList.remove('hidden');
        this.renderProfiles();
        this.updateControls();
        void this.refreshAnalysisStatus();
    }

    closeModal() {
        this.modal?.classList.add('hidden');
    }
}

export const eqUI = new EqualizerUI();
