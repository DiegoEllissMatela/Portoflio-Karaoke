import { useState, useEffect, useCallback } from 'react';

export interface DownloadProgressState {
  cachedAudioCount: number;
  totalAudioCount: number;
  percent: number;
  isDownloading: boolean;
  isComplete: boolean;
  currentFile: string | null;
  isSupported: boolean;
}

const TOTAL_AUDIO_ESTIMATE = 6; // Matches default AUDIO_ASSETS length in sw.js
const AUDIO_CACHE_NAME = 'automate-karaoke-audio-v3';

export function useDownloadProgress(): DownloadProgressState {
  const [state, setState] = useState<DownloadProgressState>({
    cachedAudioCount: 0,
    totalAudioCount: TOTAL_AUDIO_ESTIMATE,
    percent: 0,
    isDownloading: false,
    isComplete: false,
    currentFile: null,
    isSupported: typeof window !== 'undefined' && 'serviceWorker' in navigator && 'caches' in window,
  });

  const checkDirectCache = useCallback(async () => {
    if (typeof window === 'undefined' || !('caches' in window)) return;
    try {
      const hasCache = await window.caches.has(AUDIO_CACHE_NAME);
      if (!hasCache) return;

      const cache = await window.caches.open(AUDIO_CACHE_NAME);
      const keys = await cache.keys();
      const cachedCount = keys.length;
      const total = state.totalAudioCount || TOTAL_AUDIO_ESTIMATE;
      const percent = Math.min(100, Math.round((cachedCount / total) * 100));
      const complete = cachedCount >= total;

      setState((prev) => ({
        ...prev,
        cachedAudioCount: cachedCount,
        percent,
        isDownloading: !complete && cachedCount > 0,
        isComplete: complete,
      }));
    } catch (err) {
      console.warn('[useDownloadProgress] Error inspecting CacheStorage:', err);
    }
  }, [state.totalAudioCount]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // Check direct browser CacheStorage immediately
    checkDirectCache();

    // Listen to messages broadcast from sw.js
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DOWNLOAD_PROGRESS' || event.data?.type === 'CACHE_STATUS') {
        const {
          cachedAudioCount = 0,
          totalAudioCount = TOTAL_AUDIO_ESTIMATE,
          percent = 0,
          isDownloading = false,
          isComplete = false,
          currentFile = null,
        } = event.data;

        setState({
          cachedAudioCount,
          totalAudioCount,
          percent,
          isDownloading: isDownloading || (!isComplete && cachedAudioCount > 0 && cachedAudioCount < totalAudioCount),
          isComplete: isComplete || (totalAudioCount > 0 && cachedAudioCount >= totalAudioCount),
          currentFile,
          isSupported: true,
        });
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);

    // Ask Service Worker for current cache status
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'GET_CACHE_STATUS' });
    }

    // Check every 3 seconds while not complete
    const interval = setInterval(() => {
      checkDirectCache();
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'GET_CACHE_STATUS' });
      }
    }, 3000);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      clearInterval(interval);
    };
  }, [checkDirectCache]);

  return state;
}
