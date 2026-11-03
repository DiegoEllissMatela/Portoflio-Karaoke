import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import type {
  ScoreType,
  AdminCommand,
  AdminCommandType,
  AdminCommandPayload,
  RemoteDareModalState,
  ActiveRule,
} from '../types/logicTypes.ts';

export interface RemoteSessionState {
  gameMode: 'NORMAL' | 'DARE_DRINK' | 'JUST_DRINK' | 'DARE';
  qrQueueEnabled: boolean;
  players: string[];
  adminPlayer: string;
  currentSinger: string;
  nextPlayer: string;
  isPlaying: boolean;
  currentSongTitle: string;
  isAutoPassMicEnabled: boolean;
  playerScores: Record<string, ScoreType[]>;
  playerDrinks: Record<string, number>;
  immunePlayers: string[];
  activeRules: ActiveRule[];
  dareModalState: RemoteDareModalState;
  claimedPlayers: Record<string, string>; // playerName -> deviceId
  playerQueues: Record<string, any[]>;    // playerName -> Song[]
  pendingCommands: AdminCommand[];
  skipRequested?: number;
  updatedAt: number;
}

export function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  const candidates: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const lower = name.toLowerCase();
    // Ignore virtual / loopback / container network adapters
    if (
      lower.includes('vethernet') ||
      lower.includes('virtual') ||
      lower.includes('wsl') ||
      lower.includes('docker') ||
      lower.includes('tailscale') ||
      lower.includes('vmware') ||
      lower.includes('loopback')
    ) {
      continue;
    }

    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address) {
        candidates.push(iface.address);
      }
    }
  }

  // Prioritize standard local Wi-Fi / LAN address ranges
  const lan192 = candidates.find((ip) => ip.startsWith('192.168.'));
  if (lan192) return lan192;

  const lan10 = candidates.find((ip) => ip.startsWith('10.'));
  if (lan10) return lan10;

  const lan172 = candidates.find((ip) => {
    const parts = ip.split('.');
    if (parts[0] === '172') {
      const sec = parseInt(parts[1], 10);
      return sec >= 16 && sec <= 31;
    }
    return false;
  });
  if (lan172) return lan172;

  return candidates[0] || 'localhost';
}

function encodeSongPath(filename: string): string {
  if (!filename) return '';
  return encodeURI(filename).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

export function createRemoteQueueHandler(opts: { songsDir: string; dataDir?: string }) {
  const catalogPath = path.join(opts.songsDir, 'catalog.json');
  const dareCatalogPath = path.join(opts.songsDir, 'dare_catalog.json');
  const saveJsonPath = opts.dataDir ? path.join(opts.dataDir, 'save.json') : path.join(process.cwd(), 'save.json');

  let inMemoryCatalog: any[] | null = null;
  let inMemoryDareCatalog: any[] | null = null;

  function loadCatalogs() {
    if (!inMemoryCatalog && fs.existsSync(catalogPath)) {
      try {
        inMemoryCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      } catch (e) {
        console.error('[RemoteQueue] Failed to load catalog.json:', e);
      }
    }
    if (!inMemoryDareCatalog && fs.existsSync(dareCatalogPath)) {
      try {
        inMemoryDareCatalog = JSON.parse(fs.readFileSync(dareCatalogPath, 'utf8'));
      } catch (e) {
        console.error('[RemoteQueue] Failed to load dare_catalog.json:', e);
      }
    }
  }

  let nextCommandId = 1;

  const remoteSessionState: RemoteSessionState = {
    gameMode: 'NORMAL',
    qrQueueEnabled: true,
    players: [],
    adminPlayer: '',
    currentSinger: '',
    nextPlayer: '',
    isPlaying: false,
    currentSongTitle: '',
    isAutoPassMicEnabled: false,
    playerScores: {},
    playerDrinks: {},
    immunePlayers: [],
    activeRules: [],
    dareModalState: { isOpen: false, currentDare: null, drinkSpinPlan: null },
    claimedPlayers: {},
    playerQueues: {},
    pendingCommands: [],
    updatedAt: Date.now(),
  };

  return (req: any, res: any, next: any) => {
    if (!req.url) return next();
    const urlObj = new URL(req.url, 'http://localhost');
    const pathname = urlObj.pathname;

    if (!pathname.startsWith('/api/remote')) {
      return next();
    }

    // CORS & Cache headers for local Wi-Fi phones
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const jsonResponse = (status: number, data: any) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    // 1. GET /api/remote/info
    if (pathname === '/api/remote/info' && req.method === 'GET') {
      const ip = getLocalIpAddress();
      const port = req.socket?.localPort || 5173;
      const remoteUrl = `http://${ip}:${port}/?remote=1`;
      return jsonResponse(200, {
        ip,
        port,
        url: remoteUrl,
        state: remoteSessionState,
      });
    }

    // 2. GET /api/remote/songs?q=...&limit=...
    if (pathname === '/api/remote/songs' && req.method === 'GET') {
      loadCatalogs();
      const query = (urlObj.searchParams.get('q') || '').trim().toLowerCase();
      const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '50', 10), 100);

      const results: any[] = [];

      // Check active mode from state
      const isDareMode = remoteSessionState.gameMode !== 'NORMAL';

      if (isDareMode && inMemoryDareCatalog) {
        // Read enabled songs from save.json if present
        let enabledSongIds: Set<string> | null = null;
        try {
          if (fs.existsSync(saveJsonPath)) {
            const saveObj = JSON.parse(fs.readFileSync(saveJsonPath, 'utf8'));
            const modeSongSettings = saveObj.appState?.modeSettings?.[remoteSessionState.gameMode];
            if (modeSongSettings?.enabledSongs && modeSongSettings.enabledSongs.length > 0) {
              enabledSongIds = new Set(modeSongSettings.enabledSongs);
            }
          }
        } catch {}

        for (const song of inMemoryDareCatalog) {
          if (enabledSongIds && !enabledSongIds.has(song.id)) continue;
          const searchStr = `${song.title} ${song.artist}`.toLowerCase();
          if (!query || searchStr.includes(query)) {
            results.push({
              id: song.id,
              title: song.title,
              artist: song.artist,
              albumArt: song.albumArt || '/Images/cover-default.svg',
              duration: song.duration || 0,
              audioUrl: song.audioUrl,
              midiUrl: song.midiUrl,
            });
            if (results.length >= limit) break;
          }
        }
      } else if (inMemoryCatalog) {
        for (let i = 0; i < inMemoryCatalog.length; i++) {
          const t = inMemoryCatalog[i];
          const title = t[1];
          const artist = t[2];
          const searchStr = `${title} ${artist}`.toLowerCase();
          if (!query || searchStr.includes(query)) {
            const midiFile = t[6] as string;
            const midiUrl = midiFile ? `/songs/songs/${encodeSongPath(midiFile)}` : undefined;
            results.push({
              id: t[0],
              title,
              artist,
              albumArt: `/Images/cover-${(i % 4) + 1}.svg`,
              duration: 0,
              audioUrl: midiUrl,
              midiUrl,
            });
            if (results.length >= limit) break;
          }
        }
      }

      return jsonResponse(200, { songs: results });
    }

    // Helper to read JSON request body
    const readBody = (callback: (body: any) => void) => {
      let raw = '';
      req.on('data', (chunk: any) => {
        raw += chunk;
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          callback(parsed);
        } catch (err: any) {
          jsonResponse(400, { error: 'Invalid JSON body', details: err.message });
        }
      });
    };

    // 3. POST /api/remote/sync-host
    if (pathname === '/api/remote/sync-host' && req.method === 'POST') {
      return readBody((body) => {
        if (body.gameMode !== undefined) remoteSessionState.gameMode = body.gameMode;
        if (body.qrQueueEnabled !== undefined) remoteSessionState.qrQueueEnabled = body.qrQueueEnabled;
        if (Array.isArray(body.players)) {
          remoteSessionState.players = body.players;
          remoteSessionState.adminPlayer = body.players[0] || '';
          // Prune claimed players and playerQueues for removed players
          const playerSet = new Set(body.players);
          for (const p of Object.keys(remoteSessionState.claimedPlayers)) {
            if (!playerSet.has(p)) {
              delete remoteSessionState.claimedPlayers[p];
            }
          }
          for (const p of Object.keys(remoteSessionState.playerQueues)) {
            if (!playerSet.has(p)) {
              delete remoteSessionState.playerQueues[p];
            }
          }
        }
        if (body.currentSinger !== undefined) remoteSessionState.currentSinger = body.currentSinger;
        if (body.nextPlayer !== undefined) remoteSessionState.nextPlayer = body.nextPlayer;
        if (body.isPlaying !== undefined) remoteSessionState.isPlaying = Boolean(body.isPlaying);
        if (body.currentSongTitle !== undefined) remoteSessionState.currentSongTitle = String(body.currentSongTitle || '');
        if (body.isAutoPassMicEnabled !== undefined) remoteSessionState.isAutoPassMicEnabled = Boolean(body.isAutoPassMicEnabled);
        if (body.playerScores !== undefined) remoteSessionState.playerScores = body.playerScores;
        if (body.playerDrinks !== undefined) remoteSessionState.playerDrinks = body.playerDrinks;
        if (Array.isArray(body.immunePlayers)) remoteSessionState.immunePlayers = body.immunePlayers;
        if (Array.isArray(body.activeRules)) remoteSessionState.activeRules = body.activeRules;
        if (body.dareModalState !== undefined) remoteSessionState.dareModalState = body.dareModalState;

        if (typeof body.lastProcessedCommandId === 'number') {
          remoteSessionState.pendingCommands = remoteSessionState.pendingCommands.filter(
            (cmd) => cmd.id > body.lastProcessedCommandId
          );
        }

        remoteSessionState.updatedAt = Date.now();

        return jsonResponse(200, { success: true, state: remoteSessionState });
      });
    }

    // 4. POST /api/remote/claim
    if (pathname === '/api/remote/claim' && req.method === 'POST') {
      return readBody((body) => {
        const { playerName, deviceId } = body;
        if (!playerName || !deviceId) {
          return jsonResponse(400, { error: 'playerName and deviceId are required' });
        }

        // Check if another phone already claimed this name
        const existingHolder = remoteSessionState.claimedPlayers[playerName];
        if (existingHolder && existingHolder !== deviceId) {
          return jsonResponse(409, { error: `Name "${playerName}" is already taken by another device` });
        }

        // Remove any previous name claimed by this deviceId
        for (const [p, dev] of Object.entries(remoteSessionState.claimedPlayers)) {
          if (dev === deviceId) {
            delete remoteSessionState.claimedPlayers[p];
          }
        }

        remoteSessionState.claimedPlayers[playerName] = deviceId;
        remoteSessionState.updatedAt = Date.now();
        return jsonResponse(200, { success: true, state: remoteSessionState });
      });
    }

    // 5. POST /api/remote/release
    if (pathname === '/api/remote/release' && req.method === 'POST') {
      return readBody((body) => {
        const { playerName, deviceId, forceByHost } = body;
        if (!playerName) {
          return jsonResponse(400, { error: 'playerName is required' });
        }

        if (forceByHost || remoteSessionState.claimedPlayers[playerName] === deviceId) {
          delete remoteSessionState.claimedPlayers[playerName];
          remoteSessionState.updatedAt = Date.now();
          return jsonResponse(200, { success: true, state: remoteSessionState });
        }

        return jsonResponse(403, { error: 'Not authorized to release this name' });
      });
    }

    // 6. POST /api/remote/queue
    if (pathname === '/api/remote/queue' && req.method === 'POST') {
      return readBody((body) => {
        const { playerName, deviceId, action, song, index, toIndex, forceByHost } = body;
        if (!playerName) {
          return jsonResponse(400, { error: 'playerName is required' });
        }

        // Only verified device or host can modify queue
        if (!forceByHost && action !== 'POP_FIRST') {
          if (remoteSessionState.claimedPlayers[playerName] !== deviceId) {
            return jsonResponse(403, { error: 'Device not authorized for this player' });
          }
        }

        const queue = remoteSessionState.playerQueues[playerName] || [];

        switch (action) {
          case 'ADD':
            if (remoteSessionState.gameMode !== 'NORMAL') {
              return jsonResponse(403, { error: 'Song queueing is disabled in Dare and Drink modes' });
            }
            if (!song) return jsonResponse(400, { error: 'Song object required for ADD' });
            queue.push(song);
            break;

          case 'REMOVE':
            if (typeof index !== 'number' || index < 0 || index >= queue.length) {
              return jsonResponse(400, { error: 'Valid index required for REMOVE' });
            }
            queue.splice(index, 1);
            break;

          case 'REORDER':
            if (
              typeof index !== 'number' ||
              typeof toIndex !== 'number' ||
              index < 0 ||
              index >= queue.length ||
              toIndex < 0 ||
              toIndex >= queue.length
            ) {
              return jsonResponse(400, { error: 'Valid index and toIndex required for REORDER' });
            }
            const [moved] = queue.splice(index, 1);
            queue.splice(toIndex, 0, moved);
            break;

          case 'CLEAR':
            queue.length = 0;
            break;

          case 'POP_FIRST': {
            const popped = queue.shift() || null;
            remoteSessionState.playerQueues[playerName] = queue;
            remoteSessionState.updatedAt = Date.now();
            return jsonResponse(200, { success: true, popped, state: remoteSessionState });
          }

          default:
            return jsonResponse(400, { error: `Unknown action: ${action}` });
        }

        remoteSessionState.playerQueues[playerName] = queue;
        remoteSessionState.updatedAt = Date.now();
        return jsonResponse(200, { success: true, state: remoteSessionState });
      });
    }

    // 7. POST /api/remote/skip
    if (pathname === '/api/remote/skip' && req.method === 'POST') {
      return readBody((body) => {
        const { playerName, deviceId } = body;
        if (!playerName || !deviceId) {
          return jsonResponse(400, { error: 'playerName and deviceId are required' });
        }

        const adminPlayer = remoteSessionState.players[0] || '';
        const isPlayerAdmin = Boolean(adminPlayer && playerName === adminPlayer);

        // In non-NORMAL modes, only Admin can skip
        if (remoteSessionState.gameMode !== 'NORMAL' && !isPlayerAdmin) {
          return jsonResponse(403, { error: 'Only the Admin can skip songs in Dare and Drink modes' });
        }

        // In NORMAL mode, only the active singer (or Admin) on their claimed device can skip
        if (!isPlayerAdmin && remoteSessionState.currentSinger && remoteSessionState.currentSinger !== playerName) {
          return jsonResponse(403, { error: 'Only the active singer can skip the current turn' });
        }

        if (remoteSessionState.claimedPlayers[playerName] !== deviceId) {
          return jsonResponse(403, { error: 'Device not authorized for this singer' });
        }

        remoteSessionState.skipRequested = Date.now();
        remoteSessionState.updatedAt = Date.now();
        return jsonResponse(200, { success: true, message: 'Skip requested', state: remoteSessionState });
      });
    }

    // 8. POST /api/remote/admin-command
    if (pathname === '/api/remote/admin-command' && req.method === 'POST') {
      return readBody((body) => {
        const { playerName, deviceId, type, payload } = body as {
          playerName: string;
          deviceId: string;
          type: AdminCommandType;
          payload?: AdminCommandPayload;
        };

        if (!playerName || !deviceId || !type) {
          return jsonResponse(400, { error: 'playerName, deviceId, and type are required' });
        }

        const adminPlayer = remoteSessionState.players[0] || '';
        const isAdminDevice = Boolean(
          adminPlayer &&
          playerName === adminPlayer &&
          remoteSessionState.claimedPlayers[adminPlayer] === deviceId
        );
        const isCurrentSingerDevice = Boolean(
          remoteSessionState.currentSinger &&
          playerName === remoteSessionState.currentSinger &&
          remoteSessionState.claimedPlayers[playerName] === deviceId
        );

        if (type === 'SELECT_DRINK_TARGETS' || type === 'RESOLVE_DARE_OUTCOME') {
          if (!isAdminDevice && !isCurrentSingerDevice) {
            return jsonResponse(403, {
              error: 'Only the active singer or Admin can perform this action',
            });
          }
        } else {
          if (!adminPlayer || playerName !== adminPlayer) {
            return jsonResponse(403, { error: 'Only the Admin (first player) can perform this action' });
          }
          if (!isAdminDevice) {
            return jsonResponse(403, { error: 'Device is not authorized as the Admin player' });
          }
        }

        const cmd: AdminCommand = {
          id: nextCommandId++,
          type,
          payload,
          createdAt: Date.now(),
        };

        remoteSessionState.pendingCommands.push(cmd);
        remoteSessionState.updatedAt = Date.now();
        return jsonResponse(200, { success: true, command: cmd, state: remoteSessionState });
      });
    }

    next();
  };
}

export function remoteQueueApiPlugin(): Plugin {
  const rootDir = process.cwd();
  const songsDir = path.join(rootDir, 'public', 'songs');
  const handler = createRemoteQueueHandler({ songsDir });

  return {
    name: 'remote-queue-api-plugin',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
