import { isLocalEnvironment } from '../utils/environmentUtils';
import type {
  Song,
  ScoreType,
  AdminCommandType,
  AdminCommandPayload,
  RemoteDareModalState,
  ActiveRule,
} from '../types/logicTypes';
import type { RemoteSessionState } from './remoteQueueServer';

export interface RemoteInfoResponse {
  ip: string;
  port: number;
  url: string;
  state: RemoteSessionState;
}

export interface RemoteSongsResponse {
  songs: Song[];
}

const DEVICE_ID_KEY = 'dnm_remote_device_id';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server-dev';
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

let isRemoteBackendAvailable: boolean | null = null;
let lastCheckTime = 0;

export function isRemoteServerAvailable(): boolean {
  if (!isLocalEnvironment()) return false;
  return isRemoteBackendAvailable ?? false;
}

export async function fetchRemoteInfo(): Promise<RemoteInfoResponse> {
  if (!isLocalEnvironment()) {
    throw new Error('Remote QR queue is only available when running on a local network host.');
  }
  const res = await fetch('/api/remote/info', {
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch remote info (${res.status})`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Received non-JSON response from /api/remote/info');
  }
  return res.json();
}

export async function syncHostToRemote(data: {
  gameMode?: string;
  qrQueueEnabled?: boolean;
  players?: string[];
  currentSinger?: string;
  nextPlayer?: string;
  isPlaying?: boolean;
  currentSongTitle?: string;
  isAutoPassMicEnabled?: boolean;
  playerScores?: Record<string, ScoreType[]>;
  playerDrinks?: Record<string, number>;
  immunePlayers?: string[];
  activeRules?: ActiveRule[];
  dareModalState?: RemoteDareModalState;
  lastProcessedCommandId?: number;
}): Promise<{ success: boolean; state: RemoteSessionState }> {
  if (!isLocalEnvironment()) {
    return { success: false, state: {} as RemoteSessionState };
  }
  const now = Date.now();
  if (isRemoteBackendAvailable === false && now - lastCheckTime < 10000) {
    return { success: false, state: {} as RemoteSessionState };
  }

  try {
    const res = await fetch('/api/remote/sync-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      isRemoteBackendAvailable = false;
      lastCheckTime = now;
      throw new Error(`Failed to sync host state (${res.status})`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      isRemoteBackendAvailable = false;
      lastCheckTime = now;
      throw new Error('Received non-JSON response from /api/remote/sync-host');
    }
    isRemoteBackendAvailable = true;
    return res.json();
  } catch (err) {
    isRemoteBackendAvailable = false;
    lastCheckTime = now;
    throw err;
  }
}

export async function claimPlayerName(
  playerName: string,
  deviceId: string
): Promise<{ success: boolean; state: RemoteSessionState }> {
  const res = await fetch('/api/remote/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName, deviceId }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to claim player name (${res.status})`);
  }
  return res.json();
}

export async function releasePlayerName(
  playerName: string,
  deviceId?: string,
  forceByHost?: boolean
): Promise<{ success: boolean; state: RemoteSessionState }> {
  const res = await fetch('/api/remote/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName, deviceId, forceByHost }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to release player name (${res.status})`);
  }
  return res.json();
}

export async function searchRemoteSongs(query: string, limit: number = 50): Promise<Song[]> {
  const url = `/api/remote/songs?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) {
    throw new Error(`Failed to search remote songs (${res.status})`);
  }
  const data: RemoteSongsResponse = await res.json();
  return data.songs || [];
}

export async function mutatePlayerQueue(params: {
  playerName: string;
  deviceId?: string;
  action: 'ADD' | 'REMOVE' | 'REORDER' | 'CLEAR' | 'POP_FIRST';
  song?: Song;
  index?: number;
  toIndex?: number;
  forceByHost?: boolean;
}): Promise<{ success: boolean; popped?: Song | null; state: RemoteSessionState }> {
  const res = await fetch('/api/remote/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Queue mutation failed (${res.status})`);
  }
  return res.json();
}

export async function requestSkipTurn(
  playerName: string,
  deviceId: string
): Promise<{ success: boolean; state?: RemoteSessionState }> {
  const res = await fetch('/api/remote/skip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName, deviceId }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to skip turn (${res.status})`);
  }
  return res.json();
}

export async function sendAdminCommand(params: {
  playerName: string;
  deviceId: string;
  type: AdminCommandType;
  payload?: AdminCommandPayload;
}): Promise<{ success: boolean; state: RemoteSessionState }> {
  const res = await fetch('/api/remote/admin-command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Admin command failed (${res.status})`);
  }
  return res.json();
}
