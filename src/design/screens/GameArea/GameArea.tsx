import React from 'react';
import { Header } from '../../components/Header/Header';
import { KaraokePlayer } from '../../components/KaraokePlayer/KaraokePlayer';
import { SongList } from '../../components/SongList/SongList';
import { Scoreboard } from '../../components/Scoreboard/Scoreboard';
import { useKaraokeLogic } from '../../../logic/hooks/useKaraokeLogic';
import styles from '../../App.module.scss';
import type { AppState } from '../../../logic/types/logicTypes';

interface GameAreaProps {
  appState: AppState;
  onNextPlayer?: () => void;
  onUpdatePlayers?: (players: string[]) => void;
  onAddScore?: (playerName: string, score: any) => void;
  onUndoScore?: (playerName: string) => void;
  onSetInputMode?: (mode: 'MANUAL' | 'TYPE' | 'MIC') => void;
  onToggleSongStatus?: (songId: string) => void;
  onSetDisabledSongs?: (songIds: string[]) => void;
  onToggleDare?: (dareText: string) => void;
  onSetDisabledDares?: (dares: string[]) => void;
  onAddCustomDare?: (categoryId: string, dareText: string) => void;
  onRemoveCustomDare?: (categoryId: string, dareText: string) => void;
  onResetScores?: () => void;
  onRemoveSpecificScore?: (playerName: string, indexToRemove: number) => void;
  onToggleRepeatableDare?: (dareText: string) => void;
  onSetUsedDares?: (categoryId: string, used: string[]) => void;
  onSetLastDare?: (dareText: string) => void;
}

export const GameArea: React.FC<GameAreaProps> = ({
  appState, onNextPlayer, onUpdatePlayers, onAddScore, onUndoScore, onSetInputMode, onToggleSongStatus, onSetDisabledSongs,
  onToggleDare, onSetDisabledDares, onAddCustomDare, onRemoveCustomDare, onResetScores, onRemoveSpecificScore,
  onToggleRepeatableDare, onSetUsedDares, onSetLastDare
}) => {
  const { state, controls } = useKaraokeLogic(appState);
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
        <Scoreboard
          appState={appState}
          onResetScores={onResetScores}
          onAddScore={onAddScore}
          onRemoveSpecificScore={onRemoveSpecificScore}
        />
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
          onToggleDare={onToggleDare}
          onSetDisabledDares={onSetDisabledDares}
          onAddCustomDare={onAddCustomDare}
          onRemoveCustomDare={onRemoveCustomDare}
          onToggleRepeatableDare={onToggleRepeatableDare}
          onSetUsedDares={onSetUsedDares}
          onSetLastDare={onSetLastDare}
        />
      </main>
    </>
  );
};
