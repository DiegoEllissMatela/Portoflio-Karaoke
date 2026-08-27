import React, { useState, useEffect, useRef } from 'react';
import { Settings, Volume2, VolumeX } from 'lucide-react';
import { MainMenu } from './screens/MainMenu/MainMenu';
import { ModeSelection } from './screens/ModeSelection/ModeSelection';
import { PlayerSetup } from './screens/PlayerSetup/PlayerSetup';
import { GameArea } from './screens/GameArea/GameArea';
import { SettingsModal } from './components/SettingsModal/SettingsModal';
import { InstallPrompt } from './components/InstallPrompt/InstallPrompt';
import { DownloadProgress } from './components/DownloadProgress/DownloadProgress';
import { useKaraokeLogic, USER_SONGS } from '../logic/hooks/useKaraokeLogic';
import type { AppState, GameMode, InputMode, DareCategoryId } from '../logic/types/logicTypes';
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
  enabledSongs: [],
  dareBlanksPerSong: 3,
  dareMinWordLength: 3,
  dareMaxWordLength: 10,
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

export const App: React.FC = () => {
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

  const { controls } = useKaraokeLogic(appState);

  // Sync state changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch (e) {
      console.error('Failed to save state to localStorage:', e);
    }
  }, [appState]);

  const handleStart = () => setAppState(prev => ({ ...prev, currentScreen: 'MODE_SELECT' }));

  const handleSelectMode = (mode: GameMode) => {
    setAppState(prev => ({ ...prev, gameMode: mode, currentScreen: 'PLAYER_SETUP' }));
  };

  const handleStartGame = (players: string[]) => {
    setIsMuted(true);
    if (audioRef.current) audioRef.current.muted = true;
    setAppState(prev => ({ ...prev, players, currentScreen: 'GAME', currentPlayerIndex: 0 }));
  };

  const handleNextPlayer = () => {
    setAppState(prev => ({
      ...prev,
      currentPlayerIndex: prev.players.length > 0 ? (prev.currentPlayerIndex + 1) % prev.players.length : 0
    }));
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
      playerScores: {}
    }));
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
  };

  const handleToggleSongStatus = (songId: string) => {
    setAppState(prev => {
      const disabled = prev.disabledSongs || [];
      const enabled = prev.enabledSongs || [];
      const song = USER_SONGS.find(s => s.id === songId);
      const isHiddenByDefault = song?.isHiddenByDefault;

      let newDisabled = [...disabled];
      let newEnabled = [...enabled];

      const currentlyDisabled = isHiddenByDefault
        ? (!enabled.includes(songId) || disabled.includes(songId))
        : disabled.includes(songId);

      if (currentlyDisabled) {
        // We are enabling it
        newDisabled = newDisabled.filter(id => id !== songId);
        if (isHiddenByDefault) {
          if (!newEnabled.includes(songId)) newEnabled.push(songId);
        }
      } else {
        // We are disabling it
        if (!newDisabled.includes(songId)) newDisabled.push(songId);
        if (isHiddenByDefault) {
          newEnabled = newEnabled.filter(id => id !== songId);
        }
      }

      return { ...prev, disabledSongs: newDisabled, enabledSongs: newEnabled };
    });
  };

  const handleSetDisabledSongs = (songIds: string[]) => {
    setAppState(prev => {
      if (songIds.length === 0) {
        // Enable All
        const allHidden = USER_SONGS.filter(s => s.isHiddenByDefault).map(s => s.id);
        return { ...prev, disabledSongs: [], enabledSongs: allHidden };
      } else {
        // Disable All
        return { ...prev, disabledSongs: songIds, enabledSongs: [] };
      }
    });
  };

  const handleUpdateDareBlanks = (blanks: number) => {
    setAppState(prev => ({ ...prev, dareBlanksPerSong: blanks }));
  };

  const handleUpdateDareMinWordLength = (min: number) => {
    setAppState(prev => ({ ...prev, dareMinWordLength: min }));
  };

  const handleUpdateDareMaxWordLength = (max: number) => {
    setAppState(prev => ({ ...prev, dareMaxWordLength: max }));
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

  const handleAddCustomDare = (categoryId: DareCategoryId, dareText: string) => {
    setAppState(prev => {
      const customs = { ...(prev.customDares || {}) };
      customs[categoryId] = [...(customs[categoryId] || []), dareText];
      return { ...prev, customDares: customs };
    });
  };

  const handleRemoveCustomDare = (categoryId: DareCategoryId, dareText: string) => {
    setAppState(prev => {
      const customs = { ...(prev.customDares || {}) };
      customs[categoryId] = (customs[categoryId] || []).filter(d => d !== dareText);
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



  return (
    <div className={styles.appLayout}>
      <audio
        ref={audioRef}
        src="/songs/Background/PartyLoopAudio.m4a"
        loop
        autoPlay
        muted={isMuted}
      />

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
          onNextPlayer={handleNextPlayer}
          onUpdatePlayers={handleUpdatePlayers}
          onAddScore={handleAddScore}
          onUndoScore={handleUndoScore}
          onSetInputMode={handleSetInputMode}
          onToggleSongStatus={handleToggleSongStatus}
          onSetDisabledSongs={handleSetDisabledSongs}
          onToggleDare={handleToggleDare}
          onSetDisabledDares={handleSetDisabledDares}
          onAddCustomDare={handleAddCustomDare}
          onRemoveCustomDare={handleRemoveCustomDare}
          onResetScores={handleResetScores}
          onRemoveSpecificScore={handleRemoveSpecificScore}
          onToggleRepeatableDare={handleToggleRepeatableDare}
          onSetUsedDares={handleSetUsedDares}
          onSetLastDare={handleSetLastDare}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onRefreshLyrics={controls.reloadLyrics}
        onResetSession={handleResetSession}
        appState={appState}
        onToggleAutoResume={handleToggleAutoResume}
        onToggleCountdown={handleToggleCountdown}
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
    </div>
  );
};

export default App;
