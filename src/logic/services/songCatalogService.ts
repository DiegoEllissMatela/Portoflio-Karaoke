import type { Song } from '../types/logicTypes';

export type CatalogProgressCallback = (progress: number, status: string, log?: string) => void;

const DB_NAME = 'AutomateKaraokeDB_v5';
const DB_VERSION = 1;
const STORE_NAME = 'songs';

import { LOCAL_ALBUM_COVERS, DEFAULT_ALBUM_ART } from '../utils/albumArtUtils';

function encodeSongPath(filename: string): string {
  if (!filename) return '';
  return encodeURI(filename).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

const albumArts = [
  ...LOCAL_ALBUM_COVERS,
  DEFAULT_ALBUM_ART
];

// In-memory cached song list & diagnostic logs
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

/**
 * Fallback inline loader if Web Worker is unavailable or encounters an error
 */
async function fallbackInlineLoad(onProgress?: CatalogProgressCallback): Promise<Song[]> {
  const log1 = recordLog('Running inline fallback loader...');
  onProgress?.(20, 'Checking song catalog...', log1);

  let rawTuples: any[][] | null = null;
  try {
    const logFetch = recordLog('Fetching /songs/catalog.json via main thread...');
    onProgress?.(30, 'Fetching catalog file...', logFetch);
    const response = await fetch('/songs/catalog.json', { cache: 'no-cache' });
    if (response.ok) {
      rawTuples = await response.json();
      const logDone = recordLog('Downloaded catalog.json successfully.');
      onProgress?.(60, 'Catalog downloaded', logDone);
    }
  } catch (fetchErr: any) {
    recordLog(`Network fetch error: ${fetchErr?.message}`);
  }

  // If fetched catalog successfully, hydrate memory immediately
  if (rawTuples && Array.isArray(rawTuples)) {
    const logParse = recordLog(`Parsing ${rawTuples.length.toLocaleString()} track tuples in memory...`);
    onProgress?.(80, `Parsing ${rawTuples.length.toLocaleString()} tracks...`, logParse);
    const songs = tuplesToSongs(rawTuples);
    inMemorySongs = songs;
    isCatalogLoaded = true;

    // Save to IndexedDB in background
    openDB().then(db => {
      if (db) {
        bulkInsert(db, songs).catch(err => console.warn('[SongCatalog] Bulk insert warning:', err));
      }
    });

    const logReady = recordLog(`Library ready with ${songs.length.toLocaleString()} tracks.`);
    onProgress?.(100, `Library ready (${songs.length.toLocaleString()} tracks)`, logReady);
    return songs;
  }

  // Fallback to IndexedDB
  const db = await openDB();
  if (db) {
    const logDb = recordLog('Loading from IndexedDB offline storage...');
    onProgress?.(85, 'Loading offline library...', logDb);
    const cachedSongs = await getAllFromDB(db);
    if (cachedSongs && cachedSongs.length > 0) {
      inMemorySongs = cachedSongs;
      isCatalogLoaded = true;
      const logCached = recordLog(`Loaded ${cachedSongs.length.toLocaleString()} tracks from local database.`);
      onProgress?.(100, `Offline library ready (${cachedSongs.length.toLocaleString()} tracks)`, logCached);
      return cachedSongs;
    }
  }

  throw new Error('Failed to load songs from network and no offline cache available');
}

/**
 * Main entry point: Loads catalog via background Web Worker with real-time progress & logging
 */
export async function loadSongCatalog(
  onProgress?: CatalogProgressCallback
): Promise<Song[]> {
  if (isCatalogLoaded && inMemorySongs.length > 0) {
    const log = recordLog(`Catalog already cached in memory (${inMemorySongs.length.toLocaleString()} tracks)`);
    onProgress?.(100, `Ready (${inMemorySongs.length.toLocaleString()} tracks)`, log);
    return inMemorySongs;
  }

  if (catalogLoadingPromise) {
    return catalogLoadingPromise;
  }

  catalogLoadingPromise = new Promise<Song[]>((resolve, reject) => {
    try {
      if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
        const initLog = recordLog('Starting background catalog Web Worker...');
        onProgress?.(10, 'Initializing catalog worker...', initLog);

        const worker = new Worker(
          new URL('../workers/catalogWorker.ts', import.meta.url),
          { type: 'module' }
        );

        worker.onmessage = (event: MessageEvent) => {
          const { type, progress, status, songs, message, log } = event.data || {};
          const logged = log ? recordLog(log) : undefined;

          if (type === 'PROGRESS') {
            onProgress?.(progress, status, logged);
          } else if (type === 'SUCCESS') {
            inMemorySongs = songs;
            isCatalogLoaded = true;
            const successLog = recordLog(`Library active (${songs.length.toLocaleString()} tracks).`);
            onProgress?.(100, `Library ready (${songs.length.toLocaleString()} tracks)`, successLog);
            worker.terminate();
            resolve(songs);
          } else if (type === 'ERROR') {
            console.error('[SongCatalog] Worker reported error:', message);
            recordLog(`Worker error: ${message}`);
            worker.terminate();
            fallbackInlineLoad(onProgress).then(resolve).catch(reject);
          }
        };

        worker.onerror = (err) => {
          console.warn('[SongCatalog] Web Worker onerror:', err);
          recordLog('Worker failed to execute, triggering inline fallback...');
          worker.terminate();
          fallbackInlineLoad(onProgress).then(resolve).catch(reject);
        };

        worker.postMessage({ action: 'LOAD_CATALOG' });
        return;
      }
    } catch (err: any) {
      console.warn('[SongCatalog] Worker initialization exception:', err);
      recordLog(`Worker creation exception: ${err?.message}`);
    }

    fallbackInlineLoad(onProgress).then(resolve).catch(reject);
  });

  return catalogLoadingPromise;
}

export function getLoadedSongs(): Song[] {
  return inMemorySongs;
}

export function isCatalogReady(): boolean {
  return isCatalogLoaded;
}
