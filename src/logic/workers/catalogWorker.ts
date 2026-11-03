import type { Song } from '../types/logicTypes';

const DB_NAME = 'AutomateKaraokeDB_v5';
const DB_VERSION = 1;
const STORE_NAME = 'songs';

function encodeSongPath(filename: string): string {
  if (!filename) return '';
  return encodeURI(filename).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

const albumArts = [
  '/Images/cover-1.svg',
  '/Images/cover-2.svg',
  '/Images/cover-3.svg',
  '/Images/cover-4.svg',
  '/Images/cover-default.svg'
];

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);

    const timeout = setTimeout(() => {
      console.warn('[Worker] IndexedDB open timeout (1000ms), continuing with in-memory storage');
      resolve(null);
    }, 1000);

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        clearTimeout(timeout);
        resolve(request.result);
      };
      request.onerror = () => {
        clearTimeout(timeout);
        resolve(null);
      };
      request.onblocked = () => {
        clearTimeout(timeout);
        resolve(null);
      };
    } catch {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

async function getAllFromDB(db: IDBDatabase): Promise<Song[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list: Song[] = req.result || [];
        // Sanitize any stale external unsplash URLs to local vector covers
        for (let i = 0; i < list.length; i++) {
          if (!list[i].albumArt || list[i].albumArt?.includes('unsplash.com')) {
            list[i].albumArt = albumArts[i % albumArts.length];
          }
        }
        resolve(list);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function bulkInsert(db: IDBDatabase, songs: Song[]): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (let i = 0; i < songs.length; i++) {
        store.put(songs[i]);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

function tuplesToSongs(tuples: any[][]): Song[] {
  const count = tuples.length;
  const songs: Song[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const t = tuples[i];
    const id = t[0];
    const title = t[1];
    const artist = t[2];
    const isHidden = Boolean(t[5]);
    const searchKey = `${title} ${artist}`.toLowerCase();

    // Use MIDI file (index 6) from /songs/songs/ as the primary audio source.
    // The .opus instrumental (index 3) and .lrc lyrics (index 4) files are not
    // present in the local /songs/songs/ folder — only .mid files are available.
    const midiFile = t[6] as string;
    const midiUrl = midiFile
      ? `/songs/songs/${encodeSongPath(midiFile)}`
      : undefined;

    songs[i] = {
      id,
      title,
      artist,
      albumArt: albumArts[i % albumArts.length],
      duration: 0,
      audioUrl: midiUrl,   // Point audioUrl to the MIDI file as well
      midiUrl,
      lyricsUrl: '',        // No .lrc files available in /songs/songs/
      lyrics: [],
      isHiddenByDefault: isHidden,
      searchKey,
    };
  }
  return songs;
}

// Worker message listener
self.onmessage = async (e: MessageEvent) => {
  if (e.data?.action === 'LOAD_CATALOG') {
    try {
      // 1. Fast path: Check IndexedDB offline storage first for instant startup (<100ms)
      const db = await openDB();
      if (db) {
        const cachedSongs = await getAllFromDB(db);
        if (cachedSongs && cachedSongs.length > 0) {
          self.postMessage({
            type: 'PROGRESS',
            progress: 100,
            status: `Library ready (${cachedSongs.length.toLocaleString()} tracks)`,
            log: `Loaded ${cachedSongs.length.toLocaleString()} tracks instantly from local cache.`
          });
          self.postMessage({ type: 'SUCCESS', songs: cachedSongs });
          return;
        }
      }

      // 2. Cold path: Fetch catalog JSON from server
      self.postMessage({
        type: 'PROGRESS',
        progress: 15,
        status: 'Fetching 48,000 song catalog...',
        log: 'Downloading catalog.json stream...'
      });

      let rawTuples: any[][] | null = null;
      try {
        const response = await fetch('/songs/catalog.json');
        if (response.ok) {
          const contentLength = Number(response.headers.get('content-length')) || 8900000;
          const reader = response.body?.getReader();

          if (reader) {
            let receivedBytes = 0;
            const chunks: Uint8Array[] = [];
            let lastUpdate = Date.now();

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                chunks.push(value);
                receivedBytes += value.length;
                const now = Date.now();
                // Throttle UI progress messages to max 10 times/sec to avoid flooding React main thread
                if (now - lastUpdate > 100) {
                  lastUpdate = now;
                  const percent = Math.min(80, Math.round((receivedBytes / contentLength) * 80));
                  const mbRec = (receivedBytes / (1024 * 1024)).toFixed(1);
                  self.postMessage({
                    type: 'PROGRESS',
                    progress: percent,
                    status: `Downloading song definitions: ${mbRec} MB`,
                    log: `Streamed ${mbRec} MB...`
                  });
                }
              }
            }

            self.postMessage({
              type: 'PROGRESS',
              progress: 85,
              status: 'Parsing song definitions...',
              log: 'Deserializing JSON catalog...'
            });

            const total = new Uint8Array(receivedBytes);
            let offset = 0;
            for (const chunk of chunks) {
              total.set(chunk, offset);
              offset += chunk.length;
            }
            const text = new TextDecoder('utf-8').decode(total);
            rawTuples = JSON.parse(text);
          } else {
            rawTuples = await response.json();
          }
        }
      } catch (fetchErr: any) {
        self.postMessage({
          type: 'PROGRESS',
          progress: 50,
          status: 'Network fetch failed, retrying cache...',
          log: `Fetch error: ${fetchErr?.message || 'network failed'}`
        });
      }

      // If fetched catalog successfully, hydrate, send to UI, and cache in background
      if (rawTuples && Array.isArray(rawTuples)) {
        self.postMessage({
          type: 'PROGRESS',
          progress: 95,
          status: `Hydrating ${rawTuples.length.toLocaleString()} songs...`,
          log: `Constructing song models...`
        });
        const songs = tuplesToSongs(rawTuples);

        self.postMessage({
          type: 'PROGRESS',
          progress: 100,
          status: `Library ready (${songs.length.toLocaleString()} tracks)`,
          log: `Catalog ready (${songs.length.toLocaleString()} tracks)`
        });
        self.postMessage({ type: 'SUCCESS', songs });

        // Update IndexedDB cache asynchronously in the background
        if (db) {
          bulkInsert(db, songs).catch(saveErr => {
            console.warn('[Worker] Background cache update warning:', saveErr);
          });
        }
        return;
      }

      // Fallback
      if (db) {
        const cachedSongs = await getAllFromDB(db);
        if (cachedSongs && cachedSongs.length > 0) {
          self.postMessage({
            type: 'PROGRESS',
            progress: 100,
            status: `Offline library ready (${cachedSongs.length.toLocaleString()} tracks)`,
            log: `Loaded ${cachedSongs.length.toLocaleString()} tracks from cache`
          });
          self.postMessage({ type: 'SUCCESS', songs: cachedSongs });
          return;
        }
      }

      throw new Error('Failed to load songs from network and no offline cache available');
    } catch (err: any) {
      console.error('[Worker] Catalog load failed:', err);
      self.postMessage({
        type: 'ERROR',
        message: err?.message || 'Failed to load songs',
        log: `Error: ${err?.message || 'Failed to load songs'}`
      });
    }
  }
};
