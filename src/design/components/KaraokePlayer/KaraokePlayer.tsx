import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Mic2, RotateCcw } from 'lucide-react';
import type { KaraokeState, AudioControls, AppState } from '../../../logic/types/logicTypes';
import { formatTime } from '../../../logic/utils/lrcParser';
import styles from './KaraokePlayer.module.scss';

interface KaraokePlayerProps {
  state: KaraokeState;
  controls: AudioControls;
  appState?: AppState;
}

export const KaraokePlayer: React.FC<KaraokePlayerProps> = ({ state, controls, appState }) => {
  const { currentSong, isPlaying, currentTime, duration, volume, isMuted, currentLyricIndex } = state;

  if (!currentSong) {
    return (
      <div className={styles.playerContainer}>
        <p className={styles.noLyric}>No song selected.</p>
      </div>
    );
  }

  const activeLyrics = [];
  for (let i = -2; i <= 2; i++) {
    const idx = currentLyricIndex + i;
    if (idx >= 0 && idx < currentSong.lyrics.length) {
      activeLyrics.push({ lyric: currentSong.lyrics[idx], offset: i });
    }
  }

  let showGapCountdown = false;
  let gapCountdownNumber = 0;

  if (appState?.isCountdownEnabled && currentSong.lyrics.length > 0) {
    const firstLyricTime = currentSong.lyrics[0].time;

    // Check Intro Gap (requires >= 4 seconds)
    if (firstLyricTime >= 4) {
      const timeUntilFirstLyric = firstLyricTime - currentTime;
      const adjustedTime = timeUntilFirstLyric + -0.5;
      if (adjustedTime > 0 && adjustedTime <= 3) {
        showGapCountdown = true;
        gapCountdownNumber = Math.ceil(adjustedTime);
      }
    }

    // Check Mid-Song Gaps (requires >= 8 seconds)
    if (!showGapCountdown && currentLyricIndex >= 0 && currentLyricIndex < currentSong.lyrics.length - 1) {
      const currentLyric = currentSong.lyrics[currentLyricIndex];
      const nextLyric = currentSong.lyrics[currentLyricIndex + 1];

      let currentLyricEndTime = currentLyric.time;
      if (currentLyric.wordTimings && currentLyric.wordTimings.length > 0) {
        currentLyricEndTime = currentLyric.wordTimings[currentLyric.wordTimings.length - 1].end_ms / 1000;
      } else {
        currentLyricEndTime = currentLyric.time + Math.min(5, currentLyric.text.length * 0.2);
      }

      const gapDuration = nextLyric.time - currentLyricEndTime;

      if (gapDuration >= 8) {
        const timeUntilNextLyric = nextLyric.time - currentTime;
        const adjustedTime = timeUntilNextLyric + -0.5;
        if (currentTime >= currentLyricEndTime && adjustedTime > 0 && adjustedTime <= 3) {
          showGapCountdown = true;
          gapCountdownNumber = Math.ceil(adjustedTime);
        }
      }
    }
  }

  const currentSinger = appState?.players?.length ? appState.players[appState.currentPlayerIndex] : null;

  const renderLyricText = (lyric: any) => {
    const { text, id: lyricId, blankedWords, wordTimings } = lyric;

    if (!wordTimings || wordTimings.length === 0) {
      return text;
    }

    const isLineCleared = state.countdown?.clearedLineIds.includes(lyricId);

    return wordTimings.map((wt: any, i: number) => {
      const isVisible = (currentTime * 1000 + 350) >= wt.start_ms;
      const strippedWord = wt.word.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isBlanked = blankedWords && blankedWords.includes(strippedWord);

      if (isBlanked && !isLineCleared) {
        return (
          <span key={i} className={styles.blankBox} style={{ marginRight: '0.25em' }}>
            <span style={{ visibility: 'hidden' }}>{wt.word}</span>
          </span>
        );
      }

      return (
        <span
          key={i}
          style={{
            color: isVisible ? 'inherit' : '#666',
            WebkitTextFillColor: isVisible ? 'inherit' : '#666',
            textShadow: isVisible ? 'inherit' : 'none',
            transition: 'all 0.1s',
            marginRight: '0.25em'
          }}
        >
          {wt.word}
        </span>
      );
    });
  };

  return (
    <div className={styles.playerContainer}>
      {/* Gap Countdown Overlay */}
      {showGapCountdown && (
        <div className={styles.introCountdownOverlay}>
          <span className={styles.introCountdownNumber} key={gapCountdownNumber}>
            {gapCountdownNumber}
          </span>
        </div>
      )}

      {/* Countdown Overlay */}
      {state.countdown?.isActive && (
        <div className={`${styles.countdownOverlay} ${state.countdown.isListening ? styles.listeningMode : !state.countdown.isRevealing ? styles.timerMode : styles.revealMode}`}>
          {state.countdown.isListening ? (
            <div className={styles.countdownContainer}>
              <div className={styles.listeningCircle}>
                <span className={styles.countdownNumber}>{state.countdown.timeLeft}</span>
              </div>
              <span className={styles.countdownText}>SING THE WORD!</span>
              {state.countdown.liveTranscript && (
                <div className={styles.liveTranscript}>{state.countdown.liveTranscript}</div>
              )}
            </div>
          ) : !state.countdown.isRevealing ? (
            <div className={styles.countdownContainer}>
              <div className={styles.countdownCircle}>
                <span className={styles.countdownNumber}>{state.countdown.timeLeft}</span>
              </div>
              <span className={styles.countdownText}>DARE!</span>
            </div>
          ) : (
            <>
              <h3 className={styles.countdownText}>THE MISSING WORD WAS:</h3>
              <div className={styles.revealedWords}>
                {state.currentSong?.lyrics.find(l => l.id === state.countdown?.lineId)?.blankedWords?.map((w, i) => (
                  <span key={i} className={styles.bigRevealWord}>{w}</span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Song Header Info */}
      <div className={styles.songHero}>
        <img
          src={currentSong.albumArt || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80'}
          alt={currentSong.title}
          className={styles.albumCover}
        />
        <div className={styles.meta}>
          <h2 className={styles.title}>{currentSong.title}</h2>
          <span className={styles.artist}>{currentSong.artist}</span>
        </div>

        {currentSinger && (
          <div className={styles.currentSingerWrapper}>
            <div className={styles.currentSingerBadge}>
              <Mic2 size={16} />
              <div className={styles.singerInfo}>
                <span className={styles.label}>Now Singing</span>
                <span className={styles.name}>{currentSinger}</span>
              </div>
            </div>
            {state.micScores && state.micScores.length > 0 && (
              <div className={styles.micScoresDots}>
                {state.micScores.map((isCorrect, i) => (
                  <span key={i} className={`${styles.scoreDot} ${isCorrect ? styles.correct : styles.incorrect}`} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Karaoke Lyric Stage */}
      <div className={styles.lyricStage} style={{ '--lyric-scale': state.lyricScale } as React.CSSProperties}>
        {activeLyrics.length > 0 ? (
          activeLyrics.map(({ lyric, offset }) => {
            let className = styles.activeLyric;
            if (offset === -2) className = styles.fadingOutLyric;
            else if (offset === 1) className = styles.upcomingLyricBig;
            else if (offset === 2) className = styles.upcomingLyric;

            return (
              <div key={lyric.id} className={className}>
                {renderLyricText(lyric)}
              </div>
            );
          })
        ) : (
          <div className={styles.activeLyric}>♪ Get Ready to Sing ♪</div>
        )}
      </div>

      {/* Audio Waveform Animation when playing */}
      {isPlaying && (
        <div className={styles.waveform}>
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} className={styles.bar} />
          ))}
        </div>
      )}

      {/* Progress Bar & Seek */}
      <div className={styles.progressSection}>
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={(e) => controls.seek(parseFloat(e.target.value))}
          className={styles.slider}
        />
        <div className={styles.timestamps}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className={styles.controlsBar}>
        <div className={styles.playbackBtns}>
          <button onClick={controls.prevSong} className={styles.btn} title="Previous Song">
            <SkipBack size={20} />
          </button>
          <button onClick={controls.restart} className={styles.btn} title="Restart Song">
            <RotateCcw size={20} />
          </button>
          <button onClick={controls.togglePlay} className={styles.playBtn} title={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: 4 }} />}
          </button>
          <button onClick={controls.nextSong} className={styles.btn} title="Next Song">
            <SkipForward size={20} />
          </button>
        </div>

        <div className={styles.auxControls}>
          <div className={styles.volumeControl}>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: 'white', marginRight: 4 }}>A</span>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={state.lyricScale}
              onChange={(e) => controls.setLyricScale(parseFloat(e.target.value))}
              className={styles.volSlider}
              title="Adjust Lyric Size"
            />
          </div>
          <div className={styles.volumeControl}>
            <button onClick={controls.toggleMute} className={styles.btn} style={{ width: 36, height: 36 }}>
              {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => controls.setVolume(parseFloat(e.target.value))}
              className={styles.volSlider}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
