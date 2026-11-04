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
      audioUrl: midiUrl,
      midiUrl,
      lyricsUrl: '',
      lyrics: [],
      isHiddenByDefault: isHidden,
      searchKey,
    };
  }
  return songs;
}

self.onmessage = async (e: MessageEvent) => {
  if (e.data?.action === 'LOAD_CATALOG') {
    const isLocal = Boolean(e.data?.isLocal);

    try {
      const db = await openDB();

      // 1. Fast path: check offline cache
      if (db) {
        const cachedSongs = await getAllFromDB(db);
        if (cachedSongs && cachedSongs.length > 0) {
          // If we are on static web hosting, avoid using a stale local 48k cache
          if (!isLocal && cachedSongs.length > 500) {
            // Skip 48k cache on web; fall through to web_catalog.json
          } else {
            self.postMessage({
              type: 'STAGE_1_SUCCESS',
              songs: cachedSongs,
              status: `Library ready (${cachedSongs.length.toLocaleString()} tracks)`,
              log: `Loaded ${cachedSongs.length.toLocaleString()} tracks instantly from cache.`
            });
            self.postMessage({
              type: 'SUCCESS',
              songs: cachedSongs,
              isFull: cachedSongs.length > 500
            });
            return;
          }
        }
      }

      // 2. Stage 1: Load lightweight curated web catalog (<150ms)
      self.postMessage({
        type: 'PROGRESS',
        progress: 20,
        status: 'Loading curated song collection...',
        log: 'Fetching /songs/web_catalog.json...'
      });

      let stage1Songs: Song[] = [];
      try {
        const webRes = await fetch('/songs/web_catalog.json');
        if (webRes.ok) {
          const webTuples = await webRes.json();
          stage1Songs = tuplesToSongs(webTuples);
          self.postMessage({
            type: 'STAGE_1_SUCCESS',
            songs: stage1Songs,
            status: `Library ready (${stage1Songs.length.toLocaleString()} tracks)`,
            log: `Loaded curated web catalog (${stage1Songs.length.toLocaleString()} tracks).`
          });
        }
      } catch (webErr: any) {
        console.warn('[Worker] Web catalog fetch warning:', webErr);
      }

      // If on static web hosting (Vercel), Stage 1 is the complete library
      if (!isLocal) {
        if (stage1Songs.length > 0) {
          self.postMessage({
            type: 'PROGRESS',
            progress: 100,
            status: `Library ready (${stage1Songs.length.toLocaleString()} tracks)`,
            log: `Web library initialized with ${stage1Songs.length.toLocaleString()} curated tracks.`
          });
          self.postMessage({ type: 'SUCCESS', songs: stage1Songs, isFull: false });
          if (db) {
            bulkInsert(db, stage1Songs).catch(() => {});
          }
          return;
        }
      }

      // 3. Stage 2 (Local environment only): Background stream & parse full 48k catalog
      self.postMessage({
        type: 'PROGRESS',
        progress: 30,
        status: 'Loading full 48,000 song library in background...',
        log: 'Streaming catalog.json...'
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
                if (now - lastUpdate > 150) {
                  lastUpdate = now;
                  const percent = Math.min(85, Math.round(30 + (receivedBytes / contentLength) * 55));
                  const mbRec = (receivedBytes / (1024 * 1024)).toFixed(1);
                  self.postMessage({
                    type: 'PROGRESS',
                    progress: percent,
                    status: `Downloading song library: ${mbRec} MB`,
                    log: `Streamed ${mbRec} MB...`
                  });
                }
              }
            }

            self.postMessage({
              type: 'PROGRESS',
              progress: 90,
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
          status: 'Local full catalog not available, keeping curated collection.',
          log: `Full catalog fetch: ${fetchErr?.message || 'skipped'}`
        });
      }

      if (rawTuples && Array.isArray(rawTuples)) {
        self.postMessage({
          type: 'PROGRESS',
          progress: 98,
          status: `Hydrating ${rawTuples.length.toLocaleString()} songs...`,
          log: `Constructing song models...`
        });
        const fullSongs = tuplesToSongs(rawTuples);

        self.postMessage({
          type: 'PROGRESS',
          progress: 100,
          status: `Full library ready (${fullSongs.length.toLocaleString()} tracks)`,
          log: `Full catalog ready (${fullSongs.length.toLocaleString()} tracks).`
        });
        self.postMessage({ type: 'SUCCESS', songs: fullSongs, isFull: true });

        if (db) {
          bulkInsert(db, fullSongs).catch(err => {
            console.warn('[Worker] Cache update warning:', err);
          });
        }
        return;
      }

      // If full fetch failed but we have stage1 songs, succeed with stage 1
      if (stage1Songs.length > 0) {
        self.postMessage({
          type: 'PROGRESS',
          progress: 100,
          status: `Library ready (${stage1Songs.length.toLocaleString()} tracks)`,
          log: `Ready with ${stage1Songs.length.toLocaleString()} curated tracks.`
        });
        self.postMessage({ type: 'SUCCESS', songs: stage1Songs, isFull: false });
        return;
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
