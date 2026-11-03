import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  Search,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  Trash2,
  Lock,
  Music,
  ListMusic,
  Check,
  Flame,
  Mic,
  SkipForward,
  Crown,
  Play,
  Pause,
  RotateCcw,
  Target,
  RefreshCw,
  Trophy,
  ScrollText,
} from 'lucide-react';
import type { Song, AdminCommandType, AdminCommandPayload } from '../../../logic/types/logicTypes';
import {
  getDeviceId,
  fetchRemoteInfo,
  claimPlayerName,
  releasePlayerName,
  searchRemoteSongs,
  mutatePlayerQueue,
  requestSkipTurn,
  sendAdminCommand,
} from '../../../logic/services/remoteQueueClient';
import type { RemoteSessionState } from '../../../logic/services/remoteQueueServer';
import styles from './MobileRemote.module.scss';

export const MobileRemote: React.FC = () => {
  const [deviceId] = useState<string>(() => getDeviceId());
  const [remoteState, setRemoteState] = useState<RemoteSessionState | null>(null);
  const [activeTab, setActiveTab] = useState<'search' | 'queue' | 'party' | 'admin'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addedSongId, setAddedSongId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isSkipping, setIsSkipping] = useState(false);
  const [skipFeedback, setSkipFeedback] = useState<string | null>(null);
  const [editingScorePlayer, setEditingScorePlayer] = useState<string | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [adminActionStatus, setAdminActionStatus] = useState<string | null>(null);
  const [selectedDrinkTargets, setSelectedDrinkTargets] = useState<string[]>([]);
  const [isSubmittingTargets, setIsSubmittingTargets] = useState(false);
  const [remotePickerSelected, setRemotePickerSelected] = useState<string[]>([]);
  const [remoteCustomRuleInput, setRemoteCustomRuleInput] = useState<string>('');
  const [remoteCountPickerValue, setRemoteCountPickerValue] = useState<number>(1);
  const [newAdminRuleText, setNewAdminRuleText] = useState<string>('');
  const [newAdminRulePenalty, setNewAdminRulePenalty] = useState<number>(1);

  // Poll remote info from server every 800ms for fast remote reactivity
  useEffect(() => {
    let isMounted = true;
    const poll = async () => {
      try {
        const info = await fetchRemoteInfo();
        if (isMounted && info?.state) {
          setRemoteState(info.state);
        }
      } catch (err) {
        console.warn('[MobileRemote] Poll failed:', err);
      }
    };

    poll();
    const interval = setInterval(poll, 800);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Determine which player name is claimed by this phone
  const myClaimedName = useMemo(() => {
    if (!remoteState?.claimedPlayers) return null;
    return (
      Object.keys(remoteState.claimedPlayers).find(
        (name) => remoteState.claimedPlayers[name] === deviceId
      ) || null
    );
  }, [remoteState?.claimedPlayers, deviceId]);

  const adminPlayerName = remoteState?.players?.[0] || '';
  const isAdmin = Boolean(myClaimedName && adminPlayerName && myClaimedName === adminPlayerName);

  // Debounce search query by 200ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Execute song search when debouncedQuery changes
  useEffect(() => {
    let isCurrent = true;
    if (!myClaimedName) return;

    setIsSearching(true);
    searchRemoteSongs(debouncedQuery, 40)
      .then((songs) => {
        if (isCurrent) {
          setSearchResults(songs);
          setIsSearching(false);
        }
      })
      .catch((err) => {
        if (isCurrent) {
          console.error('[MobileRemote] Search failed:', err);
          setIsSearching(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [debouncedQuery, myClaimedName]);

  // Claim a player name
  const handleClaim = async (playerName: string) => {
    setClaimError(null);
    try {
      const res = await claimPlayerName(playerName, deviceId);
      if (res?.state) {
        setRemoteState(res.state);
      }
    } catch (err: any) {
      setClaimError(err.message || 'Failed to claim name');
    }
  };

  // Release currently claimed name
  const handleRelease = async () => {
    if (!myClaimedName) return;
    try {
      const res = await releasePlayerName(myClaimedName, deviceId);
      if (res?.state) {
        setRemoteState(res.state);
      }
    } catch (err: any) {
      console.error('[MobileRemote] Failed to release name:', err);
    }
  };

  // Add song to player queue
  const handleAddSong = async (song: Song) => {
    if (!myClaimedName) return;
    try {
      const res = await mutatePlayerQueue({
        playerName: myClaimedName,
        deviceId,
        action: 'ADD',
        song,
      });
      if (res?.state) {
        setRemoteState(res.state);
        setAddedSongId(song.id);
        setTimeout(() => setAddedSongId(null), 1200);
      }
    } catch (err: any) {
      console.error('[MobileRemote] Failed to add song:', err);
    }
  };

  // Reorder song in player queue
  const handleReorderSong = async (index: number, toIndex: number) => {
    if (!myClaimedName) return;
    try {
      const res = await mutatePlayerQueue({
        playerName: myClaimedName,
        deviceId,
        action: 'REORDER',
        index,
        toIndex,
      });
      if (res?.state) {
        setRemoteState(res.state);
      }
    } catch (err: any) {
      console.error('[MobileRemote] Failed to reorder queue:', err);
    }
  };

  // Remove song from player queue
  const handleRemoveSong = async (index: number) => {
    if (!myClaimedName) return;
    try {
      const res = await mutatePlayerQueue({
        playerName: myClaimedName,
        deviceId,
        action: 'REMOVE',
        index,
      });
      if (res?.state) {
        setRemoteState(res.state);
      }
    } catch (err: any) {
      console.error('[MobileRemote] Failed to remove song:', err);
    }
  };

  // Clear player queue
  const handleClearQueue = async () => {
    if (!myClaimedName) return;
    try {
      const res = await mutatePlayerQueue({
        playerName: myClaimedName,
        deviceId,
        action: 'CLEAR',
      });
      if (res?.state) {
        setRemoteState(res.state);
      }
    } catch (err: any) {
      console.error('[MobileRemote] Failed to clear queue:', err);
    }
  };

  // Request skip turn from phone (enabled only when it is active singer's turn)
  const handleSkipTurn = async () => {
    if (!myClaimedName || !isSingingNow || isSkipping) return;
    setIsSkipping(true);
    setSkipFeedback(null);
    try {
      const res = await requestSkipTurn(myClaimedName, deviceId);
      if (res?.state) {
        setRemoteState(res.state);
        setSkipFeedback('Turn skipped!');
        setTimeout(() => setSkipFeedback(null), 2000);
      }
    } catch (err: any) {
      console.error('[MobileRemote] Failed to skip turn:', err);
      setSkipFeedback(err.message || 'Failed to skip');
      setTimeout(() => setSkipFeedback(null), 2500);
    } finally {
      setIsSkipping(false);
    }
  };

  // Send command to host server (Admin has full control; Singer can also submit target/dare resolutions)
  const handleSendCommand = async (type: AdminCommandType, payload?: AdminCommandPayload) => {
    if (!myClaimedName) return;
    const canSend = isAdmin || (isSingingNow && (type === 'SELECT_DRINK_TARGETS' || type === 'RESOLVE_DARE_OUTCOME'));
    if (!canSend) return;
    try {
      const res = await sendAdminCommand({
        playerName: myClaimedName,
        deviceId,
        type,
        payload,
      });
      if (res?.state) {
        setRemoteState(res.state);
      }
    } catch (err: any) {
      console.error(`[MobileRemote] Command ${type} failed:`, err);
      setAdminActionStatus(err.message || 'Action failed');
      setTimeout(() => setAdminActionStatus(null), 2500);
    }
  };

  const handleSendAdminCmd = handleSendCommand;

  // Calculate live leaderboard for the Scoreboard panel
  const playerRankings = useMemo(() => {
    const list = (remoteState?.players || []).map((p) => {
      const scores = remoteState?.playerScores?.[p] || [];
      let normal = 0;
      let extra = 0;
      for (const s of scores) {
        if (s === 'PERFECT') normal += 3;
        else if (s === 'TWO_WORDS') normal += 2;
        else if (s === 'ONE_WORD') normal += 1;
        else if (s === 'EXTRA') extra += 1;
      }
      return { player: p, normal, extra, scores, drinks: remoteState?.playerDrinks?.[p] || 0 };
    });
    return list.sort((a, b) => b.normal - a.normal || b.extra - a.extra);
  }, [remoteState?.players, remoteState?.playerScores, remoteState?.playerDrinks]);

  const myQueue = (myClaimedName && remoteState?.playerQueues?.[myClaimedName]) || [];
  const isSingingNow = Boolean(myClaimedName && remoteState?.currentSinger === myClaimedName);
  const isUpNext = Boolean(myClaimedName && remoteState?.nextPlayer === myClaimedName);
  const isDareMode = Boolean(
    remoteState?.gameMode && (remoteState.gameMode === 'DARE_DRINK' || remoteState.gameMode === 'JUST_DRINK' || remoteState.gameMode === 'DARE')
  );
  const isDareOrDrinkMode = isDareMode;
  const showDrinks = remoteState?.gameMode === 'JUST_DRINK' || remoteState?.gameMode === 'DARE_DRINK';
  const isJustDrink = showDrinks;

  const isSelectingPlayers = Boolean(
    remoteState?.dareModalState?.isOpen &&
    remoteState?.dareModalState?.isSelectingPlayers &&
    !remoteState?.dareModalState?.currentDare
  );
  const manualSelectionCount = remoteState?.dareModalState?.manualSelectionCount || 1;
  const candidatePlayers = remoteState?.dareModalState?.candidatePlayers || [];
  const manualSelectionTitle = remoteState?.dareModalState?.manualSelectionTitle || 'Choose Who Drinks';
  const canPickDrinkTargets = Boolean(isSelectingPlayers && (isSingingNow || isAdmin));
  const myDrinksAssigned =
    myClaimedName &&
    remoteState?.dareModalState?.isOpen &&
    remoteState?.dareModalState?.drinkRecipients
      ? remoteState.dareModalState.drinkRecipients[myClaimedName] || 0
      : 0;

  const darePlan = remoteState?.dareModalState?.dareResolutionPlan;
  const isDareUnresolved = Boolean(
    remoteState?.dareModalState?.isOpen &&
    darePlan &&
    !remoteState?.dareModalState?.isDareResolved
  );

  useEffect(() => {
    if (remoteState?.dareModalState?.dareResolutionPlan) {
      setRemoteCustomRuleInput(remoteState.dareModalState.dareResolutionPlan.defaultRuleText || '');
      setRemoteCountPickerValue(remoteState.dareModalState.dareResolutionPlan.drinkCount || 1);
      setRemotePickerSelected([]);
    }
  }, [remoteState?.dareModalState?.currentDare, remoteState?.dareModalState?.dareResolutionPlan?.interactiveType]);

  // Reset drink target selections when selection phase ends
  useEffect(() => {
    if (!isSelectingPlayers) {
      setSelectedDrinkTargets([]);
      setIsSubmittingTargets(false);
    }
  }, [isSelectingPlayers]);

  // Keep activeTab aligned with active game mode
  useEffect(() => {
    if (!remoteState) return;
    if (remoteState.gameMode !== 'NORMAL') {
      if (activeTab === 'search' || activeTab === 'queue') {
        setActiveTab(isAdmin ? 'admin' : 'party');
      }
    } else {
      if (activeTab === 'party') {
        setActiveTab('search');
      }
    }
  }, [remoteState?.gameMode, isAdmin, activeTab]);

  const handleToggleDrinkTarget = (playerName: string) => {
    setSelectedDrinkTargets((prev) => {
      if (prev.includes(playerName)) {
        return prev.filter((p) => p !== playerName);
      }
      if (manualSelectionCount === 1) {
        return [playerName];
      }
      if (prev.length < manualSelectionCount) {
        return [...prev, playerName];
      }
      return prev;
    });
  };

  const handleConfirmDrinkTargets = async () => {
    if (!myClaimedName || selectedDrinkTargets.length !== manualSelectionCount || isSubmittingTargets) return;
    setIsSubmittingTargets(true);
    try {
      const res = await sendAdminCommand({
        playerName: myClaimedName,
        deviceId,
        type: 'SELECT_DRINK_TARGETS',
        payload: { selectedPlayers: selectedDrinkTargets },
      });
      if (res?.state) {
        setRemoteState(res.state);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to submit player selection');
    } finally {
      setIsSubmittingTargets(false);
    }
  };

  const renderDrinkTargetPicker = () => {
    const isComplete = selectedDrinkTargets.length === manualSelectionCount;
    return (
      <div className={styles.drinkPickerCard}>
        <div className={styles.drinkPickerHeader}>
          <div className={styles.pickerTitleRow}>
            <Target size={16} style={{ color: '#fbbf24' }} />
            <strong>{manualSelectionTitle}</strong>
          </div>
          <p>
            Tap <b>{manualSelectionCount}</b> player{manualSelectionCount > 1 ? 's' : ''} to take a drink:
          </p>
        </div>

        <div className={styles.drinkCandidateGrid}>
          {candidatePlayers.map((player) => {
            const isSelected = selectedDrinkTargets.includes(player);
            const currentDrinks = remoteState?.playerDrinks?.[player] || 0;
            return (
              <button
                key={player}
                type="button"
                className={`${styles.drinkCandidateBtn} ${isSelected ? styles.drinkCandidateSelected : ''}`}
                onClick={() => handleToggleDrinkTarget(player)}
              >
                <div className={styles.candidateLeft}>
                  <span className={styles.beerIcon}>🍺</span>
                  <span className={styles.candidateName}>{player}</span>
                </div>
                <div className={styles.candidateRight}>
                  <span className={styles.candidateDrinks}>{currentDrinks} drank</span>
                  {isSelected && <span className={styles.checkIcon}>✓</span>}
                </div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={styles.drinkConfirmBtn}
          disabled={!isComplete || isSubmittingTargets}
          onClick={handleConfirmDrinkTargets}
        >
          {isSubmittingTargets
            ? 'Submitting...'
            : isComplete
            ? `Confirm: ${selectedDrinkTargets.join(', ')} 🍺`
            : `Select ${manualSelectionCount - selectedDrinkTargets.length} more (${selectedDrinkTargets.length}/${manualSelectionCount})`}
        </button>
      </div>
    );
  };

  const renderInteractiveDareResolution = () => {
    if (!darePlan) return null;

    // 1. SINGER_PICKER: Singer & Admin
    if (darePlan.interactiveType === 'SINGER_PICKER') {
      const selectCount = darePlan.selectCount || 1;
      const canPick = isSingingNow || isAdmin;
      const candidates = darePlan.candidatePlayers || [];

      return (
        <div className={styles.remoteInteractiveDareBox}>
          <span className={styles.interactiveTypeTag}>
            Singer Choice: Pick {selectCount}
          </span>
          <p className={styles.remoteDarePrompt}>
            {canPick
              ? `Select ${selectCount} player(s) to drink ${darePlan.drinkCount} 🍺:`
              : `Waiting for ${remoteState?.currentSinger || 'Singer'} to select ${selectCount} player(s)...`}
          </p>
          {canPick ? (
            <>
              <div className={styles.remoteCandidateGrid}>
                {candidates.map((p) => {
                  const isSelected = remotePickerSelected.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      className={`${styles.remoteCandidateBtn} ${isSelected ? styles.candidateSelected : ''}`}
                      onClick={() => {
                        if (remotePickerSelected.includes(p)) {
                          setRemotePickerSelected((prev) => prev.filter((x) => x !== p));
                        } else {
                          if (selectCount === 1) {
                            setRemotePickerSelected([p]);
                          } else if (remotePickerSelected.length < selectCount) {
                            setRemotePickerSelected((prev) => [...prev, p]);
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
                className={styles.remoteConfirmActionBtn}
                disabled={remotePickerSelected.length === 0}
                onClick={() => {
                  const rec: Record<string, number> = {};
                  for (const p of remotePickerSelected) rec[p] = darePlan.drinkCount;
                  if (darePlan.includeSingerInDrink && remoteState?.currentSinger) {
                    rec[remoteState.currentSinger] = (rec[remoteState.currentSinger] || 0) + darePlan.drinkCount;
                  }
                  const summary = darePlan.includeSingerInDrink
                    ? `🍺 ${remoteState?.currentSinger} and ${remotePickerSelected.join(' and ')} drink ${darePlan.drinkCount}!`
                    : `🍺 ${remotePickerSelected.join(' and ')} drink${remotePickerSelected.length === 1 ? 's' : ''} ${darePlan.drinkCount}!`;
                  handleSendCommand('RESOLVE_DARE_OUTCOME', {
                    recipients: rec,
                    summaryText: summary,
                  });
                }}
              >
                Confirm Pick (+{darePlan.drinkCount} 🍺)
              </button>
            </>
          ) : (
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic' }}>
              Only {remoteState?.currentSinger || 'the active singer'} or Admin can choose targets.
            </div>
          )}
        </div>
      );
    }

    // 2. ONGOING_RULE: Singer & Admin
    if (darePlan.interactiveType === 'ONGOING_RULE') {
      const canActivate = isSingingNow || isAdmin;
      return (
        <div className={styles.remoteInteractiveDareBox}>
          <span className={styles.interactiveTypeTag}>
            Ongoing Rule (+{darePlan.drinkCount} 🍺 on break)
          </span>
          <p className={styles.remoteDarePrompt}>
            {darePlan.defaultRuleText || remoteState?.dareModalState?.currentDare}
          </p>
          {canActivate ? (
            <>
              {darePlan.requiresCustomRuleText && (
                <input
                  type="text"
                  className={styles.remoteRuleInput}
                  placeholder="Type custom rule..."
                  value={remoteCustomRuleInput}
                  onChange={(e) => setRemoteCustomRuleInput(e.target.value)}
                />
              )}
              <button
                type="button"
                className={styles.remoteConfirmActionBtn}
                disabled={darePlan.requiresCustomRuleText && !remoteCustomRuleInput.trim()}
                onClick={() => {
                  const ruleText = remoteCustomRuleInput.trim() || darePlan.defaultRuleText || remoteState?.dareModalState?.currentDare || 'Active Rule';
                  handleSendCommand('RESOLVE_DARE_OUTCOME', {
                    ruleText,
                    drinkCount: darePlan.drinkCount,
                    summaryText: `📜 Active Rule Added: "${ruleText}" (+${darePlan.drinkCount} 🍺 on break)!`,
                  });
                }}
              >
                📜 Activate Rule (+{darePlan.drinkCount} 🍺)
              </button>
              {typeof darePlan.canRefuseRuleForDrinks === 'number' && (
                <button
                  type="button"
                  className={styles.remoteConfirmActionBtn}
                  style={{ background: 'rgba(239, 68, 68, 0.25)', border: '1px solid #ef4444' }}
                  onClick={() => {
                    const drinks = darePlan.canRefuseRuleForDrinks || 1;
                    handleSendCommand('RESOLVE_DARE_OUTCOME', {
                      recipients: remoteState?.currentSinger ? { [remoteState.currentSinger]: drinks } : {},
                      summaryText: `🍺 ${remoteState?.currentSinger} refused the rule and drank ${drinks}!`,
                    });
                  }}
                >
                  🍺 Refuse & Drink +{darePlan.canRefuseRuleForDrinks} Drinks
                </button>
              )}
            </>
          ) : (
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic' }}>
              Waiting for {remoteState?.currentSinger || 'Singer'} or Admin to activate the rule...
            </div>
          )}
        </div>
      );
    }

    // 3. ADMIN_GROUP_PICKER: Admin Only
    if (darePlan.interactiveType === 'ADMIN_GROUP_PICKER') {
      if (!isAdmin) {
        return (
          <div className={styles.remoteInteractiveDareBox}>
            <span className={styles.interactiveTypeTag}>Social Dare</span>
            <p className={styles.remoteDarePrompt}>
              Waiting for Admin to select matching players...
            </p>
          </div>
        );
      }

      const candidates = darePlan.candidatePlayers || remoteState?.players || [];
      return (
        <div className={styles.remoteInteractiveDareBox}>
          <span className={styles.interactiveTypeTag}>
            Admin: Select Matching Players (+{darePlan.drinkCount} 🍺)
          </span>
          <div className={styles.remoteCandidateGrid}>
            {candidates.map((p) => {
              const isSelected = remotePickerSelected.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  className={`${styles.remoteCandidateBtn} ${isSelected ? styles.candidateSelected : ''}`}
                  onClick={() => {
                    setRemotePickerSelected((prev) =>
                      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
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
              className={styles.remoteConfirmActionBtn}
              style={{ flex: 2 }}
              onClick={() => {
                const rec: Record<string, number> = {};
                for (const p of remotePickerSelected) rec[p] = darePlan.drinkCount;
                const summary = remotePickerSelected.length > 0
                  ? `🍺 ${remotePickerSelected.join(', ')} drink ${darePlan.drinkCount}!`
                  : 'No players selected — 0 drinks!';
                handleSendCommand('RESOLVE_DARE_OUTCOME', {
                  recipients: rec,
                  summaryText: summary,
                });
              }}
            >
              Confirm Selected ({remotePickerSelected.length})
            </button>
            <button
              type="button"
              className={styles.remoteConfirmActionBtn}
              style={{ flex: 1, background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)' }}
              onClick={() => {
                handleSendCommand('RESOLVE_DARE_OUTCOME', {
                  recipients: {},
                  summaryText: 'No players matched this dare! Everyone is safe.',
                });
              }}
            >
              No Matches (0 🍺)
            </button>
          </div>
        </div>
      );
    }

    // 4. PASS_OR_DRINK: Admin Only
    if (darePlan.interactiveType === 'PASS_OR_DRINK') {
      if (!isAdmin) {
        return (
          <div className={styles.remoteInteractiveDareBox}>
            <span className={styles.interactiveTypeTag}>Challenge</span>
            <p className={styles.remoteDarePrompt}>
              Waiting for Admin to mark completed or failed...
            </p>
          </div>
        );
      }

      return (
        <div className={styles.remoteInteractiveDareBox}>
          <span className={styles.interactiveTypeTag}>
            Pass or Drink ({darePlan.drinkCount} 🍺)
          </span>
          <div className={styles.remotePassOrDrinkRow}>
            <button
              type="button"
              className={styles.remotePassBtn}
              onClick={() => {
                handleSendCommand('RESOLVE_DARE_OUTCOME', {
                  recipients: {},
                  summaryText: `🎉 ${remoteState?.currentSinger} completed the dare!`,
                });
              }}
            >
              ✅ Completed (0 🍺)
            </button>
            <button
              type="button"
              className={styles.remoteFailBtn}
              onClick={() => {
                const rec = remoteState?.currentSinger ? { [remoteState.currentSinger]: darePlan.drinkCount } : {};
                handleSendCommand('RESOLVE_DARE_OUTCOME', {
                  recipients: rec,
                  summaryText: `🍺 ${remoteState?.currentSinger} failed/refused and drinks ${darePlan.drinkCount}!`,
                });
              }}
            >
              🍺 Failed (+{darePlan.drinkCount} 🍺)
            </button>
          </div>
        </div>
      );
    }

    // 5. COUNT_PICKER: Admin Only
    if (darePlan.interactiveType === 'COUNT_PICKER') {
      if (!isAdmin) {
        return (
          <div className={styles.remoteInteractiveDareBox}>
            <span className={styles.interactiveTypeTag}>Count Picker</span>
            <p className={styles.remoteDarePrompt}>
              Waiting for Admin to submit count...
            </p>
          </div>
        );
      }

      return (
        <div className={styles.remoteInteractiveDareBox}>
          <span className={styles.interactiveTypeTag}>
            Count Picker (+{darePlan.drinkCount} 🍺 each)
          </span>
          <div className={styles.remoteCountStepper}>
            <button
              type="button"
              className={styles.stepperBtn}
              disabled={remoteCountPickerValue <= 0}
              onClick={() => setRemoteCountPickerValue((v) => Math.max(0, v - 1))}
            >
              −
            </button>
            <span className={styles.stepperVal}>{remoteCountPickerValue}</span>
            <button
              type="button"
              className={styles.stepperBtn}
              disabled={remoteCountPickerValue >= 10}
              onClick={() => setRemoteCountPickerValue((v) => Math.min(10, v + 1))}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className={styles.remoteConfirmActionBtn}
            onClick={() => {
              const drinks = remoteCountPickerValue * darePlan.drinkCount;
              const rec = drinks > 0 && remoteState?.currentSinger ? { [remoteState.currentSinger]: drinks } : {};
              const summary = drinks > 0
                ? `🍺 ${remoteState?.currentSinger} gets ${drinks} drink(s)! (${remoteCountPickerValue} × ${darePlan.drinkCount})`
                : `${remoteState?.currentSinger} had 0 misses — 0 drinks!`;
              handleSendCommand('RESOLVE_DARE_OUTCOME', {
                recipients: rec,
                summaryText: summary,
              });
            }}
          >
            Confirm ({remoteCountPickerValue * darePlan.drinkCount} 🍺)
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className={styles.mobileContainer}>
      {/* Top Sticky Bar */}
      <header className={styles.topBar}>
        <div className={styles.brandTitle}>
          <span>DNM Karaoke</span> Remote
        </div>
        {myClaimedName && (
          <div className={styles.singerBadge}>
            <span className={styles.singerName}>{myClaimedName}</span>
            {isAdmin && (
              <span className={styles.adminCrownBadge}>
                <Crown size={11} /> Admin
              </span>
            )}
            <button
              type="button"
              className={styles.switchBtn}
              onClick={handleRelease}
              title="Switch Singer Name"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </header>

      {/* State A: QR Feature Disabled Notice */}
      {remoteState && remoteState.qrQueueEnabled === false && (
        <div className={styles.disabledBanner}>
          <h3>QR Song Queue Disabled</h3>
          <p>The host has disabled mobile queueing for the current game mode. Please check the main TV screen.</p>
        </div>
      )}

      {/* State B: Step 1 - Choose Your Name */}
      {remoteState && remoteState.qrQueueEnabled !== false && !myClaimedName && (
        <div className={styles.contentArea}>
          <div className={styles.selectNameSection}>
            <div className={styles.sectionHeader}>
              <h2>Choose Your Singer Name</h2>
              <p>Select your name below to start searching and queueing songs for your turn.</p>
            </div>

            {claimError && (
              <div style={{ color: '#ef4444', fontSize: '0.85rem', textAlign: 'center' }}>
                {claimError}
              </div>
            )}

            <div className={styles.playerGrid}>
              {(!remoteState.players || remoteState.players.length === 0) ? (
                <div className={styles.emptyState}>
                  <span>No singers added yet</span>
                  <small>Ask the host to add singer names on the main screen.</small>
                </div>
              ) : (
                remoteState.players.map((player, index) => {
                  const claimedBy = remoteState.claimedPlayers?.[player];
                  const isTaken = Boolean(claimedBy && claimedBy !== deviceId);
                  const isFirstPlayer = index === 0;

                  return (
                    <button
                      key={player}
                      type="button"
                      className={`${styles.playerCard} ${isTaken ? styles.takenCard : ''}`}
                      disabled={isTaken}
                      onClick={() => handleClaim(player)}
                    >
                      <div className={styles.cardMeta}>
                        <User size={18} style={{ color: isTaken ? '#64748b' : '#c084fc' }} />
                        <span className={styles.playerName}>{player}</span>
                        {isFirstPlayer && (
                          <span className={styles.adminCrownBadge}>
                            <Crown size={12} /> Admin
                          </span>
                        )}
                      </div>
                      <div>
                        {isTaken ? (
                          <span className={`${styles.cardBadge} ${styles.takenBadge}`}>
                            <Lock size={12} /> Taken
                          </span>
                        ) : (
                          <span className={`${styles.cardBadge} ${styles.availBadge}`}>
                            Available
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* State C: Step 2 - Active Singer Dashboard */}
      {remoteState && remoteState.qrQueueEnabled !== false && myClaimedName && (
        <>
          {/* Drink Alert Banner (Visible when player is chosen to take drinks) */}
          {myDrinksAssigned > 0 && (
            <div className={styles.drinkAlertBanner}>
              <div className={styles.drinkAlertIcon}>🍺</div>
              <div className={styles.drinkAlertBody}>
                <strong>DRINK ALERT! YOU WERE CHOSEN!</strong>
                <span>
                  Take <b>{myDrinksAssigned} drink{myDrinksAssigned > 1 ? 's' : ''}</b> right now!
                </span>
                {remoteState.dareModalState?.currentDare && (
                  <small>{remoteState.dareModalState.currentDare}</small>
                )}
              </div>
            </div>
          )}

          {/* Singer Turn & Control Bar */}
          <div className={styles.singerControlCard}>
            <div className={styles.singerStatusRow}>
              {isSingingNow ? (
                <div className={`${styles.turnIndicator} ${styles.singingNow}`}>
                  <Flame size={18} />
                  <div>
                    <strong>You're Singing Now!</strong>
                    <span>Grab the mic and show your skills!</span>
                  </div>
                </div>
              ) : isUpNext ? (
                <div className={`${styles.turnIndicator} ${styles.upNext}`}>
                  <Mic size={18} />
                  <div>
                    <strong>You're Up Next!</strong>
                    <span>
                      {isDareOrDrinkMode ? 'Get ready for your turn!' : 'Your #1 queued song will play next.'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className={`${styles.turnIndicator} ${styles.waiting}`}>
                  <Music size={18} />
                  <div>
                    <strong>Waiting for Turn</strong>
                    <span>
                      {remoteState.currentSinger
                        ? `${remoteState.currentSinger} is singing now`
                        : 'No singer currently singing'}
                    </span>
                  </div>
                </div>
              )}

              {!isDareOrDrinkMode ? (
                <button
                  type="button"
                  className={`${styles.remoteSkipBtn} ${isSingingNow ? styles.skipActive : ''}`}
                  disabled={!isSingingNow || isSkipping}
                  onClick={handleSkipTurn}
                  title={
                    isSingingNow
                      ? 'Skip current song & pass mic'
                      : "Skip is disabled when it's not your turn"
                  }
                >
                  <SkipForward size={16} />
                  <span>{isSkipping ? 'Skipping...' : 'Skip'}</span>
                </button>
              ) : (
                <div className={styles.randomModeBadge} title="Songs are chosen randomly in this mode">
                  🎲 Random Mode
                </div>
              )}
            </div>
            {skipFeedback && (
              <div className={styles.skipFeedbackNotice}>
                {skipFeedback}
              </div>
            )}
          </div>

          {/* Quick Host Transport Bar (Admin Only) */}
          {isAdmin && (
            <div
              className={`${styles.adminQuickBar} ${
                remoteState.gameMode !== 'NORMAL' ? styles.hasChallenge : ''
              }`}
            >
              <button
                type="button"
                className={`${styles.quickActionBtn} ${remoteState.isPlaying ? styles.pauseBtn : styles.playBtn}`}
                onClick={() => handleSendAdminCmd('TOGGLE_PLAY')}
                title="Toggle playback on TV"
              >
                {remoteState.isPlaying ? <Pause size={14} /> : <Play size={14} />}
                <span>{remoteState.isPlaying ? 'Pause TV' : 'Play TV'}</span>
              </button>

              <button
                type="button"
                className={`${styles.quickActionBtn} ${styles.passMicBtn}`}
                onClick={() => handleSendAdminCmd('PASS_MIC')}
                title="Pass mic to next singer on TV"
              >
                <SkipForward size={14} />
                <span>Pass Mic</span>
              </button>

              {remoteState.gameMode !== 'NORMAL' && (
                <button
                  type="button"
                  className={`${styles.quickActionBtn} ${styles.challengeBtn} ${
                    remoteState.dareModalState?.isOpen ? styles.challengeActive : ''
                  }`}
                  onClick={() =>
                    handleSendAdminCmd(
                      remoteState.dareModalState?.isOpen ? 'CLOSE_CHALLENGE' : 'OPEN_CHALLENGE'
                    )
                  }
                  title={
                    remoteState.dareModalState?.isOpen
                      ? 'Close Challenge Modal on TV'
                      : 'Trigger Challenge Modal on TV'
                  }
                >
                  <Target size={14} />
                  <span>{remoteState.dareModalState?.isOpen ? 'Close Dare' : 'Challenge'}</span>
                </button>
              )}

              <button
                type="button"
                className={`${styles.quickActionBtn} ${remoteState.isAutoPassMicEnabled ? styles.autoOnBtn : styles.autoOffBtn}`}
                onClick={() =>
                  handleSendAdminCmd('TOGGLE_AUTO_PASS', {
                    enabled: !remoteState.isAutoPassMicEnabled,
                  })
                }
                title="Toggle Auto Pass Mic"
              >
                <RefreshCw size={13} className={remoteState.isAutoPassMicEnabled ? styles.spinIcon : ''} />
                <span>Auto: {remoteState.isAutoPassMicEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          )}
          {adminActionStatus && (
            <div style={{ color: '#f87171', fontSize: '0.78rem', textAlign: 'center', marginTop: '4px' }}>
              {adminActionStatus}
            </div>
          )}

          {/* Global Challenge Controller Card (Visible everywhere on phone for Admin when TV modal is open) */}
          {isAdmin && remoteState.dareModalState?.isOpen && (
            <div className={styles.globalChallengeBanner}>
              <div className={styles.bannerHeader}>
                <div className={styles.bannerTitleGroup}>
                  <Target size={16} className={styles.targetIconPulse} />
                  <div>
                    <strong>TV Challenge: {remoteState.currentSinger || 'Active Singer'}</strong>
                    <span>
                      {isSelectingPlayers
                        ? 'Select players to drink below'
                        : remoteState.dareModalState.isSpinning
                        ? 'Drink wheel spinning on TV...'
                        : !remoteState.dareModalState.currentDare
                        ? (isJustDrink ? 'Select score result to spin the wheel on TV' : 'Select score result to reveal dare on TV')
                        : 'Challenge active on TV screen'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.bannerCloseBtn}
                  onClick={() => handleSendAdminCmd('CLOSE_CHALLENGE')}
                  title="Close Challenge Modal on TV"
                >
                  <X size={15} />
                </button>
              </div>

              {isSelectingPlayers ? (
                <div>
                  {renderDrinkTargetPicker()}
                  <button
                    type="button"
                    className={styles.cancelModalBtn}
                    style={{ marginTop: '8px', width: '100%' }}
                    onClick={() => handleSendAdminCmd('CLOSE_CHALLENGE')}
                  >
                    Cancel / Close TV Modal
                  </button>
                </div>
              ) : remoteState.dareModalState.isSpinning ? (
                <div className={styles.spinningNotice}>
                  <RefreshCw size={16} className={styles.spinIcon} />
                  <span>Spinning the drink wheel on TV... hang tight!</span>
                </div>
              ) : !remoteState.dareModalState.currentDare ? (
                <div className={styles.bannerScoreGrid}>
                  <button
                    type="button"
                    className={`${styles.remoteScoreBtn} ${styles.scoreBtn_PERFECT}`}
                    onClick={() =>
                      handleSendAdminCmd('SELECT_DARE_SCORE', { score: 'PERFECT' })
                    }
                  >
                    Perfect (+3)
                  </button>
                  <button
                    type="button"
                    className={`${styles.remoteScoreBtn} ${styles.scoreBtn_TWO_WORDS}`}
                    onClick={() =>
                      handleSendAdminCmd('SELECT_DARE_SCORE', { score: 'TWO_WORDS' })
                    }
                  >
                    2 Words (+2)
                  </button>
                  <button
                    type="button"
                    className={`${styles.remoteScoreBtn} ${styles.scoreBtn_ONE_WORD}`}
                    onClick={() =>
                      handleSendAdminCmd('SELECT_DARE_SCORE', { score: 'ONE_WORD' })
                    }
                  >
                    1 Word (+1)
                  </button>
                  <button
                    type="button"
                    className={`${styles.remoteScoreBtn} ${styles.scoreBtn_ZERO}`}
                    onClick={() =>
                      handleSendAdminCmd('SELECT_DARE_SCORE', { score: 'ZERO' })
                    }
                  >
                    No Correct (0)
                  </button>
                  <button
                    type="button"
                    className={`${styles.remoteScoreBtn} ${styles.scoreBtn_EXTRA}`}
                    onClick={() =>
                      handleSendAdminCmd('SELECT_DARE_SCORE', { score: 'EXTRA' })
                    }
                  >
                    Extra Challenge (+1 ★)
                  </button>
                </div>
              ) : isDareUnresolved ? (
                <div className={styles.bannerDarePreview}>
                  <p className={styles.previewText}>{remoteState.dareModalState.currentDare}</p>
                  {renderInteractiveDareResolution()}
                  <div className={styles.dareActionRow} style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      className={styles.undoScoreBtn}
                      onClick={() => handleSendAdminCmd('UNDO_DARE_SCORE')}
                    >
                      <RotateCcw size={14} />
                      <span>Undo Score</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.bannerDarePreview}>
                  <p className={styles.previewText}>{remoteState.dareModalState.currentDare}</p>
                  <div className={styles.dareActionRow}>
                    <button
                      type="button"
                      className={styles.undoScoreBtn}
                      onClick={() => handleSendAdminCmd('UNDO_DARE_SCORE')}
                    >
                      <RotateCcw size={14} />
                      <span>Undo</span>
                    </button>
                    <button
                      type="button"
                      className={styles.doneDareBtn}
                      onClick={() => handleSendAdminCmd('FINISH_DARE')}
                    >
                      Start / Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Active singer non-admin dare card & drink target selection */}
          {!isAdmin && remoteState.dareModalState?.isOpen && (
            canPickDrinkTargets ? (
              <div style={{ margin: '10px 16px 0' }}>
                {renderDrinkTargetPicker()}
              </div>
            ) : isSelectingPlayers ? (
              <div className={styles.singerDareCard} style={{ borderColor: 'rgba(251, 191, 36, 0.4)', background: 'rgba(245, 158, 11, 0.08)' }}>
                <div className={styles.dareHeader}>
                  <RefreshCw size={16} className={styles.spinIcon} style={{ color: '#fbbf24' }} />
                  <strong style={{ color: '#fbbf24' }}>Choosing Who Drinks</strong>
                </div>
                <p style={{ color: '#fef08a' }}>
                  {remoteState.currentSinger} is selecting {manualSelectionCount} player{manualSelectionCount > 1 ? 's' : ''} to take a drink...
                </p>
              </div>
            ) : remoteState.dareModalState.currentDare && isSingingNow ? (
              <div className={styles.singerDareCard}>
                <div className={styles.dareHeader}>
                  <Flame size={16} style={{ color: '#ec4899' }} />
                  <strong>Your Challenge:</strong>
                </div>
                <p>{remoteState.dareModalState.currentDare}</p>
                {isDareUnresolved && renderInteractiveDareResolution()}
              </div>
            ) : null
          )}

          {/* Tab Navigation */}
          <nav className={styles.tabNav}>
            {!isDareOrDrinkMode ? (
              <>
                <button
                  type="button"
                  className={`${styles.navBtn} ${activeTab === 'search' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('search')}
                >
                  <Search size={16} />
                  Search Songs
                </button>
                <button
                  type="button"
                  className={`${styles.navBtn} ${activeTab === 'queue' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('queue')}
                >
                  <ListMusic size={16} />
                  My Queue ({myQueue.length})
                </button>
              </>
            ) : (
              <button
                type="button"
                className={`${styles.navBtn} ${activeTab === 'party' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('party')}
              >
                <Trophy size={16} />
                Party Dashboard
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                className={`${styles.navBtn} ${activeTab === 'admin' ? styles.activeTab : ''} ${styles.adminTabBtn}`}
                onClick={() => setActiveTab('admin')}
              >
                <Crown size={15} />
                Host Controls
                {remoteState.dareModalState?.isOpen && <span className={styles.activeDot} />}
              </button>
            )}
          </nav>

          <main className={styles.contentArea}>
            {/* Tab 1: Search Songs */}
            {activeTab === 'search' && (
              <>
                <div className={styles.searchWrapper}>
                  <Search size={16} className={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder="Search song or artist..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className={styles.clearBtn}
                      onClick={() => setSearchQuery('')}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Dare Mode Notice Banner */}
                {isDareMode && (
                  <div className={styles.dareModeNoticeBanner}>
                    <div className={styles.noticeIcon}>🎲</div>
                    <div className={styles.noticeText}>
                      <strong>Dare Mode: Random Song Selection</strong>
                      <span>Songs are picked at random by the game. Browsing is view-only and manual queueing is disabled.</span>
                    </div>
                  </div>
                )}

                <div className={styles.songList}>
                  {isSearching ? (
                    <div className={styles.emptyState}>
                      <span>Searching songbook...</span>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className={styles.emptyState}>
                      <span>No songs found</span>
                      <small>Try searching for a different song title or artist name.</small>
                    </div>
                  ) : (
                    searchResults.map((song) => {
                      const isAdded = addedSongId === song.id;
                      return (
                        <div
                          key={song.id}
                          className={`${styles.songCard} ${isDareMode ? styles.disabledCard : ''}`}
                        >
                          <img
                            src={song.albumArt || '/Images/cover-default.svg'}
                            alt={song.title}
                            className={styles.albumArt}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/Images/cover-default.svg';
                            }}
                          />
                          <div className={styles.songMeta}>
                            <span className={styles.songTitle}>{song.title}</span>
                            <span className={styles.songArtist}>{song.artist}</span>
                          </div>
                          <button
                            type="button"
                            className={`${styles.addBtn} ${
                              isDareMode ? styles.disabledAddBtn : isAdded ? styles.addedBtn : ''
                            }`}
                            disabled={isDareMode}
                            onClick={() => !isDareMode && handleAddSong(song)}
                            title={
                              isDareMode
                                ? 'Song selection is randomized in Dare Mode'
                                : 'Add to my song queue'
                            }
                          >
                            {isDareMode ? (
                              <>
                                <Lock size={13} /> Locked
                              </>
                            ) : isAdded ? (
                              <>
                                <Check size={16} /> Added
                              </>
                            ) : (
                              <>
                                <Plus size={16} /> Queue
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {/* Tab 2: My Queue */}
            {activeTab === 'queue' && (
              <div className={styles.queueContainer}>
                {isDareMode && (
                  <div
                    style={{
                      background: 'rgba(236, 72, 153, 0.12)',
                      border: '1px solid rgba(236, 72, 153, 0.35)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '0.78rem',
                      color: '#f472b6',
                      marginBottom: '12px',
                      lineHeight: '1.4',
                    }}
                  >
                    🎲 <strong>Dare Mode Active:</strong> Songs are randomly assigned by the game for each turn.
                  </div>
                )}

                <div className={styles.queueHeader}>
                  <div className={styles.queueTitleGroup}>
                    <h3>My Song Queue</h3>
                    <span className={styles.queueCountBadge}>
                      {myQueue.length} {myQueue.length === 1 ? 'song' : 'songs'}
                    </span>
                  </div>
                  {myQueue.length > 0 && (
                    <button
                      type="button"
                      className={styles.clearQueueBtn}
                      onClick={handleClearQueue}
                      title="Clear all songs in your queue"
                    >
                      <Trash2 size={13} />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>

                {myQueue.length === 0 ? (
                  <div className={styles.emptyState}>
                    <span>Your queue is empty</span>
                    <small>Tap "Search Songs" to add songs for your upcoming turns.</small>
                  </div>
                ) : (
                  myQueue.map((song, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === myQueue.length - 1;

                    return (
                      <div
                        key={`${song.id}-${idx}`}
                        className={`${styles.queueCard} ${isFirst ? styles.firstInQueue : ''}`}
                      >
                        <div className={styles.queueLeft}>
                          <span className={styles.queueOrderIndex}>{idx + 1}</span>
                          <div className={styles.queueMeta}>
                            <span className={styles.queueTitle}>{song.title}</span>
                            <span className={styles.queueArtist}>{song.artist}</span>
                            {isFirst && (
                              <span className={styles.nextPlayBadge}>Playing on your next turn</span>
                            )}
                          </div>
                        </div>

                        <div className={styles.queueControls}>
                          <button
                            type="button"
                            className={styles.controlBtn}
                            disabled={isFirst}
                            onClick={() => handleReorderSong(idx, idx - 1)}
                            title="Move Up"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            className={styles.controlBtn}
                            disabled={isLast}
                            onClick={() => handleReorderSong(idx, idx + 1)}
                            title="Move Down"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            className={`${styles.controlBtn} ${styles.removeBtn}`}
                            onClick={() => handleRemoveSong(idx)}
                            title="Remove Song"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab: Party Dashboard (For Dare / Drink Modes) */}
            {activeTab === 'party' && (
              <div className={styles.partyDashboard}>
                {/* 1. Live Challenge / Wheel Status Card */}
                <div className={styles.partyCard}>
                  <div className={styles.partyCardHeader}>
                    <h3>
                      <Target size={17} style={{ color: '#06b6d4' }} />
                      <span>Live Game Status</span>
                    </h3>
                    <span className={styles.cardTag}>
                      {remoteState.gameMode === 'JUST_DRINK'
                        ? 'Just Drink'
                        : remoteState.gameMode === 'DARE_DRINK'
                        ? 'Dare x Drink'
                        : 'Dare Mode'}
                    </span>
                  </div>

                  <div className={styles.liveFeedBox}>
                    <div className={styles.liveFeedTitle}>Current TV State</div>
                    {isSelectingPlayers ? (
                      <p className={styles.liveFeedContent}>
                        🎯 {canPickDrinkTargets ? 'Choose players to drink using the picker above!' : `${remoteState.currentSinger} is choosing ${manualSelectionCount} player(s) to drink on their phone...`}
                      </p>
                    ) : remoteState.dareModalState?.isSpinning ? (
                      <p className={styles.liveFeedContent}>
                        🎡 Drink Wheel is spinning on TV for {remoteState.currentSinger}...
                      </p>
                    ) : remoteState.dareModalState?.currentDare ? (
                      <div>
                        <p className={styles.liveFeedContent}>{remoteState.dareModalState.currentDare}</p>
                        <p className={styles.liveFeedHint}>Waiting for Host to start next round on TV</p>
                      </div>
                    ) : remoteState.dareModalState?.isOpen ? (
                      <p className={styles.liveFeedContent}>
                        ⚖️ Host is scoring {remoteState.currentSinger}'s performance on TV...
                      </p>
                    ) : (
                      <p className={styles.liveFeedContent}>
                        🎤 {remoteState.currentSinger ? `${remoteState.currentSinger} is singing "${remoteState.currentSongTitle || 'Song'}"` : 'Singing in progress'}
                      </p>
                    )}
                  </div>
                </div>

                {/* 2. Turn Rotation & Order */}
                <div className={styles.partyCard}>
                  <div className={styles.partyCardHeader}>
                    <h3>
                      <Flame size={17} style={{ color: '#f59e0b' }} />
                      <span>Turn Order</span>
                    </h3>
                    <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                      {remoteState.players.length} Singers
                    </span>
                  </div>

                  <div className={styles.turnOrderRow}>
                    {remoteState.players.map((p, pIdx) => {
                      const isCurrent = p === remoteState.currentSinger;
                      const isNext = p === remoteState.nextPlayer;
                      const isMe = p === myClaimedName;

                      let pillClass = '';
                      if (isCurrent) pillClass = styles.currentPill;
                      else if (isNext) pillClass = styles.nextPill;
                      if (isMe) pillClass += ` ${styles.myPill}`;

                      return (
                        <div key={p} className={`${styles.turnOrderPill} ${pillClass}`}>
                          <span className={styles.pillIndex}>#{pIdx + 1}</span>
                          <span>{p}</span>
                          {pIdx === 0 && <span className={styles.pillBadge}>👑</span>}
                          {isCurrent && <span className={styles.pillBadge}>🎤 Singing</span>}
                          {isNext && <span className={styles.pillBadge}>⏭️ Next</span>}
                          {isMe && !isCurrent && !isNext && <span className={styles.pillBadge}>You</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Read-Only Live Scoreboard & Drinks Tally */}
                <div className={styles.partyCard}>
                  <div className={styles.partyCardHeader}>
                    <h3>
                      <Trophy size={17} style={{ color: '#facc15' }} />
                      <span>Scoreboard & Drinks</span>
                    </h3>
                    <span style={{ fontSize: '0.74rem', color: '#64748b' }}>Live</span>
                  </div>

                  <div className={styles.remoteScoreboardList}>
                    {playerRankings.length === 0 ? (
                      <div className={styles.emptyState}>No players added.</div>
                    ) : (
                      playerRankings.map(({ player, normal, extra, scores, drinks }, idx) => {
                        const rank = idx + 1;
                        const isCurrent = player === remoteState.currentSinger;
                        const isMe = player === myClaimedName;

                        let rankClass = '';
                        if (rank === 1) rankClass = styles.gold;
                        else if (rank === 2) rankClass = styles.silver;
                        else if (rank === 3) rankClass = styles.bronze;

                        return (
                          <div
                            key={player}
                            className={`${styles.remoteScorePlayerRow} ${isMe ? styles.editingRow : ''}`}
                            style={{ cursor: 'default' }}
                          >
                            <div className={styles.playerRowTop}>
                              <div className={styles.rowLeft}>
                                <span className={`${styles.rankPill} ${rankClass}`}>#{rank}</span>
                                <span className={styles.pName}>
                                  {player} {isMe && <span style={{ color: '#c084fc', fontSize: '0.75rem' }}>(You)</span>}
                                </span>
                                {(remoteState.immunePlayers || []).includes(player) && (
                                  <span className={styles.immuneBadge}>🛡️ IMMUNE</span>
                                )}
                                {isCurrent && (
                                  <span style={{ fontSize: '0.65rem', color: '#34d399', fontWeight: 700 }}>
                                    ● Singing
                                  </span>
                                )}
                              </div>
                              <div className={styles.pointsBlock}>
                                <span>{normal} pts</span>
                                {remoteState.gameMode !== 'NORMAL' && (
                                  <span className={styles.extraNum}>| {extra} ★</span>
                                )}
                                {showDrinks && (
                                  <span className={styles.drinkNum}>🍺 {drinks}</span>
                                )}
                              </div>
                            </div>

                            {scores.length > 0 && (
                              <div className={styles.scoreDotsRow}>
                                {scores.map((s, sIdx) => (
                                  <span
                                    key={sIdx}
                                    className={`${styles.scoreDotSmall} ${styles[`dot_${s}`]}`}
                                    title={s}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 4. Active Rules Feed (DARE_DRINK Mode) */}
                {remoteState.gameMode === 'DARE_DRINK' && (remoteState.activeRules || []).length > 0 && (
                  <div className={styles.partyCard}>
                    <div className={styles.partyCardHeader}>
                      <h3>
                        <ScrollText size={17} style={{ color: '#ec4899' }} />
                        <span>Active Party Rules</span>
                      </h3>
                      <span className={styles.cardTag}>{(remoteState.activeRules || []).length} Active</span>
                    </div>
                    <div className={styles.activeRulesFeed}>
                      {(remoteState.activeRules || []).map((rule) => (
                        <div key={rule.id} className={styles.ruleFeedItem}>
                          <div className={styles.ruleFeedText}>
                            <strong>📜 {rule.text}</strong>
                            <span className={styles.ruleFeedPenalty}>+{rule.penaltyDrinks} 🍺</span>
                          </div>
                          <span className={styles.ruleFeedAuthor}>Added by {rule.createdBy}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Admin & Dare x Drink Controller */}
            {activeTab === 'admin' && isAdmin && (
              <div className={styles.adminTabContent}>
                {/* Section A: Challenge & Dare Controller (for DARE / DARE_DRINK modes) */}
                {remoteState.gameMode !== 'NORMAL' && (
                  <div className={styles.adminPanelCard}>
                    <div className={styles.cardHeaderRow}>
                      <h3>
                        <Target size={18} style={{ color: '#06b6d4' }} />
                        <span>Challenge & Dare Control</span>
                      </h3>
                      <span style={{ fontSize: '0.75rem', color: '#c084fc', fontWeight: 700 }}>
                        {remoteState.currentSinger ? `${remoteState.currentSinger}'s Turn` : 'No Singer'}
                      </span>
                    </div>

                    {!remoteState.dareModalState?.isOpen ? (
                      <div>
                        <button
                          type="button"
                          className={styles.triggerChallengeBtn}
                          onClick={() => handleSendAdminCmd('OPEN_CHALLENGE')}
                        >
                          <Target size={18} />
                          <span>Trigger Challenge on TV</span>
                        </button>
                      </div>
                    ) : isSelectingPlayers ? (
                      <div>
                        {renderDrinkTargetPicker()}
                        <button
                          type="button"
                          className={styles.cancelModalBtn}
                          style={{ marginTop: '10px', width: '100%' }}
                          onClick={() => handleSendAdminCmd('CLOSE_CHALLENGE')}
                        >
                          Cancel / Close TV Modal
                        </button>
                      </div>
                    ) : remoteState.dareModalState?.isSpinning ? (
                      <div className={styles.spinningNotice}>
                        <RefreshCw size={16} className={styles.spinIcon} />
                        <span>Spinning the drink wheel on TV... hang tight!</span>
                      </div>
                    ) : !remoteState.dareModalState?.currentDare ? (
                      <div className={styles.dareModalActiveNotice}>
                        <div className={styles.noticeTitle}>
                          TV is waiting for Dare Score: {remoteState.currentSinger}
                        </div>
                        <div className={styles.remoteScoreGrid}>
                          <button
                            type="button"
                            className={`${styles.remoteScoreBtn} ${styles.scoreBtn_PERFECT}`}
                            onClick={() =>
                              handleSendAdminCmd('SELECT_DARE_SCORE', { score: 'PERFECT' })
                            }
                          >
                            Perfect (+3)
                          </button>
                          <button
                            type="button"
                            className={`${styles.remoteScoreBtn} ${styles.scoreBtn_TWO_WORDS}`}
                            onClick={() =>
                              handleSendAdminCmd('SELECT_DARE_SCORE', { score: 'TWO_WORDS' })
                            }
                          >
                            2 Words (+2)
                          </button>
                          <button
                            type="button"
                            className={`${styles.remoteScoreBtn} ${styles.scoreBtn_ONE_WORD}`}
                            onClick={() =>
                              handleSendAdminCmd('SELECT_DARE_SCORE', { score: 'ONE_WORD' })
                            }
                          >
                            1 Word (+1)
                          </button>
                          <button
                            type="button"
                            className={`${styles.remoteScoreBtn} ${styles.scoreBtn_ZERO}`}
                            onClick={() =>
                              handleSendAdminCmd('SELECT_DARE_SCORE', { score: 'ZERO' })
                            }
                          >
                            No Correct (0)
                          </button>
                          <button
                            type="button"
                            className={`${styles.remoteScoreBtn} ${styles.scoreBtn_EXTRA}`}
                            onClick={() =>
                              handleSendAdminCmd('SELECT_DARE_SCORE', { score: 'EXTRA' })
                            }
                          >
                            Extra Challenge (+1 ★)
                          </button>
                        </div>
                        <button
                          type="button"
                          className={styles.cancelModalBtn}
                          onClick={() => handleSendAdminCmd('CLOSE_CHALLENGE')}
                        >
                          Cancel / Close TV Modal
                        </button>
                      </div>
                    ) : isDareUnresolved ? (
                      <div className={styles.activeDarePreview}>
                        <div className={styles.previewTitle}>The Dare Active on TV:</div>
                        <p className={styles.previewText}>{remoteState.dareModalState.currentDare}</p>
                        {renderInteractiveDareResolution()}
                        <div className={styles.dareActionRow} style={{ marginTop: '8px' }}>
                          <button
                            type="button"
                            className={styles.undoScoreBtn}
                            onClick={() => handleSendAdminCmd('UNDO_DARE_SCORE')}
                          >
                            <RotateCcw size={14} />
                            <span>Undo Score</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.activeDarePreview}>
                        <div className={styles.previewTitle}>The Dare Active on TV:</div>
                        <p className={styles.previewText}>{remoteState.dareModalState.currentDare}</p>
                        <div className={styles.dareActionRow}>
                          <button
                            type="button"
                            className={styles.undoScoreBtn}
                            onClick={() => handleSendAdminCmd('UNDO_DARE_SCORE')}
                          >
                            <RotateCcw size={14} />
                            <span>Undo</span>
                          </button>
                          <button
                            type="button"
                            className={styles.doneDareBtn}
                            onClick={() => handleSendAdminCmd('FINISH_DARE')}
                          >
                            Start / Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Section B: Live Scoreboard & Points Editor */}
                <div className={styles.adminPanelCard}>
                  <div className={styles.cardHeaderRow}>
                    <h3>
                      <Trophy size={18} style={{ color: '#facc15' }} />
                      <span>Live Scoreboard</span>
                    </h3>
                    {isResetConfirmOpen ? (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          className={styles.resetAllBtn}
                          style={{ background: '#ef4444', color: 'white' }}
                          onClick={() => {
                            handleSendAdminCmd('RESET_ALL_SCORES');
                            setIsResetConfirmOpen(false);
                          }}
                        >
                          Confirm Reset
                        </button>
                        <button
                          type="button"
                          className={styles.cancelModalBtn}
                          style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                          onClick={() => setIsResetConfirmOpen(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.resetAllBtn}
                        onClick={() => setIsResetConfirmOpen(true)}
                        title="Reset all scores"
                      >
                        <RotateCcw size={12} />
                        <span>Reset All</span>
                      </button>
                    )}
                  </div>

                  <div className={styles.remoteScoreboardList}>
                    {playerRankings.length === 0 ? (
                      <div className={styles.emptyState} style={{ padding: '16px' }}>
                        No players added.
                      </div>
                    ) : (
                      playerRankings.map(({ player, normal, extra, scores, drinks }, idx) => {
                        const rank = idx + 1;
                        const isEditing = editingScorePlayer === player;
                        const isCurrent = player === remoteState.currentSinger;

                        let rankClass = '';
                        if (rank === 1) rankClass = styles.gold;
                        else if (rank === 2) rankClass = styles.silver;
                        else if (rank === 3) rankClass = styles.bronze;

                        return (
                          <div
                            key={player}
                            className={`${styles.remoteScorePlayerRow} ${isEditing ? styles.editingRow : ''}`}
                            onClick={() => setEditingScorePlayer(isEditing ? null : player)}
                          >
                            <div className={styles.playerRowTop}>
                              <div className={styles.rowLeft}>
                                <span className={`${styles.rankPill} ${rankClass}`}>#{rank}</span>
                                <span className={styles.pName}>{player}</span>
                                {(remoteState.immunePlayers || []).includes(player) && (
                                  <span className={styles.immuneBadge}>🛡️ IMMUNE</span>
                                )}
                                {isCurrent && (
                                  <span style={{ fontSize: '0.65rem', color: '#34d399', fontWeight: 700 }}>
                                    ● Singing
                                  </span>
                                )}
                              </div>
                              <div className={styles.pointsBlock}>
                                <span>{normal} pts</span>
                                {remoteState.gameMode !== 'NORMAL' && (
                                  <span className={styles.extraNum}>| {extra} ★</span>
                                )}
                                {showDrinks && (
                                  <span className={styles.drinkNum}>🍺 {drinks}</span>
                                )}
                              </div>
                            </div>

                            {scores.length > 0 && (
                              <div className={styles.scoreDotsRow}>
                                {scores.map((s, sIdx) => (
                                  <span
                                    key={sIdx}
                                    className={`${styles.scoreDotSmall} ${styles[`dot_${s}`]}`}
                                    title={s}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Point Editing Drawer */}
                            {isEditing && (
                              <div
                                className={styles.scoreEditDrawer}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className={styles.drawerSubtitle}>
                                  Current Scores (Tap badge to remove)
                                </div>
                                <div className={styles.scoreChipList}>
                                  {scores.length === 0 ? (
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                      No scores recorded yet.
                                    </span>
                                  ) : (
                                    scores.map((s, sIdx) => (
                                      <button
                                        key={sIdx}
                                        type="button"
                                        className={`${styles.scoreChip} ${styles[`chip_${s}`]}`}
                                        onClick={() =>
                                          handleSendAdminCmd('REMOVE_PLAYER_SCORE', {
                                            targetPlayer: player,
                                            scoreIndex: sIdx,
                                          })
                                        }
                                        title="Remove this score badge"
                                      >
                                        <span>{s}</span>
                                        <X size={11} />
                                      </button>
                                    ))
                                  )}
                                </div>

                                {showDrinks && (
                                  <>
                                    <div className={styles.drawerSubtitle} style={{ marginTop: '6px' }}>
                                      Drinks Taken by {player}
                                    </div>
                                    <div className={styles.drinkAdjustRow}>
                                      <button
                                        type="button"
                                        className={styles.drinkAdjustBtn}
                                        disabled={drinks <= 0}
                                        onClick={() =>
                                          handleSendAdminCmd('ADJUST_PLAYER_DRINKS', {
                                            targetPlayer: player,
                                            delta: -1,
                                          })
                                        }
                                      >
                                        −
                                      </button>
                                      <span className={styles.drinkAdjustValue}>🍺 {drinks}</span>
                                      <button
                                        type="button"
                                        className={styles.drinkAdjustBtn}
                                        onClick={() =>
                                          handleSendAdminCmd('ADJUST_PLAYER_DRINKS', {
                                            targetPlayer: player,
                                            delta: 1,
                                          })
                                        }
                                      >
                                        +
                                      </button>
                                    </div>
                                  </>
                                )}

                                <div className={styles.drawerSubtitle} style={{ marginTop: '6px' }}>
                                  Add Score to {player}
                                </div>
                                <div className={styles.addScorePillGrid}>
                                  <button
                                    type="button"
                                    className={styles.addScorePill}
                                    style={{ color: '#49ff00' }}
                                    onClick={() =>
                                      handleSendAdminCmd('ADD_PLAYER_SCORE', {
                                        targetPlayer: player,
                                        score: 'PERFECT',
                                      })
                                    }
                                  >
                                    + Perfect (3)
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.addScorePill}
                                    style={{ color: '#fbff00' }}
                                    onClick={() =>
                                      handleSendAdminCmd('ADD_PLAYER_SCORE', {
                                        targetPlayer: player,
                                        score: 'TWO_WORDS',
                                      })
                                    }
                                  >
                                    + 2 Words (2)
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.addScorePill}
                                    style={{ color: '#ff9100' }}
                                    onClick={() =>
                                      handleSendAdminCmd('ADD_PLAYER_SCORE', {
                                        targetPlayer: player,
                                        score: 'ONE_WORD',
                                      })
                                    }
                                  >
                                    + 1 Word (1)
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.addScorePill}
                                    style={{ color: '#ff4d4d' }}
                                    onClick={() =>
                                      handleSendAdminCmd('ADD_PLAYER_SCORE', {
                                        targetPlayer: player,
                                        score: 'ZERO',
                                      })
                                    }
                                  >
                                    + Zero (0)
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.addScorePill}
                                    style={{ color: '#c084fc', gridColumn: 'span 2' }}
                                    onClick={() =>
                                      handleSendAdminCmd('ADD_PLAYER_SCORE', {
                                        targetPlayer: player,
                                        score: 'EXTRA',
                                      })
                                    }
                                  >
                                    + Extra Challenge (★)
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Section C: Ongoing Rules Manager (DARE_DRINK Mode) */}
                {remoteState.gameMode === 'DARE_DRINK' && (
                  <div className={styles.adminPanelCard}>
                    <div className={styles.cardHeaderRow}>
                      <h3>
                        <ScrollText size={18} style={{ color: '#ec4899' }} />
                        <span>Ongoing Rules Manager</span>
                      </h3>
                      <span className={styles.cardTag}>
                        {(remoteState.activeRules || []).length} Active
                      </span>
                    </div>

                    {/* Add Rule Quick Form */}
                    <div className={styles.remoteRuleAddBox}>
                      <input
                        type="text"
                        placeholder="Add a new rule (e.g. No touching phones)..."
                        value={newAdminRuleText}
                        onChange={(e) => setNewAdminRuleText(e.target.value)}
                        className={styles.remoteRuleInput}
                      />
                      <div className={styles.remoteRuleControlsRow}>
                        <div className={styles.penaltySelectRow}>
                          {[1, 2, 3].map((val) => (
                            <button
                              key={val}
                              type="button"
                              className={`${styles.remotePenaltyBtn} ${newAdminRulePenalty === val ? styles.penaltyActive : ''}`}
                              onClick={() => setNewAdminRulePenalty(val)}
                            >
                              +{val} 🍺
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className={styles.addRuleBtn}
                          disabled={!newAdminRuleText.trim()}
                          onClick={() => {
                            if (!newAdminRuleText.trim()) return;
                            handleSendAdminCmd('ADD_ACTIVE_RULE', {
                              ruleText: newAdminRuleText.trim(),
                              drinkCount: newAdminRulePenalty,
                            });
                            setNewAdminRuleText('');
                          }}
                        >
                          + Add Rule
                        </button>
                      </div>
                    </div>

                    {/* Active Rules List */}
                    <div className={styles.remoteRulesList}>
                      {(remoteState.activeRules || []).length === 0 ? (
                        <div className={styles.emptyState} style={{ padding: '14px' }}>
                          No active rules right now.
                        </div>
                      ) : (
                        (remoteState.activeRules || []).map((rule) => (
                          <div key={rule.id} className={styles.remoteRuleCard}>
                            <div className={styles.remoteRuleCardTop}>
                              <div>
                                <div className={styles.ruleCardText}>📜 {rule.text}</div>
                                <div className={styles.ruleCardSub}>
                                  By {rule.createdBy} · +{rule.penaltyDrinks} 🍺
                                </div>
                              </div>
                              <button
                                type="button"
                                className={styles.deleteRuleBtn}
                                onClick={() =>
                                  handleSendAdminCmd('REMOVE_ACTIVE_RULE', { ruleId: rule.id })
                                }
                                title="Remove rule"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>

                            <div className={styles.ruleBreakPrompt}>
                              Who broke this rule? Tap to drink (+{rule.penaltyDrinks} 🍺):
                            </div>
                            <div className={styles.punishPlayerGrid}>
                              {remoteState.players.map((p) => {
                                const isImmune = (remoteState.immunePlayers || []).includes(p);
                                return (
                                  <button
                                    key={p}
                                    type="button"
                                    className={`${styles.punishBtn} ${isImmune ? styles.punishImmuneBtn : ''}`}
                                    disabled={isImmune}
                                    onClick={() =>
                                      handleSendAdminCmd('TRIGGER_RULE_BREAK', {
                                        ruleId: rule.id,
                                        targetPlayer: p,
                                      })
                                    }
                                    title={isImmune ? `${p} is immune until next turn!` : `Give ${rule.penaltyDrinks} drinks to ${p}`}
                                  >
                                    {p} {isImmune ? '🛡️' : `(+${rule.penaltyDrinks}🍺)`}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
};

export default MobileRemote;
