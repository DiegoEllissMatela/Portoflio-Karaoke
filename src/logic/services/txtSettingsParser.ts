import type { AppState, GameMode, InputMode, PortableSettingsData, ModeSongSettings, ModeSettingsMap, DareEntry, DareInteractiveType } from '../types/logicTypes.ts';
import { normalizeDareEntry } from '../utils/dareEngine.ts';

export interface CatalogSongRef {
  id: string;
  title: string;
  artist?: string;
}

/**
 * Serializes application state into a clean, human-readable text file that can be
 * easily viewed and edited in Windows Notepad.
 */
export function serializeToTxt(
  data: PortableSettingsData,
  catalog: CatalogSongRef[] = []
): string {
  const app = data.appState || {};
  const lines: string[] = [];

  // Helper to resolve title from ID
  const idToDisplay = (id: string): string => {
    const found = catalog.find(s => s.id.toLowerCase() === id.toLowerCase());
    if (found) {
      return found.artist ? `${found.title} - ${found.artist}` : found.title;
    }
    return id;
  };

  lines.push('# ========================================================');
  lines.push('# AUTOMATE KARAOKE - HUMAN READABLE SAVE FILE');
  lines.push('# You can view/edit this file in Notepad or copy it anywhere!');
  lines.push('# Lines starting with # are comments and will be ignored.');
  lines.push('# ========================================================');
  lines.push('');

  const activeMode: GameMode = app.gameMode || 'DARE_DRINK';
  const modeSettings: ModeSettingsMap = app.modeSettings || {};

  // Extract or fallback individual mode settings
  const dareDrink: ModeSongSettings = modeSettings.DARE_DRINK || {
    allSongsDisabled: activeMode === 'DARE_DRINK' ? Boolean(app.allSongsDisabled) : true,
    enabledSongs: activeMode === 'DARE_DRINK' ? (app.enabledSongs || []) : [],
    disabledSongs: activeMode === 'DARE_DRINK' ? (app.disabledSongs || []) : [],
    dareBlanksPerSong: app.dareBlanksPerSong ?? 4,
    dareMinWordLength: app.dareMinWordLength ?? 4,
    dareMaxWordLength: app.dareMaxWordLength ?? 12,
  };

  const normal: ModeSongSettings = modeSettings.NORMAL || {
    allSongsDisabled: activeMode === 'NORMAL' ? Boolean(app.allSongsDisabled) : false,
    enabledSongs: activeMode === 'NORMAL' ? (app.enabledSongs || []) : [],
    disabledSongs: activeMode === 'NORMAL' ? (app.disabledSongs || []) : [],
  };

  const justDrink: ModeSongSettings = modeSettings.JUST_DRINK || modeSettings.DARE || {
    allSongsDisabled: (activeMode === 'JUST_DRINK' || activeMode === 'DARE') ? Boolean(app.allSongsDisabled) : true,
    enabledSongs: (activeMode === 'JUST_DRINK' || activeMode === 'DARE') ? (app.enabledSongs || []) : [],
    disabledSongs: (activeMode === 'JUST_DRINK' || activeMode === 'DARE') ? (app.disabledSongs || []) : [],
    dareBlanksPerSong: app.dareBlanksPerSong ?? 4,
    dareMinWordLength: app.dareMinWordLength ?? 4,
    dareMaxWordLength: app.dareMaxWordLength ?? 12,
  };

  // 1. GAME SETTINGS
  lines.push('[GAME SETTINGS]');
  lines.push(`Active Mode = ${activeMode}`);
  lines.push(`Current Singer = ${app.players && app.players.length > 0 ? (app.players[app.currentPlayerIndex ?? 0] || app.players[0]) : ''}`);
  lines.push(`Auto Resume = ${app.isAutoResumeEnabled !== false}`);
  lines.push(`Countdown = ${app.isCountdownEnabled !== false}`);
  lines.push(`Input Mode = ${app.inputMode || 'MANUAL'}`);
  lines.push('');

  // 2. PLAYERS
  lines.push('[PLAYERS]');
  lines.push('# One player name per line:');
  if (app.players && app.players.length > 0) {
    for (const p of app.players) {
      if (p.trim()) lines.push(p.trim());
    }
  } else {
    lines.push('Elliss');
  }
  lines.push('');

  // 3. SCORES
  lines.push('[SCORES]');
  lines.push('# Format: Player Name = SCORE1, SCORE2 (e.g. PERFECT, TWO_WORDS, ONE_WORD, ZERO)');
  if (app.playerScores && Object.keys(app.playerScores).length > 0) {
    for (const [player, scores] of Object.entries(app.playerScores)) {
      if (Array.isArray(scores) && scores.length > 0) {
        lines.push(`${player} = ${scores.join(', ')}`);
      }
    }
  }
  lines.push('');

  // 3.5. DRINKS (For Just Drink Mode)
  lines.push('[DRINKS]');
  lines.push('# Format: Player Name = Total Drinks Taken (e.g. 3)');
  if (app.playerDrinks && Object.keys(app.playerDrinks).length > 0) {
    for (const [player, drinks] of Object.entries(app.playerDrinks)) {
      if (typeof drinks === 'number') {
        lines.push(`${player} = ${drinks}`);
      }
    }
  }
  lines.push('');

  // 4. DARE X DRINKING MODE
  lines.push('# ========================================================');
  lines.push('# DARE X DRINKING MODE (Individual Mode Settings)');
  lines.push('# ========================================================');
  lines.push('[DARE_DRINK SETTINGS]');
  lines.push(`Blanks Per Song = ${dareDrink.dareBlanksPerSong ?? 4}`);
  lines.push(`Min Word Length = ${dareDrink.dareMinWordLength ?? 4}`);
  lines.push(`Max Word Length = ${dareDrink.dareMaxWordLength ?? 12}`);
  lines.push('');

  lines.push('[DARE_DRINK ENABLED SONGS]');
  lines.push('# Songs explicitly enabled in Dare x Drinking mode:');
  if (dareDrink.enabledSongs && dareDrink.enabledSongs.length > 0) {
    for (const id of dareDrink.enabledSongs) {
      lines.push(idToDisplay(id));
    }
  }
  lines.push('');

  lines.push('[DARE_DRINK DISABLED SONGS]');
  lines.push('# Songs explicitly disabled in Dare x Drinking mode:');
  if (dareDrink.allSongsDisabled || (dareDrink.enabledSongs && dareDrink.enabledSongs.length > 0 && (!dareDrink.disabledSongs || dareDrink.disabledSongs.length === 0 || dareDrink.disabledSongs.length > 50))) {
    lines.push('ALL_OTHERS_DISABLED = true');
  } else if (dareDrink.disabledSongs && dareDrink.disabledSongs.length > 0) {
    for (const id of dareDrink.disabledSongs) {
      lines.push(idToDisplay(id));
    }
  }
  lines.push('');

  // 5. NORMAL KARAOKE MODE
  lines.push('# ========================================================');
  lines.push('# NORMAL KARAOKE MODE (Individual Mode Settings)');
  lines.push('# ========================================================');
  lines.push('[NORMAL ENABLED SONGS]');
  lines.push('# Leave empty for all catalog songs, or list specific favorites:');
  if (normal.enabledSongs && normal.enabledSongs.length > 0) {
    for (const id of normal.enabledSongs) {
      lines.push(idToDisplay(id));
    }
  }
  lines.push('');

  lines.push('[NORMAL DISABLED SONGS]');
  lines.push('# Songs explicitly disabled in Normal Karaoke mode:');
  if (normal.allSongsDisabled) {
    lines.push('ALL_OTHERS_DISABLED = true');
  } else if (normal.disabledSongs && normal.disabledSongs.length > 0) {
    for (const id of normal.disabledSongs) {
      lines.push(idToDisplay(id));
    }
  }
  lines.push('');

  // 6. JUST DRINK MODE
  lines.push('# ========================================================');
  lines.push('# JUST DRINK MODE (Individual Mode Settings)');
  lines.push('# ========================================================');
  lines.push('[JUST_DRINK SETTINGS]');
  lines.push(`Blanks Per Song = ${justDrink.dareBlanksPerSong ?? 4}`);
  lines.push(`Min Word Length = ${justDrink.dareMinWordLength ?? 4}`);
  lines.push(`Max Word Length = ${justDrink.dareMaxWordLength ?? 12}`);
  lines.push('');

  lines.push('[JUST_DRINK ENABLED SONGS]');
  if (justDrink.enabledSongs && justDrink.enabledSongs.length > 0) {
    for (const id of justDrink.enabledSongs) {
      lines.push(idToDisplay(id));
    }
  }
  lines.push('');

  lines.push('[JUST_DRINK DISABLED SONGS]');
  if (justDrink.allSongsDisabled) {
    lines.push('ALL_OTHERS_DISABLED = true');
  } else if (justDrink.disabledSongs && justDrink.disabledSongs.length > 0) {
    for (const id of justDrink.disabledSongs) {
      lines.push(idToDisplay(id));
    }
  }
  lines.push('');

  // 7. AUDIO & DISPLAY
  lines.push('# ========================================================');
  lines.push('# GLOBAL AUDIO & DISPLAY SETTINGS');
  lines.push('# ========================================================');
  lines.push('[AUDIO & DISPLAY]');
  const volPct = Math.round(((app.globalAudioVolume ?? 0.5) * 100));
  lines.push(`Volume = ${volPct}%`);
  lines.push(`Muted = ${app.globalAudioMuted === true}`);
  lines.push(`Vocal Guide Enabled = ${data.toneGuide?.enabled !== false}`);
  const tgVolPct = Math.round(((data.toneGuide?.volume ?? 0.5) * 100));
  lines.push(`Vocal Guide Volume = ${tgVolPct}%`);
  lines.push(`Container Max Height = ${app.mainContentMaxHeight ?? 800}`);
  lines.push(`Container Max Width = ${app.mainContentMaxWidth ?? 2400}`);
  lines.push('');

  // 8. CUSTOM DARES
  lines.push('[CUSTOM DARES]');
  lines.push('# Format: Category = Dare text | INTERACTIVE_TYPE | DRINK_COUNT | SELECT_COUNT');
  lines.push('# Example: 3 Words = Pick 2 players | SINGER_PICKER | 2 | 2');
  if (app.customDares) {
    const formatDare = (entry: DareEntry): string => {
      if (typeof entry === 'string') return entry;
      const type = entry.interactiveType || 'PASS_OR_DRINK';
      const drinks = entry.drinkCount ?? 1;
      const selectCount = entry.config?.selectCount ? ` | ${entry.config.selectCount}` : '';
      return `${entry.text} | ${type} | ${drinks}${selectCount}`;
    };

    if (app.customDares.threeWords?.length) {
      for (const d of app.customDares.threeWords) lines.push(`3 Words = ${formatDare(d)}`);
    }
    if (app.customDares.twoWords?.length) {
      for (const d of app.customDares.twoWords) lines.push(`2 Words = ${formatDare(d)}`);
    }
    if (app.customDares.oneWord?.length) {
      for (const d of app.customDares.oneWord) lines.push(`1 Word = ${formatDare(d)}`);
    }
    if (app.customDares.zeroWords?.length) {
      for (const d of app.customDares.zeroWords) lines.push(`0 Words = ${formatDare(d)}`);
    }
    if (app.customDares.challenge?.length) {
      for (const d of app.customDares.challenge) lines.push(`Challenge = ${formatDare(d)}`);
    }
  }
  lines.push('');

  return lines.join('\r\n');
}

/**
 * Parses human-readable text into a structured PortableSettingsData object.
 */
export function parseFromTxt(
  txt: string,
  catalog: CatalogSongRef[] = []
): PortableSettingsData {
  const lines = txt.split(/\r?\n/);
  let currentSection = '';

  const modeSettings: ModeSettingsMap = {
    DARE_DRINK: {
      allSongsDisabled: true,
      disabledSongs: [],
      enabledSongs: [],
      dareBlanksPerSong: 4,
      dareMinWordLength: 4,
      dareMaxWordLength: 12,
    },
    JUST_DRINK: {
      allSongsDisabled: true,
      disabledSongs: [],
      enabledSongs: [],
      dareBlanksPerSong: 4,
      dareMinWordLength: 4,
      dareMaxWordLength: 12,
    },
    NORMAL: {
      allSongsDisabled: false,
      disabledSongs: [],
      enabledSongs: [],
    },
    DARE: {
      allSongsDisabled: true,
      disabledSongs: [],
      enabledSongs: [],
      dareBlanksPerSong: 4,
      dareMinWordLength: 4,
      dareMaxWordLength: 12,
    },
  };

  const app: Partial<AppState> = {
    players: [],
    playerScores: {},
    playerDrinks: {},
    disabledSongs: [],
    enabledSongs: [],
    modeSettings,
    customDares: {
      threeWords: [],
      twoWords: [],
      oneWord: [],
      zeroWords: [],
      challenge: [],
    },
    categoryNames: {
      threeWords: '3 Words',
      twoWords: '2 Words',
      oneWord: '1 Word',
      zeroWords: '0 Words',
      challenge: 'Challenge',
    },
    scoreOutcomeMapping: {
      PERFECT: 'threeWords',
      TWO_WORDS: 'twoWords',
      ONE_WORD: 'oneWord',
      ZERO: 'zeroWords',
      EXTRA: 'challenge',
    },
  };

  let toneGuideEnabled = true;
  let toneGuideVolume = 0.5;

  // Helper to match text to catalog song ID
  const resolveSongId = (input: string): string => {
    const raw = input.trim();
    if (!raw) return '';
    const cleanLower = raw.toLowerCase();

    // Check exact ID match first
    const exactId = catalog.find(s => s.id.toLowerCase() === cleanLower);
    if (exactId) return exactId.id;

    // Check "Title - Artist" format
    if (raw.includes(' - ')) {
      const parts = raw.split(' - ');
      const titlePart = parts[0].trim().toLowerCase();
      const artistPart = parts[1].trim().toLowerCase();
      const match = catalog.find(s =>
        s.title.toLowerCase() === titlePart &&
        (s.artist ? s.artist.toLowerCase().includes(artistPart) : true)
      );
      if (match) return match.id;
    }

    // Check by title match
    const titleMatch = catalog.find(s => s.title.toLowerCase() === cleanLower);
    if (titleMatch) return titleMatch.id;

    // Substring title match
    const partialMatch = catalog.find(s => s.title.toLowerCase().includes(cleanLower));
    if (partialMatch) return partialMatch.id;

    // Default to slugified raw string if catalog is not loaded yet
    return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || raw;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      continue;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.substring(1, line.length - 1).trim().toUpperCase();
      continue;
    }

    const eqIdx = line.indexOf('=');
    const key = eqIdx !== -1 ? line.substring(0, eqIdx).trim().toLowerCase() : '';
    const val = eqIdx !== -1 ? line.substring(eqIdx + 1).trim() : line;

    switch (currentSection) {
      case 'GAME SETTINGS': {
        if (key === 'mode' || key === 'active mode') {
          const rawMode = val.toUpperCase().replace(/\s+/g, '_');
          if (rawMode === 'JUST_DRINK' || rawMode === 'DRINK' || rawMode === 'JUSTDRINK' || rawMode === 'DARE') {
            app.gameMode = 'JUST_DRINK';
          } else {
            app.gameMode = rawMode as GameMode;
          }
        } else if (key === 'current singer') {
          // If singer specified, will resolve index once players are read
          (app as any)._targetSinger = val;
        } else if (key === 'auto resume') {
          app.isAutoResumeEnabled = val.toLowerCase() === 'true';
        } else if (key === 'countdown') {
          app.isCountdownEnabled = val.toLowerCase() === 'true';
        } else if (key === 'input mode') {
          app.inputMode = val.toUpperCase() as InputMode;
        }
        break;
      }

      case 'PLAYERS': {
        // Line without '=' or with key
        const playerName = eqIdx !== -1 ? val : line;
        if (playerName && !app.players!.includes(playerName)) {
          app.players!.push(playerName);
        }
        break;
      }

      case 'SCORES': {
        if (eqIdx !== -1) {
          const playerName = line.substring(0, eqIdx).trim();
          const scoresList = val.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
          app.playerScores![playerName] = scoresList as any[];
        }
        break;
      }

      case 'DRINKS': {
        if (eqIdx !== -1) {
          const playerName = line.substring(0, eqIdx).trim();
          const count = parseInt(val.trim(), 10);
          if (!isNaN(count)) {
            app.playerDrinks![playerName] = count;
          }
        }
        break;
      }

      case 'DARE_DRINK SETTINGS': {
        if (key === 'blanks per song') {
          const num = parseInt(val, 10);
          if (!isNaN(num)) modeSettings.DARE_DRINK!.dareBlanksPerSong = num;
        } else if (key === 'min word length') {
          const num = parseInt(val, 10);
          if (!isNaN(num)) modeSettings.DARE_DRINK!.dareMinWordLength = num;
        } else if (key === 'max word length') {
          const num = parseInt(val, 10);
          if (!isNaN(num)) modeSettings.DARE_DRINK!.dareMaxWordLength = num;
        }
        break;
      }

      case 'DARE_DRINK ENABLED SONGS': {
        const songName = eqIdx !== -1 ? val : line;
        const resolvedId = resolveSongId(songName);
        if (resolvedId && !modeSettings.DARE_DRINK!.enabledSongs!.includes(resolvedId)) {
          modeSettings.DARE_DRINK!.enabledSongs!.push(resolvedId);
        }
        break;
      }

      case 'DARE_DRINK DISABLED SONGS': {
        if (key === 'all_others_disabled' || line.toLowerCase().includes('all_others_disabled')) {
          modeSettings.DARE_DRINK!.allSongsDisabled = true;
          break;
        }
        const songName = eqIdx !== -1 ? val : line;
        const resolvedId = resolveSongId(songName);
        if (resolvedId && !modeSettings.DARE_DRINK!.disabledSongs!.includes(resolvedId)) {
          modeSettings.DARE_DRINK!.disabledSongs!.push(resolvedId);
        }
        break;
      }

      case 'NORMAL ENABLED SONGS': {
        const songName = eqIdx !== -1 ? val : line;
        const resolvedId = resolveSongId(songName);
        if (resolvedId && !modeSettings.NORMAL!.enabledSongs!.includes(resolvedId)) {
          modeSettings.NORMAL!.enabledSongs!.push(resolvedId);
        }
        break;
      }

      case 'NORMAL DISABLED SONGS': {
        if (key === 'all_others_disabled' || line.toLowerCase().includes('all_others_disabled')) {
          modeSettings.NORMAL!.allSongsDisabled = true;
          break;
        }
        const songName = eqIdx !== -1 ? val : line;
        const resolvedId = resolveSongId(songName);
        if (resolvedId && !modeSettings.NORMAL!.disabledSongs!.includes(resolvedId)) {
          modeSettings.NORMAL!.disabledSongs!.push(resolvedId);
        }
        break;
      }

      case 'JUST_DRINK SETTINGS':
      case 'DARE SETTINGS': {
        if (key === 'blanks per song') {
          const num = parseInt(val, 10);
          if (!isNaN(num)) {
            modeSettings.JUST_DRINK!.dareBlanksPerSong = num;
            modeSettings.DARE!.dareBlanksPerSong = num;
            app.dareBlanksPerSong = num;
          }
        } else if (key === 'min word length') {
          const num = parseInt(val, 10);
          if (!isNaN(num)) {
            modeSettings.JUST_DRINK!.dareMinWordLength = num;
            modeSettings.DARE!.dareMinWordLength = num;
            app.dareMinWordLength = num;
          }
        } else if (key === 'max word length') {
          const num = parseInt(val, 10);
          if (!isNaN(num)) {
            modeSettings.JUST_DRINK!.dareMaxWordLength = num;
            modeSettings.DARE!.dareMaxWordLength = num;
            app.dareMaxWordLength = num;
          }
        }
        break;
      }

      case 'JUST_DRINK ENABLED SONGS':
      case 'DARE ENABLED SONGS': {
        const songName = eqIdx !== -1 ? val : line;
        const resolvedId = resolveSongId(songName);
        if (resolvedId) {
          if (!modeSettings.JUST_DRINK!.enabledSongs!.includes(resolvedId)) {
            modeSettings.JUST_DRINK!.enabledSongs!.push(resolvedId);
          }
          if (!modeSettings.DARE!.enabledSongs!.includes(resolvedId)) {
            modeSettings.DARE!.enabledSongs!.push(resolvedId);
          }
        }
        break;
      }

      case 'JUST_DRINK DISABLED SONGS':
      case 'DARE DISABLED SONGS': {
        if (key === 'all_others_disabled' || line.toLowerCase().includes('all_others_disabled')) {
          modeSettings.JUST_DRINK!.allSongsDisabled = true;
          modeSettings.DARE!.allSongsDisabled = true;
          break;
        }
        const songName = eqIdx !== -1 ? val : line;
        const resolvedId = resolveSongId(songName);
        if (resolvedId) {
          if (!modeSettings.JUST_DRINK!.disabledSongs!.includes(resolvedId)) {
            modeSettings.JUST_DRINK!.disabledSongs!.push(resolvedId);
          }
          if (!modeSettings.DARE!.disabledSongs!.includes(resolvedId)) {
            modeSettings.DARE!.disabledSongs!.push(resolvedId);
          }
        }
        break;
      }

      case 'ENABLED SONGS': {
        const songName = eqIdx !== -1 ? val : line;
        const resolvedId = resolveSongId(songName);
        if (resolvedId && !app.enabledSongs!.includes(resolvedId)) {
          app.enabledSongs!.push(resolvedId);
        }
        break;
      }

      case 'DISABLED SONGS': {
        if (key === 'all_others_disabled' || line.toLowerCase().includes('all_others_disabled')) {
          app.allSongsDisabled = true;
          break;
        }
        const songName = eqIdx !== -1 ? val : line;
        const resolvedId = resolveSongId(songName);
        if (resolvedId && !app.disabledSongs!.includes(resolvedId)) {
          app.disabledSongs!.push(resolvedId);
        }
        break;
      }

      case 'AUDIO & DISPLAY': {
        if (key === 'volume') {
          const num = parseFloat(val.replace('%', ''));
          if (!isNaN(num)) {
            app.globalAudioVolume = val.includes('%') ? num / 100 : num;
          }
        } else if (key === 'muted') {
          app.globalAudioMuted = val.toLowerCase() === 'true';
        } else if (key === 'vocal guide enabled') {
          toneGuideEnabled = val.toLowerCase() === 'true';
        } else if (key === 'vocal guide volume') {
          const num = parseFloat(val.replace('%', ''));
          if (!isNaN(num)) {
            toneGuideVolume = val.includes('%') ? num / 100 : num;
          }
        } else if (key === 'container max height') {
          const num = parseInt(val, 10);
          if (!isNaN(num)) app.mainContentMaxHeight = num;
        } else if (key === 'container max width') {
          const num = parseInt(val, 10);
          if (!isNaN(num)) app.mainContentMaxWidth = num;
        }
        break;
      }

      case 'CUSTOM DARES': {
        if (eqIdx !== -1) {
          const cat = line.substring(0, eqIdx).trim().toLowerCase();
          const rawVal = val.trim();
          let dareItem: DareEntry;

          if (rawVal.includes('|')) {
            const parts = rawVal.split('|').map((p) => p.trim());
            const text = parts[0] || '';
            const type = (parts[1] || 'PASS_OR_DRINK') as DareInteractiveType;
            const drinks = parseInt(parts[2] || '1', 10) || 1;
            const selectCount = parts[3] ? parseInt(parts[3], 10) : undefined;

            dareItem = {
              id: text,
              text,
              interactiveType: type,
              drinkCount: drinks,
              config: selectCount ? { selectCount } : undefined,
              isCustom: true,
            };
          } else {
            dareItem = normalizeDareEntry(rawVal);
          }

          if (cat.includes('3') || cat.includes('three')) {
            app.customDares!.threeWords.push(dareItem);
          } else if (cat.includes('2') || cat.includes('two')) {
            app.customDares!.twoWords.push(dareItem);
          } else if (cat.includes('1') || cat.includes('one')) {
            app.customDares!.oneWord.push(dareItem);
          } else if (cat.includes('0') || cat.includes('zero')) {
            app.customDares!.zeroWords.push(dareItem);
          } else if (cat.includes('challenge')) {
            app.customDares!.challenge.push(dareItem);
          }
        }
        break;
      }
    }
  }

  // Handle current singer index if players exist
  if (app.players && app.players.length > 0) {
    const target = (app as any)._targetSinger;
    if (target) {
      const idx = app.players.findIndex((p: string) => p.toLowerCase() === target.toLowerCase());
      app.currentPlayerIndex = idx !== -1 ? idx : 0;
    } else {
      app.currentPlayerIndex = 0;
    }
  }
  delete (app as any)._targetSinger;

  // Sync active mode settings onto root appState
  const activeModeKey: GameMode = app.gameMode || 'DARE_DRINK';
  const activeModeConfig = modeSettings[activeModeKey] || modeSettings.DARE_DRINK!;

  // If legacy [ENABLED SONGS] or [DISABLED SONGS] were supplied without mode prefix
  if (app.enabledSongs && app.enabledSongs.length > 0 && activeModeConfig.enabledSongs?.length === 0) {
    activeModeConfig.enabledSongs = [...app.enabledSongs];
  }
  if (app.disabledSongs && app.disabledSongs.length > 0 && activeModeConfig.disabledSongs?.length === 0) {
    activeModeConfig.disabledSongs = [...app.disabledSongs];
  }
  if (app.allSongsDisabled && !activeModeConfig.allSongsDisabled) {
    activeModeConfig.allSongsDisabled = true;
  }

  app.modeSettings = modeSettings;
  app.allSongsDisabled = activeModeConfig.allSongsDisabled ?? false;
  app.enabledSongs = activeModeConfig.enabledSongs || [];
  app.disabledSongs = activeModeConfig.disabledSongs || [];
  if (activeModeConfig.dareBlanksPerSong !== undefined) app.dareBlanksPerSong = activeModeConfig.dareBlanksPerSong;
  if (activeModeConfig.dareMinWordLength !== undefined) app.dareMinWordLength = activeModeConfig.dareMinWordLength;
  if (activeModeConfig.dareMaxWordLength !== undefined) app.dareMaxWordLength = activeModeConfig.dareMaxWordLength;

  return {
    version: '1.0.0',
    savedAt: new Date().toISOString(),
    appState: app,
    toneGuide: {
      enabled: toneGuideEnabled,
      volume: toneGuideVolume,
    },
  };
}
