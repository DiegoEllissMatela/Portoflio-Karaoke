import type { Song } from '../types/logicTypes';
import { LOCAL_ALBUM_COVERS, DEFAULT_ALBUM_ART } from '../utils/albumArtUtils';
import { isLocalEnvironment } from '../utils/environmentUtils';

export type CatalogProgressCallback = (progress: number, status: string, log?: string) => void;
export type FullCatalogReadyCallback = (songs: Song[]) => void;

const DB_NAME = 'AutomateKaraokeDB_v5';
const DB_VERSION = 1;
const STORE_NAME = 'songs';

function encodeSongPath(filename: string): string {
  if (!filename) return '';
  return encodeURI(filename).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

const albumArts = [
  ...LOCAL_ALBUM_COVERS,
  DEFAULT_ALBUM_ART
];

let inMemorySongs: Song[] = [];
let isCatalogLoaded = false;
let catalogLoadingPromise: Promise<Song[]> | null = null;
const activityLogs: string[] = [];

function recordLog(msg: string): string {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] ${msg}`;
  activityLogs.push(line);
  if (activityLogs.length > 50) activityLogs.shift();
  return line;
}

export function getCatalogLogs(): string[] {
  return [...activityLogs];
}

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return resolve(null);
    }

    const timeout = setTimeout(() => {
      console.warn('[SongCatalog] IndexedDB open timeout (1000ms), continuing with RAM cache');
      resolve(null);
    }, 1000);

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
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

/**
 * Fallback inline loader if Web Worker is unavailable or encounters an error
 */
async function fallbackInlineLoad(
  onProgress?: CatalogProgressCallback,
  onFullCatalogReady?: FullCatalogReadyCallback
): Promise<Song[]> {
  const isLocal = isLocalEnvironment();
  const log1 = recordLog('Running inline fallback loader...');
  onProgress?.(20, 'Loading curated songs...', log1);

  // 1. Check offline cache
  const db = await openDB();
  if (db) {
    const cachedSongs = await getAllFromDB(db);
    if (cachedSongs && cachedSongs.length > 0) {
      if (isLocal || cachedSongs.length <= 500) {
        inMemorySongs = cachedSongs;
        isCatalogLoaded = true;
        const logCached = recordLog(`Loaded ${cachedSongs.length.toLocaleString()} tracks from cache.`);
        onProgress?.(100, `Library ready (${cachedSongs.length.toLocaleString()} tracks)`, logCached);
        return cachedSongs;
      }
    }
  }

  // 2. Fetch curated web catalog
  let stage1Songs: Song[] = [];
  try {
    const webRes = await fetch('/songs/web_catalog.json');
    if (webRes.ok) {
      const webTuples = await webRes.json();
      stage1Songs = tuplesToSongs(webTuples);
      inMemorySongs = stage1Songs;
      isCatalogLoaded = true;
      const logWeb = recordLog(`Curated collection ready (${stage1Songs.length} tracks).`);
      onProgress?.(100, `Library ready (${stage1Songs.length} tracks)`, logWeb);
    }
  } catch (webErr: any) {
    recordLog(`Web catalog fetch failed: ${webErr?.message}`);
  }

  // If on static web hosting or full catalog not needed, return stage 1
  if (!isLocal || stage1Songs.length > 0) {
    if (isLocal && stage1Songs.length > 0) {
      // In background on local, attempt to fetch full catalog
      fetch('/songs/catalog.json')
        .then(res => res.ok ? res.json() : null)
        .then(fullTuples => {
          if (Array.isArray(fullTuples)) {
            const fullSongs = tuplesToSongs(fullTuples);
            inMemorySongs = fullSongs;
            if (db) bulkInsert(db, fullSongs).catch(() => {});
            onFullCatalogReady?.(fullSongs);
          }
        })
        .catch(() => {});
      return stage1Songs;
    }
    if (stage1Songs.length > 0) {
      return stage1Songs;
    }
  }

  // 3. Fallback: full catalog directly if local
  if (isLocal) {
    try {
      const response = await fetch('/songs/catalog.json', { cache: 'no-cache' });
      if (response.ok) {
        const rawTuples = await response.json();
        const songs = tuplesToSongs(rawTuples);
        inMemorySongs = songs;
        isCatalogLoaded = true;
        if (db) bulkInsert(db, songs).catch(() => {});
        onProgress?.(100, `Library ready (${songs.length.toLocaleString()} tracks)`);
        return songs;
      }
    } catch (err: any) {
      recordLog(`Full catalog fallback failed: ${err?.message}`);
    }
  }

  throw new Error('Failed to load songs from network and no offline cache available');
}

/**
 * Main entry point: Loads catalog via background Web Worker with two-stage resolution.
 * Stage 1 resolves fast (<150ms) with curated web songs to unblock UI.
 * Stage 2 (when running locally) silently fetches and upgrades to the full 48k library.
 */
export async function loadSongCatalog(
  onProgress?: CatalogProgressCallback,
  onFullCatalogReady?: FullCatalogReadyCallback
): Promise<Song[]> {
  if (isCatalogLoaded && inMemorySongs.length > 0) {
    const log = recordLog(`Catalog already cached in memory (${inMemorySongs.length.toLocaleString()} tracks)`);
    onProgress?.(100, `Ready (${inMemorySongs.length.toLocaleString()} tracks)`, log);
    return inMemorySongs;
  }

  if (catalogLoadingPromise) {
    return catalogLoadingPromise;
  }

  const isLocal = isLocalEnvironment();

  catalogLoadingPromise = new Promise<Song[]>((resolve, reject) => {
    let resolved = false;

    try {
      if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
        const initLog = recordLog(`Starting catalog loader (${isLocal ? 'Local environment' : 'Web deployment'})...`);
        onProgress?.(10, 'Initializing catalog worker...', initLog);

        const worker = new Worker(
          new URL('../workers/catalogWorker.ts', import.meta.url),
          { type: 'module' }
        );

        worker.onmessage = (event: MessageEvent) => {
          const { type, progress, status, songs, message, log, isFull } = event.data || {};
          const logged = log ? recordLog(log) : undefined;

          if (type === 'PROGRESS') {
            onProgress?.(progress, status, logged);
          } else if (type === 'STAGE_1_SUCCESS') {
            inMemorySongs = songs;
            isCatalogLoaded = true;
            if (!resolved) {
              resolved = true;
              onProgress?.(100, status || `Ready (${songs.length} tracks)`, logged);
              resolve(songs);
            }
          } else if (type === 'SUCCESS') {
            inMemorySongs = songs;
            isCatalogLoaded = true;
            if (!resolved) {
              resolved = true;
              onProgress?.(100, `Library ready (${songs.length.toLocaleString()} tracks)`, logged);
              resolve(songs);
            } else if (isFull) {
              // Stage 2 completed in background: notify listener to upgrade song library
              onFullCatalogReady?.(songs);
            }
            worker.terminate();
          } else if (type === 'ERROR') {
            console.error('[SongCatalog] Worker reported error:', message);
            recordLog(`Worker error: ${message}`);
            worker.terminate();
            if (!resolved) {
              fallbackInlineLoad(onProgress, onFullCatalogReady).then(resolve).catch(reject);
            }
          }
        };

        worker.onerror = (err) => {
          console.warn('[SongCatalog] Web Worker onerror:', err);
          recordLog('Worker failed to execute, triggering inline fallback...');
          worker.terminate();
          if (!resolved) {
            fallbackInlineLoad(onProgress, onFullCatalogReady).then(resolve).catch(reject);
          }
        };

        worker.postMessage({ action: 'LOAD_CATALOG', isLocal });
        return;
      }
    } catch (err: any) {
      console.warn('[SongCatalog] Worker initialization exception:', err);
      recordLog(`Worker creation exception: ${err?.message}`);
    }

    fallbackInlineLoad(onProgress, onFullCatalogReady).then(resolve).catch(reject);
  });

  return catalogLoadingPromise;
}

export function getLoadedSongs(): Song[] {
  return inMemorySongs;
}

export function isCatalogReady(): boolean {
  return isCatalogLoaded;
}
