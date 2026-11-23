// js/core/crossfeedNode.js
export const CROSSFEED_MODES = Object.freeze(['off', 'subtle', 'room']);

export const CROSSFEED_PRESETS = Object.freeze({
    off: Object.freeze({
        directGain: 1.0,
        crossGain: 0.0,
        cutoffHz: 900,
        delaySec: 0.00025
    }),
    subtle: Object.freeze({
        directGain: 0.88,
        crossGain: 0.18,
        cutoffHz: 900,
        delaySec: 0.00025
    }),
    room: Object.freeze({
        directGain: 0.78,
        crossGain: 0.32,
        cutoffHz: 700,
        delaySec: 0.00035
    })
});

export function normalizeCrossfeedMode(mode) {
    if (typeof mode !== 'string') return 'off';
    const normalized = mode.trim().toLowerCase();
    return CROSSFEED_MODES.includes(normalized) ? normalized : 'off';
}

const rampParam = (param, target, now, immediate = false) => {
    if (!param) return;
    if (typeof param.cancelScheduledValues === 'function') {
        param.cancelScheduledValues(now);
    }
    if (immediate || typeof param.linearRampToValueAtTime !== 'function') {
        if (typeof param.setValueAtTime === 'function') {
            param.setValueAtTime(target, now);
        } else {
            param.value = target;
        }
        return;
    }
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + 0.035);
};

export function createCrossfeedStage(audioCtx, initialMode = 'off') {
    if (
        !audioCtx ||
        typeof audioCtx.createGain !== 'function' ||
        typeof audioCtx.createChannelSplitter !== 'function' ||
        typeof audioCtx.createChannelMerger !== 'function' ||
        typeof audioCtx.createBiquadFilter !== 'function' ||
        typeof audioCtx.createDelay !== 'function'
    ) {
        return null;
    }

    const createdNodes = [];
    const track = (node) => {
        createdNodes.push(node);
        return node;
    };

    try {
        const mode = normalizeCrossfeedMode(initialMode);
        const preset = CROSSFEED_PRESETS[mode];

        const input = track(audioCtx.createGain());
        input.gain.value = 1.0;

        const splitter = track(audioCtx.createChannelSplitter(2));
        const merger = track(audioCtx.createChannelMerger(2));

        const directL = track(audioCtx.createGain());
        const directR = track(audioCtx.createGain());
        directL.gain.value = preset.directGain;
        directR.gain.value = preset.directGain;

        const crossFilterLR = track(audioCtx.createBiquadFilter());
        const crossFilterRL = track(audioCtx.createBiquadFilter());
        crossFilterLR.type = 'lowpass';
        crossFilterRL.type = 'lowpass';
        crossFilterLR.frequency.value = preset.cutoffHz;
        crossFilterRL.frequency.value = preset.cutoffHz;

        const crossDelayLR = track(audioCtx.createDelay(0.01));
        const crossDelayRL = track(audioCtx.createDelay(0.01));
        crossDelayLR.delayTime.value = preset.delaySec;
        crossDelayRL.delayTime.value = preset.delaySec;

        const crossGainLR = track(audioCtx.createGain());
        const crossGainRL = track(audioCtx.createGain());
        crossGainLR.gain.value = preset.crossGain;
        crossGainRL.gain.value = preset.crossGain;

        // Wire internal stereo matrix before returning so partial routing never leaks audio.
        input.connect(splitter);

        splitter.connect(directL, 0);
        splitter.connect(directR, 1);
        directL.connect(merger, 0, 0);
        directR.connect(merger, 0, 1);

        splitter.connect(crossFilterLR, 0);
        crossFilterLR.connect(crossDelayLR);
        crossDelayLR.connect(crossGainLR);
        crossGainLR.connect(merger, 0, 1);

        splitter.connect(crossFilterRL, 1);
        crossFilterRL.connect(crossDelayRL);
        crossDelayRL.connect(crossGainRL);
        crossGainRL.connect(merger, 0, 0);

        const applyMode = (nextMode, { immediate = false } = {}) => {
            const safeMode = normalizeCrossfeedMode(nextMode);
            const nextPreset = CROSSFEED_PRESETS[safeMode];
            const now = audioCtx.currentTime ?? 0;

            rampParam(directL.gain, nextPreset.directGain, now, immediate);
            rampParam(directR.gain, nextPreset.directGain, now, immediate);
            rampParam(crossGainLR.gain, nextPreset.crossGain, now, immediate);
            rampParam(crossGainRL.gain, nextPreset.crossGain, now, immediate);
            rampParam(crossFilterLR.frequency, nextPreset.cutoffHz, now, immediate);
            rampParam(crossFilterRL.frequency, nextPreset.cutoffHz, now, immediate);
            rampParam(crossDelayLR.delayTime, nextPreset.delaySec, now, immediate);
            rampParam(crossDelayRL.delayTime, nextPreset.delaySec, now, immediate);

            return safeMode;
        };

        const disconnect = () => {
            for (const node of createdNodes) {
                try { node.disconnect?.(); } catch { /* Best-effort cleanup. */ }
            }
        };

        return {
            input,
            output: merger,
            nodes: {
                input,
                splitter,
                merger,
                directL,
                directR,
                crossFilterLR,
                crossFilterRL,
                crossDelayLR,
                crossDelayRL,
                crossGainLR,
                crossGainRL
            },
            applyMode,
            disconnect
        };
    } catch (error) {
        console.warn('[Crossfeed] Unable to initialize crossfeed stage; bypassing:', error);
        for (const node of createdNodes) {
            try { node.disconnect?.(); } catch { /* Best-effort cleanup. */ }
        }
        return null;
    }
}
