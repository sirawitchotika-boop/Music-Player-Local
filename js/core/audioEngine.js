// js/core/audioEngine.js
import { computeSafeGainLinear, isValidLoudness } from './loudnessAnalyzer.js';
import { createCrossfeedStage, normalizeCrossfeedMode } from './crossfeedNode.js';

class AudioEngine {
    constructor() {
        this.audioElement = new Audio();
        this.currentObjectUrl = null;
        this.audioCtx = null;
        this.gainNode = null;
        this.levelingGainNode = null;
        this.crossfeedStage = null;
        this.eqFilters = null;
        this.eqSettings = { bass: 0, mid: 0, treble: 0 };
        this.crossfeedMode = 'off';
        this.volumeLevelingEnabled = false;
        this.trackLoudness = null;
        this.isAudioCtxInit = false;
        this._playRequestVersion = 0;
        
        this.audioElement.onerror = (error) => {
            console.warn("Audio Element Warning:", error);
        };
    }
    
    // เริ่มต้นระบบ GainNode ตัวเดียวเพื่อคุมความนุ่มนวลของสัญญาณเสียง
    _initAudioContext() {
        if (this.isAudioCtxInit) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioCtx({ latencyHint: 'playback' });
            const source = this.audioCtx.createMediaElementSource(this.audioElement);
            let levelingNode = null;
            try {
                levelingNode = this.audioCtx.createGain();
                levelingNode.gain.value = this.getEffectiveLevelingGain();
            } catch (levelingError) {
                console.warn("[AudioEngine] Volume leveling unavailable; using unity gain:", levelingError);
            }
            this.gainNode = this.audioCtx.createGain();

            // Wire the leveling gain downstream into the 35ms fade gain first.
            let downstreamTarget = this.gainNode;
            this.levelingGainNode = null;
            if (levelingNode) {
                try {
                    levelingNode.connect(this.gainNode);
                    this.levelingGainNode = levelingNode;
                    downstreamTarget = levelingNode;
                } catch (levelingError) {
                    console.warn("[AudioEngine] Leveling routing failed; bypassing:", levelingError);
                    try { levelingNode.disconnect(); } catch { /* Best-effort cleanup. */ }
                }
            }

            // Wire optional headphone crossfeed ahead of leveling/fade.
            this.crossfeedStage = null;
            const crossfeed = createCrossfeedStage(this.audioCtx, this.crossfeedMode);
            if (crossfeed) {
                try {
                    crossfeed.output.connect(downstreamTarget);
                    this.crossfeedStage = crossfeed;
                    downstreamTarget = crossfeed.input;
                } catch (crossfeedError) {
                    console.warn("[AudioEngine] Crossfeed routing failed; bypassing:", crossfeedError);
                    crossfeed.disconnect();
                }
            }

            let filters = null;
            if (typeof this.audioCtx.createBiquadFilter === 'function') {
                try {
                    const bass = this.audioCtx.createBiquadFilter();
                    bass.type = 'lowshelf';
                    bass.frequency.value = 120;
                    bass.gain.value = this.eqSettings.bass;

                    const mid = this.audioCtx.createBiquadFilter();
                    mid.type = 'peaking';
                    mid.frequency.value = 1000;
                    mid.Q.value = 0.7;
                    mid.gain.value = this.eqSettings.mid;

                    const treble = this.audioCtx.createBiquadFilter();
                    treble.type = 'highshelf';
                    treble.frequency.value = 8000;
                    treble.gain.value = this.eqSettings.treble;

                    filters = { bass, mid, treble };
                } catch (filterError) {
                    console.warn("[AudioEngine] EQ unavailable; using flat audio:", filterError);
                }
            }

            // Wire the EQ downstream first. Do not route the source into it
            // until the whole filter chain is ready, or playback could be silent.
            let eqConnected = false;
            if (filters) {
                try {
                    filters.bass.connect(filters.mid);
                    filters.mid.connect(filters.treble);
                    filters.treble.connect(downstreamTarget);
                    source.connect(filters.bass);
                    this.eqFilters = filters;
                    eqConnected = true;
                } catch (filterError) {
                    console.warn("[AudioEngine] EQ routing failed; using flat audio:", filterError);
                    for (const filter of Object.values(filters)) {
                        try { filter.disconnect(); } catch { /* Best-effort cleanup. */ }
                    }
                }
            }
            if (!eqConnected) {
                source.connect(downstreamTarget);
            }

            // Keep the existing gain node last so its 35ms play/pause ramp is unchanged.
            this.gainNode.connect(this.audioCtx.destination);
            this.isAudioCtxInit = true;
        } catch (e) {
            console.warn("[AudioEngine] Web Audio init fallback:", e);
        }
    }

    getCrossfeedMode() {
        return this.crossfeedMode;
    }

    setCrossfeedMode(mode, { immediate = false } = {}) {
        const safeMode = normalizeCrossfeedMode(mode);
        this.crossfeedMode = safeMode;
        if (this.crossfeedStage) {
            this.crossfeedStage.applyMode(safeMode, { immediate });
        }
        return this.crossfeedMode;
    }

    getEffectiveLevelingGain() {
        if (!this.volumeLevelingEnabled || !isValidLoudness(this.trackLoudness)) {
            return 1.0;
        }
        return computeSafeGainLinear(this.trackLoudness);
    }

    _applyLevelingGain(immediate = false) {
        if (!this.levelingGainNode || !this.audioCtx) return;
        const target = this.getEffectiveLevelingGain();
        const now = this.audioCtx.currentTime;
        this.levelingGainNode.gain.cancelScheduledValues(now);
        if (immediate) {
            this.levelingGainNode.gain.setValueAtTime(target, now);
        } else {
            this.levelingGainNode.gain.setValueAtTime(this.levelingGainNode.gain.value, now);
            this.levelingGainNode.gain.linearRampToValueAtTime(target, now + 0.04);
        }
    }

    getVolumeLevelingEnabled() {
        return this.volumeLevelingEnabled;
    }

    setVolumeLeveling(enabled, { immediate = false } = {}) {
        this.volumeLevelingEnabled = Boolean(enabled);
        this._applyLevelingGain(immediate);
        return this.volumeLevelingEnabled;
    }

    setTrackLoudness(loudness, { immediate = false } = {}) {
        this.trackLoudness = isValidLoudness(loudness) ? { ...loudness } : null;
        this._applyLevelingGain(immediate);
        return this.getEffectiveLevelingGain();
    }
    
    getEqualizerSettings() {
        return { ...this.eqSettings };
    }

    setEqualizer(settings = {}) {
        if (!settings || typeof settings !== 'object') return this.getEqualizerSettings();

        for (const band of ['bass', 'mid', 'treble']) {
            if (!Object.prototype.hasOwnProperty.call(settings, band)) continue;

            const numeric = Number(settings[band]);
            if (!Number.isFinite(numeric)) continue;

            const value = Math.max(-6, Math.min(6, Math.round(numeric)));
            this.eqSettings[band] = value;

            const filter = this.eqFilters?.[band];
            if (!filter || !this.audioCtx) continue;

            const now = this.audioCtx.currentTime;
            filter.gain.cancelScheduledValues(now);
            filter.gain.setValueAtTime(filter.gain.value, now);
            filter.gain.linearRampToValueAtTime(value, now + 0.025);
        }

        return this.getEqualizerSettings();
    }

    resetEqualizer() {
        return this.setEqualizer({ bass: 0, mid: 0, treble: 0 });
    }

    async play() {
        const version = ++this._playRequestVersion;
        const cancelled = () => Object.assign(new Error('Playback interrupted'), { name: 'AbortError' });
        try {
            this._initAudioContext();
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                await this.audioCtx.resume();
            }
            if (version !== this._playRequestVersion) throw cancelled();
            
            // เริ่มต้นที่ 0 แล้วไล่ระดับเสียงขึ้นใน 35ms (ป้องกันเสียงกึกตอนเริ่มเล่นเพลงจาก YouTube)
            if (this.gainNode && this.audioCtx) {
                const now = this.audioCtx.currentTime;
                this.gainNode.gain.cancelScheduledValues(now);
                this.gainNode.gain.setValueAtTime(0.0001, now);
            }
            
            await this.audioElement.play();
            if (version !== this._playRequestVersion) {
                this.audioElement.pause();
                throw cancelled();
            }
            
            if (this.gainNode && this.audioCtx) {
                const now = this.audioCtx.currentTime;
                this.gainNode.gain.cancelScheduledValues(now);
                this.gainNode.gain.linearRampToValueAtTime(1.0, now + 0.035);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Playback Play Error:", error);
            }
            throw error;
        }
    }
    
    async pause(immediate = false) {
        // Invalidate a pending Play even if the element is still reporting paused.
        ++this._playRequestVersion;
        if (!this.audioElement || this.audioElement.paused) return;
        try {
            // หรี่คลื่นเสียงลงเป็น 0 ใน 35ms ก่อนสั่ง Pause ป้องกันลำโพงดีดตัวกะทันหัน
            if (!immediate && this.gainNode && this.audioCtx && this.audioCtx.state === 'running') {
                const now = this.audioCtx.currentTime;
                this.gainNode.gain.cancelScheduledValues(now);
                this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
                this.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.035);
                await new Promise(resolve => setTimeout(resolve, 40));
            }
            this.audioElement.pause();
            if (this.gainNode && this.audioCtx) {
                this.gainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
                this.gainNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
            }
        } catch (e) {
            this.audioElement.pause();
        }
    }
    
    async load(fileOrUrl) {
        ++this._playRequestVersion;
        try {
            // หรี่เสียงเพลงเดิมลงก่อนสลับไฟล์
            if (!this.audioElement.paused) {
                await this.pause();
            }
            
            if (typeof fileOrUrl === 'string') {
                this.audioElement.src = fileOrUrl;
            } else if ((typeof File !== 'undefined' && fileOrUrl instanceof File) ||
                       (typeof Blob !== 'undefined' && fileOrUrl instanceof Blob)) {
                const oldUrl = this.currentObjectUrl;
                this.currentObjectUrl = URL.createObjectURL(fileOrUrl);
                this.audioElement.src = this.currentObjectUrl;
                
                if (oldUrl) {
                    setTimeout(() => URL.revokeObjectURL(oldUrl), 4000);
                }
            } else {
                throw new TypeError('Unsupported audio source');
            }
        } catch (error) {
            console.error("Audio Load Error:", error);
            throw error;
        }
    }
    
    seek(seconds) {
        if (seconds >= 0 && seconds <= this.audioElement.duration) {
            this.audioElement.currentTime = seconds;
        }
    }
    
    get currentTime() { return this.audioElement.currentTime; }
    get duration() { return this.audioElement.duration; }
    get paused() { return this.audioElement.paused; }
    set volume(val) {
        if (this.gainNode && this.audioCtx) {
            this.gainNode.gain.setValueAtTime(val, this.audioCtx.currentTime);
        } else {
            this.audioElement.volume = val;
        }
    }
    
    skipToNext() {
        if (typeof window.nextTrackFallback === 'function') {
            window.nextTrackFallback();
        }
    }
}

export const audioEngine = new AudioEngine();