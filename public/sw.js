// Service Worker for Automate Karaoke PWA
// Caches all assets on install for full offline support

const CACHE_VERSION = 'v3';
const STATIC_CACHE = `automate-karaoke-static-${CACHE_VERSION}`;
const AUDIO_CACHE = `automate-karaoke-audio-${CACHE_VERSION}`;

// All static assets to pre-cache on install (non-audio)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/Images/Karaoke BG General.webp',
  '/Images/Karaoke BG.webp',
  '/AnimatedIcons/Cheers.json',
  '/AnimatedIcons/DareIcon.json',
  '/AnimatedIcons/MicrophoneLogo.json',
  '/AnimatedIcons/Normal.json',
  '/AnimatedIcons/People.json',
  '/sfx/5 sec timer.mp3',
  '/songs/Background/PartyLoopAudio.m4a',
  // Lyrics LRC files
  '/songs/New_Lyrics/PAROKYA_NI_EDGAR - Sorry Na.lrc',
  '/songs/New_Lyrics/PAROKYA_NI_EDGAR - Tatlong Araw.lrc',
  '/songs/New_Lyrics/PAROKYA_NI_EDGAR - The Crush.lrc',
  '/songs/New_Lyrics/PAROKYA_NI_EDGAR - The Ordertaker.lrc',
  '/songs/New_Lyrics/PAROKYA_NI_EDGAR - Your Song.lrc',
  '/songs/New_Lyrics/Parokya_Ni_Edgar - Swimming Beach.lrc',
];

// All audio files to pre-cache on install
const AUDIO_ASSETS = [
  '/songs/New_Instrumental/PAROKYA_NI_EDGAR - Sorry Na.mp3',
  '/songs/New_Instrumental/PAROKYA_NI_EDGAR - Tatlong Araw.mp3',
  '/songs/New_Instrumental/PAROKYA_NI_EDGAR - The Crush.mp3',
  '/songs/New_Instrumental/PAROKYA_NI_EDGAR - The Ordertaker.mp3',
  '/songs/New_Instrumental/PAROKYA_NI_EDGAR - Your Song.mp3',
  '/songs/New_Instrumental/Parokya_Ni_Edgar - Swimming Beach.mp3',
];

async function broadcastProgress(data) {
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage(data);
    }
  } catch (err) {
    console.warn('[SW] Failed to broadcast progress:', err);
  }
}

// ──────────────────────────────────────────────────
// INSTALL — cache all static assets, then all audio
// ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    (async () => {
      // Cache static assets first (fast)
      const staticCache = await caches.open(STATIC_CACHE);
      console.log('[SW] Pre-caching static assets...');
      await staticCache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some static assets failed to cache:', err);
      });

      // Cache audio files (large — do this in parallel batches)
      const audioCache = await caches.open(AUDIO_CACHE);
      console.log('[SW] Pre-caching audio files (this may take a while)...');

      const existingKeys = await audioCache.keys();
      let cachedCount = existingKeys.length;

      await broadcastProgress({
        type: 'DOWNLOAD_PROGRESS',
        cachedAudioCount: cachedCount,
        totalAudioCount: AUDIO_ASSETS.length,
        percent: Math.min(100, Math.round((cachedCount / AUDIO_ASSETS.length) * 100)),
        isDownloading: cachedCount < AUDIO_ASSETS.length,
        isComplete: cachedCount >= AUDIO_ASSETS.length,
      });

      const BATCH_SIZE = 3;
      for (let i = 0; i < AUDIO_ASSETS.length; i += BATCH_SIZE) {
        const batch = AUDIO_ASSETS.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
          batch.map(async (url) => {
            try {
              const cached = await audioCache.match(url);
              if (!cached) {
                const response = await fetch(url);
                if (response.ok) {
                  await audioCache.put(url, response);
                  console.log(`[SW] Cached audio: ${url}`);
                  cachedCount++;
                  await broadcastProgress({
                    type: 'DOWNLOAD_PROGRESS',
                    cachedAudioCount: cachedCount,
                    totalAudioCount: AUDIO_ASSETS.length,
                    percent: Math.min(100, Math.round((cachedCount / AUDIO_ASSETS.length) * 100)),
                    currentFile: decodeURIComponent(url.split('/').pop() || ''),
                    isDownloading: cachedCount < AUDIO_ASSETS.length,
                    isComplete: cachedCount >= AUDIO_ASSETS.length,
                  });
                }
              }
            } catch (err) {
              console.warn(`[SW] Failed to cache audio: ${url}`, err);
            }
          })
        );
      }

      await broadcastProgress({
        type: 'DOWNLOAD_PROGRESS',
        cachedAudioCount: cachedCount,
        totalAudioCount: AUDIO_ASSETS.length,
        percent: Math.min(100, Math.round((cachedCount / AUDIO_ASSETS.length) * 100)),
        isDownloading: false,
        isComplete: true,
      });

      console.log('[SW] All assets cached. Activating immediately...');
      await self.skipWaiting();
    })()
  );
});

// ──────────────────────────────────────────────────
// ACTIVATE — clean up old caches
// ──────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      const validCaches = [STATIC_CACHE, AUDIO_CACHE];
      await Promise.all(
        cacheNames
          .filter((name) => !validCaches.includes(name))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
      // Take control of all open clients immediately
      await self.clients.claim();
      console.log('[SW] Active and controlling.');
    })()
  );
});

// ──────────────────────────────────────────────────
// FETCH — serve from cache first, network fallback
// ──────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // For audio files — cache-first, network fallback with caching
  if (url.pathname.startsWith('/songs/New_Instrumental/') || url.pathname.startsWith('/songs/audio/')) {
    event.respondWith(
      (async () => {
        const audioCache = await caches.open(AUDIO_CACHE);
        const cached = await audioCache.match(event.request);
        if (cached) return cached;

        // Not in cache — fetch and cache it
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            await audioCache.put(event.request, response.clone());
          }
          return response;
        } catch {
          return new Response('Audio unavailable offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // For navigation (HTML page) — network first with ok check, then cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request);
          // Only serve network response if it was genuinely successful (not a Cloudflare 530/502/1033 error page)
          if (networkResponse && networkResponse.ok) {
            const staticCache = await caches.open(STATIC_CACHE);
            staticCache.put(event.request, networkResponse.clone());
            return networkResponse;
          }
          throw new Error(`Server returned status ${networkResponse.status}`);
        } catch {
          // Tunnel is offline or network is down — serve the cached app shell immediately
          const staticCache = await caches.open(STATIC_CACHE);
          const cached = await staticCache.match('/index.html') || await staticCache.match('/');
          return cached || new Response('App is offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // For everything else — cache-first, network fallback
  event.respondWith(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      const cached = await staticCache.match(event.request);
      if (cached) return cached;

      try {
        const response = await fetch(event.request);
        if (response.ok) {
          if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/src/')) {
            staticCache.put(event.request, response.clone());
          }
          return response;
        }
        throw new Error(`Asset fetch status ${response.status}`);
      } catch {
        return new Response('Resource unavailable offline', { status: 503 });
      }
    })()
  );
});

// ──────────────────────────────────────────────────
// MESSAGE — handle update checks and cache status
// ──────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'GET_CACHE_STATUS') {
    (async () => {
      try {
        const audioCache = await caches.open(AUDIO_CACHE);
        const keys = await audioCache.keys();
        const count = keys.length;
        const total = AUDIO_ASSETS.length;
        const statusData = {
          type: 'DOWNLOAD_PROGRESS',
          cachedAudioCount: count,
          totalAudioCount: total,
          percent: total > 0 ? Math.min(100, Math.round((count / total) * 100)) : 100,
          isDownloading: count < total,
          isComplete: count >= total,
        };

        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage(statusData);
        } else {
          broadcastProgress(statusData);
        }
      } catch (err) {
        console.warn('[SW] Failed to get cache status:', err);
      }
    })();
  }
});
