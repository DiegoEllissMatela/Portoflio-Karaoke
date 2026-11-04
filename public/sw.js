// Service Worker for DNM Karaoke PWA
// Provides offline caching for core assets, soundfonts, and songs

const CACHE_VERSION = 'v4';
const STATIC_CACHE = `dnm-karaoke-static-${CACHE_VERSION}`;
const AUDIO_CACHE = `dnm-karaoke-audio-${CACHE_VERSION}`;

// Static shell and UI assets to pre-cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/Images/cover-1.svg',
  '/Images/cover-2.svg',
  '/Images/cover-3.svg',
  '/Images/cover-4.svg',
  '/Images/cover-default.svg',
  '/AnimatedIcons/Cheers.json',
  '/AnimatedIcons/DareIcon.json',
  '/AnimatedIcons/MicrophoneLogo.json',
  '/AnimatedIcons/Normal.json',
  '/AnimatedIcons/People.json',
  '/sfx/5 sec timer.mp3',
  '/songs/web_catalog.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      await staticCache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some static assets failed to pre-cache:', err);
      });
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      const validCaches = [STATIC_CACHE, AUDIO_CACHE];
      await Promise.all(
        cacheNames
          .filter((name) => !validCaches.includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Never intercept API routes or local backend endpoints
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // MIDI files and SoundFont files — Cache-first with background network filling
  if (
    url.pathname.startsWith('/songs/songs/') ||
    url.pathname.startsWith('/soundfont/') ||
    url.pathname.endsWith('.mid') ||
    url.pathname.endsWith('.sf2')
  ) {
    event.respondWith(
      (async () => {
        const audioCache = await caches.open(AUDIO_CACHE);
        const cached = await audioCache.match(event.request);
        if (cached) return cached;

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.ok) {
            audioCache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return new Response('Audio asset unavailable offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Navigation requests — Network-first, fallback to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.ok) {
            const staticCache = await caches.open(STATIC_CACHE);
            staticCache.put(event.request, networkResponse.clone());
            return networkResponse;
          }
          throw new Error(`Server returned status ${networkResponse.status}`);
        } catch {
          const staticCache = await caches.open(STATIC_CACHE);
          const cached = (await staticCache.match(event.request)) || (await staticCache.match('/index.html'));
          if (cached) return cached;
          return new Response('Offline: Please connect to the internet to load DNM Karaoke.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
      })()
    );
    return;
  }

  // Static assets (CSS, JS, images, icons, web_catalog.json) — Cache-first, network fallback
  event.respondWith(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      const cached = await staticCache.match(event.request);
      if (cached) return cached;

      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.ok) {
          staticCache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        return new Response('Asset not found', { status: 404 });
      }
    })()
  );
});
