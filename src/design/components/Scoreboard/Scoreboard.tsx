import React, { useState } from 'react';
import { Trophy, RotateCcw, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { AppState, ScoreType } from '../../../logic/types/logicTypes';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
import styles from './Scoreboard.module.scss';

interface ScoreboardProps {
  appState: AppState;
  onResetScores?: () => void;
  onAddScore?: (playerName: string, score: ScoreType) => void;
  onRemoveSpecificScore?: (playerName: string, indexToRemove: number) => void;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({ appState, onResetScores, onAddScore, onRemoveSpecificScore }) => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [playerToConfirmEdit, setPlayerToConfirmEdit] = useState<string | null>(null);
  const [selectedPlayerToEdit, setSelectedPlayerToEdit] = useState<string | null>(null);
  const players = appState?.players || [];
  const currentSinger = players.length > 0 ? players[appState.currentPlayerIndex] : '';

  const handleResetClick = () => {
    setIsConfirmOpen(true);
  };

  const confirmReset = () => {
    onResetScores?.();
    setIsConfirmOpen(false);
  };

  if (appState.gameMode !== 'DARE_DRINK' && appState.gameMode !== 'NORMAL') return null;

  return (
    <>
      <aside className={styles.sidebarContainer}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            <Trophy size={20} />
            <span>Scoreboard</span>
          </h3>
          <button className={styles.resetBtn} onClick={handleResetClick} title="Reset Scores">
            <RotateCcw size={16} />
          </button>
        </div>

        <div className={styles.playerListSidebar}>
          {players.length === 0 ? (
            <div className={styles.emptyState}>No players added.</div>
          ) : (
            [...players].map(player => {
              const scores = appState?.playerScores?.[player] || [];
              let normalPoints = 0;
              let extraPoints = 0;
              scores.forEach(s => {
                if (s === 'PERFECT') normalPoints += 3;
                else if (s === 'TWO_WORDS') normalPoints += 2;
                else if (s === 'ONE_WORD') normalPoints += 1;
                else if (s === 'EXTRA') extraPoints += 1;
              });
              return { player, normalPoints, extraPoints, scores };
            })
            .sort((a, b) => b.normalPoints - a.normalPoints || b.extraPoints - a.extraPoints)
            .map(({ player, normalPoints, extraPoints, scores }, idx) => {
              const rank = idx + 1;
              let rankText = `${rank}th`;
              if (rank === 1) rankText = '1st';
              else if (rank === 2) rankText = '2nd';
              else if (rank === 3) rankText = '3rd';
              
              let rankClass = styles.rankOther;
              if (rank === 1) rankClass = styles.rankGold;
              else if (rank === 2) rankClass = styles.rankSilver;
              else if (rank === 3) rankClass = styles.rankBronze;

              return (
                <div 
                  key={player} 
                  className={`${styles.playerTag} ${player === currentSinger ? styles.activeSingerTag : ''} ${styles.editableTag}`}
                  onClick={() => setPlayerToConfirmEdit(player)}
                >
                  <div className={`${styles.rankBadge} ${rankClass}`}>
                    {rankText}
                  </div>
                  <div className={styles.playerHeader}>
                    <span className={styles.playerName}>{player}</span>
                    <div className={styles.scoreNumbers}>
                      <span className={styles.normalPoints}>{normalPoints}</span>
                      {appState.gameMode !== 'NORMAL' && <span className={styles.separator}>|</span>}
                      {appState.gameMode !== 'NORMAL' && <span className={styles.extraPoints}>{extraPoints}</span>}
                    </div>
                  </div>
                  {scores.length > 0 && (
                    <div className={styles.scoreDots}>
                      {scores.map((s, i) => (
                        <div key={i} className={`${styles.scoreDot} ${styles[`scoreDot_${s}`]}`} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      <ConfirmModal
        isOpen={isConfirmOpen}
        title="Reset All Scores?"
        message="Are you sure you want to reset all players' scores? This action cannot be undone."
        confirmText="Reset Scores"
        onConfirm={confirmReset}
        onCancel={() => setIsConfirmOpen(false)}
      />

      <ConfirmModal
        isOpen={!!playerToConfirmEdit}
        title="Edit Scores?"
        message={`Are you sure you want to edit points for ${playerToConfirmEdit}?`}
        confirmText="Yes, edit points"
        onConfirm={() => {
          if (playerToConfirmEdit) {
            setSelectedPlayerToEdit(playerToConfirmEdit);
          }
          setPlayerToConfirmEdit(null);
        }}
        onCancel={() => setPlayerToConfirmEdit(null)}
      />

      {selectedPlayerToEdit && createPortal(
        <div className={styles.modalOverlay} onClick={() => setSelectedPlayerToEdit(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Edit Scores: {selectedPlayerToEdit}</h3>
              <button className={styles.closeBtn} onClick={() => setSelectedPlayerToEdit(null)}>
                <X size={20} />
              </button>
            </div>
            
            <div className={styles.editSection}>
              <h4>Current Scores (Click to Remove)</h4>
              <div className={styles.editScoreList}>
                {(appState?.playerScores?.[selectedPlayerToEdit] || []).length === 0 && (
                  <span className={styles.emptyText}>No scores yet.</span>
                )}
                {(appState?.playerScores?.[selectedPlayerToEdit] || []).map((s, idx) => (
                  <button 
                    key={idx} 
                    className={`${styles.editScoreBadge} ${styles[`scoreDot_${s}`]}`}
                    onClick={() => onRemoveSpecificScore?.(selectedPlayerToEdit, idx)}
                    title="Remove this score"
                  >
                    <div className={styles.scoreBadgeInner} />
                    <X size={14} className={styles.removeIcon} />
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.editSection}>
              <h4>Add New Score</h4>
              <div className={styles.addScoreButtons}>
                <button className={`${styles.addScoreBtn} ${styles.scorePerfect}`} onClick={() => onAddScore?.(selectedPlayerToEdit, 'PERFECT')}>Perfect</button>
                <button className={`${styles.addScoreBtn} ${styles.scoreTwo}`} onClick={() => onAddScore?.(selectedPlayerToEdit, 'TWO_WORDS')}>2 Words</button>
                <button className={`${styles.addScoreBtn} ${styles.scoreOne}`} onClick={() => onAddScore?.(selectedPlayerToEdit, 'ONE_WORD')}>1 Word</button>
                <button className={`${styles.addScoreBtn} ${styles.scoreZero}`} onClick={() => onAddScore?.(selectedPlayerToEdit, 'ZERO')}>No Correct</button>
                {appState.gameMode !== 'NORMAL' && <button className={`${styles.addScoreBtn} ${styles.scoreExtra}`} onClick={() => onAddScore?.(selectedPlayerToEdit, 'EXTRA')}>Extra Challenge</button>}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
