/**
 * ============================================================================
 * SOUNDFONT LOADER SERVICE (MEGA.SF2 / CACHED INDEXED-DB)
 * ============================================================================
 * Handles fetching, caching, and hydration of the studio-grade mega.sf2 SoundFont.
 * Employs an IndexedDB persistent cache so the 98 MB soundfont only downloads once.
 */

const DB_NAME = 'DNMKaraoke_SoundFontDB';
const DB_VERSION = 1;
const STORE_NAME = 'soundfonts';
const DEFAULT_SF_KEY = 'mega.sf2';
export const DEFAULT_SF_URL = '/soundfont/mega.sf2';

export type SoundfontProgressCallback = (progress: number, message: string) => void;

class SoundfontLoader {
  private static instance: SoundfontLoader | null = null;
  private memoryCache: ArrayBuffer | null = null;
  private loadingPromise: Promise<ArrayBuffer> | null = null;

  public static getInstance(): SoundfontLoader {
    if (!SoundfontLoader.instance) {
      SoundfontLoader.instance = new SoundfontLoader();
    }
    return SoundfontLoader.instance;
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not supported in this environment'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async getFromIndexedDB(key: string): Promise<ArrayBuffer | null> {
    try {
      const db = await this.openDB();
      return new Promise<ArrayBuffer | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && req.result instanceof ArrayBuffer) {
            resolve(req.result);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  private async saveToIndexedDB(key: string, buffer: ArrayBuffer): Promise<void> {
    try {
      const db = await this.openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(buffer, key);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[SoundfontLoader] Could not persist to IndexedDB (continuing with RAM):', e);
    }
  }

  /**
   * Loads the soundfont ArrayBuffer (Memory -> IndexedDB -> Network fetch)
   */
  public async loadSoundfont(
    url = DEFAULT_SF_URL,
    onProgress?: SoundfontProgressCallback
  ): Promise<ArrayBuffer> {
    if (this.memoryCache) {
      onProgress?.(1.0, 'SoundFont ready from memory cache');
      return this.memoryCache;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = (async () => {
      // 1. Check IndexedDB
      onProgress?.(0.05, 'Checking offline SoundFont cache...');
      const cached = await this.getFromIndexedDB(DEFAULT_SF_KEY);
      if (cached && cached.byteLength > 1000000) {
        onProgress?.(1.0, 'SoundFont hydrated from local cache');
        this.memoryCache = cached;
        this.loadingPromise = null;
        return cached;
      }

      // 2. Fetch from Network
      onProgress?.(0.1, 'Downloading studio SoundFont (mega.sf2)...');
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load SoundFont from ${url}: HTTP ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      let buffer: ArrayBuffer;
      if (response.body && totalBytes > 0) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let receivedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedBytes += value.length;
            const pct = Math.min(0.95, 0.1 + (receivedBytes / totalBytes) * 0.85);
            onProgress?.(pct, `Downloading SoundFont: ${Math.round(receivedBytes / (1024 * 1024))}MB / ${Math.round(totalBytes / (1024 * 1024))}MB`);
          }
        }

        const merged = new Uint8Array(receivedBytes);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        buffer = merged.buffer;
      } else {
        buffer = await response.arrayBuffer();
      }

      onProgress?.(0.98, 'Caching SoundFont for offline playback...');
      this.memoryCache = buffer;
      await this.saveToIndexedDB(DEFAULT_SF_KEY, buffer);

      onProgress?.(1.0, 'SoundFont loaded successfully');
      this.loadingPromise = null;
      return buffer;
    })();

    return this.loadingPromise;
  }

  public getCachedBuffer(): ArrayBuffer | null {
    return this.memoryCache;
  }
}

export const soundfontLoader = SoundfontLoader.getInstance();
