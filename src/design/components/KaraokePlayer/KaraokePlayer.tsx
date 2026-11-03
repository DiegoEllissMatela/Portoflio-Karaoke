import React, { useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Mic2, RotateCcw, Shuffle, Music } from 'lucide-react';
import type { KaraokeState, AudioControls, AppState } from '../../../logic/types/logicTypes';
import { formatTime } from '../../../logic/utils/lrcParser';
import { DEFAULT_ALBUM_ART, handleAlbumArtError } from '../../../logic/utils/albumArtUtils';
import { getEffectiveDuration } from '../../../logic/hooks/useKaraokeLogic';
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

  const totalDuration = duration > 0 ? duration : (currentSong.duration && currentSong.duration > 0 ? currentSong.duration : 0);
  const effectiveDuration = getEffectiveDuration(totalDuration, currentSong.lyrics);
  const displayCurrentTime = totalDuration > 0 ? Math.min(currentTime, totalDuration) : currentTime;

  const isDareMode = appState?.gameMode === 'DARE_DRINK' || appState?.gameMode === 'JUST_DRINK' || appState?.gameMode === 'DARE';
  const isBlankRangeMovable = appState?.isBlankRangeMovable !== false;
  const showBlankWordIndicators = Boolean(appState?.showBlankWordIndicators);

  const [blankRange, setBlankRange] = useState({
    start: appState?.dareBlankStartPct ?? 15,
    end: appState?.dareBlankEndPct ?? 85,
  });

  const currentRangeRef = useRef({ start: blankRange.start, end: blankRange.end });

  // Sync if appState updates from external state changes (e.g. switching modes)
  React.useEffect(() => {
    if (appState?.dareBlankStartPct !== undefined && appState?.dareBlankEndPct !== undefined) {
      setBlankRange({
        start: appState.dareBlankStartPct,
        end: appState.dareBlankEndPct,
      });
      currentRangeRef.current = {
        start: appState.dareBlankStartPct,
        end: appState.dareBlankEndPct,
      };
    }
  }, [appState?.dareBlankStartPct, appState?.dareBlankEndPct, appState?.gameMode]);

  const sliderTrackRef = useRef<HTMLDivElement>(null);

  const blankMarkers: { time: number; pct: number; word: string }[] = [];
  if (isDareMode && effectiveDuration > 0 && currentSong.lyrics) {
    currentSong.lyrics.forEach(line => {
      if (line.blankedWords && line.blankedWords.length > 0) {
        if (line.wordTimings && line.wordTimings.length > 0) {
          const remainingBlanks = [...line.blankedWords];
          line.wordTimings.forEach(wt => {
            const wordClean = (wt.text || wt.word || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const matchIdx = remainingBlanks.indexOf(wordClean);
            if (matchIdx !== -1) {
              remainingBlanks.splice(matchIdx, 1);
              const t = wt.start_time ?? (wt.start_ms ? wt.start_ms / 1000 : line.time);
              const pct = Math.min(100, Math.max(0, (t / effectiveDuration) * 100));
              blankMarkers.push({ time: t, pct, word: wt.text || wt.word || '' });
            }
          });
        } else {
          const pct = Math.min(100, Math.max(0, (line.time / effectiveDuration) * 100));
          blankMarkers.push({ time: line.time, pct, word: line.blankedWords.join(', ') });
        }
      }
    });
  }

  const handleStartDrag = (e: React.PointerEvent | React.MouseEvent, handle: 'start' | 'end' | 'band') => {
    if (!controls.setDareBlankRange || !sliderTrackRef.current) return;
    if (!isBlankRangeMovable) return;
    e.preventDefault();
    e.stopPropagation();

    const track = sliderTrackRef.current;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;

    const initialClientX = e.clientX;
    const initialStart = currentRangeRef.current.start;
    const initialEnd = currentRangeRef.current.end;
    const bandSpan = initialEnd - initialStart;

    const onMove = (moveEv: PointerEvent | MouseEvent) => {
      moveEv.preventDefault();
      const currentRect = track.getBoundingClientRect();
      const trackWidth = currentRect.width || rect.width;
      if (trackWidth <= 0) return;

      if (handle === 'band') {
        const deltaPct = Math.round(((moveEv.clientX - initialClientX) / trackWidth) * 100);
        let newStart = initialStart + deltaPct;
        let newEnd = initialEnd + deltaPct;

        if (newStart < 0) {
          newStart = 0;
          newEnd = Math.min(100, bandSpan);
        } else if (newEnd > 100) {
          newEnd = 100;
          newStart = Math.max(0, 100 - bandSpan);
        }

        currentRangeRef.current = { start: newStart, end: newEnd };
        setBlankRange({ start: newStart, end: newEnd });
      } else if (handle === 'start') {
        const pct = Math.min(100, Math.max(0, Math.round(((moveEv.clientX - currentRect.left) / trackWidth) * 100)));
        const newStart = Math.min(pct, initialEnd - 5);
        currentRangeRef.current = { start: newStart, end: initialEnd };
        setBlankRange({ start: newStart, end: initialEnd });
      } else if (handle === 'end') {
        const pct = Math.min(100, Math.max(0, Math.round(((moveEv.clientX - currentRect.left) / trackWidth) * 100)));
        const newEnd = Math.max(pct, initialStart + 5);
        currentRangeRef.current = { start: initialStart, end: newEnd };
        setBlankRange({ start: initialStart, end: newEnd });
      }
    };

    const onUp = () => {
      const finalRange = currentRangeRef.current;
      controls.setDareBlankRange?.(finalRange.start, finalRange.end);

      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

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

  const renderLyricText = (lyric: any, offset: number = 0) => {
    const { text, id: lyricId, blankedWords, wordTimings } = lyric;
    const isLineCleared = state.countdown?.clearedLineIds.includes(lyricId);
    const nowMs = currentTime * 1000 + 80; // subtle audio latency lead compensation

    // Fallback if no wordTimings (plain text LRC fallback)
    if (!wordTimings || wordTimings.length === 0) {
      const words = text.split(/(\s+)/);
      const rendered = words.map((chunk: string, i: number) => {
        if (/^\s+$/.test(chunk)) {
          return chunk;
        }
        const strippedWord = chunk.toLowerCase().replace(/[^a-z0-9]/g, '');
        const isBlanked = blankedWords && blankedWords.includes(strippedWord);
        if (isBlanked && !isLineCleared) {
          return (
            <span key={i} className={styles.blankBox} style={{ marginRight: '0.25em' }}>
              <span style={{ visibility: 'hidden' }}>{chunk}</span>
            </span>
          );
        }
        return chunk;
      });

      if (offset === 0) {
        return <span className={styles.activeLyricFallback}>{rendered}</span>;
      }
      return rendered;
    }

    // Lines with wordTimings
    return wordTimings.map((wt: any, i: number) => {
      const wordText = wt.text || wt.word;
      const strippedWord = wordText.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isBlanked = blankedWords && blankedWords.includes(strippedWord);

      // Mask blanked words across ALL lines (upcoming, active, and past until solved/cleared)
      if (isBlanked && !isLineCleared) {
        return (
          <span key={i} className={styles.blankBox} style={{ marginRight: '0.25em' }}>
            <span style={{ visibility: 'hidden' }}>{wordText}</span>
          </span>
        );
      }

      // Non-active lines: render plain word (revealed word if cleared, or normal word)
      if (offset !== 0) {
        return (
          <span key={i} className={styles.karaokeWord} style={{ marginRight: '0.25em' }}>
            {wordText}
          </span>
        );
      }

      // Active line: smooth sliding karaoke wipe with syllables
      if (wt.syllables && wt.syllables.length > 0) {
        return (
          <span key={i} className={styles.karaokeWord} style={{ marginRight: '0.25em' }}>
            {wt.syllables.map((syl: any, sIdx: number) => {
              let sylProgress = 0;
              if (nowMs >= syl.end_ms) {
                sylProgress = 1;
              } else if (nowMs > syl.start_ms) {
                const duration = Math.max(50, syl.end_ms - syl.start_ms);
                sylProgress = Math.min(1, Math.max(0, (nowMs - syl.start_ms) / duration));
              }

              const progressPct = (sylProgress * 100).toFixed(1);

              return (
                <span
                  key={sIdx}
                  className={`${styles.karaokeToken} ${sylProgress > 0 ? styles.glowing : ''}`}
                  style={{ '--progress': `${progressPct}%` } as React.CSSProperties}
                >
                  {syl.text}
                </span>
              );
            })}
          </span>
        );
      }

      // Word without individual syllables in active line
      let wordProgress = 0;
      if (nowMs >= wt.end_ms) {
        wordProgress = 1;
      } else if (nowMs > wt.start_ms) {
        const duration = Math.max(50, wt.end_ms - wt.start_ms);
        wordProgress = Math.min(1, Math.max(0, (nowMs - wt.start_ms) / duration));
      }

      const progressPct = (wordProgress * 100).toFixed(1);

      return (
        <span key={i} className={styles.karaokeWord} style={{ marginRight: '0.25em' }}>
          <span
            className={`${styles.karaokeToken} ${wordProgress > 0 ? styles.glowing : ''}`}
            style={{ '--progress': `${progressPct}%` } as React.CSSProperties}
          >
            {wordText}
          </span>
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
              <h3 className={styles.countdownText}>
                {(() => {
                  const lineBlanks = state.currentSong?.lyrics.find(l => l.id === state.countdown?.lineId)?.blankedWords;
                  return lineBlanks && lineBlanks.length > 1 ? 'THE MISSING WORDS WERE:' : 'THE MISSING WORD WAS:';
                })()}
              </h3>
              <div className={styles.revealedWords}>
                {(() => {
                  const currentLine = state.currentSong?.lyrics.find(l => l.id === state.countdown?.lineId);
                  if (!currentLine?.blankedWords || currentLine.blankedWords.length === 0) return null;

                  const lineWords = currentLine.wordTimings && currentLine.wordTimings.length > 0
                    ? currentLine.wordTimings.map(wt => wt.text || wt.word)
                    : currentLine.text.split(/\s+/);

                  const orderedBlanks = lineWords.filter(lw => {
                    const stripped = lw.toLowerCase().replace(/[^a-z0-9]/g, '');
                    return currentLine.blankedWords?.includes(stripped);
                  });

                  const displayWords = orderedBlanks.length > 0 ? orderedBlanks : currentLine.blankedWords;

                  return displayWords.map((w, i) => (
                    <span key={i} className={styles.bigRevealWord}>{w}</span>
                  ));
                })()}
              </div>
            </>
          )}
        </div>
      )}

      {/* Song Header Info */}
      <div className={styles.songHero}>
        <img
          src={currentSong.albumArt || DEFAULT_ALBUM_ART}
          alt={currentSong.title}
          className={styles.albumCover}
          onError={handleAlbumArtError}
          loading="eager"
        />
        <div className={styles.meta}>
          <h2 className={styles.title}>{currentSong.title}</h2>
          <span className={styles.artist}>{currentSong.artist}</span>
        </div>

        <div className={styles.currentSingerWrapper}>
          {currentSinger && (
            <div className={styles.currentSingerBadge}>
              <Mic2 size={16} />
              <div className={styles.singerInfo}>
                <span className={styles.label}>Now Singing</span>
                <span className={styles.name}>{currentSinger}</span>
              </div>
            </div>
          )}

          {/* Song Tone Guide / Vocal Melody Status Badge */}
          <button
            onClick={controls.toggleToneGuide}
            className={`${styles.toneGuideBadge} ${state.isToneGuideEnabled ? styles.toneGuideActive : styles.toneGuideMuted}`}
            title={`Vocal Guide Melody (Songhub Level 5 / 50%): ${state.isToneGuideEnabled ? `${Math.round(state.toneGuideVolume * 100)}% (Active)` : 'Muted'} - Click to Toggle (Hotkey: 'V')`}
          >
            <Music size={15} />
            <span className={styles.toneGuideLabel}>Vocal Guide:</span>
            <span className={styles.toneGuideValue}>
              {state.isToneGuideEnabled ? `${Math.round(state.toneGuideVolume * 100)}%` : 'MUTED'}
            </span>
            <span className={styles.toneGuideDot} />
          </button>

          {currentSinger && state.micScores && state.micScores.length > 0 && (
            <div className={styles.micScoresDots}>
              {state.micScores.map((isCorrect, i) => (
                <span key={i} className={`${styles.scoreDot} ${isCorrect ? styles.correct : styles.incorrect}`} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Karaoke Lyric Stage */}
      <div className={styles.lyricStage} style={{ '--lyric-scale': state.lyricScale } as React.CSSProperties}>
        {activeLyrics.length > 0 ? (
          activeLyrics.map(({ lyric, offset }) => {
            let className = styles.activeLyric;
            if (offset === -2) className = styles.fadingOutLyric;
            else if (offset === -1) className = styles.pastLyric;
            else if (offset === 1) className = styles.upcomingLyricBig;
            else if (offset === 2) className = styles.upcomingLyric;

            return (
              <div key={lyric.id} className={className}>
                {renderLyricText(lyric, offset)}
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
        <div className={styles.sliderWrapper} ref={sliderTrackRef}>
          {/* Normal Pink Music Seek Slider */}
          <input
            type="range"
            min={0}
            max={totalDuration > 0 ? totalDuration : 1}
            step={0.1}
            value={displayCurrentTime}
            onChange={(e) => controls.seek(parseFloat(e.target.value))}
            className={styles.slider}
            disabled={totalDuration <= 0}
          />

          {/* DARE / JUST_DRINK White Slider Range & White Blank Markers */}
          {isDareMode && effectiveDuration > 0 && (
            <div className={styles.blankRangeOverlay}>
              {/* Highlighted White Range Band (Movable whole-window or locked via settings) */}
              <div
                className={`${styles.blankRangeBand} ${isBlankRangeMovable ? styles.movableBand : ''}`}
                style={{
                  left: `${blankRange.start}%`,
                  width: `${Math.max(0, blankRange.end - blankRange.start)}%`,
                }}
                onPointerDown={isBlankRangeMovable ? (e) => handleStartDrag(e, 'band') : undefined}
                onMouseDown={isBlankRangeMovable ? (e) => handleStartDrag(e, 'band') : undefined}
                title={isBlankRangeMovable ? `Drag to reposition blank range (${formatTime((blankRange.start / 100) * effectiveDuration)} – ${formatTime((blankRange.end / 100) * effectiveDuration)})` : `Blank range: ${formatTime((blankRange.start / 100) * effectiveDuration)} – ${formatTime((blankRange.end / 100) * effectiveDuration)} (Locked)`}
              />

              {/* White dots for each blanked word timestamp - disabled by default, toggleable in Settings */}
              {showBlankWordIndicators && blankMarkers.map((marker, idx) => (
                <div
                  key={idx}
                  className={styles.blankWordDot}
                  style={{ left: `${marker.pct}%` }}
                  title={`Blank: "${marker.word}" at ${formatTime(marker.time)}`}
                />
              ))}

              {/* Start Handle Knob (Only shown and movable when allowed) */}
              {isBlankRangeMovable && (
                <div
                  className={`${styles.blankRangeHandle} ${styles.startHandle}`}
                  style={{ left: `${blankRange.start}%` }}
                  onPointerDown={(e) => handleStartDrag(e, 'start')}
                  onMouseDown={(e) => handleStartDrag(e, 'start')}
                  title={`Blanks Start: ${formatTime((blankRange.start / 100) * effectiveDuration)} (${blankRange.start}%)`}
                >
                  <div className={styles.handleKnob} />
                  <div className={styles.handleTooltip}>{formatTime((blankRange.start / 100) * effectiveDuration)}</div>
                </div>
              )}

              {/* End Handle Knob (Only shown and movable when allowed) */}
              {isBlankRangeMovable && (
                <div
                  className={`${styles.blankRangeHandle} ${styles.endHandle}`}
                  style={{ left: `${blankRange.end}%` }}
                  onPointerDown={(e) => handleStartDrag(e, 'end')}
                  onMouseDown={(e) => handleStartDrag(e, 'end')}
                  title={`Blanks End: ${formatTime((blankRange.end / 100) * effectiveDuration)} (${blankRange.end}%)`}
                >
                  <div className={styles.handleKnob} />
                  <div className={styles.handleTooltip}>{formatTime((blankRange.end / 100) * effectiveDuration)}</div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.timestamps}>
          <span>{formatTime(displayCurrentTime)}</span>
          {state.isAudioLoading ? (
            <span className={styles.bufferingBadge}>
              Buffering Audio...
            </span>
          ) : (
            <span>{formatTime(totalDuration)}</span>
          )}
        </div>
      </div>

      {/* Controls Bar */}
      <div className={styles.controlsBar}>
        <div className={styles.playbackBtns}>
          <button onClick={controls.shufflePlaylist} className={styles.btn} title="Shuffle Songs">
            <Shuffle size={20} />
          </button>
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
          {/* Key Transpose Control */}
          <div className={styles.pitchControl} title="Key Transpose (Hotkeys: 'I' up, 'K' down)">
            <button
              onClick={() => controls.transposeDown ? controls.transposeDown() : controls.setPitch(state.pitch - 1)}
              className={styles.btn}
              style={{ width: 36, height: 36 }}
              disabled={state.pitch <= -6}
              title="Key Down (Hotkey: K)"
            >
              <span className={styles.pitchSymbol}>♭</span>
            </button>
            <button
              onClick={() => controls.resetPitch ? controls.resetPitch() : controls.setPitch(0)}
              className={`${styles.pitchBadge} ${state.pitch !== 0 ? styles.pitchBadgeActive : ''}`}
              title="Reset Key to Original (0)"
            >
              <span className={styles.pitchText}>KEY</span>
              <span className={styles.pitchValue}>{state.pitch > 0 ? `+${state.pitch}` : state.pitch}</span>
            </button>
            <button
              onClick={() => controls.transposeUp ? controls.transposeUp() : controls.setPitch(state.pitch + 1)}
              className={styles.btn}
              style={{ width: 36, height: 36 }}
              disabled={state.pitch >= 6}
              title="Key Up (Hotkey: I)"
            >
              <span className={styles.pitchSymbol}>♯</span>
            </button>
          </div>

          {/* Lyric Font Size Slider */}
          <div className={styles.volumeControl} title="Lyric Font Size">
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

          {/* Vocal Guide Melody Volume & Mute Control (Songhub Level 5 Parity) */}
          <div className={styles.volumeControl} title={`Vocal Melody Guide (Level 5): ${state.isToneGuideEnabled ? `${Math.round(state.toneGuideVolume * 100)}%` : 'Muted'} (Hotkey: V)`}>
            <button
              onClick={controls.toggleToneGuide}
              className={`${styles.btn} ${state.isToneGuideEnabled ? styles.guideBtnActive : styles.guideBtnMuted}`}
              style={{ width: 36, height: 36 }}
              title={state.isToneGuideEnabled ? "Mute Vocal Guide (Hotkey: V)" : "Unmute Vocal Guide (Hotkey: V)"}
            >
              {state.isToneGuideEnabled && state.toneGuideVolume > 0 ? (
                <Music size={18} color="#10b981" />
              ) : (
                <VolumeX size={18} color="#ef4444" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.isToneGuideEnabled ? state.toneGuideVolume : 0}
              onChange={(e) => controls.setToneGuideVolume ? controls.setToneGuideVolume(parseFloat(e.target.value)) : null}
              className={styles.volSlider}
              style={{ accentColor: state.isToneGuideEnabled ? '#10b981' : '#6b7280' }}
              title={`Vocal Guide Volume: ${Math.round((state.isToneGuideEnabled ? state.toneGuideVolume : 0) * 100)}%`}
            />
            <span style={{ fontSize: '0.75rem', fontWeight: 800, minWidth: '38px', textAlign: 'right', color: state.isToneGuideEnabled ? '#10b981' : '#ef4444' }}>
              {state.isToneGuideEnabled ? `V:${Math.round(state.toneGuideVolume * 100)}%` : 'V:OFF'}
            </span>
          </div>

          {/* Main Music Volume Slider */}
          <div className={styles.volumeControl} title="Music Volume">
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
              title={`Music Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
