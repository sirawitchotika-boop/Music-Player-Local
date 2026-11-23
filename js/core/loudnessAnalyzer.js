// js/core/loudnessAnalyzer.js
export const LOUDNESS_VERSION = 1;
export const TARGET_LOUDNESS_DB = -16;
export const MIN_GAIN_DB = -12;
export const MAX_GAIN_DB = 9;
export const PEAK_CEILING_LINEAR = 0.98;
const BLOCK_DURATION_SEC = 0.2;
const SILENCE_GATE_DB = -50;
const RELATIVE_GATE_OFFSET_DB = -10;
const EPSILON = 1e-12;

export const dbToLinear = (db) => Math.pow(10, db / 20);

export const linearToDb = (linear) => {
    if (!Number.isFinite(linear) || linear <= EPSILON) return -120;
    return 20 * Math.log10(linear);
};

const roundTo = (value, decimals) => {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
};

export function computeSafeGainLinear(loudness) {
    if (!isValidLoudness(loudness)) return 1.0;

    const rawGainDb = TARGET_LOUDNESS_DB - loudness.loudnessDb;
    const clampedGainDb = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, rawGainDb));
    let gainLinear = dbToLinear(clampedGainDb);

    if (loudness.peakLinear > EPSILON) {
        const maxSafeLinear = PEAK_CEILING_LINEAR / loudness.peakLinear;
        gainLinear = Math.min(gainLinear, maxSafeLinear);
    }

    if (!Number.isFinite(gainLinear) || gainLinear <= 0) return 1.0;
    return Math.max(dbToLinear(MIN_GAIN_DB), Math.min(dbToLinear(MAX_GAIN_DB), gainLinear));
}

export function isValidLoudness(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    return data.version === LOUDNESS_VERSION &&
        Number.isFinite(data.loudnessDb) &&
        data.loudnessDb >= -120 && data.loudnessDb <= 12 &&
        Number.isFinite(data.peakLinear) &&
        data.peakLinear >= 0 && data.peakLinear <= 16 &&
        Number.isFinite(data.gainDb) &&
        data.gainDb >= MIN_GAIN_DB - 24 && data.gainDb <= MAX_GAIN_DB + 1;
}

export function computeLoudnessFromChannels(channels, sampleRate = 44100) {
    if (!Array.isArray(channels) || channels.length === 0) return null;
    const validChannels = channels.filter(ch => ch && typeof ch.length === 'number' && ch.length > 0);
    if (validChannels.length === 0) return null;

    const totalSamples = Math.min(...validChannels.map(ch => ch.length));
    if (totalSamples <= 0) return null;

    const safeRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 44100;
    const blockSize = Math.max(256, Math.round(safeRate * BLOCK_DURATION_SEC));
    const channelCount = validChannels.length;

    let peakLinear = 0;
    const blockEnergies = [];
    let overallSumSq = 0;
    let overallCount = 0;

    for (let offset = 0; offset < totalSamples; offset += blockSize) {
        const end = Math.min(totalSamples, offset + blockSize);
        let blockSumSq = 0;
        let blockCount = 0;

        for (let ch = 0; ch < channelCount; ch++) {
            const data = validChannels[ch];
            for (let i = offset; i < end; i++) {
                const sample = data[i];
                if (!Number.isFinite(sample)) continue;
                const abs = Math.abs(sample);
                if (abs > peakLinear) peakLinear = abs;
                blockSumSq += sample * sample;
                blockCount++;
            }
        }

        if (blockCount > 0) {
            const meanSq = blockSumSq / blockCount;
            overallSumSq += blockSumSq;
            overallCount += blockCount;
            if (linearToDb(Math.sqrt(meanSq)) >= SILENCE_GATE_DB) {
                blockEnergies.push(meanSq);
            }
        }
    }

    if (overallCount === 0 || peakLinear <= EPSILON) {
        return {
            version: LOUDNESS_VERSION,
            loudnessDb: -120,
            peakLinear: 0,
            gainDb: 0
        };
    }

    let meanEnergy = overallSumSq / overallCount;
    if (blockEnergies.length > 0) {
        const ungatedAvg = blockEnergies.reduce((sum, e) => sum + e, 0) / blockEnergies.length;
        const relativeThresholdDb = linearToDb(Math.sqrt(ungatedAvg)) + RELATIVE_GATE_OFFSET_DB;
        const gated = blockEnergies.filter(e => linearToDb(Math.sqrt(e)) >= relativeThresholdDb);
        const active = gated.length > 0 ? gated : blockEnergies;
        meanEnergy = active.reduce((sum, e) => sum + e, 0) / active.length;
    }

    const loudnessDb = roundTo(linearToDb(Math.sqrt(meanEnergy)), 2);
    const roundedPeak = roundTo(peakLinear, 4);
    const provisional = {
        version: LOUDNESS_VERSION,
        loudnessDb,
        peakLinear: roundedPeak,
        gainDb: 0
    };
    const safeLinear = computeSafeGainLinear(provisional);
    provisional.gainDb = roundTo(linearToDb(safeLinear), 2);
    return provisional;
}

const readBlobArrayBuffer = async (blob) => {
    if (!blob) return null;
    if (typeof blob.arrayBuffer === 'function') {
        return blob.arrayBuffer();
    }
    if (typeof FileReader !== 'undefined') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error('Could not read audio blob'));
            reader.readAsArrayBuffer(blob);
        });
    }
    return null;
};

export async function analyzeAudioBlob(blob, { decodeAudio } = {}) {
    if (!blob) return null;
    let tempCtx = null;
    try {
        const arrayBuffer = await readBlobArrayBuffer(blob);
        if (!arrayBuffer || arrayBuffer.byteLength === 0) return null;

        let audioBuffer = null;
        if (typeof decodeAudio === 'function') {
            audioBuffer = await decodeAudio(arrayBuffer);
        } else {
            const AudioCtx = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
                globalThis.AudioContext || globalThis.webkitAudioContext;
            if (!AudioCtx) return null;
            tempCtx = new AudioCtx();
            audioBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
        }

        if (!audioBuffer || !audioBuffer.numberOfChannels) return null;
        const channels = [];
        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
            channels.push(audioBuffer.getChannelData(i));
        }
        return computeLoudnessFromChannels(channels, audioBuffer.sampleRate);
    } catch (error) {
        console.warn('[Loudness] Could not analyze audio blob:', error);
        return null;
    } finally {
        if (tempCtx && typeof tempCtx.close === 'function') {
            try { await tempCtx.close(); } catch { /* Best-effort cleanup. */ }
        }
    }
}

export class LoudnessCoordinator {
    constructor({ analyzeBlob = analyzeAudioBlob } = {}) {
        this.analyzeBlob = analyzeBlob;
        this._inFlight = new Map();
        this._libraryScanPromise = null;
    }

    async ensureTrackLoudness(track, { storage, blob = null } = {}) {
        if (!track || track.id === undefined || track.id === null) return null;
        if (isValidLoudness(track.loudness)) return track.loudness;

        if (this._inFlight.has(track.id)) {
            return this._inFlight.get(track.id);
        }

        const task = (async () => {
            try {
                const audioBlob = blob || track.blob || (storage ? await storage.getTrackBlob(track.id) : null);
                if (!audioBlob) return null;
                const measured = await this.analyzeBlob(audioBlob);
                if (!isValidLoudness(measured)) return null;
                track.loudness = measured;
                if (storage && typeof storage.updateTrackLoudness === 'function') {
                    await storage.updateTrackLoudness(track.id, measured);
                }
                return measured;
            } catch (error) {
                console.warn('[Loudness] Track analysis failed:', error);
                return null;
            } finally {
                this._inFlight.delete(track.id);
            }
        })();

        this._inFlight.set(track.id, task);
        return task;
    }

    async analyzeTracksSequentially(tracks, { storage, onTrackMeasured, onProgress } = {}) {
        if (!Array.isArray(tracks) || tracks.length === 0) {
            return { total: 0, analyzed: 0, skipped: 0, failed: 0 };
        }
        let analyzed = 0;
        let skipped = 0;
        let failed = 0;
        const total = tracks.length;

        for (let i = 0; i < total; i++) {
            const track = tracks[i];
            if (isValidLoudness(track?.loudness)) {
                skipped++;
            } else {
                const measured = await this.ensureTrackLoudness(track, { storage });
                if (measured) {
                    analyzed++;
                    onTrackMeasured?.(track, measured);
                } else {
                    failed++;
                }
            }
            onProgress?.({ completed: i + 1, total, analyzed, skipped, failed });
        }

        return { total, analyzed, skipped, failed };
    }

    async analyzeLibrary({ storage, onTrackMeasured, onProgress } = {}) {
        if (this._libraryScanPromise) return this._libraryScanPromise;
        this._libraryScanPromise = (async () => {
            try {
                const tracks = storage ? await storage.getAllTracks() : [];
                return await this.analyzeTracksSequentially(tracks, {
                    storage,
                    onTrackMeasured,
                    onProgress
                });
            } finally {
                this._libraryScanPromise = null;
            }
        })();
        return this._libraryScanPromise;
    }
}

export const loudnessCoordinator = new LoudnessCoordinator();
