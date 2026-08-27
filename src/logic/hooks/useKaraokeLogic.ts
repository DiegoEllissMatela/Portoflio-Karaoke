import { useState, useEffect, useRef, useCallback } from 'react';
import type { Song, KaraokeState, AudioControls, AppState, LyricLine } from '../types/logicTypes';
import { fetchAndParseLRC, parseJSONLyrics } from '../utils/lrcParser';

// Auto-discover audio and lyric files in the public directory
const audioFiles = import.meta.glob('/public/songs/audio/*.{mp3,m4a,wav,ogg}');
const lyricFiles = import.meta.glob('/public/songs/lyrics/*.json');

export const USER_SONGS: Song[] = [];

Object.keys(audioFiles).forEach((audioPath, index) => {
  const filename = audioPath.split('/').pop()?.replace(/\.(mp3|m4a|wav|ogg)$/i, '');
  if (!filename) return;

  // Case-insensitive match for lyrics
  const matchingLyricKey = Object.keys(lyricFiles).find(lyricPath => {
    const lyricFilename = lyricPath.split('/').pop()?.replace(/\.json$/i, '');
    return lyricFilename?.toLowerCase() === filename.toLowerCase();
  });

  // Known title-first overrides for local filenaming conventions
  const knownTitleFirst: Record<string, { title: string; artist: string }> = {
    'harana parokya ni edgar': { title: 'Harana', artist: 'Parokya ni Edgar' },
    'torete moonstar88': { title: 'Torete', artist: 'Moonstar88' },
    'parokya halaga': { title: 'Halaga', artist: 'Parokya ni Edgar' },
    'check list': { title: 'Checklist', artist: 'Unknown' },
  };

  let cleanFilename = filename;
  let isHiddenByDefault = false;
  if (cleanFilename.toLowerCase().endsWith('-u')) {
    isHiddenByDefault = true;
    cleanFilename = cleanFilename.slice(0, -2).trim();
  }

  let title = cleanFilename;
  let artist = 'Unknown Artist';
  const lowerFilename = cleanFilename.toLowerCase().trim();

  if (knownTitleFirst[lowerFilename]) {
    title = knownTitleFirst[lowerFilename].title;
    artist = knownTitleFirst[lowerFilename].artist;
  } else if (cleanFilename.includes(' - ')) {
    const parts = cleanFilename.split(' - ');
    artist = parts[0].replace(/-/g, ' ').trim();
    title = parts[1].trim();
  } else if (cleanFilename.includes(' ')) {
    const parts = cleanFilename.split(' ');
    artist = parts[0].replace(/-/g, ' ').trim();
    title = parts.slice(1).join(' ').trim();
  }

  // Assign alternating placeholder art
  const albumArts = [
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1493225457124-a1a2a5f5f9af?auto=format&fit=crop&w=600&q=80'
  ];

  USER_SONGS.push({
    id: filename.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title,
    artist,
    albumArt: albumArts[index % albumArts.length],
    duration: 0,
    audioUrl: audioPath.replace('/public', ''),
    lyricsUrl: matchingLyricKey ? matchingLyricKey.replace('/public', '') : '',
    lyrics: [],
    isHiddenByDefault,
  });
});

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

function processDareLyrics(lyrics: LyricLine[], blanksPerSong: number, minLength: number, maxLength: number): LyricLine[] {
  const processed = lyrics.map(l => ({ ...l, blankedWords: [] as string[] }));
  const candidates: { lineIdx: number, word: string }[] = [];
  let globalWordCount = 0;

  processed.forEach((line, lineIdx) => {
    const words = line.text.split(/\s+/);
    words.forEach(word => {
      if (word.trim().length > 0) {
        globalWordCount++;
        const strippedWord = word.replace(/[^a-zA-Z0-9]/g, '');
        if (globalWordCount > 4 && strippedWord.length >= minLength && strippedWord.length <= maxLength) {
          candidates.push({ lineIdx, word });
        }
      }
    });
  });

  const selected = [];
  for (let i = 0; i < blanksPerSong && candidates.length > 0; i++) {
    const randIdx = Math.floor(Math.random() * candidates.length);
    selected.push(candidates[randIdx]);
    candidates.splice(randIdx, 1);
  }

  selected.forEach(cand => {
    processed[cand.lineIdx].blankedWords!.push(cand.word.toLowerCase().replace(/[^a-z0-9]/g, ''));
  });

  return processed;
}

export function useKaraokeLogic(appState?: AppState): { state: KaraokeState; controls: AudioControls } {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const requestRef = useRef<number | null>(null);
  const isMicScoringRef = useRef<boolean>(false);

  const [playlist, setPlaylist] = useState<Song[]>(() => {
    const disabled = appState?.disabledSongs || [];
    const enabled = appState?.enabledSongs || [];
    return [...USER_SONGS].filter(song => {
      const isDefaultHidden = song.isHiddenByDefault && !enabled.includes(song.id);
      return !disabled.includes(song.id) && !isDefaultHidden;
    });
  });
  const [currentSong, setCurrentSong] = useState<Song | null>(playlist.length > 0 ? playlist[0] : null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [pitch, setPitchState] = useState<number>(0);
  const [lyricScale, setLyricScaleState] = useState<number>(1);
  const [currentLyricIndex, setCurrentLyricIndex] = useState<number>(-1);
  const [micScores, setMicScores] = useState<boolean[]>([]);
  const [countdown, setCountdown] = useState<{ isActive: boolean; timeLeft: number; lineId: string | null; isRevealing: boolean; clearedLineIds: string[]; isListening?: boolean; liveTranscript?: string }>({
    isActive: false,
    timeLeft: 5,
    lineId: null,
    isRevealing: false,
    clearedLineIds: [],
  });

  // Initialize Audio Element
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.volume = volume;
    audio.muted = isMuted;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
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
    const expectedWord = line?.blankedWords?.[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';

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
      const hasMatch = words.some(word => {
        if (word === expectedWord) return true;
        if ((word.includes(expectedWord) || expectedWord.includes(word)) && Math.abs(word.length - expectedWord.length) <= 3) {
          return true;
        }
        return levenshtein(word, expectedWord) <= maxAllowedDistance;
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

      if (currentSong.lyrics.length === 0 && currentSong.lyricsUrl) {
        const parsed = await fetchAndParseLRC(currentSong.lyricsUrl);
        let fetchedLyrics = parsed.lyrics;

        if (appState?.gameMode === 'DARE_DRINK' || appState?.gameMode === 'DARE') {
          fetchedLyrics = processDareLyrics(
            fetchedLyrics,
            appState.dareBlanksPerSong ?? 3,
            appState.dareMinWordLength ?? 3,
            appState.dareMaxWordLength ?? 10
          );
        }

        setCurrentSong(prev => prev ? { ...prev, lyrics: fetchedLyrics } : null);

        // Update playlist with fetched lyrics to avoid refetching
        setPlaylist(prevPlaylist =>
          prevPlaylist.map(s => s.id === currentSong.id ? { ...s, lyrics: fetchedLyrics } : s)
        );
      }

      if (currentSong.audioUrl) {
        // Compare src efficiently
        if (audio.src !== window.location.origin + currentSong.audioUrl && !audio.src.endsWith(currentSong.audioUrl)) {
          audio.src = currentSong.audioUrl;
          audio.load();
        }
      } else {
        audio.removeAttribute('src');
      }

      setCurrentTime(0);
      setDuration(currentSong.duration || 0);
      setMicScores([]);
      setCountdown(prev => ({ ...prev, isActive: false, isRevealing: false, lineId: null, clearedLineIds: [], isListening: false, liveTranscript: '' }));

      if (isPlaying) {
        audio.play().catch(e => console.error("Playback failed:", e));
      }
    };

    loadSong();
  }, [currentSong?.id, appState?.gameMode, appState?.dareBlanksPerSong, appState?.dareMinWordLength, appState?.dareMaxWordLength]); // Only re-run when song changes or dare settings change

  // RequestAnimationFrame loop
  const updateLoop = useCallback(() => {
    if (!audioRef.current) return;

    // Only update if playing or explicitly requested
    const newTime = audioRef.current.currentTime;
    setCurrentTime(newTime);

    if (isPlaying) {
      requestRef.current = requestAnimationFrame(updateLoop);
    }
  }, [isPlaying]);

  // Handle play/pause side effects
  useEffect(() => {
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
  }, [isPlaying, updateLoop]);

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

          // Calculate proportional delay (slightly adjusted so it pauses *just* before the word)
          const proportion = Math.max(0, (wordIndex / lineLength) - 0.05);
          const targetTime = activeLine.time + (proportion * lineDuration);

          let delayMs = 0;
          if (audioRef.current) {
            delayMs = (targetTime - audioRef.current.currentTime) * 1000;
          }

          const triggerPause = () => {
            setIsPlaying(false);
            setCountdown(prev => ({ ...prev, isActive: true, timeLeft: 5, lineId: activeLine.id, isRevealing: false }));
            if (timerAudioRef.current) {
              timerAudioRef.current.currentTime = 0;
              timerAudioRef.current.play().catch(console.error);
            }
          };

          if (delayMs > 0) {
            timeoutId = setTimeout(triggerPause, delayMs);
          } else {
            triggerPause();
          }
        }
      }
    }

    return () => clearTimeout(timeoutId);
  }, [currentLyricIndex, currentSong, isPlaying, countdown.lineId, countdown.clearedLineIds]);

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
          }
        }, 3000); // Show reveal for 3 seconds
      }
    }
    return () => clearTimeout(timerId);
  }, [countdown.isActive, countdown.timeLeft, countdown.isRevealing, countdown.isListening, appState?.isAutoResumeEnabled, appState?.inputMode, startSpeechRecognition, handleMicResult]);


  const restart = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      setMicScores([]);
      setCountdown(prev => ({ ...prev, isActive: false, isRevealing: false, clearedLineIds: [], lineId: null }));

      // Re-roll the blanked words if in Dare Mode!
      if ((appState?.gameMode === 'DARE_DRINK' || appState?.gameMode === 'DARE') && currentSong) {
        setCurrentSong(prev => prev ? { 
          ...prev, 
          lyrics: processDareLyrics(
            prev.lyrics,
            appState.dareBlanksPerSong ?? 3,
            appState.dareMinWordLength ?? 3,
            appState.dareMaxWordLength ?? 10
          ) 
        } : prev);
      }

      if (!isPlaying) {
        setIsPlaying(true);
      }
    }
  }, [isPlaying, appState?.gameMode, currentSong, appState?.dareBlanksPerSong, appState?.dareMinWordLength, appState?.dareMaxWordLength]);

  useEffect(() => {
    if ((appState?.gameMode === 'DARE_DRINK' || appState?.gameMode === 'DARE')) {
      const blanks = appState.dareBlanksPerSong ?? 3;
      const minLen = appState.dareMinWordLength ?? 3;
      const maxLen = appState.dareMaxWordLength ?? 10;

      // Update current song instantly
      if (currentSong) {
        setCurrentSong(prev => prev ? { 
          ...prev, 
          lyrics: processDareLyrics(prev.lyrics, blanks, minLen, maxLen) 
        } : prev);
      }

      // Update all fetched songs in playlist to prevent stale blanks
      setPlaylist(prevPlaylist => 
        prevPlaylist.map(s => s.lyrics.length > 0 ? { 
          ...s, 
          lyrics: processDareLyrics(s.lyrics, blanks, minLen, maxLen) 
        } : s)
      );
    }
  }, [appState?.gameMode, appState?.dareBlanksPerSong, appState?.dareMinWordLength, appState?.dareMaxWordLength]);

  // Controls Map
  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const togglePlay = useCallback(() => setIsPlaying((prev) => !prev), []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
    if (vol > 0) {
      setIsMuted(false);
      if (audioRef.current) audioRef.current.muted = false;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (audioRef.current) audioRef.current.muted = next;
      return next;
    });
  }, []);

  const setPitch = useCallback((p: number) => {
    setPitchState(p);
  }, []);

  const selectSong = useCallback(
    (songId: string) => {
      const song = playlist.find((s) => s.id === songId);
      if (song) {
        setCurrentSong(song);
        setIsPlaying(true);
      }
    },
    [playlist]
  );

  const nextSong = useCallback(() => {
    if (!currentSong) return;
    const currentIndex = playlist.findIndex((s) => s.id === currentSong.id);
    const nextIndex = (currentIndex + 1) % playlist.length;
    setCurrentSong(playlist[nextIndex]);
    setIsPlaying(true);
  }, [currentSong, playlist]);

  const prevSong = useCallback(() => {
    if (!currentSong) return;
    const currentIndex = playlist.findIndex((s) => s.id === currentSong.id);
    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    setCurrentSong(playlist[prevIndex]);
    setIsPlaying(true);
  }, [currentSong, playlist]);

  const setLyricScale = useCallback((scale: number) => setLyricScaleState(scale), []);

  const shufflePlaylist = useCallback(() => {
    setPlaylist(prev => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    });
  }, []);

  const loadCustomSong = useCallback(
    (title: string, artist: string, lrcContent: string, audioFile?: File) => {
      const parsedLrc = parseJSONLyrics(lrcContent);
      const audioUrl = audioFile ? URL.createObjectURL(audioFile) : undefined;
      const newSong: Song = {
        id: `custom-${Date.now()}`,
        title: title || 'Custom Karaoke Song',
        artist: artist || 'Unknown Artist',
        albumArt: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
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
          if (appState?.gameMode === 'DARE_DRINK' || appState?.gameMode === 'DARE') {
            fetchedLyrics = processDareLyrics(
              fetchedLyrics,
              appState.dareBlanksPerSong ?? 3,
              appState.dareMinWordLength ?? 3,
              appState.dareMaxWordLength ?? 10
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
    setPlaylist(() => {
      const disabled = appState?.disabledSongs || [];
      const enabled = appState?.enabledSongs || [];
      return [...USER_SONGS].filter(song => {
        const isDefaultHidden = song.isHiddenByDefault && !enabled.includes(song.id);
        return !disabled.includes(song.id) && !isDefaultHidden;
      });
    });
  }, [appState?.disabledSongs, appState?.enabledSongs, appState?.gameMode]);


  return {
    state: {
      currentSong,
      isPlaying,
      currentTime,
      duration,
      volume,
      pitch,
      currentLyricIndex,
      playlist,
      isMuted,
      countdown,
      lyricScale,
      micScores,
      allAvailableSongs: USER_SONGS,
    },
    controls: {
      play,
      pause,
      togglePlay,
      seek,
      setVolume,
      toggleMute,
      setPitch,
      selectSong,
      nextSong,
      prevSong,
      restart,
      setLyricScale,
      loadCustomSong,
      reloadLyrics,
      shufflePlaylist,
    },
  };
}
