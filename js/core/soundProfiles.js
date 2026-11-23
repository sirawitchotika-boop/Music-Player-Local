// js/core/soundProfiles.js
import { normalizeCrossfeedMode } from './crossfeedNode.js';

export const PROFILES_STORAGE_KEY = 'gt_soundmaster_sound_profiles';
export const ACTIVE_PROFILE_STORAGE_KEY = 'gt_soundmaster_active_profile';
const BANDS = ['bass', 'mid', 'treble'];

export const clampEqBand = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(-6, Math.min(6, Math.round(numeric)));
};

export function normalizeSoundSettings(raw = {}) {
    const eqRaw = raw && typeof raw.eq === 'object' && !Array.isArray(raw.eq) ? raw.eq : raw;
    const eq = Object.fromEntries(BANDS.map(band => [band, clampEqBand(eqRaw?.[band])]));
    return {
        eq,
        leveling: Boolean(raw?.leveling),
        crossfeed: normalizeCrossfeedMode(raw?.crossfeed)
    };
}

export function soundSettingsEqual(a, b) {
    const first = normalizeSoundSettings(a);
    const second = normalizeSoundSettings(b);
    return first.eq.bass === second.eq.bass &&
        first.eq.mid === second.eq.mid &&
        first.eq.treble === second.eq.treble &&
        first.leveling === second.leveling &&
        first.crossfeed === second.crossfeed;
}

export const BUILTIN_PROFILES = Object.freeze([
    Object.freeze({
        id: 'pure-flat',
        name: 'Pure Flat',
        builtin: true,
        settings: Object.freeze({
            eq: Object.freeze({ bass: 0, mid: 0, treble: 0 }),
            leveling: false,
            crossfeed: 'off'
        })
    }),
    Object.freeze({
        id: 'earbuds',
        name: 'Earbuds',
        builtin: true,
        settings: Object.freeze({
            eq: Object.freeze({ bass: 2, mid: 0, treble: 1 }),
            leveling: true,
            crossfeed: 'subtle'
        })
    }),
    Object.freeze({
        id: 'car-speaker',
        name: 'Car / Speaker',
        builtin: true,
        settings: Object.freeze({
            eq: Object.freeze({ bass: 3, mid: 1, treble: 1 }),
            leveling: true,
            crossfeed: 'off'
        })
    }),
    Object.freeze({
        id: 'late-night',
        name: 'Late Night',
        builtin: true,
        settings: Object.freeze({
            eq: Object.freeze({ bass: -1, mid: 1, treble: -2 }),
            leveling: true,
            crossfeed: 'room'
        })
    })
]);

const BUILTIN_IDS = new Set(BUILTIN_PROFILES.map(p => p.id));

export function isBuiltinProfileId(id) {
    return BUILTIN_IDS.has(id);
}

export function sanitizeProfileName(name) {
    if (typeof name !== 'string') return '';
    return name.trim().slice(0, 32);
}

export function loadCustomProfiles(storageObj = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    try {
        const raw = storageObj?.getItem(PROFILES_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        const seen = new Set();
        const profiles = [];
        for (const item of parsed) {
            if (!item || typeof item !== 'object') continue;
            const id = typeof item.id === 'string' && item.id.startsWith('sp_') ? item.id : null;
            const name = sanitizeProfileName(item.name);
            if (!id || !name || seen.has(id) || BUILTIN_IDS.has(id)) continue;
            seen.add(id);
            profiles.push({
                id,
                name,
                builtin: false,
                settings: normalizeSoundSettings(item.settings)
            });
        }
        return profiles;
    } catch {
        return [];
    }
}

export function saveCustomProfiles(customProfiles, storageObj = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    try {
        if (!storageObj) return false;
        const clean = (Array.isArray(customProfiles) ? customProfiles : [])
            .filter(p => p && !p.builtin && typeof p.id === 'string' && p.id.startsWith('sp_') && sanitizeProfileName(p.name))
            .map(p => ({
                id: p.id,
                name: sanitizeProfileName(p.name),
                settings: normalizeSoundSettings(p.settings)
            }));
        storageObj.setItem(PROFILES_STORAGE_KEY, JSON.stringify(clean));
        return true;
    } catch (error) {
        console.warn('[SoundProfiles] Could not save custom profiles:', error);
        return false;
    }
}

export function getAllProfiles(customProfiles = []) {
    return [
        ...BUILTIN_PROFILES.map(p => ({
            id: p.id,
            name: p.name,
            builtin: true,
            settings: normalizeSoundSettings(p.settings)
        })),
        ...(Array.isArray(customProfiles) ? customProfiles : []).map(p => ({
            id: p.id,
            name: sanitizeProfileName(p.name),
            builtin: false,
            settings: normalizeSoundSettings(p.settings)
        }))
    ];
}

export function createCustomProfile(name, settings, existingProfiles = []) {
    const cleanName = sanitizeProfileName(name);
    if (!cleanName) return { error: 'Enter a profile name.' };

    const duplicate = existingProfiles.some(p => p.name.toLowerCase() === cleanName.toLowerCase());
    if (duplicate) return { error: 'A profile with this name already exists.' };

    const profile = {
        id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        builtin: false,
        settings: normalizeSoundSettings(settings)
    };
    return { profile };
}

export function renameCustomProfile(id, newName, customProfiles = [], allProfiles = []) {
    if (isBuiltinProfileId(id)) return { error: 'Built-in profiles cannot be renamed.' };
    const cleanName = sanitizeProfileName(newName);
    if (!cleanName) return { error: 'Enter a profile name.' };

    const duplicate = allProfiles.some(p => p.id !== id && p.name.toLowerCase() === cleanName.toLowerCase());
    if (duplicate) return { error: 'A profile with this name already exists.' };

    const index = customProfiles.findIndex(p => p.id === id);
    if (index === -1) return { error: 'Profile not found.' };

    const updated = customProfiles.map(p => (p.id === id ? { ...p, name: cleanName } : p));
    return { customProfiles: updated, name: cleanName };
}

export function updateCustomProfileSettings(id, settings, customProfiles = []) {
    if (isBuiltinProfileId(id)) return { error: 'Built-in profiles cannot be overwritten. Use Save As instead.' };
    const index = customProfiles.findIndex(p => p.id === id);
    if (index === -1) return { error: 'Profile not found.' };

    const normalized = normalizeSoundSettings(settings);
    const updated = customProfiles.map(p => (p.id === id ? { ...p, settings: normalized } : p));
    return { customProfiles: updated, settings: normalized };
}

export function deleteCustomProfile(id, customProfiles = []) {
    if (isBuiltinProfileId(id)) return { error: 'Built-in profiles cannot be deleted.' };
    const exists = customProfiles.some(p => p.id === id);
    if (!exists) return { error: 'Profile not found.' };
    return { customProfiles: customProfiles.filter(p => p.id !== id) };
}
