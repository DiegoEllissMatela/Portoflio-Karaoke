import type { AppState, PortableSettingsData, DareCategoryId, DareEntry } from '../types/logicTypes.ts';
import { normalizeDareEntry } from '../utils/dareEngine.ts';
import { parseFromTxt, serializeToTxt, type CatalogSongRef } from './txtSettingsParser.ts';
import { DEFAULT_DARE_DRINK_SONG_IDS, DEFAULT_JUST_DRINK_SONG_IDS } from '../constants/defaultSongs.ts';

export type { PortableSettingsData };

const LOCAL_STORAGE_KEY = 'automate_karaoke_app_state_v2';
const API_SETTINGS_URL = '/api/settings';
const STATIC_FALLBACK_URLS = [
  '/save.txt',
  '/save/save.txt',
  '/save/save.json',
  '/save.json',
  '/settings/karaoke_settings.json',
];

let saveTimeoutId: ReturnType<typeof setTimeout> | null = null;

function sanitizePortableSettings(data: PortableSettingsData): PortableSettingsData {
  if (data?.appState) {
    // If an old save file had thousands of disabled song IDs from "Disable All", migrate to lightweight whitelist mode
    if (data.appState.disabledSongs && data.appState.disabledSongs.length > 50) {
      data.appState.allSongsDisabled = true;
      data.appState.disabledSongs = [];
    }

    // Normalize customDares so string entries are upgraded to structured DareItems
    if (data.appState.customDares) {
      const normalizedCustoms: Record<string, DareEntry[]> = {};
      for (const [cat, entries] of Object.entries(data.appState.customDares)) {
        if (Array.isArray(entries)) {
          normalizedCustoms[cat] = entries.map((entry) => normalizeDareEntry(entry));
        }
      }
      data.appState.customDares = normalizedCustoms as Record<DareCategoryId, DareEntry[]>;
    }

    // Ensure modeSettings exists and contains individualized settings for each mode
    if (!data.appState.modeSettings) {
      data.appState.modeSettings = {
        DARE_DRINK: {
          allSongsDisabled: Boolean(data.appState.allSongsDisabled ?? true),
          disabledSongs: data.appState.disabledSongs || [],
          enabledSongs: (data.appState.enabledSongs && data.appState.enabledSongs.length > 5)
            ? data.appState.enabledSongs
            : [...DEFAULT_DARE_DRINK_SONG_IDS],
          dareBlanksPerSong: data.appState.dareBlanksPerSong ?? 4,
          dareMinWordLength: data.appState.dareMinWordLength ?? 4,
          dareMaxWordLength: data.appState.dareMaxWordLength ?? 12,
          disabledDares: data.appState.disabledDares || [],
          qrQueueEnabled: false,
        },
        JUST_DRINK: {
          allSongsDisabled: Boolean(data.appState.allSongsDisabled ?? true),
          disabledSongs: data.appState.disabledSongs || [],
          enabledSongs: (data.appState.enabledSongs && data.appState.enabledSongs.length > 5)
            ? data.appState.enabledSongs
            : [...DEFAULT_JUST_DRINK_SONG_IDS],
          dareBlanksPerSong: data.appState.dareBlanksPerSong ?? 4,
          dareMinWordLength: data.appState.dareMinWordLength ?? 4,
          dareMaxWordLength: data.appState.dareMaxWordLength ?? 12,
          disabledDares: data.appState.disabledDares || [],
          qrQueueEnabled: false,
        },
        NORMAL: {
          allSongsDisabled: false,
          disabledSongs: [],
          enabledSongs: [],
          qrQueueEnabled: true,
        },
        DARE: {
          allSongsDisabled: true,
          disabledSongs: [],
          enabledSongs: (data.appState.enabledSongs && data.appState.enabledSongs.length > 5)
            ? data.appState.enabledSongs
            : [...DEFAULT_DARE_DRINK_SONG_IDS],
          dareBlanksPerSong: data.appState.dareBlanksPerSong ?? 4,
          dareMinWordLength: data.appState.dareMinWordLength ?? 4,
          dareMaxWordLength: data.appState.dareMaxWordLength ?? 12,
          disabledDares: data.appState.disabledDares || [],
          qrQueueEnabled: false,
        },
      };
    } else {
      // Check existing modeSettings: Ensure DARE_DRINK and JUST_DRINK have the 300 default songs if previously unset or at legacy 3-5 songs
      const dd = data.appState.modeSettings.DARE_DRINK;
      if (dd) {
        if (!dd.enabledSongs || dd.enabledSongs.length <= 5) {
          dd.enabledSongs = [...DEFAULT_DARE_DRINK_SONG_IDS];
          dd.allSongsDisabled = true;
        }
      }
      const jd = data.appState.modeSettings.JUST_DRINK;
      if (jd) {
        if (!jd.enabledSongs || jd.enabledSongs.length <= 5) {
          jd.enabledSongs = [...DEFAULT_JUST_DRINK_SONG_IDS];
          jd.allSongsDisabled = true;
        }
      }
    }

    // Keep active gameMode enabledSongs aligned with default 300 songs if at legacy or empty
    const currentMode = data.appState.gameMode || 'DARE_DRINK';
    if (currentMode === 'DARE_DRINK' || currentMode === 'JUST_DRINK') {
      if (!data.appState.enabledSongs || data.appState.enabledSongs.length <= 5) {
        data.appState.enabledSongs = [...DEFAULT_DARE_DRINK_SONG_IDS];
        data.appState.allSongsDisabled = true;
      }
    }
  }
  return data;
}

/**
 * Loads application settings from the app's internal folder (`settings/karaoke_settings.json`).
 * Falls back to localStorage if running statically without a backend.
 */
export async function loadAppSettings(): Promise<PortableSettingsData | null> {
  // 1. Try local Vite server API endpoint
  try {
    const res = await fetch(`${API_SETTINGS_URL}?t=${Date.now()}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
    if (res.ok) {
      const data: any = await res.json();
      if (data && data.exists !== false && (data.appState || data.players || data.disabledSongs)) {
        // If data is directly appState or wrapped in PortableSettingsData
        const portable: PortableSettingsData = {
          version: data.version || '1.0.0',
          savedAt: data.savedAt || new Date().toISOString(),
          appState: data.appState || data,
          toneGuide: data.toneGuide,
        };
        return sanitizePortableSettings(portable);
      }
    }
  } catch (err) {
    // API not reachable or static host, proceed to fallback
  }

  // 2. Try static public file fallback
  for (const staticUrl of STATIC_FALLBACK_URLS) {
    try {
      const res = await fetch(`${staticUrl}?t=${Date.now()}`);
      if (res.ok) {
        if (staticUrl.endsWith('.txt')) {
          const txt = await res.text();
          if (txt && txt.includes('[')) {
            return sanitizePortableSettings(parseFromTxt(txt));
          }
        } else {
          const data: any = await res.json();
          if (data && (data.appState || data.players || data.disabledSongs)) {
            return sanitizePortableSettings({
              version: data.version || '1.0.0',
              savedAt: data.savedAt || new Date().toISOString(),
              appState: data.appState || data,
              toneGuide: data.toneGuide,
            });
          }
        }
      }
    } catch {
      // Continue to next fallback
    }
  }

  // 3. Fallback to localStorage
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      let toneGuide: { enabled: boolean; volume: number } | undefined;
      const tgEnabled = localStorage.getItem('dnm_tone_guide_enabled');
      const tgVol = localStorage.getItem('dnm_tone_guide_volume');
      if (tgEnabled !== null || tgVol !== null) {
        toneGuide = {
          enabled: tgEnabled !== null ? tgEnabled === 'true' : true,
          volume: tgVol !== null ? parseFloat(tgVol) : 0.50,
        };
      }
      return sanitizePortableSettings({
        version: '1.0.0',
        savedAt: new Date().toISOString(),
        appState: parsed,
        toneGuide,
      });
    }
  } catch (err) {
    console.error('[SettingsStorage] Error reading localStorage:', err);
  }

  return null;
}

/**
 * Saves application settings directly to the app's internal folder (`settings/karaoke_settings.json`).
 * Automatically debounced to prevent excessive disk writes during slider adjustments.
 */
export function saveAppSettings(
  appState: AppState,
  extra?: { toneGuide?: { enabled: boolean; volume: number } },
  immediate: boolean = false
): Promise<boolean> {
  const payload: PortableSettingsData = {
    version: '1.0.0',
    savedAt: new Date().toISOString(),
    appState,
    toneGuide: extra?.toneGuide,
  };

  // Sync to localStorage immediately as secondary safety backup
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appState));
    if (extra?.toneGuide) {
      localStorage.setItem('dnm_tone_guide_enabled', String(extra.toneGuide.enabled));
      localStorage.setItem('dnm_tone_guide_volume', String(extra.toneGuide.volume));
    }
  } catch (err) {
    console.error('[SettingsStorage] localStorage write failed:', err);
  }

  if (saveTimeoutId) {
    clearTimeout(saveTimeoutId);
    saveTimeoutId = null;
  }

  const performSave = async (): Promise<boolean> => {
    try {
      const res = await fetch(API_SETTINGS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (err) {
      // In offline / static preview, API may be absent
      return false;
    }
  };

  if (immediate) {
    return performSave();
  }

  return new Promise((resolve) => {
    saveTimeoutId = setTimeout(async () => {
      const ok = await performSave();
      resolve(ok);
    }, 350);
  });
}

/**
 * Exports settings as a human-readable `save.txt` file readable/editable in Windows Notepad.
 */
export function exportTxtSettingsFile(
  appState: AppState,
  extra?: { toneGuide?: { enabled: boolean; volume: number } },
  catalog?: CatalogSongRef[]
): void {
  const payload: PortableSettingsData = {
    version: '1.0.0',
    savedAt: new Date().toISOString(),
    appState,
    toneGuide: extra?.toneGuide,
  };

  const txtContent = serializeToTxt(payload, catalog);
  const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'save.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports settings as a downloadable `save.json` file.
 */
export function exportSettingsFile(
  appState: AppState,
  extra?: { toneGuide?: { enabled: boolean; volume: number } }
): void {
  const payload: PortableSettingsData = {
    version: '1.0.0',
    savedAt: new Date().toISOString(),
    appState,
    toneGuide: extra?.toneGuide,
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'save.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Imports settings from a user-selected .txt or .json file, validates it, and persists it.
 */
export async function importSettingsFromFile(
  file: File,
  catalog?: CatalogSongRef[]
): Promise<PortableSettingsData> {
  const text = await file.text();

  // If text file or does not start with JSON brace
  if (file.name.toLowerCase().endsWith('.txt') || !text.trim().startsWith('{')) {
    const parsedTxt = sanitizePortableSettings(parseFromTxt(text, catalog));
    if (parsedTxt.appState) {
      await saveAppSettings(parsedTxt.appState as AppState, { toneGuide: parsedTxt.toneGuide }, true);
    }
    return parsedTxt;
  }

  // Otherwise parse as JSON
  const parsed = JSON.parse(text);
  if (!parsed || (typeof parsed !== 'object')) {
    throw new Error('Invalid settings file format: file must contain a JSON object or formatted text.');
  }

  const appStateData: Partial<AppState> = parsed.appState || parsed;
  const portable: PortableSettingsData = sanitizePortableSettings({
    version: parsed.version || '1.0.0',
    savedAt: parsed.savedAt || new Date().toISOString(),
    appState: appStateData,
    toneGuide: parsed.toneGuide,
  });

  // Immediately persist imported settings
  await saveAppSettings(appStateData as AppState, { toneGuide: portable.toneGuide }, true);
  return portable;
}
