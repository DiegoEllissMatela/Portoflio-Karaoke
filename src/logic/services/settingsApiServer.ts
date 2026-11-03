import fs from 'node:fs';
import path from 'node:path';
import { parseFromTxt, serializeToTxt } from './txtSettingsParser.ts';

export interface SettingsPaths {
  dataDir: string;
  songsDir: string;
}

function getCatalogRefs(songsDir: string) {
  try {
    const dareCatalogPath = path.join(songsDir, 'dare_catalog.json');
    if (fs.existsSync(dareCatalogPath)) {
      const parsed = JSON.parse(fs.readFileSync(dareCatalogPath, 'utf-8'));
      return parsed.map((s: any) => ({ id: s.id, title: s.title, artist: s.artist }));
    }
  } catch {}
  return [];
}

/**
 * Reusable Connect/Node middleware handler for /api/settings and /api/save.
 * Shared between Vite dev server plugins and the embedded Electron server.
 */
export function createSettingsHandler(paths: SettingsPaths) {
  const { dataDir, songsDir } = paths;
  const saveDir = path.resolve(dataDir, 'save');
  const rootSaveTxt = path.join(dataDir, 'save.txt');
  const saveTxt = path.join(saveDir, 'save.txt');
  const saveFile = path.join(saveDir, 'save.json');
  const rootSaveFile = path.join(dataDir, 'save.json');
  const settingsDir = path.resolve(dataDir, 'settings');
  const settingsFile = path.join(settingsDir, 'karaoke_settings.json');

  return (req: any, res: any, next: any) => {
    if (!req.url) return next();
    const url = req.url.split('?')[0];

    if (url === '/api/settings' || url === '/api/save') {
      if (req.method === 'GET') {
        try {
          const catalogRefs = getCatalogRefs(songsDir);

          // Check if save.txt exists and is newer than save.json (e.g. edited in Notepad!)
          const txtCandidate = fs.existsSync(rootSaveTxt) ? rootSaveTxt : (fs.existsSync(saveTxt) ? saveTxt : null);
          const jsonCandidate = fs.existsSync(rootSaveFile) ? rootSaveFile : (fs.existsSync(saveFile) ? saveFile : (fs.existsSync(settingsFile) ? settingsFile : null));

          let useTxt = false;
          if (txtCandidate && jsonCandidate) {
            const txtMtime = fs.statSync(txtCandidate).mtimeMs;
            const jsonMtime = fs.statSync(jsonCandidate).mtimeMs;
            if (txtMtime > jsonMtime) {
              useTxt = true;
            }
          } else if (txtCandidate && !jsonCandidate) {
            useTxt = true;
          }

          if (useTxt && txtCandidate) {
            const rawTxt = fs.readFileSync(txtCandidate, 'utf-8');
            const parsedData = parseFromTxt(rawTxt, catalogRefs);
            const formatted = JSON.stringify(parsedData, null, 2);

            // Sync to JSON files
            fs.writeFileSync(rootSaveFile, formatted, 'utf-8');
            if (fs.existsSync(saveDir)) fs.writeFileSync(saveFile, formatted, 'utf-8');
            if (fs.existsSync(settingsDir)) fs.writeFileSync(settingsFile, formatted, 'utf-8');

            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            });
            res.end(formatted);
            return;
          }

          if (jsonCandidate) {
            const data = fs.readFileSync(jsonCandidate, 'utf-8');
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            });
            res.end(data);
            return;
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ exists: false }));
            return;
          }
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
      } else if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const catalogRefs = getCatalogRefs(songsDir);
            const formattedJson = JSON.stringify(parsed, null, 2);
            const formattedTxt = serializeToTxt(parsed, catalogRefs);

            if (!fs.existsSync(saveDir)) {
              fs.mkdirSync(saveDir, { recursive: true });
            }

            // 1. Write save.txt (Notepad human-readable) in root and save/
            fs.writeFileSync(rootSaveTxt, formattedTxt, 'utf-8');
            fs.writeFileSync(saveTxt, formattedTxt, 'utf-8');

            // 2. Write save.json in root and save/
            fs.writeFileSync(rootSaveFile, formattedJson, 'utf-8');
            fs.writeFileSync(saveFile, formattedJson, 'utf-8');

            // 3. Write to settings/karaoke_settings.json for backwards compatibility
            if (!fs.existsSync(settingsDir)) {
              fs.mkdirSync(settingsDir, { recursive: true });
            }
            fs.writeFileSync(settingsFile, formattedJson, 'utf-8');

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, savedAt: new Date().toISOString() }));
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }
    }
    next();
  };
}

