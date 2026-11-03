export interface SyllableTiming {
  text: string;
  start_ms: number;
  end_ms: number;
  start_time?: number;
  end_time?: number;
}

export interface WordTiming {
  word: string;
  text?: string;
  start_ms: number;
  end_ms: number;
  start_time?: number;
  end_time?: number;
  syllables?: SyllableTiming[];
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
  midiUrl?: string; // Direct MIDI file URL (.mid)
  melodyUrl?: string; // Isolated vocal guide track / audio URL
  lyricsUrl?: string; // URL for fetching lyrics
  lyrics: LyricLine[];
  isHiddenByDefault?: boolean;
  searchKey?: string;
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
  isToneGuideEnabled: boolean;
  toneGuideVolume: number;
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
  songQueue: Song[];
  isLoadingCatalog: boolean;
  catalogProgress: number;
  catalogStatus: string;
  catalogLogs?: string[];
  isAudioLoading: boolean;
  audioLoadingProgress: number;
  songEndedCount?: number;
}

export interface AudioControls {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleToneGuide: () => void;
  setToneGuideEnabled: (enabled: boolean) => void;
  setToneGuideVolume: (volume: number) => void;
  setPitch: (pitch: number) => void;
  transposeUp?: () => void;
  transposeDown?: () => void;
  resetPitch?: () => void;
  selectSong: (songId: string) => void;
  nextSong: () => void;
  prevSong: () => void;
  restart: () => void;
  setLyricScale: (scale: number) => void;
  setDareBlankRange?: (startPct: number, endPct: number) => void;
  loadCustomSong: (title: string, artist: string, lrcContent: string, audioFile?: File) => void;
  reloadLyrics: () => Promise<void>;
  shufflePlaylist: () => void;
  addToQueue: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  skipCatalogLoading?: () => void;
}

export type ScreenType = 'HOME' | 'MODE_SELECT' | 'PLAYER_SETUP' | 'GAME';
export type GameMode = 'DARE_DRINK' | 'JUST_DRINK' | 'NORMAL' | 'DARE';
export type ScoreType = 'PERFECT' | 'TWO_WORDS' | 'ONE_WORD' | 'ZERO' | 'EXTRA';
export type InputMode = 'MANUAL' | 'TYPE' | 'MIC';

export type DareCategoryId = 'threeWords' | 'twoWords' | 'oneWord' | 'zeroWords' | 'challenge' | string;

export interface QueuedSongItem {
  queueId: string;       // Unique ID for this queued entry
  song: Song;            // The song object
  playerName: string;    // Name of the player who queued it
  addedAt: number;       // Timestamp
}

export interface PlayerClaimMap {
  // Maps playerName -> deviceId of the phone that claimed it
  [playerName: string]: string;
}

export interface PlayerSongQueueMap {
  // Maps playerName -> ordered array of songs queued by that player
  [playerName: string]: Song[];
}

export interface ModeSongSettings {
  allSongsDisabled?: boolean;
  disabledSongs?: string[];
  enabledSongs?: string[];
  dareBlanksPerSong?: number;
  dareMinWordLength?: number;
  dareMaxWordLength?: number;
  dareBlankStartPct?: number;
  dareBlankEndPct?: number;
  showBlankWordIndicators?: boolean;
  isBlankRangeMovable?: boolean;
  disabledDares?: string[];
  qrQueueEnabled?: boolean;
}

export type ModeSettingsMap = Partial<Record<GameMode, ModeSongSettings>>;

export interface ActiveRule {
  id: string;
  text: string;
  createdBy: string;
  penaltyDrinks: number;
  createdAt: number;
}

export type DareInteractiveType =
  | 'AUTO_DRINK'
  | 'IMMUNITY'
  | 'ONGOING_RULE'
  | 'WHEEL_SPIN'
  | 'SINGER_PICKER'
  | 'ADMIN_GROUP_PICKER'
  | 'PASS_OR_DRINK'
  | 'COUNT_PICKER';

export type AutoDrinkTargetType =
  | 'SINGER'
  | 'EVERYONE_INCLUDING_SINGER'
  | 'EVERYONE_EXCEPT_SINGER'
  | 'FIRST_THREE_PLAYERS'
  | 'LOWER_SCORE_THAN_SINGER'
  | 'HIGHER_SCORE_THAN_SINGER'
  | 'FIRST_PLACE'
  | 'PLAYER_ABOVE_SINGER'
  | 'SINGER_PER_2_GREEN'
  | 'SINGER_PER_3_RED'
  | 'MOST_GREEN'
  | 'MOST_YELLOW'
  | 'MOST_ORANGE'
  | 'MOST_RED'
  | 'LEAST_GREEN'
  | 'LEAST_YELLOW'
  | 'LEAST_ORANGE'
  | 'LEAST_RED';

export interface DareItemConfig {
  /** For AUTO_DRINK: deterministic formula for who drinks */
  autoTarget?: AutoDrinkTargetType;
  /** Exclude current singer from MOST/LEAST badge calculations */
  excludeSinger?: boolean;
  /** For WHEEL_SPIN or SINGER_PICKER: how many players to pick (1, 2, or 3) */
  selectCount?: number;
  /** For WHEEL_SPIN or SINGER_PICKER: whether singer also drinks with the chosen target(s) */
  includeSingerInDrink?: boolean;
  /** For WHEEL_SPIN: whether wheel spin is followed by a physical/social challenge */
  wheelNeedsFollowupPicker?: boolean;
  /** For ONGOING_RULE: whether user types a custom rule in an input box */
  requiresCustomRuleText?: boolean;
  /** For ONGOING_RULE: pre-filled rule text (supports {singer} placeholder) */
  defaultRuleText?: string;
  /** For ONGOING_RULE: if set, singer can refuse the ongoing rule by drinking this amount */
  canRefuseRuleForDrinks?: number;
}

export interface DareItem {
  /** Unique identifier or exact dare text for backwards compatibility */
  id: string;
  /** Displayed challenge text */
  text: string;
  /** Explicit interactive resolution mechanic */
  interactiveType: DareInteractiveType;
  /** Base drink penalty count (1, 2, 3, or 0 for immunity) */
  drinkCount: number;
  /** Optional mechanic-specific configuration */
  config?: DareItemConfig;
  /** Whether this dare was created by a user */
  isCustom?: boolean;
}

/** Supports both new structured DareItem objects and legacy plain-text strings from old saves */
export type DareEntry = DareItem | string;

export interface DareResolutionPlan {
  dareText: string;
  interactiveType: DareInteractiveType;
  drinkCount: number;
  selectCount?: number;
  includeSingerInDrink?: boolean;
  autoRecipients?: Record<string, number>;
  autoSummary?: string;
  candidatePlayers?: string[];
  requiresCustomRuleText?: boolean;
  defaultRuleText?: string;
  canRefuseRuleForDrinks?: number;
  wheelNeedsFollowupPicker?: boolean;
}

export type AdminCommandType =
  | 'TOGGLE_PLAY'
  | 'PASS_MIC'
  | 'TOGGLE_AUTO_PASS'
  | 'OPEN_CHALLENGE'
  | 'CLOSE_CHALLENGE'
  | 'SELECT_DARE_SCORE'
  | 'UNDO_DARE_SCORE'
  | 'FINISH_DARE'
  | 'ADD_PLAYER_SCORE'
  | 'REMOVE_PLAYER_SCORE'
  | 'RESET_ALL_SCORES'
  | 'ADJUST_PLAYER_DRINKS'
  | 'SELECT_DRINK_TARGETS'
  | 'RESOLVE_DARE_OUTCOME'
  | 'ADD_ACTIVE_RULE'
  | 'TRIGGER_RULE_BREAK'
  | 'REMOVE_ACTIVE_RULE';

export interface AdminCommandPayload {
  score?: ScoreType;
  targetPlayer?: string;
  scoreIndex?: number;
  enabled?: boolean;
  delta?: number;
  selectedPlayers?: string[];
  drinkCount?: number;
  ruleId?: string;
  ruleText?: string;
  keepRuleActive?: boolean;
  grantImmunityTo?: string;
  summaryText?: string;
  recipients?: Record<string, number>;
}

export interface AdminCommand {
  id: number;
  type: AdminCommandType;
  payload?: AdminCommandPayload;
  createdAt: number;
}

export interface RemoteDareModalState {
  isOpen: boolean;
  currentDare: string | null;
  isSpinning?: boolean;
  isSelectingPlayers?: boolean;
  manualSelectionCount?: number;
  candidatePlayers?: string[];
  manualSelectionTitle?: string;
  drinkRecipients?: Record<string, number>;
  drinkSpinPlan?: DrinkSpinPlan | null;
  dareResolutionPlan?: DareResolutionPlan | null;
  isDareResolved?: boolean;
}

export type DrinkOutcomeCategory =
  | 'SINGER_DRINK'
  | 'DRINK_WITH_PARTNER'
  | 'NO_ONE_DRINKS'
  | 'YOU_DRINK'
  | 'EVERYONE_DRINKS'
  | 'RANDOM_PLAYERS_DRINK'
  | 'CHOOSE_PLAYERS_DRINK'
  | 'EVERYONE_EXCEPT_SINGER'
  | 'EXTRA_BONUS';

export interface DrinkCarouselItem {
  id: string;
  label: string;
  sublabel?: string;
  icon?: string;
  category: DrinkOutcomeCategory;
  drinkCount: number;
  requiresPlayerSelection?: boolean;
  playerSelectionCount?: number;
}

export interface DrinkSpinPlan {
  score: ScoreType;
  currentSinger: string;
  stage1Items: DrinkCarouselItem[];
  stage1WinningIndex: number;
  stage1Winner: DrinkCarouselItem;
  requiresStage2: boolean;
  stage2Rounds?: {
    playerPool: string[];
    winningPlayer: string;
    winningIndex: number;
  }[];
  drinkRecipients: Record<string, number>;
  summaryText: string;
}

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
  allSongsDisabled?: boolean;
  modeSettings?: ModeSettingsMap;
  dareBlanksPerSong?: number;
  dareMinWordLength?: number;
  dareMaxWordLength?: number;
  dareBlankStartPct?: number;
  dareBlankEndPct?: number;
  showBlankWordIndicators?: boolean;
  isBlankRangeMovable?: boolean;
  disabledDares?: string[];
  isCountdownEnabled?: boolean;
  customDares?: Record<DareCategoryId, DareEntry[]>;
  categoryNames?: Record<DareCategoryId, string>;
  scoreOutcomeMapping?: Partial<Record<ScoreType, DareCategoryId>>;
  globalAudioVolume?: number;
  globalAudioMuted?: boolean;
  repeatableDares?: string[];
  usedDares?: Record<DareCategoryId, string[]>;
  lastDare?: string;
  qrQueueEnabled?: boolean;
  isAutoPassMicEnabled?: boolean;
  claimedPlayers?: PlayerClaimMap;
  playerQueues?: PlayerSongQueueMap;
  playerDrinks?: Record<string, number>;
  lastDrinkAward?: Record<string, number>;
  immunePlayers?: string[];
  activeRules?: ActiveRule[];
}

export interface PortableSettingsData {
  version: string;
  savedAt: string;
  appState: Partial<AppState>;
  toneGuide?: {
    enabled: boolean;
    volume: number;
  };
}
