import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, SkipForward, Settings2, X, Plus, Undo2, QrCode, Wifi, Unlock, RefreshCw, ScrollText, RotateCcw, ChevronDown } from 'lucide-react';
import QRCode from 'qrcode';
import type { KaraokeState, AudioControls, AppState, ScoreType, DareCategoryId, PlayerClaimMap, PlayerSongQueueMap, DareResolutionPlan, AdminCommandPayload, DareEntry, DareItem, DareInteractiveType } from '../../../logic/types/logicTypes';
import { dares, DARE_INTERACTIVE_CATEGORIES } from '../../../logic/constants/dares';
import { generateDrinkWheelPlan, type DrinkWheelPlan } from '../../../logic/utils/drinkWheelEngine';
import { analyzeDare, buildDareWheelPlan, normalizeDareEntry } from '../../../logic/utils/dareEngine';
import { DrinkWheel } from '../DrinkCarousel/DrinkWheel';
import { fetchRemoteInfo, syncHostToRemote, releasePlayerName, mutatePlayerQueue } from '../../../logic/services/remoteQueueClient';
import styles from './SongList.module.scss';

interface SongListProps {
  state: KaraokeState;
  controls: AudioControls;
  appState?: AppState;
  onNextPlayer?: () => void;
  onUpdatePlayers?: (players: string[]) => void;
  onAddScore?: (playerName: string, score: any) => void;
  onUndoScore?: (playerName: string) => void;
  onSetInputMode?: (mode: 'MANUAL' | 'TYPE' | 'MIC') => void;
  onToggleSongStatus?: (songId: string) => void;
  onSetDisabledSongs?: (songIds: string[]) => void;
  onResetSongsToDefault?: () => void;
  onToggleDare?: (dareText: string) => void;
  onSetDisabledDares?: (dares: string[]) => void;
  onAddCustomDare?: (categoryId: DareCategoryId, dare: DareEntry) => void;
  onRemoveCustomDare?: (categoryId: DareCategoryId, dareText: string) => void;
  onToggleRepeatableDare?: (dareText: string) => void;
  onSetUsedDares?: (categoryId: DareCategoryId, used: string[]) => void;
  onSetLastDare?: (dareText: string) => void;
  onToggleQrQueue?: (enabled: boolean) => void;
  onUpdateRemoteState?: (claimed: PlayerClaimMap, queues: PlayerSongQueueMap) => void;
  onToggleAutoPassMic?: (enabled: boolean) => void;
  onResetScores?: () => void;
  onRemoveSpecificScore?: (playerName: string, indexToRemove: number) => void;
  onAddDrinks?: (recipients: Record<string, number>) => void;
  onUndoDrinks?: () => void;
  onAdjustDrinks?: (playerName: string, delta: number) => void;
  onGrantImmunity?: (playerName: string) => void;
  onRevokeImmunity?: (playerName: string) => void;
  onAddActiveRule?: (rule: { text: string; createdBy: string; penaltyDrinks: number }) => void;
  onRemoveActiveRule?: (ruleId: string) => void;
}

export const SongList: React.FC<SongListProps> = ({ 
  state, controls, appState, onNextPlayer, onUpdatePlayers, onAddScore, onUndoScore, onSetInputMode, onToggleSongStatus, onSetDisabledSongs, onResetSongsToDefault,
  onToggleDare, onSetDisabledDares, onAddCustomDare, onRemoveCustomDare,
  onToggleRepeatableDare, onSetUsedDares, onSetLastDare,
  onToggleQrQueue, onUpdateRemoteState, onToggleAutoPassMic,
  onResetScores, onRemoveSpecificScore, onAddDrinks, onUndoDrinks, onAdjustDrinks,
  onGrantImmunity, onRevokeImmunity: _onRevokeImmunity, onAddActiveRule, onRemoveActiveRule
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [newRuleText, setNewRuleText] = useState('');
  const [newRulePenalty, setNewRulePenalty] = useState(1);
  const [ruleBreakFeedback, setRuleBreakFeedback] = useState<string | null>(null);

  const [currentDare, setCurrentDare] = useState<string | null>(null);
  const [darePlan, setDarePlan] = useState<DareResolutionPlan | null>(null);
  const [isDareResolved, setIsDareResolved] = useState(false);
  const [dareOutcomeSummary, setDareOutcomeSummary] = useState<string | null>(null);
  const [selectedPlayersForDare, setSelectedPlayersForDare] = useState<string[]>([]);
  const [customRuleInput, setCustomRuleInput] = useState('');
  const [countPickerValue, setCountPickerValue] = useState(1);

  const [drinkPlan, setDrinkPlan] = useState<DrinkWheelPlan | null>(null);
  const [isManualSelectionPhase, setIsManualSelectionPhase] = useState(false);
  const [remoteSelectedTargets, setRemoteSelectedTargets] = useState<string[] | null>(null);
  const [activeDrinkRecipients, setActiveDrinkRecipients] = useState<Record<string, number>>({});
  const drinkAppliedRef = useRef(false);
  const [inputValue, setInputValue] = useState('');
  const [songSearchQuery, setSongSearchQuery] = useState('');
  const [debouncedSongQuery, setDebouncedSongQuery] = useState('');
  const [songDisplayLimit, setSongDisplayLimit] = useState(60);
  const [activeTab, setActiveTab] = useState<'players' | 'songs' | 'dares' | 'qr'>('players');
  const [selectedDareCategory, setSelectedDareCategory] = useState<DareCategoryId>('threeWords');
  const [newDareText, setNewDareText] = useState('');
  const [newDareType, setNewDareType] = useState<DareInteractiveType>('PASS_OR_DRINK');
  const [newDareDrinks, setNewDareDrinks] = useState<number>(1);
  const [newDareSelectCount, setNewDareSelectCount] = useState<number>(1);
  const [remoteUrl, setRemoteUrl] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isLoadingQr, setIsLoadingQr] = useState<boolean>(false);

  // Debounce search input by 180ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSongQuery(songSearchQuery);
    }, 180);
    return () => clearTimeout(timer);
  }, [songSearchQuery]);

  // Ensure 'dares' tab is never active in NORMAL mode
  useEffect(() => {
    if (appState?.gameMode === 'NORMAL' && activeTab === 'dares') {
      setActiveTab('players');
    }
  }, [appState?.gameMode, activeTab]);

  // Reset display limit when query changes
  useEffect(() => {
    setSongDisplayLimit(60);
  }, [debouncedSongQuery]);

  const currentMode = appState?.gameMode || 'NORMAL';
  const modeConfig = appState?.modeSettings?.[currentMode];
  const enabledSet = useMemo(() => new Set(modeConfig?.enabledSongs ?? appState?.enabledSongs ?? []), [modeConfig?.enabledSongs, appState?.enabledSongs]);
  const disabledSet = useMemo(() => new Set(modeConfig?.disabledSongs ?? appState?.disabledSongs ?? []), [modeConfig?.disabledSongs, appState?.disabledSongs]);
  const isWhitelist = Boolean(modeConfig?.allSongsDisabled ?? appState?.allSongsDisabled ?? (enabledSet.size > 0));

  const filteredCatalogSongs = useMemo(() => {
    const q = debouncedSongQuery.trim().toLowerCase();
    const all = state.allAvailableSongs || [];
    if (!q) {
      // When search box is empty, always show all enabled songs first
      return [...all].sort((a, b) => {
        const isExplicitlyDisabledA = disabledSet.has(a.id);
        const isExplicitlyEnabledA = enabledSet.has(a.id);
        const isEnabledA = isWhitelist
          ? (isExplicitlyEnabledA && !isExplicitlyDisabledA)
          : (!isExplicitlyDisabledA && (!a.isHiddenByDefault || isExplicitlyEnabledA));

        const isExplicitlyDisabledB = disabledSet.has(b.id);
        const isExplicitlyEnabledB = enabledSet.has(b.id);
        const isEnabledB = isWhitelist
          ? (isExplicitlyEnabledB && !isExplicitlyDisabledB)
          : (!isExplicitlyDisabledB && (!b.isHiddenByDefault || isExplicitlyEnabledB));

        if (isEnabledA && !isEnabledB) return -1;
        if (!isEnabledA && isEnabledB) return 1;
        return 0;
      });
    }

    return all.filter(song => {
      const key = song.searchKey || `${song.title} ${song.artist}`.toLowerCase();
      return key.includes(q);
    });
  }, [state.allAvailableSongs, debouncedSongQuery, enabledSet, disabledSet, isWhitelist]);

  const visibleCatalogSongs = useMemo(() => {
    return filteredCatalogSongs.slice(0, songDisplayLimit);
  }, [filteredCatalogSongs, songDisplayLimit]);


  const players = appState?.players || [];
  const nextPlayerIndex = players.length > 0 ? ((appState?.currentPlayerIndex || 0) + 1) % players.length : 0;
  const nextPlayer = players.length > 0 ? players[nextPlayerIndex] : 'Guest Player';

  const currentSinger = players.length > 0 ? players[appState?.currentPlayerIndex || 0] : 'Guest Player';

  const nextPlayerQueue = appState?.playerQueues?.[nextPlayer] || [];
  const nextPlayerQueuedSong = nextPlayerQueue.length > 0 ? nextPlayerQueue[0] : null;

  const handleNextTurn = useCallback(async () => {
    if (nextPlayerQueuedSong) {
      try {
        await mutatePlayerQueue({
          playerName: nextPlayer,
          action: 'POP_FIRST',
          forceByHost: true,
        });
      } catch (err) {
        console.warn('[SongList] Failed to pop remote queue:', err);
      }
      if (onNextPlayer) onNextPlayer();
      controls.selectSong(nextPlayerQueuedSong.id);
    } else {
      if (onNextPlayer) onNextPlayer();
      controls.nextSong();
    }
  }, [nextPlayer, nextPlayerQueuedSong, onNextPlayer, controls]);

  const nextTurnRef = useRef(handleNextTurn);
  nextTurnRef.current = handleNextTurn;

  const lastHandledSkipRef = useRef<number>(Date.now());
  const lastHandledEndedRef = useRef<number>(state.songEndedCount || 0);
  const lastProcessedCmdRef = useRef<number>(0);

  // Auto Pass Mic when current song finishes playing
  useEffect(() => {
    if (typeof state.songEndedCount === 'number' && state.songEndedCount > lastHandledEndedRef.current) {
      lastHandledEndedRef.current = state.songEndedCount;
      if (appState?.isAutoPassMicEnabled) {
        nextTurnRef.current();
      }
    }
  }, [state.songEndedCount, appState?.isAutoPassMicEnabled]);

  // Load QR code when QR tab is opened
  useEffect(() => {
    if (isModalOpen && activeTab === 'qr') {
      setIsLoadingQr(true);
      fetchRemoteInfo()
        .then((info) => {
          setRemoteUrl(info.url);
          return QRCode.toDataURL(info.url, {
            width: 200,
            margin: 1,
            color: {
              dark: '#0a0b10',
              light: '#ffffff',
            },
          });
        })
        .then((dataUrl) => {
          setQrDataUrl(dataUrl);
          setIsLoadingQr(false);
        })
        .catch((err) => {
          console.error('[SongList] Failed to generate QR code:', err);
          setIsLoadingQr(false);
        });
    }
  }, [isModalOpen, activeTab]);

  const handleUnlockPlayer = async (playerName: string) => {
    try {
      const res = await releasePlayerName(playerName, undefined, true);
      if (res?.state && onUpdateRemoteState) {
        onUpdateRemoteState(res.state.claimedPlayers || {}, res.state.playerQueues || {});
      }
    } catch (e) {
      console.error('[SongList] Failed to release player name:', e);
    }
  };

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    const name = inputValue.trim();
    if (name && !players.includes(name) && onUpdatePlayers) {
      onUpdatePlayers([...players, name]);
      setInputValue('');
    }
  };

  const handleRemovePlayer = (nameToRemove: string) => {
    if (onUpdatePlayers) {
      onUpdatePlayers(players.filter(p => p !== nameToRemove));
    }
  };

  const handleScore = (score: ScoreType) => {
    const isJustDrink = appState?.gameMode === 'JUST_DRINK';

    // A spin is already in progress / showing its result; ignore repeat taps.
    if (isJustDrink && drinkPlan) return;

    setIsManualSelectionPhase(false);
    setRemoteSelectedTargets(null);
    setActiveDrinkRecipients({});

    if (onAddScore) {
      onAddScore(currentSinger, score);
    }

    if (appState?.gameMode === 'NORMAL') {
      setIsScoreModalOpen(false);
      return;
    }

    // Just Drink: spin the drink wheel instead of drawing a text dare
    if (isJustDrink) {
      drinkAppliedRef.current = false;
      setDrinkPlan(
        generateDrinkWheelPlan(
          score,
          currentSinger,
          players,
          appState?.playerDrinks || {},
          Object.keys(appState?.lastDrinkAward || {})
        )
      );
      return;
    }

    // Pick a random dare based on mapped category
    const categoryId = appState?.scoreOutcomeMapping?.[score] || 
      (score === 'PERFECT' ? 'threeWords' :
       score === 'TWO_WORDS' ? 'twoWords' :
       score === 'ONE_WORD' ? 'oneWord' :
       score === 'ZERO' ? 'zeroWords' : 'challenge');

    const rawDefaults: DareEntry[] = (dares as any)[categoryId] || [];
    const rawCustoms: DareEntry[] = appState?.customDares?.[categoryId] || [];
    const defaults: DareItem[] = rawDefaults.map(normalizeDareEntry);
    const customs: DareItem[] = rawCustoms.map(normalizeDareEntry);

    const disabled = appState?.disabledDares || [];
    const enabledPool = [...defaults, ...customs].filter(d => !disabled.includes(d.text) && !disabled.includes(d.id));

    const usedInCategory = appState?.usedDares?.[categoryId] || [];
    const repeatable = appState?.repeatableDares || [];

    const nonRepeatableEnabled = enabledPool.filter(d => !repeatable.includes(d.text) && !repeatable.includes(d.id));
    const allNonRepeatableUsed = nonRepeatableEnabled.length > 0 && nonRepeatableEnabled.every(d => usedInCategory.includes(d.text) || usedInCategory.includes(d.id));

    let activeUsedDares = usedInCategory;
    if (allNonRepeatableUsed) {
      if (onSetUsedDares) onSetUsedDares(categoryId, []);
      activeUsedDares = [];
    }

    let pool = enabledPool.filter(d => {
      if (d.text === appState?.lastDare || d.id === appState?.lastDare) return false;
      return (!activeUsedDares.includes(d.text) && !activeUsedDares.includes(d.id)) || repeatable.includes(d.text) || repeatable.includes(d.id);
    });

    if (pool.length === 0 && enabledPool.length > 0) {
      pool = enabledPool;
    }

    if (pool.length > 0) {
      const randomDareItem = pool[Math.floor(Math.random() * pool.length)];
      setCurrentDare(randomDareItem.text);
      if (onSetUsedDares && !activeUsedDares.includes(randomDareItem.text) && !activeUsedDares.includes(randomDareItem.id)) {
        onSetUsedDares(categoryId, [...activeUsedDares, randomDareItem.text]);
      }
      if (onSetLastDare) {
        onSetLastDare(randomDareItem.text);
      }

      if (appState?.gameMode === 'DARE_DRINK') {
        const plan = analyzeDare(
          randomDareItem,
          currentSinger,
          players,
          appState?.playerScores || {},
          appState?.immunePlayers || []
        );
        setDarePlan(plan);
        setIsDareResolved(false);
        setDareOutcomeSummary(null);
        setSelectedPlayersForDare([]);
        setCustomRuleInput(plan.defaultRuleText || '');
        setCountPickerValue(plan.drinkCount || 1);

        if (plan.interactiveType === 'AUTO_DRINK') {
          drinkAppliedRef.current = false;
          onAddDrinks?.(plan.autoRecipients || {});
          setActiveDrinkRecipients(plan.autoRecipients || {});
          setDareOutcomeSummary(plan.autoSummary || '');
          setIsDareResolved(true);
        } else if (plan.interactiveType === 'IMMUNITY') {
          onGrantImmunity?.(currentSinger);
          setDareOutcomeSummary(plan.autoSummary || '');
          setIsDareResolved(true);
        } else if (plan.interactiveType === 'WHEEL_SPIN') {
          drinkAppliedRef.current = false;
          const wheelPlan = buildDareWheelPlan(
            plan,
            currentSinger,
            players,
            appState?.playerDrinks || {},
            Object.keys(appState?.lastDrinkAward || {})
          );
          setDrinkPlan(wheelPlan);
        }
      }
    } else {
      setIsScoreModalOpen(false);
    }
  };

  const resolveDareOutcome = (payload: {
    recipients?: Record<string, number>;
    grantImmunityTo?: string;
    ruleText?: string;
    drinkCount?: number;
    summaryText: string;
  }) => {
    if (payload.recipients && Object.keys(payload.recipients).length > 0) {
      onAddDrinks?.(payload.recipients);
      setActiveDrinkRecipients(payload.recipients);
    }
    if (payload.grantImmunityTo) {
      onGrantImmunity?.(payload.grantImmunityTo);
    }
    if (payload.ruleText) {
      onAddActiveRule?.({
        text: payload.ruleText,
        createdBy: currentSinger,
        penaltyDrinks: payload.drinkCount || 1,
      });
    }
    setDareOutcomeSummary(payload.summaryText);
    setCurrentDare(payload.summaryText);
    setIsDareResolved(true);
  };

  const handleCloseDare = () => {
    setCurrentDare(null);
    setDrinkPlan(null);
    setDarePlan(null);
    setIsDareResolved(false);
    setDareOutcomeSummary(null);
    setSelectedPlayersForDare([]);
    setCustomRuleInput('');
    setCountPickerValue(1);
    setIsManualSelectionPhase(false);
    setRemoteSelectedTargets(null);
    setActiveDrinkRecipients({});
    setIsScoreModalOpen(false);
  };

  const handleDrinkSpinFinished = (customRecipients?: Record<string, number>, customSummary?: string) => {
    if (!drinkPlan || drinkAppliedRef.current) return;
    drinkAppliedRef.current = true;
    const finalRecipients = customRecipients || drinkPlan.drinkRecipients;
    const finalSummary = customSummary || drinkPlan.summaryText;
    onAddDrinks?.(finalRecipients);
    setActiveDrinkRecipients(finalRecipients);
    setIsManualSelectionPhase(false);
    // Mirror the outcome into currentDare so the phone remote shows the result too
    setCurrentDare(finalSummary);
    setDareOutcomeSummary(finalSummary);
    setIsDareResolved(true);
  };

  const handleUndo = () => {
    if (onUndoScore) {
      onUndoScore(currentSinger);
    }
    if (drinkAppliedRef.current) {
      onUndoDrinks?.();
      drinkAppliedRef.current = false;
    }
    setDrinkPlan(null);
    setCurrentDare(null);
    setDarePlan(null);
    setIsDareResolved(false);
    setDareOutcomeSummary(null);
    setSelectedPlayersForDare([]);
    setCustomRuleInput('');
    setCountPickerValue(1);
    setIsManualSelectionPhase(false);
    setRemoteSelectedTargets(null);
    setActiveDrinkRecipients({});
  };

  const adminActionHandlersRef = useRef({
    togglePlay: () => controls.togglePlay(),
    passMic: () => nextTurnRef.current(),
    toggleAutoPass: (enabled?: boolean) => onToggleAutoPassMic?.(enabled ?? !appState?.isAutoPassMicEnabled),
    openChallenge: () => {
      controls.pause();
      setIsScoreModalOpen(true);
    },
    closeChallenge: () => {
      setCurrentDare(null);
      setDrinkPlan(null);
      setIsManualSelectionPhase(false);
      setRemoteSelectedTargets(null);
      setActiveDrinkRecipients({});
      setIsScoreModalOpen(false);
    },
    selectDareScore: (score: ScoreType) => {
      setIsScoreModalOpen(true);
      handleScore(score);
    },
    undoDareScore: () => handleUndo(),
    finishDare: () => handleCloseDare(),
    addPlayerScore: (targetPlayer: string, score: ScoreType) => onAddScore?.(targetPlayer, score),
    removePlayerScore: (targetPlayer: string, idx: number) => onRemoveSpecificScore?.(targetPlayer, idx),
    resetAllScores: () => onResetScores?.(),
    adjustPlayerDrinks: (targetPlayer: string, delta: number) => onAdjustDrinks?.(targetPlayer, delta),
    selectDrinkTargets: (targets: string[]) => setRemoteSelectedTargets(targets),
    resolveDareOutcome: (payload?: AdminCommandPayload) => {
      if (!payload) return;
      if (payload.recipients && Object.keys(payload.recipients).length > 0) {
        onAddDrinks?.(payload.recipients);
        setActiveDrinkRecipients(payload.recipients);
      }
      if (payload.grantImmunityTo) {
        onGrantImmunity?.(payload.grantImmunityTo);
      }
      if (payload.ruleText) {
        onAddActiveRule?.({
          text: payload.ruleText,
          createdBy: currentSinger,
          penaltyDrinks: payload.drinkCount || 1,
        });
      }
      if (payload.summaryText) {
        setDareOutcomeSummary(payload.summaryText);
        setCurrentDare(payload.summaryText);
      }
      setIsDareResolved(true);
    },
    addActiveRule: (payload?: AdminCommandPayload) => {
      if (payload?.ruleText) {
        onAddActiveRule?.({
          text: payload.ruleText,
          createdBy: payload.targetPlayer || currentSinger || 'Admin',
          penaltyDrinks: payload.drinkCount || 1,
        });
      }
    },
    triggerRuleBreak: (payload?: AdminCommandPayload) => {
      if (payload?.targetPlayer) {
        const count = payload.drinkCount || 1;
        onAddDrinks?.({ [payload.targetPlayer]: count });
        setRuleBreakFeedback(`🍺 ${payload.targetPlayer} broke a rule! +${count} drink(s)!`);
        setTimeout(() => setRuleBreakFeedback(null), 3500);
      }
    },
    removeActiveRule: (ruleId?: string) => {
      if (ruleId) {
        onRemoveActiveRule?.(ruleId);
      }
    },
  });

  adminActionHandlersRef.current = {
    togglePlay: () => controls.togglePlay(),
    passMic: () => nextTurnRef.current(),
    toggleAutoPass: (enabled?: boolean) => onToggleAutoPassMic?.(enabled ?? !appState?.isAutoPassMicEnabled),
    openChallenge: () => {
      controls.pause();
      setIsScoreModalOpen(true);
    },
    closeChallenge: () => {
      setCurrentDare(null);
      setDrinkPlan(null);
      setDarePlan(null);
      setIsDareResolved(false);
      setDareOutcomeSummary(null);
      setSelectedPlayersForDare([]);
      setCustomRuleInput('');
      setCountPickerValue(1);
      setIsManualSelectionPhase(false);
      setRemoteSelectedTargets(null);
      setActiveDrinkRecipients({});
      setIsScoreModalOpen(false);
    },
    selectDareScore: (score: ScoreType) => {
      setIsScoreModalOpen(true);
      handleScore(score);
    },
    undoDareScore: () => handleUndo(),
    finishDare: () => handleCloseDare(),
    addPlayerScore: (targetPlayer: string, score: ScoreType) => onAddScore?.(targetPlayer, score),
    removePlayerScore: (targetPlayer: string, idx: number) => onRemoveSpecificScore?.(targetPlayer, idx),
    resetAllScores: () => onResetScores?.(),
    adjustPlayerDrinks: (targetPlayer: string, delta: number) => onAdjustDrinks?.(targetPlayer, delta),
    selectDrinkTargets: (targets: string[]) => setRemoteSelectedTargets(targets),
    resolveDareOutcome: (payload?: AdminCommandPayload) => {
      if (!payload) return;
      if (payload.recipients && Object.keys(payload.recipients).length > 0) {
        onAddDrinks?.(payload.recipients);
        setActiveDrinkRecipients(payload.recipients);
      }
      if (payload.grantImmunityTo) {
        onGrantImmunity?.(payload.grantImmunityTo);
      }
      if (payload.ruleText) {
        onAddActiveRule?.({
          text: payload.ruleText,
          createdBy: currentSinger,
          penaltyDrinks: payload.drinkCount || 1,
        });
      }
      if (payload.summaryText) {
        setDareOutcomeSummary(payload.summaryText);
        setCurrentDare(payload.summaryText);
      }
      setIsDareResolved(true);
    },
    addActiveRule: (payload?: AdminCommandPayload) => {
      if (payload?.ruleText) {
        onAddActiveRule?.({
          text: payload.ruleText,
          createdBy: payload.targetPlayer || currentSinger || 'Admin',
          penaltyDrinks: payload.drinkCount || 1,
        });
      }
    },
    triggerRuleBreak: (payload?: AdminCommandPayload) => {
      if (payload?.targetPlayer) {
        const count = payload.drinkCount || 1;
        onAddDrinks?.({ [payload.targetPlayer]: count });
        setRuleBreakFeedback(`🍺 ${payload.targetPlayer} broke a rule! +${count} drink(s)!`);
        setTimeout(() => setRuleBreakFeedback(null), 3500);
      }
    },
    removeActiveRule: (ruleId?: string) => {
      if (ruleId) {
        onRemoveActiveRule?.(ruleId);
      }
    },
  };

  // Periodic host state sync with remote server & remote skip / admin command triggers
  useEffect(() => {
    let isMounted = true;
    const syncState = async () => {
      try {
        const res = await syncHostToRemote({
          gameMode: appState?.gameMode || 'NORMAL',
          qrQueueEnabled: appState?.qrQueueEnabled ?? true,
          players: appState?.players || [],
          currentSinger,
          nextPlayer,
          isPlaying: state.isPlaying,
          currentSongTitle: state.currentSong?.title || '',
          isAutoPassMicEnabled: Boolean(appState?.isAutoPassMicEnabled),
          playerScores: appState?.playerScores || {},
          playerDrinks: appState?.playerDrinks || {},
          immunePlayers: appState?.immunePlayers || [],
          activeRules: appState?.activeRules || [],
          dareModalState: {
            isOpen: isScoreModalOpen,
            currentDare: currentDare,
            isSpinning: Boolean(drinkPlan && !currentDare && !isManualSelectionPhase),
            isSelectingPlayers: Boolean(drinkPlan && !currentDare && isManualSelectionPhase),
            manualSelectionCount: drinkPlan?.manualSelectionCount || 1,
            candidatePlayers: drinkPlan?.candidatePlayers || darePlan?.candidatePlayers || [],
            manualSelectionTitle: drinkPlan?.stage1Winner?.label || (darePlan ? 'Dare Challenge' : 'Choose Who Drinks'),
            drinkRecipients: currentDare ? activeDrinkRecipients : {},
            dareResolutionPlan: darePlan,
            isDareResolved: isDareResolved,
          },
          lastProcessedCommandId: lastProcessedCmdRef.current,
        });

        if (isMounted && res?.state) {
          // 1. Check for remote skip trigger
          if (res.state.skipRequested && res.state.skipRequested > lastHandledSkipRef.current) {
            lastHandledSkipRef.current = res.state.skipRequested;
            nextTurnRef.current();
          }

          // 2. Process pending admin commands in exact order
          if (Array.isArray(res.state.pendingCommands)) {
            for (const cmd of res.state.pendingCommands) {
              if (cmd.id > lastProcessedCmdRef.current) {
                lastProcessedCmdRef.current = cmd.id;
                const handlers = adminActionHandlersRef.current;
                switch (cmd.type) {
                  case 'TOGGLE_PLAY':
                    handlers.togglePlay();
                    break;
                  case 'PASS_MIC':
                    handlers.passMic();
                    break;
                  case 'TOGGLE_AUTO_PASS':
                    handlers.toggleAutoPass(cmd.payload?.enabled);
                    break;
                  case 'OPEN_CHALLENGE':
                    handlers.openChallenge();
                    break;
                  case 'CLOSE_CHALLENGE':
                    handlers.closeChallenge();
                    break;
                  case 'SELECT_DARE_SCORE':
                    if (cmd.payload?.score) handlers.selectDareScore(cmd.payload.score);
                    break;
                  case 'UNDO_DARE_SCORE':
                    handlers.undoDareScore();
                    break;
                  case 'FINISH_DARE':
                    handlers.finishDare();
                    break;
                  case 'ADD_PLAYER_SCORE':
                    if (cmd.payload?.targetPlayer && cmd.payload?.score) {
                      handlers.addPlayerScore(cmd.payload.targetPlayer, cmd.payload.score);
                    }
                    break;
                  case 'REMOVE_PLAYER_SCORE':
                    if (cmd.payload?.targetPlayer && typeof cmd.payload?.scoreIndex === 'number') {
                      handlers.removePlayerScore(cmd.payload.targetPlayer, cmd.payload.scoreIndex);
                    }
                    break;
                  case 'RESET_ALL_SCORES':
                    handlers.resetAllScores();
                    break;
                  case 'ADJUST_PLAYER_DRINKS':
                    if (cmd.payload?.targetPlayer && typeof cmd.payload?.delta === 'number') {
                      handlers.adjustPlayerDrinks(cmd.payload.targetPlayer, cmd.payload.delta);
                    }
                    break;
                  case 'SELECT_DRINK_TARGETS':
                    if (Array.isArray(cmd.payload?.selectedPlayers) && cmd.payload.selectedPlayers.length > 0) {
                      handlers.selectDrinkTargets(cmd.payload.selectedPlayers);
                    }
                    break;
                  case 'RESOLVE_DARE_OUTCOME':
                    handlers.resolveDareOutcome(cmd.payload);
                    break;
                  case 'ADD_ACTIVE_RULE':
                    handlers.addActiveRule(cmd.payload);
                    break;
                  case 'TRIGGER_RULE_BREAK':
                    handlers.triggerRuleBreak(cmd.payload);
                    break;
                  case 'REMOVE_ACTIVE_RULE':
                    handlers.removeActiveRule(cmd.payload?.ruleId);
                    break;
                }
              }
            }
          }

          // 3. Sync claimed players and queues into host state
          if (onUpdateRemoteState) {
            onUpdateRemoteState(res.state.claimedPlayers || {}, res.state.playerQueues || {});
          }
        }
      } catch {
        // Local server might be idle or offline
      }
    };

    syncState();
    const interval = setInterval(syncState, 500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [
    appState?.gameMode,
    appState?.qrQueueEnabled,
    appState?.players,
    appState?.playerScores,
    appState?.playerDrinks,
    appState?.isAutoPassMicEnabled,
    currentSinger,
    nextPlayer,
    state.isPlaying,
    state.currentSong?.title,
    isScoreModalOpen,
    currentDare,
    darePlan,
    isDareResolved,
    drinkPlan,
    isManualSelectionPhase,
    activeDrinkRecipients,
    appState?.immunePlayers,
    appState?.activeRules,
    onUpdateRemoteState,
  ]);

  const currentIndex = state.currentSong ? state.playlist.findIndex(s => s.id === state.currentSong?.id) : -1;
  const defaultNextSong = state.playlist.length > 0 ? state.playlist[(currentIndex + 1) % state.playlist.length] : null;
  const nextSong = nextPlayerQueuedSong
    ? nextPlayerQueuedSong
    : (state.songQueue && state.songQueue.length > 0)
    ? state.songQueue[0]
    : defaultNextSong;

  return (
    <aside className={styles.sidebarContainer}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          <User size={20} />
          <span>Up Next</span>
        </h3>
        <button className={styles.editBtn} onClick={() => {
          controls.pause();
          setIsModalOpen(true);
        }} title="Manage Players">
          <Settings2 size={16} />
        </button>
      </div>

      <div className={styles.nextTurnInfo}>
        <span className={styles.label}>Up Next:</span>
        <h2 className={styles.playerName}>{nextPlayer}</h2>

        {nextSong && (
          <div className={styles.nextSongDetails}>
            <span className={styles.songTitle}>{nextSong.title}</span>
            <span className={styles.songArtist}>{nextSong.artist}</span>
          </div>
        )}

        {(appState?.gameMode === 'DARE_DRINK' || appState?.gameMode === 'JUST_DRINK') && (
          <>
            <div className={styles.inputModeContainer}>
              <label className={styles.toggleLabel}>Input Mode</label>
              <div className={styles.inputModeGroup}>
                <button
                  className={`${styles.modeBtn} ${appState?.inputMode === 'MANUAL' ? styles.active : ''}`}
                  onClick={() => onSetInputMode && onSetInputMode('MANUAL')}
                >Manual</button>
                <button
                  className={`${styles.modeBtn} ${appState?.inputMode === 'TYPE' ? styles.active : ''}`}
                  onClick={() => onSetInputMode && onSetInputMode('TYPE')}
                >Type</button>
                {!Boolean((window as any).desktop?.isElectron) && (
                  <button
                    className={`${styles.modeBtn} ${appState?.inputMode === 'MIC' ? styles.active : ''}`}
                    onClick={() => onSetInputMode && onSetInputMode('MIC')}
                  >Mic</button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className={styles.bottomActions}>
        {appState?.gameMode === 'DARE_DRINK' && (
          <button
            className={styles.rulesBtn}
            onClick={() => setIsRulesModalOpen(true)}
            title="View & Manage Ongoing Rules"
          >
            <ScrollText size={18} />
            <span>Ongoing Rules</span>
            {(appState?.activeRules || []).length > 0 && (
              <span className={styles.ruleCountBadge}>
                {(appState?.activeRules || []).length}
              </span>
            )}
          </button>
        )}

        {(appState?.gameMode === 'DARE_DRINK' || appState?.gameMode === 'JUST_DRINK') && (
          <button className={styles.scoreBtn} onClick={() => {
            setIsScoreModalOpen(true);
          }}>
            <span>Challenge</span>
          </button>
        )}

        <div
          className={`${styles.autoPassContainer} ${appState?.isAutoPassMicEnabled ? styles.autoPassActive : ''}`}
          onClick={() => onToggleAutoPassMic && onToggleAutoPassMic(!appState?.isAutoPassMicEnabled)}
          title="Automatically pass the mic and play next song when current song finishes"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleAutoPassMic && onToggleAutoPassMic(!appState?.isAutoPassMicEnabled);
            }
          }}
        >
          <div className={styles.autoPassLabelGroup}>
            <RefreshCw
              size={14}
              className={`${styles.autoPassIcon} ${appState?.isAutoPassMicEnabled ? styles.iconSpin : ''}`}
            />
            <span className={styles.autoPassText}>Auto Pass</span>
          </div>

          <div className={`${styles.autoToggleSwitch} ${appState?.isAutoPassMicEnabled ? styles.switchActive : ''}`}>
            <span className={styles.autoToggleKnob} />
          </div>

          <input
            type="checkbox"
            checked={appState?.isAutoPassMicEnabled ?? false}
            onChange={(e) => onToggleAutoPassMic && onToggleAutoPassMic(e.target.checked)}
            className={styles.srOnlyCheckbox}
            tabIndex={-1}
            aria-label="Auto Pass Mic"
          />
        </div>

        <button className={styles.nextTurnBtn} onClick={handleNextTurn}>
          <SkipForward size={20} />
          <span>Pass Mic</span>
        </button>
      </div>

      {/* Manage Players Modal */}
      {isModalOpen && createPortal(
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div className={styles.tabContainer}>
                <button 
                  className={`${styles.tabBtn} ${activeTab === 'players' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('players')}
                >
                  Manage Players
                </button>
                <button 
                  className={`${styles.tabBtn} ${activeTab === 'songs' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('songs')}
                >
                  Manage Songs
                </button>
                {appState?.gameMode !== 'NORMAL' && (
                  <button 
                    className={`${styles.tabBtn} ${activeTab === 'dares' ? styles.activeTab : ''}`}
                    onClick={() => setActiveTab('dares')}
                  >
                    Manage Dares
                  </button>
                )}
                <button 
                  className={`${styles.tabBtn} ${activeTab === 'qr' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('qr')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <QrCode size={15} />
                  QR Queue
                </button>
              </div>
              <button onClick={() => setIsModalOpen(false)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            {activeTab === 'players' ? (
              <>
                <form onSubmit={handleAddPlayer} className={styles.inputGroup}>
                  <input
                    type="text"
                    placeholder="Enter player name..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className={styles.input}
                  />
                  <button type="submit" className={styles.addBtn} disabled={!inputValue.trim()}>
                    <Plus size={20} />
                    Add
                  </button>
                </form>

                <div className={styles.playerList}>
                  {players.length === 0 ? (
                    <div className={styles.emptyState}>No players added.</div>
                  ) : (
                    players.map((player) => {
                      return (
                        <div key={player} className={styles.playerTag}>
                          <span>{player}</span>

                          <button onClick={() => handleRemovePlayer(player)} className={styles.removeBtn}>
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : activeTab === 'songs' ? (
              <div className={styles.songsTabContent}>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Managing songs for: <strong style={{ color: '#00e5ff' }}>{appState?.gameMode === 'NORMAL' ? 'Normal Karaoke' : (appState?.gameMode === 'DARE_DRINK' ? 'Dare x Drinking' : 'Just Drink')}</strong></span>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{isWhitelist ? `${enabledSet.size} enabled` : (disabledSet.size > 0 ? `${disabledSet.size} disabled` : 'All enabled')}</span>
                </div>
                <div className={styles.songActions}>
                  <button 
                    className={styles.actionBtn}
                    onClick={() => {
                      if (onSetDisabledSongs) {
                        onSetDisabledSongs([]);
                      }
                    }}
                  >
                    Enable All
                  </button>
                  <button 
                    className={styles.actionBtn}
                    onClick={() => {
                      if (onSetDisabledSongs) {
                        onSetDisabledSongs(['__ALL_DISABLED__']);
                      }
                    }}
                  >
                    Disable All
                  </button>
                  <button 
                    className={styles.actionBtn}
                    onClick={() => {
                      if (onResetSongsToDefault) {
                        onResetSongsToDefault();
                      }
                    }}
                    title="Reset active mode songs to default list"
                  >
                    <RotateCcw size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                    Default Songs
                  </button>
                  <button 
                    className={`${styles.actionBtn} ${styles.shuffleBtn}`}
                    onClick={() => controls.shufflePlaylist()}
                  >
                    Shuffle Active Playlist
                  </button>
                </div>
                
                <div className={styles.inputGroup} style={{ marginBottom: '16px' }}>
                  <input
                    type="text"
                    placeholder="Search songs or artists..."
                    value={songSearchQuery}
                    onChange={(e) => setSongSearchQuery(e.target.value)}
                    className={styles.input}
                  />
                </div>
                
                <div className={styles.songListScrollable}>
                  {filteredCatalogSongs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>
                      No songs found
                    </div>
                  ) : (
                    <>
                      {visibleCatalogSongs.map(song => {
                        const isExplicitlyDisabled = disabledSet.has(song.id);
                        const isExplicitlyEnabled = enabledSet.has(song.id);
                        const isDisabled = isWhitelist
                          ? (!isExplicitlyEnabled || isExplicitlyDisabled)
                          : (isExplicitlyDisabled || (song.isHiddenByDefault && !isExplicitlyEnabled));
                        return (
                          <div key={song.id} className={`${styles.songListItem} ${isDisabled ? styles.disabledSong : ''}`}>
                            <div className={styles.songInfo}>
                              <span className={styles.songListTitle}>{song.title}</span>
                              <span className={styles.songListArtist}>{song.artist}</span>
                            </div>
                            <button 
                              className={`${styles.toggleSwitch} ${!isDisabled ? styles.active : ''}`}
                              onClick={() => onToggleSongStatus && onToggleSongStatus(song.id)}
                            >
                              <div className={styles.toggleKnob} />
                            </button>
                          </div>
                        );
                      })}

                      {visibleCatalogSongs.length < filteredCatalogSongs.length && (
                        <div className={styles.loadMoreContainer}>
                          <button
                            type="button"
                            className={styles.loadMoreBtn}
                            onClick={() => setSongDisplayLimit(prev => prev + 60)}
                          >
                            <span>Load More Songs ({filteredCatalogSongs.length - visibleCatalogSongs.length} remaining)</span>
                            <ChevronDown size={16} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (activeTab === 'dares' && appState?.gameMode !== 'NORMAL') ? (
              <div className={styles.songsTabContent}>
                <div className={styles.inputGroup} style={{ marginBottom: '8px' }}>
                  <select 
                    className={styles.input}
                    value={selectedDareCategory}
                    onChange={(e) => setSelectedDareCategory(e.target.value)}
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', color: 'white' }}
                  >
                    {Object.entries(appState?.categoryNames || {}).map(([id, name]) => (
                      <option key={id} value={id} style={{ backgroundColor: '#1a1a2e', color: 'white' }}>{name}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.inputGroup} style={{ flexDirection: 'column', gap: '8px', background: 'rgba(255, 255, 255, 0.04)', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="New custom dare description..."
                      value={newDareText}
                      onChange={(e) => setNewDareText(e.target.value)}
                      className={styles.input}
                      style={{ flex: 1 }}
                    />
                    <button 
                      className={styles.addBtn} 
                      style={{ width: 'auto', padding: '10px 16px' }}
                      disabled={!newDareText.trim()}
                      onClick={() => {
                        if (onAddCustomDare && newDareText.trim()) {
                          const customItem: DareItem = {
                            id: newDareText.trim(),
                            text: newDareText.trim(),
                            interactiveType: newDareType,
                            drinkCount: newDareType === 'IMMUNITY' ? 0 : newDareDrinks,
                            config: {
                              selectCount: (newDareType === 'SINGER_PICKER' || newDareType === 'WHEEL_SPIN') ? newDareSelectCount : undefined,
                              requiresCustomRuleText: newDareType === 'ONGOING_RULE',
                              defaultRuleText: newDareType === 'ONGOING_RULE' ? newDareText.trim() : undefined,
                            },
                            isCustom: true,
                          };
                          onAddCustomDare(selectedDareCategory, customItem);
                          setNewDareText('');
                        }
                      }}
                    >
                      <Plus size={20} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    <select
                      className={styles.input}
                      value={newDareType}
                      onChange={(e) => setNewDareType(e.target.value as DareInteractiveType)}
                      style={{ flex: 2, minWidth: '160px', fontSize: '0.8rem', padding: '6px 8px', backgroundColor: 'rgba(0, 0, 0, 0.6)', color: 'white' }}
                      title="Select Dare Interaction Mechanic"
                    >
                      {DARE_INTERACTIVE_CATEGORIES.map(cat => (
                        <option key={cat.type} value={cat.type} style={{ backgroundColor: '#1a1a2e', color: 'white' }}>
                          {cat.label}
                        </option>
                      ))}
                    </select>

                    {newDareType !== 'IMMUNITY' && (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        {[1, 2, 3].map(cnt => (
                          <button
                            key={cnt}
                            type="button"
                            className={styles.secondaryBtn}
                            style={{
                              padding: '6px 10px',
                              fontSize: '0.75rem',
                              backgroundColor: newDareDrinks === cnt ? '#8b5cf6' : 'rgba(255, 255, 255, 0.1)',
                              color: 'white',
                              border: newDareDrinks === cnt ? '1px solid #c084fc' : '1px solid transparent',
                            }}
                            onClick={() => setNewDareDrinks(cnt)}
                          >
                            {cnt} 🍺
                          </button>
                        ))}
                      </div>
                    )}

                    {(newDareType === 'SINGER_PICKER' || newDareType === 'WHEEL_SPIN') && (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        {[1, 2, 3].map(pCount => (
                          <button
                            key={pCount}
                            type="button"
                            className={styles.secondaryBtn}
                            style={{
                              padding: '6px 10px',
                              fontSize: '0.75rem',
                              backgroundColor: newDareSelectCount === pCount ? '#06b6d4' : 'rgba(255, 255, 255, 0.1)',
                              color: 'white',
                              border: newDareSelectCount === pCount ? '1px solid #67e8f9' : '1px solid transparent',
                            }}
                            onClick={() => setNewDareSelectCount(pCount)}
                            title={`Pick ${pCount} player(s)`}
                          >
                            {pCount}P
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button 
                    className={styles.secondaryBtn}
                    style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}
                    onClick={() => {
                      if (!onSetDisabledDares) return;
                      const currentCategoryDares = [
                        ...((dares as any)[selectedDareCategory] || []).map((d: any) => typeof d === 'string' ? d : d.text),
                        ...(appState?.customDares?.[selectedDareCategory] || []).map((d: any) => typeof d === 'string' ? d : d.text)
                      ];
                      const newDisabled = (appState?.disabledDares || []).filter(d => !currentCategoryDares.includes(d));
                      onSetDisabledDares(newDisabled);
                    }}
                  >
                    Enable All
                  </button>
                  <button 
                    className={styles.dangerBtn}
                    style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}
                    onClick={() => {
                      if (!onSetDisabledDares) return;
                      const currentCategoryDares = [
                        ...((dares as any)[selectedDareCategory] || []).map((d: any) => typeof d === 'string' ? d : d.text),
                        ...(appState?.customDares?.[selectedDareCategory] || []).map((d: any) => typeof d === 'string' ? d : d.text)
                      ];
                      const newDisabled = Array.from(new Set([...(appState?.disabledDares || []), ...currentCategoryDares]));
                      onSetDisabledDares(newDisabled);
                    }}
                  >
                    Disable All
                  </button>
                </div>

                <div className={styles.songListScrollable} style={{ marginTop: '16px', maxHeight: '300px' }}>
                  {/* Default Dares */}
                  {((dares as any)[selectedDareCategory] || []).map((dItem: DareEntry, i: number) => {
                    const dareObj = normalizeDareEntry(dItem);
                    const dareText = dareObj.text;
                    const isDisabled = appState?.disabledDares?.includes(dareText);
                    const meta = DARE_INTERACTIVE_CATEGORIES.find(m => m.type === dareObj.interactiveType);
                    return (
                      <div key={`def-${i}`} className={`${styles.songListItem} ${isDisabled ? styles.disabledSong : ''}`}>
                        <div className={styles.songInfo}>
                          <span className={styles.songListTitle} style={{ fontSize: '0.85rem' }}>{dareText}</span>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                            <span className={styles.songListArtist}>Default</span>
                            <span style={{ fontSize: '0.65rem', background: 'rgba(139, 92, 246, 0.25)', color: '#c084fc', padding: '1px 6px', borderRadius: '4px' }}>
                              {meta?.shortBadge || dareObj.interactiveType}
                            </span>
                            {dareObj.interactiveType !== 'IMMUNITY' && (
                              <span style={{ fontSize: '0.65rem', background: 'rgba(234, 179, 8, 0.2)', color: '#facc15', padding: '1px 6px', borderRadius: '4px' }}>
                                +{dareObj.drinkCount} 🍺
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#a1a1aa', cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              checked={appState?.repeatableDares?.includes(dareText) || false}
                              onChange={() => onToggleRepeatableDare && onToggleRepeatableDare(dareText)}
                              style={{ cursor: 'pointer', accentColor: '#8b5cf6', width: '16px', height: '16px', flexShrink: 0 }}
                            />
                            Repeatable
                          </label>
                          <button 
                            className={`${styles.toggleSwitch} ${!isDisabled ? styles.active : ''}`}
                            onClick={() => onToggleDare && onToggleDare(dareText)}
                          >
                            <div className={styles.toggleKnob} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Custom Dares */}
                  {(appState?.customDares?.[selectedDareCategory] || []).map((dItem: DareEntry, i: number) => {
                    const dareObj = normalizeDareEntry(dItem);
                    const dareText = dareObj.text;
                    const meta = DARE_INTERACTIVE_CATEGORIES.find(m => m.type === dareObj.interactiveType);
                    return (
                      <div key={`cus-${i}`} className={styles.songListItem}>
                        <div className={styles.songInfo}>
                          <span className={styles.songListTitle} style={{ fontSize: '0.85rem' }}>{dareText}</span>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                            <span className={styles.songListArtist} style={{ color: '#22c55e' }}>Custom</span>
                            <span style={{ fontSize: '0.65rem', background: 'rgba(6, 182, 212, 0.25)', color: '#67e8f9', padding: '1px 6px', borderRadius: '4px' }}>
                              {meta?.shortBadge || dareObj.interactiveType}
                            </span>
                            {dareObj.interactiveType !== 'IMMUNITY' && (
                              <span style={{ fontSize: '0.65rem', background: 'rgba(234, 179, 8, 0.2)', color: '#facc15', padding: '1px 6px', borderRadius: '4px' }}>
                                +{dareObj.drinkCount} 🍺
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#a1a1aa', cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              checked={appState?.repeatableDares?.includes(dareText) || false}
                              onChange={() => onToggleRepeatableDare && onToggleRepeatableDare(dareText)}
                              style={{ cursor: 'pointer', accentColor: '#8b5cf6', width: '16px', height: '16px', flexShrink: 0 }}
                            />
                            Repeatable
                          </label>
                          <button 
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                            onClick={() => onRemoveCustomDare && onRemoveCustomDare(selectedDareCategory, dareText)}
                            title="Delete custom dare"
                          >
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : activeTab === 'qr' ? (
              <div className={styles.qrTabContent}>
                <div className={styles.qrToggleRow}>
                  <div className={styles.qrToggleInfo}>
                    <span className={styles.qrToggleTitle}>
                      QR Queue ({appState?.gameMode === 'NORMAL' ? 'Normal Mode' : (appState?.gameMode === 'DARE_DRINK' ? 'Dare x Drink' : 'Just Drink')})
                    </span>
                    <span className={styles.qrToggleSubtitle}>
                      {appState?.qrQueueEnabled ? 'Enabled — Players can scan and queue songs via phone' : 'Disabled for this mode'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`${styles.toggleSwitch} ${appState?.qrQueueEnabled ? styles.active : ''}`}
                    onClick={() => onToggleQrQueue && onToggleQrQueue(!appState?.qrQueueEnabled)}
                    title="Toggle QR Song Queue for this mode"
                    aria-label="Toggle QR Song Queue"
                  >
                    <div className={styles.toggleKnob} />
                  </button>
                </div>

                {appState?.qrQueueEnabled ? (
                  <div className={styles.qrLayoutGrid}>
                    <div className={styles.qrLeftCol}>
                      <div className={styles.qrCard}>
                        {isLoadingQr ? (
                          <div style={{ padding: '40px', color: '#64748b', fontSize: '0.85rem' }}>Generating QR...</div>
                        ) : qrDataUrl ? (
                          <img src={qrDataUrl} alt="Scan to Queue Songs" width={180} height={180} />
                        ) : (
                          <div style={{ padding: '40px', color: '#64748b', fontSize: '0.85rem' }}>Unable to load QR</div>
                        )}
                      </div>

                      {remoteUrl && (
                        <div className={styles.qrUrlBadge} title="Open or share this address">
                          {remoteUrl}
                        </div>
                      )}

                      <div className={styles.qrWifiNotice} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <Wifi size={14} style={{ color: '#06b6d4', flexShrink: 0 }} />
                        <span>Same Wi-Fi required: Phones must be on the same local network. <strong>No internet needed.</strong></span>
                      </div>

                      {Boolean((window as any).desktop?.isElectron) && (
                        <div style={{ marginTop: '10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            style={{
                              fontSize: '0.78rem',
                              padding: '6px 12px',
                              backgroundColor: 'rgba(6, 182, 212, 0.15)',
                              border: '1px solid rgba(6, 182, 212, 0.4)',
                              color: '#67e8f9',
                              borderRadius: '6px',
                              cursor: 'pointer',
                            }}
                            onClick={async () => {
                              try {
                                const res = await (window as any).desktop?.requestFirewallAccess?.();
                                alert(res?.message || 'Windows Firewall configuration finished.');
                              } catch (err: any) {
                                alert(`Error requesting firewall access: ${err?.message || err}`);
                              }
                            }}
                            title="Allows phones on your local Wi-Fi to connect through Windows Firewall"
                          >
                            🛡️ Allow Phone Connections (Fix Windows Firewall)
                          </button>
                        </div>
                      )}
                    </div>

                    <div className={styles.qrRightCol}>
                      <div className={styles.qrPlayerSection}>
                        <div className={styles.qrSectionHeader}>
                          <span className={styles.qrSectionTitle}>Singer Connections</span>
                          <span className={styles.qrSectionBadge}>
                            {players.filter(p => Boolean(appState?.claimedPlayers?.[p])).length}/{players.length} Connected
                          </span>
                        </div>
                        <div className={styles.qrPlayerList}>
                          {players.length === 0 ? (
                            <div className={styles.emptyState} style={{ padding: '16px' }}>No players added yet. Add players in the "Manage Players" tab.</div>
                          ) : (
                            players.map((p, idx) => {
                              const isClaimed = Boolean(appState?.claimedPlayers?.[p]);
                              const queueCount = (appState?.playerQueues?.[p] || []).length;
                              return (
                                <div key={p} className={styles.qrPlayerItem}>
                                  <div className={styles.qrPlayerMeta}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span className={styles.qrPlayerName}>{p}</span>
                                      {idx === 0 && (
                                        <span style={{ fontSize: '0.68rem', background: 'rgba(234, 179, 8, 0.2)', border: '1px solid rgba(234, 179, 8, 0.5)', color: '#facc15', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                          👑 Admin
                                        </span>
                                      )}
                                    </div>
                                    <span className={styles.qrPlayerCount}>
                                      {queueCount > 0 ? `${queueCount} song${queueCount > 1 ? 's' : ''} queued` : 'No songs queued'}
                                    </span>
                                  </div>
                                  <div className={styles.qrPlayerActions}>
                                    {isClaimed ? (
                                      <>
                                        <span className={styles.statusConnected}>Connected</span>
                                        <button
                                          type="button"
                                          className={styles.unlockBtn}
                                          onClick={() => handleUnlockPlayer(p)}
                                          title="Disconnect phone and make name available again"
                                          style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                        >
                                          <Unlock size={11} />
                                          Unlock
                                        </button>
                                      </>
                                    ) : (
                                      <span className={styles.statusWaiting}>Waiting for scan</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '36px 16px', color: '#94a3b8', fontSize: '0.9rem', background: 'rgba(0,0,0,0.15)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>QR Song Queue is disabled for {appState?.gameMode === 'NORMAL' ? 'Normal Mode' : (appState?.gameMode === 'DARE_DRINK' ? 'Dare x Drink' : 'Just Drink')}.</p>
                    <p style={{ margin: '8px 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>Toggle the switch above to allow mobile devices to queue songs in this mode.</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      )}

      {/* Ongoing Rules Modal */}
      {isRulesModalOpen && createPortal(
        <div className={styles.modalOverlay} onClick={() => setIsRulesModalOpen(false)}>
          <div className={styles.rulesModalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.rulesHeader}>
              <div className={styles.rulesTitleGroup}>
                <ScrollText size={22} />
                <h3>Ongoing Rules</h3>
              </div>
              <button className={styles.closeBtn} onClick={() => setIsRulesModalOpen(false)} title="Close">
                <X size={18} />
              </button>
            </div>

            {ruleBreakFeedback && (
              <div className={styles.ruleBreakAlert}>
                {ruleBreakFeedback}
              </div>
            )}

            <div className={styles.ruleAddForm}>
              <input
                type="text"
                className={styles.ruleInput}
                placeholder="Add a new ongoing rule (e.g. No pointing fingers...)"
                value={newRuleText}
                onChange={e => setNewRuleText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newRuleText.trim()) {
                    onAddActiveRule?.({
                      text: newRuleText.trim(),
                      createdBy: currentSinger || 'Admin',
                      penaltyDrinks: newRulePenalty,
                    });
                    setNewRuleText('');
                  }
                }}
              />
              <div className={styles.ruleFormControls}>
                <div className={styles.penaltySelectGroup}>
                  {[1, 2, 3].map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      className={`${styles.penaltyBtn} ${newRulePenalty === cnt ? styles.penaltyActive : ''}`}
                      onClick={() => setNewRulePenalty(cnt)}
                    >
                      +{cnt} 🍺
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.addRuleSubmitBtn}
                  disabled={!newRuleText.trim()}
                  onClick={() => {
                    if (newRuleText.trim()) {
                      onAddActiveRule?.({
                        text: newRuleText.trim(),
                        createdBy: currentSinger || 'Admin',
                        penaltyDrinks: newRulePenalty,
                      });
                      setNewRuleText('');
                    }
                  }}
                >
                  Add Rule
                </button>
              </div>
            </div>

            <div className={styles.rulesListContainer}>
              {(appState?.activeRules || []).length === 0 ? (
                <div className={styles.noRulesText}>
                  No active ongoing rules right now. When a rule dare is drawn or added above, it will appear here.
                </div>
              ) : (
                (appState?.activeRules || []).map(rule => (
                  <div key={rule.id} className={styles.ruleCard}>
                    <div className={styles.ruleCardHeader}>
                      <h4 className={styles.ruleCardTitle}>{rule.text}</h4>
                      <button
                        type="button"
                        className={styles.removeRuleBtn}
                        onClick={() => onRemoveActiveRule?.(rule.id)}
                        title="Remove Rule"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className={styles.ruleCardMeta}>
                      <span>By {rule.createdBy}</span>
                      <span className={styles.rulePenaltyBadge}>+{rule.penaltyDrinks} 🍺</span>
                    </div>

                    <div className={styles.ruleTargetPrompt}>
                      Who broke this rule? Tap to make them drink +{rule.penaltyDrinks} 🍺:
                    </div>
                    <div className={styles.ruleTargetGrid}>
                      {players.map(p => (
                        <button
                          key={p}
                          type="button"
                          className={styles.ruleTargetBtn}
                          onClick={() => {
                            onAddDrinks?.({ [p]: rule.penaltyDrinks });
                            setRuleBreakFeedback(`🍺 ${p} broke "${rule.text}"! +${rule.penaltyDrinks} drink(s)!`);
                            setTimeout(() => setRuleBreakFeedback(null), 3500);
                          }}
                        >
                          🍺 {p} (+{rule.penaltyDrinks})
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Score Dare / Drink Wheel Modal */}
      {isScoreModalOpen && createPortal(
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} ${styles.scoreModal} ${drinkPlan ? styles.wheelActive : ''}`}>
            {drinkPlan ? (
              <DrinkWheel
                key={`${drinkPlan.score}-${drinkPlan.summaryText}-${drinkPlan.stage1WinningIndex}`}
                plan={drinkPlan}
                onFinished={handleDrinkSpinFinished}
                onUndo={handleUndo}
                onDone={handleCloseDare}
                onManualPhaseStart={() => setIsManualSelectionPhase(true)}
                externalSelectedPlayers={remoteSelectedTargets}
              />
            ) : currentDare ? (
              <div className={styles.dareResult}>
                <button className={styles.undoBtn} onClick={handleUndo} title="Undo Score">
                  <Undo2 size={20} />
                </button>
                <h3 className={styles.dareResultTitle}>The Dare</h3>

                {isDareResolved ? (
                  <div className={styles.dareOutcomeBanner}>
                    <img src="/Beer.gif" alt="Cheers" className={styles.dareOutcomeGif} />
                    <p style={{ margin: 0 }}>{dareOutcomeSummary || currentDare}</p>
                    <button className={styles.dareDoneBtn} onClick={handleCloseDare}>Start</button>
                  </div>
                ) : (
                  <>
                    <p className={styles.dareResultText}>{currentDare}</p>
                    {darePlan ? (
                      <div className={styles.interactiveDareBox}>
                    {darePlan.interactiveType === 'SINGER_PICKER' && (
                      <>
                        <span className={styles.interactiveDareBadge}>
                          Singer Choice: Pick {darePlan.selectCount || 1}
                        </span>
                        <div className={styles.candidatePickerGrid}>
                          {(darePlan.candidatePlayers || []).map(p => {
                            const isSelected = selectedPlayersForDare.includes(p);
                            return (
                              <button
                                key={p}
                                type="button"
                                className={`${styles.candidatePickerBtn} ${isSelected ? styles.candidateSelected : ''}`}
                                onClick={() => {
                                  const maxAllowed = darePlan.selectCount || 1;
                                  if (selectedPlayersForDare.includes(p)) {
                                    setSelectedPlayersForDare(prev => prev.filter(x => x !== p));
                                  } else {
                                    if (maxAllowed === 1) {
                                      setSelectedPlayersForDare([p]);
                                    } else if (selectedPlayersForDare.length < maxAllowed) {
                                      setSelectedPlayersForDare(prev => [...prev, p]);
                                    }
                                  }
                                }}
                              >
                                🍺 {p} {isSelected && '✓'}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          className={styles.dareDoneBtn}
                          disabled={selectedPlayersForDare.length === 0}
                          onClick={() => {
                            const rec: Record<string, number> = {};
                            for (const p of selectedPlayersForDare) rec[p] = darePlan.drinkCount;
                            if (darePlan.includeSingerInDrink) rec[currentSinger] = (rec[currentSinger] || 0) + darePlan.drinkCount;
                            const summary = darePlan.includeSingerInDrink
                              ? `🍺 ${currentSinger} and ${selectedPlayersForDare.join(' and ')} drink ${darePlan.drinkCount}!`
                              : `🍺 ${selectedPlayersForDare.join(' and ')} drink${selectedPlayersForDare.length === 1 ? 's' : ''} ${darePlan.drinkCount}!`;
                            resolveDareOutcome({ recipients: rec, summaryText: summary });
                          }}
                        >
                          Confirm Pick (+{darePlan.drinkCount} 🍺)
                        </button>
                      </>
                    )}

                    {darePlan.interactiveType === 'ONGOING_RULE' && (
                      <>
                        <span className={styles.interactiveDareBadge}>
                          Ongoing Rule (+{darePlan.drinkCount} 🍺 on break)
                        </span>
                        {darePlan.requiresCustomRuleText && (
                          <input
                            type="text"
                            className={styles.ruleInput}
                            placeholder="Type the rule..."
                            value={customRuleInput}
                            onChange={e => setCustomRuleInput(e.target.value)}
                          />
                        )}
                        <button
                          type="button"
                          className={styles.dareDoneBtn}
                          disabled={darePlan.requiresCustomRuleText && !customRuleInput.trim()}
                          onClick={() => {
                            const ruleText = customRuleInput.trim() || darePlan.defaultRuleText || currentDare;
                            resolveDareOutcome({
                              ruleText,
                              drinkCount: darePlan.drinkCount,
                              summaryText: `📜 Active Rule Added: "${ruleText}" (+${darePlan.drinkCount} 🍺 on break)!`
                            });
                          }}
                        >
                          📜 Activate Rule (+{darePlan.drinkCount} 🍺 on break)
                        </button>
                        {typeof darePlan.canRefuseRuleForDrinks === 'number' && (
                          <button
                            type="button"
                            className={styles.dareDoneBtn}
                            style={{ background: 'rgba(239, 68, 68, 0.25)', border: '1px solid #ef4444' }}
                            onClick={() => {
                              const drinks = darePlan.canRefuseRuleForDrinks || 1;
                              resolveDareOutcome({
                                recipients: { [currentSinger]: drinks },
                                summaryText: `🍺 ${currentSinger} refused the rule and took ${drinks} drink(s)!`
                              });
                            }}
                          >
                            🍺 Refuse & Drink +{darePlan.canRefuseRuleForDrinks} Drinks
                          </button>
                        )}
                      </>
                    )}

                    {darePlan.interactiveType === 'ADMIN_GROUP_PICKER' && (
                      <>
                        <span className={styles.interactiveDareBadge}>
                          Admin: Select Matching Players (+{darePlan.drinkCount} 🍺 each)
                        </span>
                        <div className={styles.candidatePickerGrid}>
                          {(darePlan.candidatePlayers || []).map(p => {
                            const isSelected = selectedPlayersForDare.includes(p);
                            return (
                              <button
                                key={p}
                                type="button"
                                className={`${styles.candidatePickerBtn} ${isSelected ? styles.candidateSelected : ''}`}
                                onClick={() => {
                                  setSelectedPlayersForDare(prev =>
                                    prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                                  );
                                }}
                              >
                                {p} {isSelected ? '✓ 🍺' : ''}
                              </button>
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className={styles.dareDoneBtn}
                            style={{ flex: 2 }}
                            onClick={() => {
                              const rec: Record<string, number> = {};
                              for (const p of selectedPlayersForDare) rec[p] = darePlan.drinkCount;
                              const summary = selectedPlayersForDare.length > 0
                                ? `🍺 ${selectedPlayersForDare.join(', ')} drink ${darePlan.drinkCount}!`
                                : 'No players selected — 0 drinks!';
                              resolveDareOutcome({ recipients: rec, summaryText: summary });
                            }}
                          >
                            Confirm Selected ({selectedPlayersForDare.length})
                          </button>
                          <button
                            type="button"
                            className={styles.dareDoneBtn}
                            style={{ flex: 1, background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)' }}
                            onClick={() => {
                              resolveDareOutcome({
                                recipients: {},
                                summaryText: 'No players matched this dare! Everyone is safe.'
                              });
                            }}
                          >
                            No Matches (0 🍺)
                          </button>
                        </div>
                      </>
                    )}

                    {darePlan.interactiveType === 'PASS_OR_DRINK' && (
                      <>
                        <span className={styles.interactiveDareBadge}>
                          Pass or Drink
                        </span>
                        <div className={styles.passOrDrinkButtons}>
                          <button
                            type="button"
                            className={styles.passBtn}
                            onClick={() => {
                              resolveDareOutcome({
                                recipients: {},
                                summaryText: `🎉 ${currentSinger} completed the dare!`
                              });
                            }}
                          >
                            ✅ Completed Dare (0 🍺)
                          </button>
                          <button
                            type="button"
                            className={styles.drinkPenaltyBtn}
                            onClick={() => {
                              resolveDareOutcome({
                                recipients: { [currentSinger]: darePlan.drinkCount },
                                summaryText: `🍺 ${currentSinger} failed/refused and drinks ${darePlan.drinkCount}!`
                              });
                            }}
                          >
                            🍺 Refuse / Failed (+{darePlan.drinkCount} 🍺)
                          </button>
                        </div>
                      </>
                    )}

                    {darePlan.interactiveType === 'COUNT_PICKER' && (
                      <>
                        <span className={styles.interactiveDareBadge}>
                          Count Picker (+{darePlan.drinkCount} 🍺 each)
                        </span>
                        <div className={styles.countPickerBox}>
                          <button
                            type="button"
                            className={styles.countBtn}
                            disabled={countPickerValue <= 0}
                            onClick={() => setCountPickerValue(v => Math.max(0, v - 1))}
                          >
                            −
                          </button>
                          <span className={styles.countValue}>{countPickerValue}</span>
                          <button
                            type="button"
                            className={styles.countBtn}
                            disabled={countPickerValue >= 10}
                            onClick={() => setCountPickerValue(v => Math.min(10, v + 1))}
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className={styles.dareDoneBtn}
                          onClick={() => {
                            const drinks = countPickerValue * darePlan.drinkCount;
                            const rec = drinks > 0 ? { [currentSinger]: drinks } : {};
                            const summary = drinks > 0
                              ? `🍺 ${currentSinger} gets ${drinks} drink(s)! (${countPickerValue} × ${darePlan.drinkCount})`
                              : `${currentSinger} had 0 misses — 0 drinks!`;
                            resolveDareOutcome({ recipients: rec, summaryText: summary });
                          }}
                        >
                          Confirm ({countPickerValue * darePlan.drinkCount} 🍺)
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <button className={styles.dareDoneBtn} onClick={handleCloseDare}>Start</button>
                )}
                  </>
                )}
              </div>
            ) : (
              <>
                <div className={styles.modalHeader}>
                  <h3>Score the Dare</h3>
                  <button onClick={() => {
                    setIsScoreModalOpen(false);
                  }} className={styles.closeBtn}>
                    <X size={20} />
                  </button>
                </div>

                <div className={styles.scoreOptions}>
                  <button className={`${styles.scoreOptionBtn} ${styles.scorePerfect}`} onClick={() => handleScore('PERFECT')}>Perfect</button>
                  <button className={`${styles.scoreOptionBtn} ${styles.scoreTwo}`} onClick={() => handleScore('TWO_WORDS')}>2 Words</button>
                  <button className={`${styles.scoreOptionBtn} ${styles.scoreOne}`} onClick={() => handleScore('ONE_WORD')}>1 Word</button>
                  <button className={`${styles.scoreOptionBtn} ${styles.scoreZero}`} onClick={() => handleScore('ZERO')}>No Correct</button>
                  {appState?.gameMode !== 'NORMAL' && (
                    <>
                      <div className={styles.divider}></div>
                      <button className={`${styles.scoreOptionBtn} ${styles.scoreExtra}`} onClick={() => handleScore('EXTRA')}>Extra Challenge</button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </aside>
  );
};

