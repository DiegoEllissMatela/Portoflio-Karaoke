import React, { useState, useEffect, useRef } from 'react';
import { Settings, Volume2, VolumeX } from 'lucide-react';
import { MainMenu } from './screens/MainMenu/MainMenu';
import { ModeSelection } from './screens/ModeSelection/ModeSelection';
import { PlayerSetup } from './screens/PlayerSetup/PlayerSetup';
import { GameArea } from './screens/GameArea/GameArea';
import { SettingsModal } from './components/SettingsModal/SettingsModal';
import { InstallPrompt } from './components/InstallPrompt/InstallPrompt';
import { DownloadProgress } from './components/DownloadProgress/DownloadProgress';
import { LoadingScreen } from './components/LoadingScreen/LoadingScreen';
import { MobileRemote } from './screens/MobileRemote/MobileRemote';
import { useKaraokeLogic, USER_SONGS, USER_SONGS_MAP } from '../logic/hooks/useKaraokeLogic';
import {
  loadAppSettings,
  saveAppSettings,
} from '../logic/services/settingsStorageService';
import {
  DEFAULT_DARE_DRINK_SONG_IDS,
  DEFAULT_JUST_DRINK_SONG_IDS,
  getDefaultEnabledSongsForMode,
} from '../logic/constants/defaultSongs';
import type { AppState, GameMode, InputMode, DareCategoryId, PlayerClaimMap, PlayerSongQueueMap, DareEntry } from '../logic/types/logicTypes';
import styles from './App.module.scss';

const STORAGE_KEY = 'automate_karaoke_app_state_v2';

const DEFAULT_APP_STATE: AppState = {
  currentScreen: 'HOME',
  gameMode: null,
  players: [],
  currentPlayerIndex: 0,
  isAutoResumeEnabled: true,
  isCountdownEnabled: true,
  playerScores: {},
  inputMode: 'MANUAL',
  disabledSongs: [],
  enabledSongs: [...DEFAULT_DARE_DRINK_SONG_IDS],
  allSongsDisabled: true,
  modeSettings: {
    DARE_DRINK: {
      allSongsDisabled: true,
      disabledSongs: [],
      enabledSongs: [...DEFAULT_DARE_DRINK_SONG_IDS],
      dareBlanksPerSong: 4,
      dareMinWordLength: 4,
      dareMaxWordLength: 12,
      dareBlankStartPct: 15,
      dareBlankEndPct: 85,
      showBlankWordIndicators: false,
      isBlankRangeMovable: true,
      disabledDares: ['dare-101'],
      qrQueueEnabled: true,
    },
    JUST_DRINK: {
      allSongsDisabled: true,
      disabledSongs: [],
      enabledSongs: [...DEFAULT_JUST_DRINK_SONG_IDS],
      dareBlanksPerSong: 4,
      dareMinWordLength: 4,
      dareMaxWordLength: 12,
      dareBlankStartPct: 15,
      dareBlankEndPct: 85,
      showBlankWordIndicators: false,
      isBlankRangeMovable: true,
      disabledDares: ['dare-101'],
      qrQueueEnabled: true,
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
      enabledSongs: [...DEFAULT_DARE_DRINK_SONG_IDS],
      dareBlanksPerSong: 4,
      dareMinWordLength: 4,
      dareMaxWordLength: 12,
      dareBlankStartPct: 15,
      dareBlankEndPct: 85,
      showBlankWordIndicators: false,
      isBlankRangeMovable: true,
      disabledDares: ['dare-101'],
      qrQueueEnabled: true,
    },
  },
  qrQueueEnabled: false,
  isAutoPassMicEnabled: false,
  claimedPlayers: {},
  playerQueues: {},
  dareBlanksPerSong: 3,
  dareMinWordLength: 3,
  dareMaxWordLength: 10,
  dareBlankStartPct: 15,
  dareBlankEndPct: 85,
  showBlankWordIndicators: false,
  isBlankRangeMovable: true,
  disabledDares: [],
  repeatableDares: [],
  usedDares: {},
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
  playerDrinks: {},
  lastDrinkAward: {},
  immunePlayers: [],
  activeRules: [],
};

const getInitialState = (): AppState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_APP_STATE,
        ...parsed,
      };
    }
  } catch (e) {
    console.error('Failed to parse saved state:', e);
  }
  return DEFAULT_APP_STATE;
};

const DesktopKaraokeApp: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(getInitialState);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isInstallFabVisible, setIsInstallFabVisible] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMuted, setIsMuted] = useState<boolean>(appState.globalAudioMuted ?? false);
  const [volume, setVolume] = useState<number>(appState.globalAudioVolume ?? 0.35);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    setAppState(prev => ({
      ...prev,
      globalAudioVolume: volume,
      globalAudioMuted: isMuted
    }));
  }, [volume, isMuted]);

  const handleToggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !audioRef.current.muted;
      setIsMuted(audioRef.current.muted);
      if (!audioRef.current.muted) {
        audioRef.current.play().catch(e => console.log('Audio play failed:', e));
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (newVolume === 0) {
      setIsMuted(true);
      if (audioRef.current) audioRef.current.muted = true;
    } else if (isMuted) {
      setIsMuted(false);
      if (audioRef.current) {
        audioRef.current.muted = false;
        audioRef.current.play().catch(e => console.log('Audio play failed:', e));
      }
    }
  };

  const { controls, state } = useKaraokeLogic(appState, setAppState);

  // Hydrate settings from internal app folder file (settings/karaoke_settings.json) on mount
  useEffect(() => {
    loadAppSettings()
      .then((fileData) => {
        if (fileData?.appState) {
          setAppState((prev) => ({
            ...prev,
            ...fileData.appState,
          }));
          if (fileData.appState.globalAudioVolume !== undefined) {
            setVolume(fileData.appState.globalAudioVolume);
          }
          if (fileData.appState.globalAudioMuted !== undefined) {
            setIsMuted(fileData.appState.globalAudioMuted);
          }
          if (fileData.toneGuide) {
            controls.setToneGuideEnabled?.(fileData.toneGuide.enabled);
            controls.setToneGuideVolume?.(fileData.toneGuide.volume);
          }
        }
      })
      .catch((err) => console.error('[App] Error hydrating settings from file:', err));
  }, []);

  // Sync state changes to app folder settings file and localStorage
  useEffect(() => {
    saveAppSettings(appState, {
      toneGuide: {
        enabled: state.isToneGuideEnabled,
        volume: state.toneGuideVolume,
      },
    });
  }, [appState, state.isToneGuideEnabled, state.toneGuideVolume]);

  const handleStart = () => setAppState(prev => ({ ...prev, currentScreen: 'MODE_SELECT' }));

  const handleSelectMode = (mode: GameMode) => {
    setAppState(prev => {
      const prevMode = prev.gameMode;
      const currentModeSettings = { ...(prev.modeSettings || {}) };

      // Save previous mode's settings
      if (prevMode) {
        currentModeSettings[prevMode] = {
          allSongsDisabled: prev.allSongsDisabled,
          disabledSongs: prev.disabledSongs || [],
          enabledSongs: prev.enabledSongs || [],
          dareBlanksPerSong: prev.dareBlanksPerSong,
          dareMinWordLength: prev.dareMinWordLength,
          dareMaxWordLength: prev.dareMaxWordLength,
          dareBlankStartPct: prev.dareBlankStartPct ?? 15,
          dareBlankEndPct: prev.dareBlankEndPct ?? 85,
          showBlankWordIndicators: prev.showBlankWordIndicators ?? false,
          isBlankRangeMovable: prev.isBlankRangeMovable ?? true,
          disabledDares: prev.disabledDares,
          qrQueueEnabled: prev.qrQueueEnabled,
        };
      }

      // Load target mode's settings (or defaults)
      const targetModeSettings = currentModeSettings[mode] || {
        allSongsDisabled: mode === 'NORMAL' ? false : true,
        disabledSongs: [],
        enabledSongs: getDefaultEnabledSongsForMode(mode),
        dareBlanksPerSong: prev.dareBlanksPerSong ?? 4,
        dareMinWordLength: prev.dareMinWordLength ?? 4,
        dareMaxWordLength: prev.dareMaxWordLength ?? 12,
        dareBlankStartPct: prev.dareBlankStartPct ?? 15,
        dareBlankEndPct: prev.dareBlankEndPct ?? 85,
        showBlankWordIndicators: prev.showBlankWordIndicators ?? false,
        isBlankRangeMovable: prev.isBlankRangeMovable ?? true,
        disabledDares: prev.disabledDares || [],
        qrQueueEnabled: mode === 'NORMAL',
      };

      currentModeSettings[mode] = targetModeSettings;

      return {
        ...prev,
        gameMode: mode,
        currentScreen: 'PLAYER_SETUP',
        modeSettings: currentModeSettings,
        allSongsDisabled: targetModeSettings.allSongsDisabled ?? false,
        disabledSongs: targetModeSettings.disabledSongs || [],
        enabledSongs: targetModeSettings.enabledSongs || [],
        dareBlanksPerSong: targetModeSettings.dareBlanksPerSong ?? prev.dareBlanksPerSong,
        dareMinWordLength: targetModeSettings.dareMinWordLength ?? prev.dareMinWordLength,
        dareMaxWordLength: targetModeSettings.dareMaxWordLength ?? prev.dareMaxWordLength,
        dareBlankStartPct: targetModeSettings.dareBlankStartPct ?? (prev.dareBlankStartPct ?? 15),
        dareBlankEndPct: targetModeSettings.dareBlankEndPct ?? (prev.dareBlankEndPct ?? 85),
        showBlankWordIndicators: targetModeSettings.showBlankWordIndicators ?? (prev.showBlankWordIndicators ?? false),
        isBlankRangeMovable: targetModeSettings.isBlankRangeMovable ?? (prev.isBlankRangeMovable ?? true),
        disabledDares: targetModeSettings.disabledDares ?? prev.disabledDares,
        qrQueueEnabled: targetModeSettings.qrQueueEnabled ?? true,
      };
    });
  };

  const handleStartGame = (players: string[]) => {
    setIsMuted(true);
    if (audioRef.current) audioRef.current.muted = true;
    setAppState(prev => ({ ...prev, players, currentScreen: 'GAME', currentPlayerIndex: 0 }));
  };

  const handleNextPlayer = () => {
    setAppState(prev => {
      const nextIdx = prev.players.length > 0 ? (prev.currentPlayerIndex + 1) % prev.players.length : 0;
      const nextSinger = prev.players[nextIdx] || '';
      // Immunity expires when the player's next turn arrives
      const nextImmune = (prev.immunePlayers || []).filter(p => p !== nextSinger);
      return {
        ...prev,
        currentPlayerIndex: nextIdx,
        immunePlayers: nextImmune,
      };
    });
  };

  const handleBack = () => {
    setAppState(prev => {
      switch (prev.currentScreen) {
        case 'MODE_SELECT': return { ...prev, currentScreen: 'HOME' };
        case 'PLAYER_SETUP': return { ...prev, currentScreen: 'MODE_SELECT' };
        case 'GAME': return { ...prev, currentScreen: 'PLAYER_SETUP' };
        default: return prev;
      }
    });
  };

  const handleUpdatePlayers = (newPlayers: string[]) => {
    setAppState(prev => ({
      ...prev,
      players: newPlayers,
      currentPlayerIndex: prev.currentPlayerIndex >= newPlayers.length ? 0 : prev.currentPlayerIndex
    }));
  };

  const handleToggleAutoResume = () => {
    setAppState(prev => ({ ...prev, isAutoResumeEnabled: !prev.isAutoResumeEnabled }));
  };

  const handleToggleCountdown = () => {
    setAppState(prev => ({ ...prev, isCountdownEnabled: !prev.isCountdownEnabled }));
  };

  const handleToggleBlankWordIndicators = () => {
    setAppState(prev => {
      const nextVal = !prev.showBlankWordIndicators;
      const currentMode = prev.gameMode;
      const updatedModeSettings = { ...(prev.modeSettings || {}) };
      if (currentMode && updatedModeSettings[currentMode]) {
        updatedModeSettings[currentMode] = {
          ...updatedModeSettings[currentMode],
          showBlankWordIndicators: nextVal,
        };
      }
      return {
        ...prev,
        showBlankWordIndicators: nextVal,
        modeSettings: updatedModeSettings,
      };
    });
  };

  const handleToggleBlankRangeMovable = () => {
    setAppState(prev => {
      const nextVal = prev.isBlankRangeMovable !== undefined ? !prev.isBlankRangeMovable : false;
      const currentMode = prev.gameMode;
      const updatedModeSettings = { ...(prev.modeSettings || {}) };
      if (currentMode && updatedModeSettings[currentMode]) {
        updatedModeSettings[currentMode] = {
          ...updatedModeSettings[currentMode],
          isBlankRangeMovable: nextVal,
        };
      }
      return {
        ...prev,
        isBlankRangeMovable: nextVal,
        modeSettings: updatedModeSettings,
      };
    });
  };

  const handleAddScore = (playerName: string, score: any) => {
    setAppState(prev => {
      const currentScores = prev.playerScores[playerName] || [];
      return {
        ...prev,
        playerScores: {
          ...prev.playerScores,
          [playerName]: [...currentScores, score]
        }
      };
    });
  };

  const handleUndoScore = (playerName: string) => {
    setAppState(prev => {
      const currentScores = prev.playerScores[playerName] || [];
      return {
        ...prev,
        playerScores: {
          ...prev.playerScores,
          [playerName]: currentScores.slice(0, -1)
        }
      };
    });
  };

  const handleRemoveSpecificScore = (playerName: string, indexToRemove: number) => {
    setAppState(prev => {
      const currentScores = prev.playerScores[playerName] || [];
      return {
        ...prev,
        playerScores: {
          ...prev.playerScores,
          [playerName]: currentScores.filter((_, idx) => idx !== indexToRemove)
        }
      };
    });
  };

  const handleResetScores = () => {
    setAppState(prev => ({
      ...prev,
      playerScores: {},
      playerDrinks: {},
      lastDrinkAward: {},
      immunePlayers: [],
      activeRules: []
    }));
  };

  const handleGrantImmunity = (playerName: string) => {
    setAppState(prev => {
      const current = prev.immunePlayers || [];
      if (current.includes(playerName)) return prev;
      return {
        ...prev,
        immunePlayers: [...current, playerName]
      };
    });
  };

  const handleRevokeImmunity = (playerName: string) => {
    setAppState(prev => ({
      ...prev,
      immunePlayers: (prev.immunePlayers || []).filter(p => p !== playerName)
    }));
  };

  const handleAddActiveRule = (rule: { text: string; createdBy: string; penaltyDrinks: number }) => {
    setAppState(prev => {
      const newRule = {
        id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        text: rule.text,
        createdBy: rule.createdBy,
        penaltyDrinks: rule.penaltyDrinks || 1,
        createdAt: Date.now()
      };
      return {
        ...prev,
        activeRules: [...(prev.activeRules || []), newRule]
      };
    });
  };

  const handleRemoveActiveRule = (ruleId: string) => {
    setAppState(prev => ({
      ...prev,
      activeRules: (prev.activeRules || []).filter(r => r.id !== ruleId)
    }));
  };

  const handleAddDrinks = (recipients: Record<string, number>) => {
    setAppState(prev => {
      const nextDrinks = { ...(prev.playerDrinks || {}) };
      for (const [name, count] of Object.entries(recipients)) {
        nextDrinks[name] = (nextDrinks[name] || 0) + count;
      }
      return { ...prev, playerDrinks: nextDrinks, lastDrinkAward: recipients };
    });
  };

  const handleAdjustDrinks = (playerName: string, delta: number) => {
    setAppState(prev => {
      const current = prev.playerDrinks?.[playerName] || 0;
      return {
        ...prev,
        playerDrinks: { ...(prev.playerDrinks || {}), [playerName]: Math.max(0, current + delta) }
      };
    });
  };

  const handleUndoDrinks = () => {
    setAppState(prev => {
      const award = prev.lastDrinkAward || {};
      const nextDrinks = { ...(prev.playerDrinks || {}) };
      for (const [name, count] of Object.entries(award)) {
        nextDrinks[name] = Math.max(0, (nextDrinks[name] || 0) - count);
      }
      return { ...prev, playerDrinks: nextDrinks, lastDrinkAward: {} };
    });
  };

  const handleSetInputMode = (mode: InputMode) => {
    setAppState(prev => ({ ...prev, inputMode: mode }));
  };

  const handleUpdateMaxWidth = (width: number) => {
    setAppState(prev => ({ ...prev, mainContentMaxWidth: width }));
  };

  const handleUpdateMaxHeight = (height: number) => {
    setAppState(prev => ({ ...prev, mainContentMaxHeight: height }));
  };

  const handleResetSession = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear local storage:', e);
    }
    setAppState(DEFAULT_APP_STATE);
    saveAppSettings(DEFAULT_APP_STATE, undefined, true);
  };

  const handleToggleSongStatus = (songId: string) => {
    setAppState(prev => {
      const activeMode: GameMode = prev.gameMode || 'DARE_DRINK';
      const isWhitelist = Boolean(prev.allSongsDisabled || (prev.enabledSongs && prev.enabledSongs.length > 0));
      const disabledSet = new Set(prev.disabledSongs || []);
      const enabledSet = new Set(prev.enabledSongs || []);

      const song = USER_SONGS_MAP.get(songId) || USER_SONGS.find(s => s.id === songId);
      const isHiddenByDefault = song?.isHiddenByDefault;

      const isExplicitlyDisabled = disabledSet.has(songId);
      const isExplicitlyEnabled = enabledSet.has(songId);

      const currentlyDisabled = isWhitelist
        ? (!isExplicitlyEnabled || isExplicitlyDisabled)
        : (isExplicitlyDisabled || (isHiddenByDefault && !isExplicitlyEnabled));

      if (currentlyDisabled) {
        // We are enabling it
        disabledSet.delete(songId);
        enabledSet.add(songId);
      } else {
        // We are disabling it
        enabledSet.delete(songId);
        disabledSet.add(songId);
      }

      const newDisabled = Array.from(disabledSet);
      const newEnabled = Array.from(enabledSet);

      const updatedModeSettings = {
        ...(prev.modeSettings || {}),
        [activeMode]: {
          ...(prev.modeSettings?.[activeMode] || {}),
          allSongsDisabled: prev.allSongsDisabled,
          disabledSongs: newDisabled,
          enabledSongs: newEnabled,
        },
      };

      return {
        ...prev,
        modeSettings: updatedModeSettings,
        disabledSongs: newDisabled,
        enabledSongs: newEnabled,
      };
    });
  };

  const handleSetDisabledSongs = (songIds: string[]) => {
    setAppState(prev => {
      const activeMode: GameMode = prev.gameMode || 'DARE_DRINK';
      const isDisablingAll = songIds.length > 0;
      const newAllSongsDisabled = isDisablingAll;

      const updatedModeSettings = {
        ...(prev.modeSettings || {}),
        [activeMode]: {
          ...(prev.modeSettings?.[activeMode] || {}),
          allSongsDisabled: newAllSongsDisabled,
          disabledSongs: [],
          enabledSongs: [],
        },
      };

      return {
        ...prev,
        modeSettings: updatedModeSettings,
        allSongsDisabled: newAllSongsDisabled,
        disabledSongs: [],
        enabledSongs: [],
      };
    });
  };

  const handleResetSongsToDefault = () => {
    setAppState(prev => {
      const activeMode: GameMode = prev.gameMode || 'DARE_DRINK';
      const isDareOrDrink = activeMode === 'DARE_DRINK' || activeMode === 'JUST_DRINK' || activeMode === 'DARE';
      const defaultAllDisabled = isDareOrDrink;
      const defaultEnabled = getDefaultEnabledSongsForMode(activeMode);
      const defaultDisabled: string[] = [];

      const updatedModeSettings = {
        ...(prev.modeSettings || {}),
        [activeMode]: {
          ...(prev.modeSettings?.[activeMode] || {}),
          allSongsDisabled: defaultAllDisabled,
          disabledSongs: defaultDisabled,
          enabledSongs: defaultEnabled,
        },
      };

      return {
        ...prev,
        modeSettings: updatedModeSettings,
        allSongsDisabled: defaultAllDisabled,
        disabledSongs: defaultDisabled,
        enabledSongs: defaultEnabled,
      };
    });
  };

  const handleUpdateDareBlanks = (blanks: number) => {
    setAppState(prev => {
      const activeMode: GameMode = prev.gameMode || 'DARE_DRINK';
      const updatedModeSettings = {
        ...(prev.modeSettings || {}),
        [activeMode]: {
          ...(prev.modeSettings?.[activeMode] || {}),
          dareBlanksPerSong: blanks,
        },
      };
      return { ...prev, dareBlanksPerSong: blanks, modeSettings: updatedModeSettings };
    });
  };

  const handleUpdateDareMinWordLength = (min: number) => {
    setAppState(prev => {
      const activeMode: GameMode = prev.gameMode || 'DARE_DRINK';
      const updatedModeSettings = {
        ...(prev.modeSettings || {}),
        [activeMode]: {
          ...(prev.modeSettings?.[activeMode] || {}),
          dareMinWordLength: min,
        },
      };
      return { ...prev, dareMinWordLength: min, modeSettings: updatedModeSettings };
    });
  };

  const handleUpdateDareMaxWordLength = (max: number) => {
    setAppState(prev => {
      const activeMode: GameMode = prev.gameMode || 'DARE_DRINK';
      const updatedModeSettings = {
        ...(prev.modeSettings || {}),
        [activeMode]: {
          ...(prev.modeSettings?.[activeMode] || {}),
          dareMaxWordLength: max,
        },
      };
      return { ...prev, dareMaxWordLength: max, modeSettings: updatedModeSettings };
    });
  };

  const handleToggleDare = (dareText: string) => {
    setAppState(prev => {
      const disabled = prev.disabledDares || [];
      return {
        ...prev,
        disabledDares: disabled.includes(dareText) ? disabled.filter(d => d !== dareText) : [...disabled, dareText]
      };
    });
  };

  const handleSetDisabledDares = (dares: string[]) => {
    setAppState(prev => ({ ...prev, disabledDares: dares }));
  };

  const handleAddCustomDare = (categoryId: DareCategoryId, dare: DareEntry) => {
    setAppState(prev => {
      const customs = { ...(prev.customDares || {}) };
      customs[categoryId] = [...(customs[categoryId] || []), dare];
      return { ...prev, customDares: customs };
    });
  };

  const handleRemoveCustomDare = (categoryId: DareCategoryId, dareIdOrText: string) => {
    setAppState(prev => {
      const customs = { ...(prev.customDares || {}) };
      customs[categoryId] = (customs[categoryId] || []).filter(d => {
        const text = typeof d === 'string' ? d : d.text;
        const id = typeof d === 'string' ? d : d.id;
        return text !== dareIdOrText && id !== dareIdOrText;
      });
      return { ...prev, customDares: customs };
    });
  };

  const handleToggleRepeatableDare = (dareText: string) => {
    setAppState(prev => {
      const repeatable = prev.repeatableDares || [];
      return {
        ...prev,
        repeatableDares: repeatable.includes(dareText) ? repeatable.filter(d => d !== dareText) : [...repeatable, dareText]
      };
    });
  };

  const handleSetUsedDares = (categoryId: DareCategoryId, used: string[]) => {
    setAppState(prev => {
      const usedDares = { ...(prev.usedDares || {}) };
      usedDares[categoryId] = used;
      return { ...prev, usedDares };
    });
  };

  const handleSetLastDare = (dareText: string) => {
    setAppState(prev => ({ ...prev, lastDare: dareText }));
  };

  const handleToggleQrQueue = (enabled: boolean) => {
    setAppState(prev => {
      const activeMode: GameMode = prev.gameMode || 'NORMAL';
      const updatedModeSettings = {
        ...(prev.modeSettings || {}),
        [activeMode]: {
          ...(prev.modeSettings?.[activeMode] || {}),
          qrQueueEnabled: enabled,
        },
      };
      return { ...prev, qrQueueEnabled: enabled, modeSettings: updatedModeSettings };
    });
  };

  const handleUpdateRemoteState = (claimed: PlayerClaimMap, queues: PlayerSongQueueMap) => {
    setAppState(prev => ({
      ...prev,
      claimedPlayers: claimed,
      playerQueues: queues,
    }));
  };

  const handleToggleAutoPassMic = (enabled: boolean) => {
    setAppState(prev => ({ ...prev, isAutoPassMicEnabled: enabled }));
  };



  return (
    <div className={styles.appLayout}>
      <div className={styles.topControlGroup}>
        <div className={styles.volumeControl}>
          <button
            className={styles.settingsBtn}
            onClick={handleToggleMute}
            title={isMuted ? "Unmute Background Music" : "Mute Background Music"}
          >
            {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <div className={styles.sliderContainer}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className={styles.volumeSlider}
            />
          </div>
        </div>

        <button
          className={styles.settingsBtn}
          onClick={() => setIsSettingsOpen(true)}
          title="Open Settings"
        >
          <Settings size={20} />
        </button>

        {appState.currentScreen !== 'HOME' && (
          <button className={styles.globalBackBtn} onClick={handleBack}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back
          </button>
        )}
      </div>

      {appState.currentScreen === 'HOME' && <MainMenu onStart={handleStart} />}
      {appState.currentScreen === 'MODE_SELECT' && <ModeSelection onSelectMode={handleSelectMode} />}
      {appState.currentScreen === 'PLAYER_SETUP' && <PlayerSetup initialPlayers={appState.players} onStartGame={handleStartGame} />}
      {appState.currentScreen === 'GAME' && (
        <GameArea
          appState={appState}
          setAppState={setAppState}
          onNextPlayer={handleNextPlayer}
          onUpdatePlayers={handleUpdatePlayers}
          onAddScore={handleAddScore}
          onUndoScore={handleUndoScore}
          onSetInputMode={handleSetInputMode}
          onToggleSongStatus={handleToggleSongStatus}
          onSetDisabledSongs={handleSetDisabledSongs}
          onResetSongsToDefault={handleResetSongsToDefault}
          onToggleDare={handleToggleDare}
          onSetDisabledDares={handleSetDisabledDares}
          onAddCustomDare={handleAddCustomDare}
          onRemoveCustomDare={handleRemoveCustomDare}
          onResetScores={handleResetScores}
          onAddDrinks={handleAddDrinks}
          onUndoDrinks={handleUndoDrinks}
          onAdjustDrinks={handleAdjustDrinks}
          onRemoveSpecificScore={handleRemoveSpecificScore}
          onToggleRepeatableDare={handleToggleRepeatableDare}
          onSetUsedDares={handleSetUsedDares}
          onSetLastDare={handleSetLastDare}
          onToggleQrQueue={handleToggleQrQueue}
          onUpdateRemoteState={handleUpdateRemoteState}
          onToggleAutoPassMic={handleToggleAutoPassMic}
          onGrantImmunity={handleGrantImmunity}
          onRevokeImmunity={handleRevokeImmunity}
          onAddActiveRule={handleAddActiveRule}
          onRemoveActiveRule={handleRemoveActiveRule}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onRefreshLyrics={controls.reloadLyrics}
        onResetSession={handleResetSession}
        onResetSongsToDefault={handleResetSongsToDefault}
        appState={appState}
        onToggleAutoResume={handleToggleAutoResume}
        onToggleCountdown={handleToggleCountdown}
        onToggleBlankWordIndicators={handleToggleBlankWordIndicators}
        onToggleBlankRangeMovable={handleToggleBlankRangeMovable}
        onUpdateMaxWidth={handleUpdateMaxWidth}
        onUpdateMaxHeight={handleUpdateMaxHeight}
        onUpdateDareBlanks={handleUpdateDareBlanks}
        onUpdateDareMinWordLength={handleUpdateDareMinWordLength}
        onUpdateDareMaxWordLength={handleUpdateDareMaxWordLength}
      />

      {/* PWA Install Banner */}
      {appState.currentScreen === 'HOME' && (
        <InstallPrompt onVisibilityChange={setIsInstallFabVisible} />
      )}

      {/* Offline Song Download Progress Indicator */}
      <DownloadProgress isInstallVisible={isInstallFabVisible} />

      {/* Startup Animated Loading Screen */}
      <LoadingScreen
        progress={state.catalogProgress}
        status={state.catalogStatus}
        logs={state.catalogLogs}
        isComplete={!state.isLoadingCatalog}
        onEnterApp={controls.skipCatalogLoading}
      />
    </div>
  );
};

export const App: React.FC = () => {
  const isRemoteClient = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('remote') === '1';
  if (isRemoteClient) {
    return <MobileRemote />;
  }
  return <DesktopKaraokeApp />;
};

export default App;
