export interface WordTiming {
  word: string;
  start_ms: number;
  end_ms: number;
}

export interface LyricLine {
  id: string;
  time: number; // in seconds
  text: string;
  blankedWords?: string[]; // Array of words that are blanked out in this line
  wordTimings?: WordTiming[];
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  albumArt?: string;
  duration: number; // in seconds
  audioUrl?: string;
  lyricsUrl?: string; // NEW FIELD for fetching lyrics
  lyrics: LyricLine[];
  isHiddenByDefault?: boolean;
}

export interface KaraokeState {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  pitch: number;
  currentLyricIndex: number;
  playlist: Song[];
  isMuted: boolean;
  countdown: {
    isActive: boolean;
    timeLeft: number;
    lineId: string | null;
    isRevealing: boolean;
    clearedLineIds: string[];
    isListening?: boolean;
    liveTranscript?: string;
  };
  lyricScale: number;
  micScores: boolean[];
  allAvailableSongs: Song[];
}

export interface AudioControls {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setPitch: (pitch: number) => void;
  selectSong: (songId: string) => void;
  nextSong: () => void;
  prevSong: () => void;
  restart: () => void;
  setLyricScale: (scale: number) => void;
  loadCustomSong: (title: string, artist: string, lrcContent: string, audioFile?: File) => void;
  reloadLyrics: () => Promise<void>;
  shufflePlaylist: () => void;
}

export type ScreenType = 'HOME' | 'MODE_SELECT' | 'PLAYER_SETUP' | 'GAME';
export type GameMode = 'DARE_DRINK' | 'DARE' | 'NORMAL';
export type ScoreType = 'PERFECT' | 'TWO_WORDS' | 'ONE_WORD' | 'ZERO' | 'EXTRA';
export type InputMode = 'MANUAL' | 'TYPE' | 'MIC';

export type DareCategoryId = 'threeWords' | 'twoWords' | 'oneWord' | 'zeroWords' | 'challenge' | string;

export interface AppState {
  currentScreen: ScreenType;
  gameMode: GameMode | null;
  players: string[];
  currentPlayerIndex: number;
  isAutoResumeEnabled: boolean;
  playerScores: Record<string, ScoreType[]>;
  inputMode: InputMode;
  mainContentMaxWidth?: number;
  mainContentMaxHeight?: number;
  disabledSongs?: string[];
  enabledSongs?: string[];
  dareBlanksPerSong?: number;
  dareMinWordLength?: number;
  dareMaxWordLength?: number;
  disabledDares?: string[];
  isCountdownEnabled?: boolean;
  customDares?: Record<DareCategoryId, string[]>;
  categoryNames?: Record<DareCategoryId, string>;
  scoreOutcomeMapping?: Partial<Record<ScoreType, DareCategoryId>>;
  globalAudioVolume?: number;
  globalAudioMuted?: boolean;
  repeatableDares?: string[];
  usedDares?: Record<DareCategoryId, string[]>;
  lastDare?: string;
}
