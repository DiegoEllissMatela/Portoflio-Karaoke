import React from 'react';
import { Header } from '../../components/Header/Header';
import { KaraokePlayer } from '../../components/KaraokePlayer/KaraokePlayer';
import { SongList } from '../../components/SongList/SongList';
import { Scoreboard } from '../../components/Scoreboard/Scoreboard';
import { QueuePanel } from '../../components/QueuePanel/QueuePanel';
import { useKaraokeLogic } from '../../../logic/hooks/useKaraokeLogic';
import styles from '../../App.module.scss';
import type { AppState, DareEntry, DareCategoryId } from '../../../logic/types/logicTypes';

interface GameAreaProps {
  appState: AppState;
  setAppState?: React.Dispatch<React.SetStateAction<AppState>>;
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
  onResetScores?: () => void;
  onRemoveSpecificScore?: (playerName: string, indexToRemove: number) => void;
  onToggleRepeatableDare?: (dareText: string) => void;
  onSetUsedDares?: (categoryId: string, used: string[]) => void;
  onSetLastDare?: (dareText: string) => void;
  onToggleQrQueue?: (enabled: boolean) => void;
  onUpdateRemoteState?: (claimed: any, queues: any) => void;
  onToggleAutoPassMic?: (enabled: boolean) => void;
  onAddDrinks?: (recipients: Record<string, number>) => void;
  onUndoDrinks?: () => void;
  onAdjustDrinks?: (playerName: string, delta: number) => void;
  onGrantImmunity?: (playerName: string) => void;
  onRevokeImmunity?: (playerName: string) => void;
  onAddActiveRule?: (rule: { text: string; createdBy: string; penaltyDrinks: number }) => void;
  onRemoveActiveRule?: (ruleId: string) => void;
}

export const GameArea: React.FC<GameAreaProps> = ({
  appState, setAppState, onNextPlayer, onUpdatePlayers, onAddScore, onUndoScore, onSetInputMode, onToggleSongStatus, onSetDisabledSongs, onResetSongsToDefault,
  onToggleDare, onSetDisabledDares, onAddCustomDare, onRemoveCustomDare, onResetScores, onRemoveSpecificScore,
  onToggleRepeatableDare, onSetUsedDares, onSetLastDare, onToggleQrQueue, onUpdateRemoteState, onToggleAutoPassMic,
  onAddDrinks, onUndoDrinks, onAdjustDrinks,
  onGrantImmunity, onRevokeImmunity, onAddActiveRule, onRemoveActiveRule
}) => {
  const { state, controls } = useKaraokeLogic(appState, setAppState);
  const hasAutoScoredRef = React.useRef(false);

  React.useEffect(() => {
    // Reset guard when scores clear (like on song restart)
    if (state.micScores.length === 0) {
      hasAutoScoredRef.current = false;
    }

    // Auto-score logic for Mic Mode
    if (appState.inputMode === 'MIC' && !hasAutoScoredRef.current) {
      const totalBlanks = state.currentSong?.lyrics.filter(l => l.blankedWords && l.blankedWords.length > 0).length || 0;

      // If we've answered all blanks in the song
      if (totalBlanks > 0 && state.micScores.length === totalBlanks) {
        hasAutoScoredRef.current = true;
        const correctCount = state.micScores.filter(s => s).length;

        let scoreToAssign: any = 'ZERO';
        if (correctCount >= 3) scoreToAssign = 'PERFECT';
        else if (correctCount === 2) scoreToAssign = 'TWO_WORDS';
        else if (correctCount === 1) scoreToAssign = 'ONE_WORD';

        const currentSinger = appState.players[appState.currentPlayerIndex];
        if (onAddScore && currentSinger) {
          onAddScore(currentSinger, scoreToAssign);
        }
      }
    }
  }, [state.micScores, appState.inputMode, state.currentSong, appState.players, appState.currentPlayerIndex, onAddScore]);

  return (
    <>
      <Header gameMode={appState.gameMode} />
      <main 
        className={styles.mainContent} 
        style={{ 
          maxWidth: `${appState.mainContentMaxWidth || 1400}px`,
          maxHeight: appState.mainContentMaxHeight === 0 ? 'none' : `${appState.mainContentMaxHeight || 800}px`
        }}
      >
        {appState.gameMode === 'NORMAL' ? (
          <QueuePanel state={state} controls={controls} appState={appState} />
        ) : (
          <Scoreboard
            appState={appState}
            onResetScores={onResetScores}
            onAddScore={onAddScore}
            onRemoveSpecificScore={onRemoveSpecificScore}
            onAdjustDrinks={onAdjustDrinks}
          />
        )}
        <KaraokePlayer state={state} controls={controls} appState={appState} />
        <SongList
          state={state}
          controls={controls}
          appState={appState}
          onNextPlayer={onNextPlayer}
          onUpdatePlayers={onUpdatePlayers}
          onAddScore={onAddScore}
          onUndoScore={onUndoScore}
          onSetInputMode={onSetInputMode}
          onToggleSongStatus={onToggleSongStatus}
          onSetDisabledSongs={onSetDisabledSongs}
          onResetSongsToDefault={onResetSongsToDefault}
          onToggleDare={onToggleDare}
          onSetDisabledDares={onSetDisabledDares}
          onAddCustomDare={onAddCustomDare}
          onRemoveCustomDare={onRemoveCustomDare}
          onToggleRepeatableDare={onToggleRepeatableDare}
          onSetUsedDares={onSetUsedDares}
          onSetLastDare={onSetLastDare}
          onToggleQrQueue={onToggleQrQueue}
          onUpdateRemoteState={onUpdateRemoteState}
          onToggleAutoPassMic={onToggleAutoPassMic}
          onResetScores={onResetScores}
          onRemoveSpecificScore={onRemoveSpecificScore}
          onAddDrinks={onAddDrinks}
          onUndoDrinks={onUndoDrinks}
          onAdjustDrinks={onAdjustDrinks}
          onGrantImmunity={onGrantImmunity}
          onRevokeImmunity={onRevokeImmunity}
          onAddActiveRule={onAddActiveRule}
          onRemoveActiveRule={onRemoveActiveRule}
        />
      </main>
    </>
  );
};
