import { useState, useEffect, useRef, useCallback } from 'react';
import type { Song, KaraokeState, AudioControls, AppState, LyricLine } from '../types/logicTypes';
import { fetchAndParseLRC, parseLyrics } from '../utils/lrcParser';
import { shuffleWithArtistSeparation, normalizeArtistName } from '../utils/shuffleUtils';
import { midiPlayer } from '../services/midiPlayerService';
import { loadSongCatalog, getLoadedSongs, isCatalogReady } from '../services/songCatalogService';
import { DEFAULT_ALBUM_ART } from '../utils/albumArtUtils';

export const USER_SONGS: Song[] = [];
export const USER_SONGS_MAP = new Map<string, Song>();


// Helper for Fuzzy Matching spoken words
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[a.length][b.length];
}

export function getEffectiveDuration(totalDuration = 0, lyrics?: LyricLine[]): number {
  if (totalDuration > 0) return totalDuration;
  if (lyrics && lyrics.length > 0) {
    const last = lyrics[lyrics.length - 1];
    let t = last.time;
    if (last.wordTimings && last.wordTimings.length > 0) {
      const lastWt = last.wordTimings[last.wordTimings.length - 1];
      t = lastWt.end_time || (lastWt.end_ms ? lastWt.end_ms / 1000 : last.time);
    }
    return Math.max(30, t + 15);
  }
  return 180;
}

function processDareLyrics(
  lyrics: LyricLine[],
  blanksPerSong: number,
  minLength: number,
  maxLength: number,
  startPct = 15,
  endPct = 85,
  totalDuration = 0
): LyricLine[] {
  const processed = lyrics.map(l => ({ ...l, blankedWords: [] as string[] }));
  const candidates: { lineIdx: number; wordIdx: number; word: string }[] = [];

  const effectiveDuration = getEffectiveDuration(totalDuration, lyrics);
  const startTime = (startPct / 100) * effectiveDuration;
  const endTime = (endPct / 100) * effectiveDuration;

  // Pass 1: Standard words strictly within [startTime, endTime]
  processed.forEach((line, lineIdx) => {
    const words = line.wordTimings && line.wordTimings.length > 0
      ? line.wordTimings.map(wt => wt.text || wt.word)
      : line.text.split(/\s+/);

    words.forEach((word, wordIdx) => {
      if (word.trim().length > 0) {
        const strippedWord = word.replace(/[^a-zA-Z0-9]/g, '');
        let wordTime = line.time;
        if (line.wordTimings && line.wordTimings[wordIdx]) {
          const wt = line.wordTimings[wordIdx];
          wordTime = wt.start_time ?? (wt.start_ms ? wt.start_ms / 1000 : line.time);
        }

        if (wordTime >= startTime && wordTime <= endTime) {
          if (strippedWord.length >= minLength && strippedWord.length <= maxLength) {
            candidates.push({ lineIdx, wordIdx, word });
          }
        }
      }
    });
  });

  // Pass 2: If we need more candidates, relax length down to >= 2, STILL strictly within [startTime, endTime]
  if (candidates.length < blanksPerSong) {
    processed.forEach((line, lineIdx) => {
      const words = line.wordTimings && line.wordTimings.length > 0
        ? line.wordTimings.map(wt => wt.text || wt.word)
        : line.text.split(/\s+/);

      words.forEach((word, wordIdx) => {
        if (word.trim().length > 0) {
          const strippedWord = word.replace(/[^a-zA-Z0-9]/g, '');
          let wordTime = line.time;
          if (line.wordTimings && line.wordTimings[wordIdx]) {
            const wt = line.wordTimings[wordIdx];
            wordTime = wt.start_time ?? (wt.start_ms ? wt.start_ms / 1000 : line.time);
          }

          if (wordTime >= startTime && wordTime <= endTime && strippedWord.length >= 2) {
            const alreadyIn = candidates.some(c => c.lineIdx === lineIdx && c.wordIdx === wordIdx);
            if (!alreadyIn) {
              candidates.push({ lineIdx, wordIdx, word });
            }
          }
        }
      });
    });
  }

  // Pass 3: If still needed, accept ANY word strictly within [startTime, endTime]
  if (candidates.length < blanksPerSong) {
    processed.forEach((line, lineIdx) => {
      const words = line.wordTimings && line.wordTimings.length > 0
        ? line.wordTimings.map(wt => wt.text || wt.word)
        : line.text.split(/\s+/);

      words.forEach((word, wordIdx) => {
        if (word.trim().length > 0) {
          const strippedWord = word.replace(/[^a-zA-Z0-9]/g, '');
          let wordTime = line.time;
          if (line.wordTimings && line.wordTimings[wordIdx]) {
            const wt = line.wordTimings[wordIdx];
            wordTime = wt.start_time ?? (wt.start_ms ? wt.start_ms / 1000 : line.time);
          }

          if (wordTime >= startTime && wordTime <= endTime && strippedWord.length >= 1) {
            const alreadyIn = candidates.some(c => c.lineIdx === lineIdx && c.wordIdx === wordIdx);
            if (!alreadyIn) {
              candidates.push({ lineIdx, wordIdx, word });
            }
          }
        }
      });
    });
  }

  // Pass 4: Only if the window literally has ZERO words (e.g. empty intro or instrumental),
  // pick words from nearest lines closest to the window
  if (candidates.length === 0) {
    const windowCenter = (startTime + endTime) / 2;
    const sortedLines = [...processed]
      .map((line, idx) => ({ line, idx, dist: Math.abs(line.time - windowCenter) }))
      .sort((a, b) => a.dist - b.dist);

    for (const item of sortedLines) {
      if (candidates.length >= blanksPerSong) break;
      const words = item.line.wordTimings && item.line.wordTimings.length > 0
        ? item.line.wordTimings.map(wt => wt.text || wt.word)
        : item.line.text.split(/\s+/);

      words.forEach((word, wordIdx) => {
        if (candidates.length < blanksPerSong && word.trim().length > 0) {
          const strippedWord = word.replace(/[^a-zA-Z0-9]/g, '');
          if (strippedWord.length >= 2) {
            candidates.push({ lineIdx: item.idx, wordIdx, word });
          }
        }
      });
    }
  }

  const selected: { lineIdx: number; wordIdx: number; word: string }[] = [];
  for (let i = 0; i < blanksPerSong && candidates.length > 0; i++) {
    const randIdx = Math.floor(Math.random() * candidates.length);
    selected.push(candidates[randIdx]);
    candidates.splice(randIdx, 1);
  }

  // Sort selected candidates in chronological song order (line order, then word order)
  selected.sort((a, b) => {
    if (a.lineIdx !== b.lineIdx) return a.lineIdx - b.lineIdx;
    return a.wordIdx - b.wordIdx;
  });

  selected.forEach(cand => {
    processed[cand.lineIdx].blankedWords!.push(cand.word.toLowerCase().replace(/[^a-z0-9]/g, ''));
  });

  // Ensure line.blankedWords is sorted strictly by word index in that line
  processed.forEach(line => {
    if (line.blankedWords && line.blankedWords.length > 1) {
      const lineWords = line.wordTimings && line.wordTimings.length > 0
        ? line.wordTimings.map(wt => (wt.text || wt.word).toLowerCase().replace(/[^a-z0-9]/g, ''))
        : line.text.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, ''));

      line.blankedWords.sort((a, b) => {
        const idxA = lineWords.indexOf(a);
        const idxB = lineWords.indexOf(b);
        return idxA - idxB;
      });
    }
  });

  return processed;
}

export function useKaraokeLogic(
  appState?: AppState,
  setAppState?: React.Dispatch<React.SetStateAction<AppState>>
): { state: KaraokeState; controls: AudioControls } {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const requestRef = useRef<number | null>(null);
  const isMicScoringRef = useRef<boolean>(false);

  const [allSongs, setAllSongs] = useState<Song[]>(() => getLoadedSongs());
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(!isCatalogReady());
  const [catalogProgress, setCatalogProgress] = useState<number>(isCatalogReady() ? 100 : 0);
  const [catalogStatus, setCatalogStatus] = useState<string>(isCatalogReady() ? 'Ready' : 'Initializing...');
  const [catalogLogs, setCatalogLogs] = useState<string[]>([]);

  const skipCatalogLoading = useCallback(() => {
    setIsLoadingCatalog(false);
    setCatalogStatus('Running in background');
    setCatalogLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] User bypassed loading screen to main app`]);
  }, []);

  const [playlist, setPlaylist] = useState<Song[]>(() => {
    const currentMode = appState?.gameMode || 'NORMAL';
    const modeConfig = appState?.modeSettings?.[currentMode];
    const disabled = modeConfig?.disabledSongs ?? appState?.disabledSongs ?? [];
    const enabled = modeConfig?.enabledSongs ?? appState?.enabledSongs ?? [];
    const isWhitelist = modeConfig?.allSongsDisabled ?? appState?.allSongsDisabled ?? (enabled.length > 0);
    const enabledSet = new Set(enabled);
    const disabledSet = new Set(disabled);
    const pool = allSongs.length > 0 ? allSongs : USER_SONGS;
    return pool.filter(song => {
      const isSongDisabled = disabledSet.has(song.id);
      const isSongEnabled = enabledSet.has(song.id);
      if (isWhitelist) {
        return isSongEnabled && !isSongDisabled;
      }
      const isDefaultHidden = song.isHiddenByDefault && !isSongEnabled;
      return !isSongDisabled && !isDefaultHidden;
    });
  });
  const [currentSong, setCurrentSong] = useState<Song | null>(playlist.length > 0 ? playlist[0] : null);

  // Background catalog loader & soundfont pre-warming
  useEffect(() => {
    let isMounted = true;

    // Early background pre-warm of SoundFont while user navigates menu/modes
    midiPlayer.ensureSoundfont().catch(err => {
      console.warn('[KaraokeLogic] Early SoundFont pre-warm notice:', err);
    });

    loadSongCatalog(
      (progress, status, log) => {
        if (!isMounted) return;
        setCatalogProgress(progress);
        setCatalogStatus(status);
        if (log) {
          setCatalogLogs(prev => [...prev, log].slice(-30));
        }
      },
      (fullSongs) => {
        if (!isMounted) return;
        USER_SONGS.length = 0;
        USER_SONGS.push(...fullSongs);
        USER_SONGS_MAP.clear();
        for (const s of fullSongs) {
          USER_SONGS_MAP.set(s.id, s);
        }
        setAllSongs(fullSongs);
        setCatalogStatus(`Library ready (${fullSongs.length.toLocaleString()} tracks)`);
      }
    )
      .then((loaded) => {
        if (!isMounted) return;
        USER_SONGS.length = 0;
        USER_SONGS.push(...loaded);
        USER_SONGS_MAP.clear();
        for (const s of loaded) {
          USER_SONGS_MAP.set(s.id, s);
        }
        setAllSongs(loaded);
        setIsLoadingCatalog(false);
        setCatalogProgress(100);
        setCatalogStatus(`Library ready (${loaded.length.toLocaleString()} tracks)`);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to load songs:', err);
        setIsLoadingCatalog(false);
        setCatalogStatus('Catalog load failed');
      });

    return () => {
      isMounted = false;
    };
  }, []);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [pitch, setPitchState] = useState<number>(0);
  const [isToneGuideEnabled, setIsToneGuideEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dnm_tone_guide_enabled');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [toneGuideVolume, setToneGuideVolumeState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('dnm_tone_guide_volume');
      return saved !== null ? parseFloat(saved) : 0.50; // Songhub Level 5 Default (50%)
    } catch {
      return 0.50;
    }
  });
  const [lyricScale, setLyricScaleState] = useState<number>(1);
  const [currentLyricIndex, setCurrentLyricIndex] = useState<number>(-1);
  const [micScores, setMicScores] = useState<boolean[]>([]);
  const [songQueue, setSongQueue] = useState<Song[]>([]);
  const [isAudioLoading, setIsAudioLoading] = useState<boolean>(false);
  const [audioLoadingProgress] = useState<number>(0);
  const [songEndedCount, setSongEndedCount] = useState<number>(0);

  const isCurrentMidi = Boolean(
    (currentSong?.audioUrl && currentSong.audioUrl.toLowerCase().endsWith('.mid')) ||
    (!currentSong?.audioUrl && currentSong?.midiUrl?.toLowerCase().endsWith('.mid'))
  );
  const [countdown, setCountdown] = useState<{ isActive: boolean; timeLeft: number; lineId: string | null; isRevealing: boolean; clearedLineIds: string[]; isListening?: boolean; liveTranscript?: string }>({
    isActive: false,
    timeLeft: 5,
    lineId: null,
    isRevealing: false,
    clearedLineIds: [],
  });

  const currentSongRef = useRef<Song | null>(currentSong);
  currentSongRef.current = currentSong;

  const durationRef = useRef<number>(duration);
  durationRef.current = duration;

  const appStateRef = useRef<AppState | undefined>(appState);
  appStateRef.current = appState;

  const blankRangeRef = useRef<{ start: number; end: number }>({
    start: appState?.dareBlankStartPct ?? 15,
    end: appState?.dareBlankEndPct ?? 85,
  });
  if (appState?.dareBlankStartPct !== undefined && appState?.dareBlankEndPct !== undefined) {
    blankRangeRef.current = {
      start: appState.dareBlankStartPct,
      end: appState.dareBlankEndPct,
    };
  }

  // Initialize Audio Element
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.volume = volume;
    audio.muted = isMuted;

    const handleLoadedMetadata = () => {
      const audioDur = audio.duration;
      if (audioDur && !isNaN(audioDur) && audioDur > 0) {
        setDuration(audioDur);
        durationRef.current = audioDur;

        // Ensure blanks are strictly regenerated for currentSong using actual audio duration
        const curApp = appStateRef.current;
        const isDare = curApp?.gameMode === 'DARE_DRINK' || curApp?.gameMode === 'JUST_DRINK' || curApp?.gameMode === 'DARE';
        if (isDare) {
          const curSong = currentSongRef.current;
          if (curSong && curSong.lyrics && curSong.lyrics.length > 0) {
            const startPct = blankRangeRef.current.start;
            const endPct = blankRangeRef.current.end;
            const newLyrics = processDareLyrics(
              curSong.lyrics,
              curApp?.dareBlanksPerSong ?? 3,
              curApp?.dareMinWordLength ?? 3,
              curApp?.dareMaxWordLength ?? 10,
              startPct,
              endPct,
              audioDur
            );
            setCurrentSong(prev => prev ? { ...prev, duration: audioDur, lyrics: newLyrics } : null);
          }
        }
      } else {
        setDuration(audio.duration);
      }
      if (audio.readyState >= 2) {
        setIsAudioLoading(false);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setSongEndedCount(prev => prev + 1);
    };

    const handleLoadStart = () => {
      setIsAudioLoading(true);
    };

    const handleLoadedData = () => {
      setIsAudioLoading(false);
    };

    const handleCanPlay = () => {
      setIsAudioLoading(false);
    };

    const handleWaiting = () => {
      if (audio.readyState < 3) {
        setIsAudioLoading(true);
      }
    };

    const handlePlaying = () => {
      setIsAudioLoading(false);
    };

    const handleError = () => {
      setIsAudioLoading(false);
    };

    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('canplaythrough', handleCanPlay);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('error', handleError);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('loadeddata', handleLoadedData);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('canplaythrough', handleCanPlay);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Initialize Timer Audio
  useEffect(() => {
    const audio = new Audio('/sfx/5 sec timer.mp3');
    timerAudioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Setup Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      // Note: We leave lang as default so it uses browser locale, as setting one excludes the other
      recognitionRef.current = recognition;
    }
  }, []);

  const handleMicResult = useCallback((success: boolean) => {
    if (isMicScoringRef.current) return;
    isMicScoringRef.current = true;

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { }
    }
    setMicScores(prev => [...prev, success]);
    setCountdown(prev => ({ ...prev, isListening: false, isRevealing: true, timeLeft: 0 }));
  }, []);

  const startSpeechRecognition = useCallback(() => {
    isMicScoringRef.current = false;

    if (!recognitionRef.current) {
      handleMicResult(false);
      return;
    }

    const line = currentSong?.lyrics.find(l => l.id === countdown.lineId);
    const expectedWords = line?.blankedWords?.map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')) || [];
    const expectedPhrase = expectedWords.join(' ');

    recognitionRef.current.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        transcript += event.results[i][0].transcript;
      }

      const cleanTranscript = transcript.toLowerCase().replace(/[^a-z0-9 ]/g, '');
      const words = cleanTranscript.split(' ');

      setCountdown(prev => ({ ...prev, liveTranscript: transcript }));

      // Fuzzy matching logic - strictly 3 letters off allowed
      const maxAllowedDistance = 3;
      const hasMatch = (expectedPhrase.length > 0 && cleanTranscript.includes(expectedPhrase)) ||
        expectedWords.some(expectedWord => {
          return words.some(word => {
            if (word === expectedWord) return true;
            if ((word.includes(expectedWord) || expectedWord.includes(word)) && Math.abs(word.length - expectedWord.length) <= 3) {
              return true;
            }
            return levenshtein(word, expectedWord) <= maxAllowedDistance;
          });
        });

      if (hasMatch) {
        handleMicResult(true);
      }
    };

    recognitionRef.current.onerror = (e: any) => console.error("Speech error:", e);

    try {
      recognitionRef.current.start();
    } catch (e) {
      console.error(e);
    }
  }, [countdown.lineId, currentSong, handleMicResult]);

  // Load current song
  useEffect(() => {
    const loadSong = async () => {
      if (!currentSong || !audioRef.current) return;

      const audio = audioRef.current;
      durationRef.current = currentSong.duration || 0;

      if (currentSong.lyrics.length === 0 && currentSong.lyricsUrl) {
        const parsed = await fetchAndParseLRC(currentSong.lyricsUrl);
        let fetchedLyrics = parsed.lyrics;

        const curApp = appStateRef.current;
        const isDare = curApp?.gameMode === 'DARE_DRINK' || curApp?.gameMode === 'JUST_DRINK' || curApp?.gameMode === 'DARE';

        if (isDare) {
          const effectiveDur = currentSong.duration || 0;

          fetchedLyrics = processDareLyrics(
            fetchedLyrics,
            curApp?.dareBlanksPerSong ?? 3,
            curApp?.dareMinWordLength ?? 3,
            curApp?.dareMaxWordLength ?? 10,
            blankRangeRef.current.start,
            blankRangeRef.current.end,
            effectiveDur
          );
        }

        const updatedSongMeta = {
          lyrics: fetchedLyrics,
          ...(parsed.title && currentSong.title === 'Unknown' ? { title: parsed.title } : {}),
          ...(parsed.artist && currentSong.artist === 'Unknown Artist' ? { artist: parsed.artist } : {}),
        };

        setCurrentSong(prev => prev ? { ...prev, ...updatedSongMeta } : null);

        // Update playlist with fetched lyrics to avoid refetching
        setPlaylist(prevPlaylist =>
          prevPlaylist.map(s => s.id === currentSong.id ? { ...s, ...updatedSongMeta } : s)
        );
      } else if (currentSong.lyrics.length > 0) {
        // If lyrics are already cached/loaded, ensure they strictly obey the current blank range and duration
        const curApp = appStateRef.current;
        const isDare = curApp?.gameMode === 'DARE_DRINK' || curApp?.gameMode === 'JUST_DRINK' || curApp?.gameMode === 'DARE';
        if (isDare) {
          const effectiveDur = currentSong.duration || 0;

          const newLyrics = processDareLyrics(
            currentSong.lyrics,
            curApp?.dareBlanksPerSong ?? 3,
            curApp?.dareMinWordLength ?? 3,
            curApp?.dareMaxWordLength ?? 10,
            blankRangeRef.current.start,
            blankRangeRef.current.end,
            effectiveDur
          );

          setCurrentSong(prev => prev ? { ...prev, lyrics: newLyrics } : null);
        }
      }

      if (isCurrentMidi) {
        audio.removeAttribute('src');
        setIsAudioLoading(true);
        try {
          const midiSrc = currentSong.midiUrl || currentSong.audioUrl!;
          const data = await midiPlayer.loadSource(midiSrc, {
            title: currentSong.title,
            artist: currentSong.artist,
          });
          if (data && data.durationSec > 0) {
            setDuration(data.durationSec);
            durationRef.current = data.durationSec;
            let midiLyrics = data.parsedLyrics;
            const curApp = appStateRef.current;
            const isDare = curApp?.gameMode === 'DARE_DRINK' || curApp?.gameMode === 'JUST_DRINK' || curApp?.gameMode === 'DARE';
            if (isDare && midiLyrics && midiLyrics.length > 0) {
              const startPct = blankRangeRef.current.start;
              const endPct = blankRangeRef.current.end;
              const blanks = curApp?.dareBlanksPerSong ?? 3;
              const minLen = curApp?.dareMinWordLength ?? 3;
              const maxLen = curApp?.dareMaxWordLength ?? 10;
              midiLyrics = processDareLyrics(
                midiLyrics,
                blanks,
                minLen,
                maxLen,
                startPct,
                endPct,
                data.durationSec
              );
              const effDur = getEffectiveDuration(data.durationSec, midiLyrics);
              lastBlankSyncKeyRef.current = [currentSong.id, midiLyrics.length, effDur.toFixed(2), startPct, endPct, blanks, minLen, maxLen].join('|');
            }
            const updatedMeta = {
              duration: data.durationSec,
              ...(midiLyrics && midiLyrics.length > 0 ? { lyrics: midiLyrics } : {}),
            };
            setCurrentSong(prev => prev ? { ...prev, ...updatedMeta } : null);
            setPlaylist(prevPlaylist =>
              prevPlaylist.map(s => s.id === currentSong.id ? { ...s, ...updatedMeta } : s)
            );
          }
        } catch (e) {
          console.error('[KaraokeLogic] MIDI load error:', e);
        } finally {
          setIsAudioLoading(false);
        }
      } else if (currentSong.audioUrl) {
        // Compare src efficiently
        const originUrl = window.location.origin + currentSong.audioUrl;
        const isDifferentSrc = audio.src !== originUrl && !audio.src.endsWith(currentSong.audioUrl);
        if (isDifferentSrc) {
          setIsAudioLoading(true);
          audio.preload = 'auto';
          audio.src = currentSong.audioUrl;
          audio.load();
          if (audio.readyState >= 2) {
            setIsAudioLoading(false);
          }
        } else if (audio.readyState >= 2) {
          setIsAudioLoading(false);
        } else {
          setIsAudioLoading(true);
        }
      } else {
        audio.removeAttribute('src');
        setIsAudioLoading(false);
      }

      setCurrentTime(0);
      if (isCurrentMidi) {
        const midiDur = midiPlayer.getDuration();
        if (midiDur > 0) {
          setDuration(midiDur);
        } else if (currentSong.duration && currentSong.duration > 0) {
          setDuration(currentSong.duration);
        } else {
          setDuration(0);
        }
      } else if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else if (currentSong.duration && currentSong.duration > 0) {
        setDuration(currentSong.duration);
      } else {
        // Never keep the previous song's duration around for a new song
        setDuration(0);
      }
      setMicScores([]);
      setCountdown(prev => ({ ...prev, isActive: false, isRevealing: false, lineId: null, clearedLineIds: [], isListening: false, liveTranscript: '' }));

      if (isPlaying) {
        if (isCurrentMidi) {
          midiPlayer.play().catch(e => console.error("MIDI playback failed:", e));
        } else {
          audio.play().catch(e => console.error("Playback failed:", e));
        }
      }
    };

    loadSong();
  }, [currentSong?.id, appState?.gameMode, appState?.dareBlanksPerSong, appState?.dareMinWordLength, appState?.dareMaxWordLength, appState?.dareBlankStartPct, appState?.dareBlankEndPct]); // Re-run when song changes or dare settings change

  // Single source of truth: keep the blanks inside the white slider window using the SAME
  // duration the player UI uses. Re-runs whenever the song, its lyrics, the real duration
  // or the slider range changes, so no manual slider nudge is ever needed.
  const lastBlankSyncKeyRef = useRef<string>('');
  useEffect(() => {
    const isDare = appState?.gameMode === 'DARE_DRINK' || appState?.gameMode === 'JUST_DRINK' || appState?.gameMode === 'DARE';
    if (!isDare || !currentSong || !currentSong.lyrics || currentSong.lyrics.length === 0) return;

    const startPct = appState?.dareBlankStartPct ?? blankRangeRef.current.start;
    const endPct = appState?.dareBlankEndPct ?? blankRangeRef.current.end;
    const blanks = appState?.dareBlanksPerSong ?? 3;
    const minLen = appState?.dareMinWordLength ?? 3;
    const maxLen = appState?.dareMaxWordLength ?? 10;
    const totalDur = duration > 0 ? duration : (currentSong.duration && currentSong.duration > 0 ? currentSong.duration : 0);
    const effDur = getEffectiveDuration(totalDur, currentSong.lyrics);

    const key = [currentSong.id, currentSong.lyrics.length, effDur.toFixed(2), startPct, endPct, blanks, minLen, maxLen].join('|');
    if (lastBlankSyncKeyRef.current === key) return;
    lastBlankSyncKeyRef.current = key;

    const newLyrics = processDareLyrics(currentSong.lyrics, blanks, minLen, maxLen, startPct, endPct, totalDur);
    setCurrentSong(prev => (prev && prev.id === currentSong.id ? { ...prev, lyrics: newLyrics } : prev));
    setPlaylist(prevPl => prevPl.map(s => (s.id === currentSong.id ? { ...s, lyrics: newLyrics } : s)));
  }, [
    currentSong?.id,
    currentSong?.lyrics?.length,
    currentSong?.duration,
    duration,
    appState?.gameMode,
    appState?.dareBlankStartPct,
    appState?.dareBlankEndPct,
    appState?.dareBlanksPerSong,
    appState?.dareMinWordLength,
    appState?.dareMaxWordLength,
  ]);

  // Synchronize MIDI Player status & time
  useEffect(() => {
    if (!isCurrentMidi) return;

    const unsubTime = midiPlayer.onTimeUpdate((time) => {
      setCurrentTime(time);
    });
    const unsubDur = midiPlayer.onDurationChange((dur) => {
      setDuration(dur);
    });
    const unsubEnded = midiPlayer.onEnded(() => {
      setIsPlaying(false);
      setCurrentTime(0);
      setSongEndedCount(prev => prev + 1);
    });
    const unsubLoad = midiPlayer.onLoadingChange((loading) => {
      setIsAudioLoading(loading);
    });

    return () => {
      unsubTime();
      unsubDur();
      unsubEnded();
      unsubLoad();
    };
  }, [isCurrentMidi]);

  // RequestAnimationFrame loop
  const updateLoop = useCallback(() => {
    let newTime = 0;
    if (isCurrentMidi) {
      newTime = midiPlayer.getCurrentTime();
      setCurrentTime(newTime);
    } else if (audioRef.current) {
      newTime = audioRef.current.currentTime;
      setCurrentTime(newTime);
    }

    if (isPlaying) {
      requestRef.current = requestAnimationFrame(updateLoop);
    }
  }, [isPlaying, isCurrentMidi]);

  // Handle play/pause side effects
  useEffect(() => {
    if (isCurrentMidi) {
      if (isPlaying) {
        midiPlayer.play().catch(e => {
          console.error("MIDI playback failed:", e);
          setIsPlaying(false);
        });
        requestRef.current = requestAnimationFrame(updateLoop);
      } else {
        midiPlayer.pause();
        if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
        }
      }
      return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
      };
    }

    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.play().catch(e => {
        console.error("Playback failed:", e);
        setIsPlaying(false);
      });
      requestRef.current = requestAnimationFrame(updateLoop);
    } else {
      audioRef.current.pause();
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, updateLoop, isCurrentMidi]);

  // Synchronize lyric highlight
  useEffect(() => {
    if (!currentSong || currentSong.lyrics.length === 0) {
      setCurrentLyricIndex(-1);
      return;
    }

    const lyrics = currentSong.lyrics;
    let activeIndex = -1;

    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime >= lyrics[i].time) {
        activeIndex = i;
      } else {
        break;
      }
    }

    setCurrentLyricIndex(activeIndex);
  }, [currentTime, currentSong]);

  // Handle Dare Mode blank pause
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    if (currentLyricIndex >= 0 && currentSong && isPlaying) {
      const activeLine = currentSong.lyrics[currentLyricIndex];
      if (activeLine?.blankedWords && activeLine.blankedWords.length > 0) {
        if (!countdown.clearedLineIds.includes(activeLine.id) && countdown.lineId !== activeLine.id) {

          const word = activeLine.blankedWords[0];
          const wordIndex = Math.max(0, activeLine.text.indexOf(word));
          const lineLength = Math.max(1, activeLine.text.length);
          const nextLine = currentSong.lyrics[currentLyricIndex + 1];
          const lineDuration = nextLine ? (nextLine.time - activeLine.time) : 5.0;

          // Calculate delay: use exact word timing if available, otherwise proportional
          const proportion = Math.max(0, (wordIndex / lineLength) - 0.05);
          let targetTime = activeLine.time + (proportion * lineDuration);

          if (activeLine.wordTimings && activeLine.wordTimings.length > 0) {
            const wt = activeLine.wordTimings.find(
              w => (w.text || w.word).toLowerCase().replace(/[^a-z0-9]/g, '') === word
            );
            if (wt) {
              const startSec = wt.start_time ?? (wt.start_ms / 1000);
              // Trigger right at blank word arrival with 0.1s lead buffer
              targetTime = Math.max(activeLine.time, startSec - 0.1);
            }
          }

          const currentAudioTime = isCurrentMidi
            ? midiPlayer.getCurrentTime()
            : (audioRef.current?.currentTime ?? currentTime);

          const delayMs = Math.max(0, (targetTime - currentAudioTime) * 1000);

          const triggerPause = () => {
            setIsPlaying(false);
            if (isCurrentMidi) {
              midiPlayer.pause();
            } else if (audioRef.current) {
              audioRef.current.pause();
            }
            setCountdown(prev => ({ ...prev, isActive: true, timeLeft: 5, lineId: activeLine.id, isRevealing: false }));
            if (timerAudioRef.current) {
              timerAudioRef.current.currentTime = 0;
              timerAudioRef.current.play().catch(console.error);
            }
          };

          if (delayMs > 20) {
            timeoutId = setTimeout(triggerPause, delayMs);
          } else {
            triggerPause();
          }
        }
      }
    }

    return () => clearTimeout(timeoutId);
  }, [currentLyricIndex, currentSong, isPlaying, countdown.lineId, countdown.clearedLineIds, isCurrentMidi, currentTime]);

  // Handle Countdown Timer and Reveal
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;
    if (countdown.isActive) {
      if (countdown.timeLeft > 0 && !countdown.isRevealing) {
        timerId = setTimeout(() => {
          setCountdown(prev => ({ ...prev, timeLeft: prev.timeLeft - 1 }));
        }, 1000);
      } else if (countdown.timeLeft === 0 && !countdown.isRevealing && !countdown.isListening) {
        if (appState?.inputMode === 'MIC') {
          setCountdown(prev => ({ ...prev, isListening: true, timeLeft: 5, liveTranscript: '' }));
          startSpeechRecognition();
        } else {
          // Switch to reveal phase for normal manual
          setCountdown(prev => ({ ...prev, isRevealing: true }));
        }
      } else if (countdown.timeLeft === 0 && countdown.isListening && !countdown.isRevealing) {
        // Run out of listening time
        handleMicResult(false);
      } else if (countdown.timeLeft === 0 && countdown.isRevealing) {
        timerId = setTimeout(() => {
          setCountdown(prev => ({
            ...prev,
            isActive: false,
            isRevealing: false,
            clearedLineIds: prev.lineId ? [...prev.clearedLineIds, prev.lineId] : prev.clearedLineIds
          }));
          if (appState?.isAutoResumeEnabled) {
            setIsPlaying(true);
            if (isCurrentMidi) {
              midiPlayer.play().catch(console.error);
            } else if (audioRef.current) {
              audioRef.current.play().catch(console.error);
            }
          }
        }, 3000); // Show reveal for 3 seconds
      }
    }
    return () => clearTimeout(timerId);
  }, [countdown.isActive, countdown.timeLeft, countdown.isRevealing, countdown.isListening, appState?.isAutoResumeEnabled, appState?.inputMode, isCurrentMidi, startSpeechRecognition, handleMicResult]);


  const restart = useCallback(() => {
    if (isCurrentMidi) {
      midiPlayer.seek(0);
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
    setCurrentTime(0);
    setMicScores([]);
    setCountdown(prev => ({ ...prev, isActive: false, isRevealing: false, clearedLineIds: [], lineId: null }));

    // Re-roll the blanked words if in Dare Mode!
    if ((appState?.gameMode === 'DARE_DRINK' || appState?.gameMode === 'JUST_DRINK' || appState?.gameMode === 'DARE') && currentSong) {
      const totalDur = duration > 0 ? duration : (currentSong.duration || 0);
      const curApp = appStateRef.current;
      setCurrentSong(prev => prev ? {
        ...prev,
        lyrics: processDareLyrics(
          prev.lyrics,
          curApp?.dareBlanksPerSong ?? 3,
          curApp?.dareMinWordLength ?? 3,
          curApp?.dareMaxWordLength ?? 10,
          curApp?.dareBlankStartPct ?? 15,
          curApp?.dareBlankEndPct ?? 85,
          totalDur
        )
      } : prev);
    }

    if (!isPlaying) {
      setIsPlaying(true);
    }
  }, [isPlaying, isCurrentMidi, appState?.gameMode, currentSong, appState?.dareBlanksPerSong, appState?.dareMinWordLength, appState?.dareMaxWordLength]);

  useEffect(() => {
    if ((appState?.gameMode === 'DARE_DRINK' || appState?.gameMode === 'JUST_DRINK' || appState?.gameMode === 'DARE')) {
      const blanks = appState.dareBlanksPerSong ?? 3;
      const minLen = appState.dareMinWordLength ?? 3;
      const maxLen = appState.dareMaxWordLength ?? 10;
      const startPct = appState.dareBlankStartPct ?? 15;
      const endPct = appState.dareBlankEndPct ?? 85;

      // Update current song instantly
      if (currentSong) {
        const totalDur = duration > 0 ? duration : (currentSong.duration || 0);
        setCurrentSong(prev => prev ? {
          ...prev,
          lyrics: processDareLyrics(prev.lyrics, blanks, minLen, maxLen, startPct, endPct, totalDur)
        } : prev);
      }

      // Update all fetched songs in playlist to prevent stale blanks
      setPlaylist(prevPlaylist =>
        prevPlaylist.map(s => s.lyrics.length > 0 ? {
          ...s,
          lyrics: processDareLyrics(s.lyrics, blanks, minLen, maxLen, startPct, endPct, s.duration || 0)
        } : s)
      );
    }
  }, [appState?.gameMode, appState?.dareBlanksPerSong, appState?.dareMinWordLength, appState?.dareMaxWordLength, appState?.dareBlankStartPct, appState?.dareBlankEndPct]);

  // Controls Map
  const play = useCallback(() => {
    setIsPlaying(true);
    if (isCurrentMidi) {
      midiPlayer.play().catch(console.error);
    }
  }, [isCurrentMidi]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (isCurrentMidi) {
      midiPlayer.pause();
    }
  }, [isCurrentMidi]);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (isCurrentMidi) {
        if (next) midiPlayer.play().catch(console.error);
        else midiPlayer.pause();
      }
      return next;
    });
  }, [isCurrentMidi]);

  const seek = useCallback((time: number) => {
    if (isCurrentMidi) {
      midiPlayer.seek(time);
      setCurrentTime(time);
    } else if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, [isCurrentMidi]);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    midiPlayer.setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
    if (vol > 0) {
      setIsMuted(false);
      midiPlayer.setMuted(false);
      if (audioRef.current) audioRef.current.muted = false;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      midiPlayer.setMuted(next);
      if (audioRef.current) audioRef.current.muted = next;
      return next;
    });
  }, []);

  const setPitch = useCallback((p: number) => {
    const clamped = Math.max(-6, Math.min(6, Math.round(p)));
    setPitchState(clamped);
    midiPlayer.setPitch(clamped);
  }, []);

  const transposeUp = useCallback(() => {
    setPitchState((prev) => {
      const next = Math.min(6, prev + 1);
      midiPlayer.setPitch(next);
      return next;
    });
  }, []);

  const transposeDown = useCallback(() => {
    setPitchState((prev) => {
      const next = Math.max(-6, prev - 1);
      midiPlayer.setPitch(next);
      return next;
    });
  }, []);

  const resetPitch = useCallback(() => {
    setPitchState(0);
    midiPlayer.setPitch(0);
  }, []);

  const setToneGuideEnabled = useCallback((enabled: boolean) => {
    setIsToneGuideEnabled(enabled);
    midiPlayer.setToneGuideEnabled(enabled);
    try {
      localStorage.setItem('dnm_tone_guide_enabled', String(enabled));
    } catch {}
  }, []);

  const toggleToneGuide = useCallback(() => {
    setIsToneGuideEnabled((prev) => {
      const next = !prev;
      midiPlayer.setToneGuideEnabled(next);
      try {
        localStorage.setItem('dnm_tone_guide_enabled', String(next));
      } catch {}
      return next;
    });
  }, []);

  const setToneGuideVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setToneGuideVolumeState(clamped);
    midiPlayer.setToneGuideVolume(clamped);
    if (clamped > 0 && !isToneGuideEnabled) {
      setIsToneGuideEnabled(true);
      midiPlayer.setToneGuideEnabled(true);
      try {
        localStorage.setItem('dnm_tone_guide_enabled', 'true');
      } catch {}
    }
    try {
      localStorage.setItem('dnm_tone_guide_volume', String(clamped));
    } catch {}
  }, [isToneGuideEnabled]);

  // Sync initial tone guide settings to midiPlayer
  useEffect(() => {
    midiPlayer.setToneGuideEnabled(isToneGuideEnabled);
    midiPlayer.setToneGuideVolume(toneGuideVolume);
  }, []);

  // Songhub Global Keyboard Shortcuts:
  // 'I' = Transpose Up (+1), 'K' = Transpose Down (-1), 'V' / 'G' = Toggle Vocal Guide Melody
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        transposeUp();
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        transposeDown();
      } else if (e.key === 'v' || e.key === 'V' || e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        toggleToneGuide();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [transposeUp, transposeDown, toggleToneGuide]);

  const prepareSongWithDareBlanks = useCallback((song: Song): Song => {
    const curApp = appStateRef.current;
    const isDare = curApp?.gameMode === 'DARE_DRINK' || curApp?.gameMode === 'JUST_DRINK' || curApp?.gameMode === 'DARE';
    if (!isDare || !song.lyrics || song.lyrics.length === 0) return song;

    const blanks = curApp?.dareBlanksPerSong ?? 3;
    const minLen = curApp?.dareMinWordLength ?? 3;
    const maxLen = curApp?.dareMaxWordLength ?? 10;
    const startPct = blankRangeRef.current.start;
    const endPct = blankRangeRef.current.end;
    const dur = song.duration || 0;

    return {
      ...song,
      lyrics: processDareLyrics(
        song.lyrics,
        blanks,
        minLen,
        maxLen,
        startPct,
        endPct,
        dur
      ),
    };
  }, []);

  const selectSong = useCallback(
    (songId: string) => {
      const song = playlist.find((s) => s.id === songId) || USER_SONGS.find((s) => s.id === songId);
      if (song) {
        setPitchState(0);
        midiPlayer.setPitch(0);
        durationRef.current = 0;
        setDuration(0);
        setCurrentSong(prepareSongWithDareBlanks(song));
        setIsPlaying(true);
      }
    },
    [playlist, prepareSongWithDareBlanks]
  );

  const nextSong = useCallback(() => {
    setPitchState(0);
    midiPlayer.setPitch(0);
    durationRef.current = 0;
    setDuration(0);
    if (songQueue.length > 0) {
      const nextQueuedSong = songQueue[0];
      setSongQueue(prev => prev.slice(1));
      setCurrentSong(prepareSongWithDareBlanks(nextQueuedSong));
      setIsPlaying(true);
      return;
    }
    if (!currentSong) return;
    const currentIndex = playlist.findIndex((s) => s.id === currentSong.id);
    const nextIndex = (currentIndex + 1) % playlist.length;
    setCurrentSong(prepareSongWithDareBlanks(playlist[nextIndex]));
    setIsPlaying(true);
  }, [currentSong, playlist, songQueue, prepareSongWithDareBlanks]);

  const addToQueue = useCallback((song: Song) => {
    setSongQueue(prev => [...prev, song]);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setSongQueue(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearQueue = useCallback(() => {
    setSongQueue([]);
  }, []);

  const prevSong = useCallback(() => {
    if (!currentSong) return;
    const currentIndex = playlist.findIndex((s) => s.id === currentSong.id);
    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    durationRef.current = 0;
    setDuration(0);
    setCurrentSong(prepareSongWithDareBlanks(playlist[prevIndex]));
    setIsPlaying(true);
  }, [currentSong, playlist, prepareSongWithDareBlanks]);

  const setLyricScale = useCallback((scale: number) => setLyricScaleState(scale), []);

  const shufflePlaylist = useCallback(() => {
    setPlaylist(prev => {
      if (prev.length <= 1) return prev;

      if (currentSong && isPlaying) {
        // Keep currently playing song at the top so audio does not skip,
        // and shuffle all remaining songs with balanced artist separation
        const remaining = prev.filter(s => s.id !== currentSong.id);
        const shuffledRemaining = shuffleWithArtistSeparation(remaining);

        const curArtist = normalizeArtistName(currentSong.artist);
        if (shuffledRemaining.length > 1 && normalizeArtistName(shuffledRemaining[0].artist) === curArtist) {
          const swapIdx = shuffledRemaining.findIndex(s => normalizeArtistName(s.artist) !== curArtist);
          if (swapIdx !== -1) {
            [shuffledRemaining[0], shuffledRemaining[swapIdx]] = [shuffledRemaining[swapIdx], shuffledRemaining[0]];
          }
        }
        return [currentSong, ...shuffledRemaining];
      }

      // If stopped or idle, fully randomize all songs and start with the new first track
      const shuffled = shuffleWithArtistSeparation(prev);
      if (shuffled.length > 0) {
        setCurrentSong(shuffled[0]);
      }
      return shuffled;
    });
  }, [currentSong, isPlaying]);

  const loadCustomSong = useCallback(
    (title: string, artist: string, lrcContent: string, audioFile?: File) => {
      const parsedLrc = parseLyrics(lrcContent);
      const audioUrl = audioFile ? URL.createObjectURL(audioFile) : undefined;
      const newSong: Song = {
        id: `custom-${Date.now()}`,
        title: title || 'Custom Karaoke Song',
        artist: artist || 'Unknown Artist',
        albumArt: DEFAULT_ALBUM_ART,
        duration: parsedLrc.lyrics.length > 0 ? parsedLrc.lyrics[parsedLrc.lyrics.length - 1].time + 15 : 180,
        audioUrl,
        lyrics: parsedLrc.lyrics,
      };

      setPlaylist((prev) => [newSong, ...prev]);
      setCurrentSong(newSong);
      setIsPlaying(true);
    },
    []
  );

  const reloadLyrics = useCallback(async () => {
    const updatedPlaylist = await Promise.all(
      playlist.map(async (song) => {
        if (!song.lyricsUrl) return song;
        try {
          const urlWithCacheBuster = `${song.lyricsUrl}${song.lyricsUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
          const parsed = await fetchAndParseLRC(urlWithCacheBuster);
          let fetchedLyrics = parsed.lyrics;
          if (appState?.gameMode === 'DARE_DRINK' || appState?.gameMode === 'JUST_DRINK' || appState?.gameMode === 'DARE') {
            fetchedLyrics = processDareLyrics(
              fetchedLyrics,
              appState.dareBlanksPerSong ?? 3,
              appState.dareMinWordLength ?? 3,
              appState.dareMaxWordLength ?? 10,
              appState.dareBlankStartPct ?? 15,
              appState.dareBlankEndPct ?? 85,
              song.duration || 0
            );
          }
          if (fetchedLyrics.length > 0) {
            return {
              ...song,
              lyrics: fetchedLyrics,
              duration: fetchedLyrics[fetchedLyrics.length - 1].time + 15,
            };
          }
        } catch (e) {
          console.error(`Failed to reload lyrics for ${song.title}:`, e);
        }
        return song;
      })
    );

    setPlaylist(updatedPlaylist);

    if (currentSong) {
      const updatedCurrentSong = updatedPlaylist.find((s) => s.id === currentSong.id);
      if (updatedCurrentSong) {
        setCurrentSong(updatedCurrentSong);
      }
    }
  }, [playlist, currentSong, appState?.gameMode, appState?.dareBlanksPerSong, appState?.dareMinWordLength, appState?.dareMaxWordLength]);

  useEffect(() => {
    const currentMode = appState?.gameMode || 'NORMAL';
    const modeConfig = appState?.modeSettings?.[currentMode];
    const disabled = modeConfig?.disabledSongs ?? appState?.disabledSongs ?? [];
    const enabled = modeConfig?.enabledSongs ?? appState?.enabledSongs ?? [];
    const isWhitelist = modeConfig?.allSongsDisabled ?? appState?.allSongsDisabled ?? (enabled.length > 0);
    const enabledSet = new Set(enabled);
    const disabledSet = new Set(disabled);
    const pool = allSongs.length > 0 ? allSongs : USER_SONGS;
    const filtered = pool.filter(song => {
      const isSongDisabled = disabledSet.has(song.id);
      const isSongEnabled = enabledSet.has(song.id);
      if (isWhitelist) {
        return isSongEnabled && !isSongDisabled;
      }
      const isDefaultHidden = song.isHiddenByDefault && !isSongEnabled;
      return !isSongDisabled && !isDefaultHidden;
    });
    // Shuffled with balanced artist separation so songs aren't in rigid alphabetical order
    const shuffled = shuffleWithArtistSeparation(filtered);
    setPlaylist(shuffled);
    if (!currentSong && shuffled.length > 0) {
      setCurrentSong(shuffled[0]);
    }
  }, [allSongs, appState?.disabledSongs, appState?.enabledSongs, appState?.allSongsDisabled, appState?.gameMode, appState?.modeSettings]);

  const setDareBlankRange = useCallback((startPct: number, endPct: number) => {
    const safeStart = Math.max(0, Math.min(95, Math.round(startPct)));
    const safeEnd = Math.max(safeStart + 5, Math.min(100, Math.round(endPct)));
    blankRangeRef.current = { start: safeStart, end: safeEnd };

    setAppState?.(prev => {
      const mode = prev.gameMode;
      const updatedModeSettings = { ...prev.modeSettings };
      if (mode) {
        updatedModeSettings[mode] = {
          ...(updatedModeSettings[mode] || {}),
          dareBlankStartPct: safeStart,
          dareBlankEndPct: safeEnd,
        };
      }
      return {
        ...prev,
        dareBlankStartPct: safeStart,
        dareBlankEndPct: safeEnd,
        modeSettings: updatedModeSettings,
      };
    });

    const curApp = appStateRef.current;
    const blanks = curApp?.dareBlanksPerSong ?? 3;
    const minLen = curApp?.dareMinWordLength ?? 3;
    const maxLen = curApp?.dareMaxWordLength ?? 10;

    // Immediately re-process blanks on currentSong
    setCurrentSong(prev => {
      if (!prev || !prev.lyrics || prev.lyrics.length === 0) return prev;
      const dur = durationRef.current > 0 ? durationRef.current : (prev.duration || 0);
      const newLyrics = processDareLyrics(
        prev.lyrics,
        blanks,
        minLen,
        maxLen,
        safeStart,
        safeEnd,
        dur
      );
      const effDur = getEffectiveDuration(dur, newLyrics);
      lastBlankSyncKeyRef.current = [prev.id, newLyrics.length, effDur.toFixed(2), safeStart, safeEnd, blanks, minLen, maxLen].join('|');
      return {
        ...prev,
        lyrics: newLyrics,
      };
    });

    // Immediately re-process blanks across all playlist songs
    setPlaylist(prevPlaylist =>
      prevPlaylist.map(song => {
        if (!song.lyrics || song.lyrics.length === 0) return song;
        return {
          ...song,
          lyrics: processDareLyrics(
            song.lyrics,
            blanks,
            minLen,
            maxLen,
            safeStart,
            safeEnd,
            song.duration || 0
          ),
        };
      })
    );
  }, [setAppState]);

  return {
    state: {
      currentSong,
      isPlaying,
      currentTime,
      duration,
      volume,
      pitch,
      isToneGuideEnabled,
      toneGuideVolume,
      currentLyricIndex,
      playlist,
      isMuted,
      countdown,
      lyricScale,
      micScores,
      allAvailableSongs: allSongs.length > 0 ? allSongs : USER_SONGS,
      songQueue,
      isLoadingCatalog,
      catalogProgress,
      catalogStatus,
      catalogLogs,
      isAudioLoading,
      audioLoadingProgress,
      songEndedCount,
    },
    controls: {
      play,
      pause,
      togglePlay,
      seek,
      setVolume,
      toggleMute,
      toggleToneGuide,
      setToneGuideEnabled,
      setToneGuideVolume,
      setPitch,
      transposeUp,
      transposeDown,
      resetPitch,
      selectSong,
      nextSong,
      prevSong,
      restart,
      setLyricScale,
      loadCustomSong,
      reloadLyrics,
      shufflePlaylist,
      addToQueue,
      removeFromQueue,
      clearQueue,
      skipCatalogLoading,
      setDareBlankRange,
    },
  };
}
