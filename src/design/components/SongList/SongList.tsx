import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { User, SkipForward, Settings2, X, Plus, Undo2 } from 'lucide-react';
import type { KaraokeState, AudioControls, AppState, ScoreType, DareCategoryId } from '../../../logic/types/logicTypes';
import { dares } from '../../../logic/constants/dares';
import styles from './SongList.module.scss';

interface SongListProps {
  state: KaraokeState;
  controls: AudioControls;
  appState?: AppState;
  onNextPlayer?: () => void;
  onUpdatePlayers?: (players: string[]) => void;
  onAddScore?: (playerName: string, score: string) => void;
  onUndoScore?: (playerName: string) => void;
  onSetInputMode?: (mode: 'MANUAL' | 'TYPE' | 'MIC') => void;
  onToggleSongStatus?: (songId: string) => void;
  onSetDisabledSongs?: (songIds: string[]) => void;
  onToggleDare?: (dareText: string) => void;
  onSetDisabledDares?: (dares: string[]) => void;
  onAddCustomDare?: (categoryId: string, dareText: string) => void;
  onRemoveCustomDare?: (categoryId: string, dareText: string) => void;
  onToggleRepeatableDare?: (dareText: string) => void;
  onSetUsedDares?: (categoryId: DareCategoryId, used: string[]) => void;
  onSetLastDare?: (dareText: string) => void;
}

export const SongList: React.FC<SongListProps> = ({ 
  state, controls, appState, onNextPlayer, onUpdatePlayers, onAddScore, onUndoScore, onSetInputMode, onToggleSongStatus, onSetDisabledSongs,
  onToggleDare, onSetDisabledDares, onAddCustomDare, onRemoveCustomDare,
  onToggleRepeatableDare, onSetUsedDares, onSetLastDare
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [currentDare, setCurrentDare] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [songSearchQuery, setSongSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'players' | 'songs' | 'dares'>('players');
  const [selectedDareCategory, setSelectedDareCategory] = useState<DareCategoryId>('threeWords');
  const [newDareText, setNewDareText] = useState('');

  const players = appState?.players || [];
  const nextPlayerIndex = players.length > 0 ? ((appState?.currentPlayerIndex || 0) + 1) % players.length : 0;
  const nextPlayer = players.length > 0 ? players[nextPlayerIndex] : 'Guest Player';

  const currentSinger = players.length > 0 ? players[appState?.currentPlayerIndex || 0] : 'Guest Player';

  const handleNextTurn = () => {
    if (onNextPlayer) onNextPlayer();
    controls.nextSong();
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
    if (onAddScore) {
      onAddScore(currentSinger, score);
    }

    if (appState?.gameMode === 'NORMAL') {
      setIsScoreModalOpen(false);
      return;
    }

    // Pick a random dare based on mapped category
    const categoryId = appState?.scoreOutcomeMapping?.[score] || 
      (score === 'PERFECT' ? 'threeWords' :
       score === 'TWO_WORDS' ? 'twoWords' :
       score === 'ONE_WORD' ? 'oneWord' :
       score === 'ZERO' ? 'zeroWords' : 'challenge');

    const defaults = (dares as any)[categoryId] || [];
    const customs = appState?.customDares?.[categoryId] || [];
    const disabled = appState?.disabledDares || [];
    const enabledPool = [...defaults, ...customs].filter(d => !disabled.includes(d));

    const usedInCategory = appState?.usedDares?.[categoryId] || [];
    const repeatable = appState?.repeatableDares || [];

    const nonRepeatableEnabled = enabledPool.filter(d => !repeatable.includes(d));
    const allNonRepeatableUsed = nonRepeatableEnabled.length > 0 && nonRepeatableEnabled.every(d => usedInCategory.includes(d));

    let activeUsedDares = usedInCategory;
    if (allNonRepeatableUsed) {
      if (onSetUsedDares) onSetUsedDares(categoryId, []);
      activeUsedDares = [];
    }

    let pool = enabledPool.filter(d => {
      if (d === appState?.lastDare) return false;
      return !activeUsedDares.includes(d) || repeatable.includes(d);
    });

    if (pool.length === 0 && enabledPool.length > 0) {
      pool = enabledPool;
    }

    if (pool.length > 0) {
      const randomDare = pool[Math.floor(Math.random() * pool.length)];
      setCurrentDare(randomDare);
      if (onSetUsedDares && !activeUsedDares.includes(randomDare)) {
        onSetUsedDares(categoryId, [...activeUsedDares, randomDare]);
      }
      if (onSetLastDare) {
        onSetLastDare(randomDare);
      }
    } else {
      setIsScoreModalOpen(false);
    }
  };

  const handleCloseDare = () => {
    setCurrentDare(null);
    setIsScoreModalOpen(false);
  };

  const handleUndo = () => {
    if (onUndoScore) {
      onUndoScore(currentSinger);
    }
    setCurrentDare(null);
  };

  const currentIndex = state.currentSong ? state.playlist.findIndex(s => s.id === state.currentSong?.id) : -1;
  const nextSong = state.playlist.length > 0 ? state.playlist[(currentIndex + 1) % state.playlist.length] : null;

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

        {appState?.gameMode === 'DARE_DRINK' && (
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
                <button
                  className={`${styles.modeBtn} ${appState?.inputMode === 'MIC' ? styles.active : ''}`}
                  onClick={() => onSetInputMode && onSetInputMode('MIC')}
                >Mic</button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className={styles.bottomActions}>
        {appState?.gameMode === 'DARE_DRINK' && (
          <button className={styles.scoreBtn} onClick={() => {
            setIsScoreModalOpen(true);
          }}>
            <span>Challenge</span>
          </button>
        )}

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
                <button 
                  className={`${styles.tabBtn} ${activeTab === 'dares' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('dares')}
                >
                  Manage Dares
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
                        const allIds = state.allAvailableSongs.map(s => s.id);
                        onSetDisabledSongs(allIds);
                      }
                    }}
                  >
                    Disable All
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
                  {state.allAvailableSongs
                    .filter(song => 
                      song.title.toLowerCase().includes(songSearchQuery.toLowerCase()) || 
                      song.artist.toLowerCase().includes(songSearchQuery.toLowerCase())
                    )
                    .map(song => {
                    const isDisabled = (song.isHiddenByDefault && !appState?.enabledSongs?.includes(song.id)) || appState?.disabledSongs?.includes(song.id) || false;
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
                </div>
              </div>
            ) : activeTab === 'dares' ? (
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

                <div className={styles.inputGroup} style={{ flexDirection: 'row', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="New dare..."
                    value={newDareText}
                    onChange={(e) => setNewDareText(e.target.value)}
                    className={styles.input}
                    style={{ flex: 1 }}
                  />
                  <button 
                    className={styles.addBtn} 
                    style={{ width: 'auto', padding: '12px 16px' }}
                    disabled={!newDareText.trim()}
                    onClick={() => {
                      if (onAddCustomDare) onAddCustomDare(selectedDareCategory, newDareText.trim());
                      setNewDareText('');
                    }}
                  >
                    <Plus size={20} />
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button 
                    className={styles.secondaryBtn}
                    style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}
                    onClick={() => {
                      if (!onSetDisabledDares) return;
                      const currentCategoryDares = [...((dares as any)[selectedDareCategory] || []), ...(appState?.customDares?.[selectedDareCategory] || [])];
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
                      const currentCategoryDares = [...((dares as any)[selectedDareCategory] || []), ...(appState?.customDares?.[selectedDareCategory] || [])];
                      const newDisabled = Array.from(new Set([...(appState?.disabledDares || []), ...currentCategoryDares]));
                      onSetDisabledDares(newDisabled);
                    }}
                  >
                    Disable All
                  </button>
                </div>

                <div className={styles.songListScrollable} style={{ marginTop: '16px', maxHeight: '300px' }}>
                  {/* Default Dares */}
                  {((dares as any)[selectedDareCategory] || []).map((dareText: string, i: number) => {
                    const isDisabled = appState?.disabledDares?.includes(dareText);
                    return (
                      <div key={`def-${i}`} className={`${styles.songListItem} ${isDisabled ? styles.disabledSong : ''}`}>
                        <div className={styles.songInfo}>
                          <span className={styles.songListTitle} style={{ fontSize: '0.85rem' }}>{dareText}</span>
                          <span className={styles.songListArtist}>Default</span>
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
                  {(appState?.customDares?.[selectedDareCategory] || []).map((dareText: string, i: number) => (
                    <div key={`cus-${i}`} className={styles.songListItem}>
                      <div className={styles.songInfo}>
                        <span className={styles.songListTitle} style={{ fontSize: '0.85rem' }}>{dareText}</span>
                        <span className={styles.songListArtist}>Custom</span>
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
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      )}

      {/* Score Dare Modal */}
      {isScoreModalOpen && createPortal(
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            {currentDare ? (
              <div className={styles.dareResult}>
                <button className={styles.undoBtn} onClick={handleUndo} title="Undo Score">
                  <Undo2 size={20} />
                </button>
                <h3 className={styles.dareResultTitle}>The Dare</h3>
                <p className={styles.dareResultText}>{currentDare}</p>
                <button className={styles.dareDoneBtn} onClick={handleCloseDare}>Start</button>
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

