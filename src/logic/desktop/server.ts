import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { createSettingsHandler } from '../services/settingsApiServer.ts';
import { createRemoteQueueHandler } from '../services/remoteQueueServer.ts';

export interface ServerOptions {
  distDir: string;       // app.asar/dist or project dist/
  songsDir: string;      // resources/songs.asar or public/songs
  soundfontDir: string;  // resources/soundfont or public/soundfont
  publicDir: string;     // static assets fallback
  dataDir: string;       // app.getPath('userData')
  preferredPort: number; // 51730
}

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
  '.sf2': 'application/octet-stream',
  '.lrc': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

function serveStaticFile(
  filePath: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cacheHeader = 'no-cache'
): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
  } catch {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_MAP[ext] || 'application/octet-stream';
  const fileSize = stat.size;
  const range = req.headers.range;

  if (req.method === 'HEAD') {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cacheHeader,
    });
    res.end();
    return true;
  }

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || (parts[1] && isNaN(end)) || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
      });
      res.end();
      return true;
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Cache-Control': cacheHeader,
    });

    try {
      const stream = fs.createReadStream(filePath, { start, end });
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      stream.pipe(res);
    } catch {
      // Fallback for asar environments if stream creation behaves differently
      const buffer = fs.readFileSync(filePath);
      res.end(buffer.subarray(start, end + 1));
    }
    return true;
  }

  res.writeHead(200, {
    'Content-Length': fileSize,
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheHeader,
  });

  try {
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
  } catch {
    const buffer = fs.readFileSync(filePath);
    res.end(buffer);
  }

  return true;
}

export function startServer(opts: ServerOptions): Promise<{ port: number; close: () => Promise<void> }> {
  const { distDir, songsDir, soundfontDir, publicDir, dataDir, preferredPort } = opts;

  const settingsHandler = createSettingsHandler({ dataDir, songsDir });
  const remoteHandler = createRemoteQueueHandler({ songsDir, dataDir });

  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }

    // 1. API routes
    const urlObj = new URL(req.url, 'http://localhost');
    const pathname = urlObj.pathname;

    if (pathname === '/api/settings' || pathname === '/api/save') {
      settingsHandler(req, res, () => {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      });
      return;
    }

    if (pathname.startsWith('/api/remote')) {
      remoteHandler(req, res, () => {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      });
      return;
    }

    // 2. Songs routing (supports decoded filenames with &, +, #, etc.)
    if (pathname.startsWith('/songs/')) {
      try {
        const relPath = decodeURIComponent(pathname.replace(/^\/songs\//, ''));
        const safeTarget = path.resolve(songsDir, relPath);
        // Security guard against path traversal
        if (!safeTarget.startsWith(path.resolve(songsDir))) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        const served = serveStaticFile(safeTarget, req, res, 'public, max-age=31536000, immutable');
        if (served) return;
      } catch {}

      res.writeHead(404);
      res.end('Song file not found');
      return;
    }

    // 3. Soundfont routing
    if (pathname.startsWith('/soundfont/')) {
      try {
        const relPath = decodeURIComponent(pathname.replace(/^\/soundfont\//, ''));
        const safeTarget = path.resolve(soundfontDir, relPath);
        if (!safeTarget.startsWith(path.resolve(soundfontDir))) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        const served = serveStaticFile(safeTarget, req, res, 'public, max-age=31536000, immutable');
        if (served) return;
      } catch {}

      res.writeHead(404);
      res.end('Soundfont file not found');
      return;
    }

    // 4. Client static files from distDir or publicDir
    const rawRel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    let decodedRel = rawRel;
    try {
      decodedRel = decodeURIComponent(rawRel);
    } catch {}

    const distTarget = path.resolve(distDir, decodedRel);
    if (distTarget.startsWith(path.resolve(distDir)) && serveStaticFile(distTarget, req, res, pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')) {
      return;
    }

    if (publicDir) {
      const publicTarget = path.resolve(publicDir, decodedRel);
      if (publicTarget.startsWith(path.resolve(publicDir)) && serveStaticFile(publicTarget, req, res, 'no-cache')) {
        return;
      }
    }

    // 5. SPA fallback to index.html (only for page routes without extensions or HTML requests)
    const ext = path.extname(pathname);
    if (!ext || ext === '.html') {
      const indexTarget = path.join(distDir, 'index.html');
      if (serveStaticFile(indexTarget, req, res, 'no-cache')) {
        return;
      }
    }

    res.writeHead(404);
    res.end('Not found');
  });

  return new Promise((resolve, reject) => {
    let port = preferredPort;
    const maxAttempts = 20;
    let attempts = 0;

    const tryListen = () => {
      attempts++;
      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
          port++;
          tryListen();
        } else {
          reject(err);
        }
      });

      server.listen(port, '0.0.0.0', () => {
        console.log(`[EmbeddedServer] Running at http://127.0.0.1:${port} (LAN accessible on port ${port})`);
        resolve({
          port,
          close: () => new Promise<void>((res) => server.close(() => res())),
        });
      });
    };

    tryListen();
  });
}

