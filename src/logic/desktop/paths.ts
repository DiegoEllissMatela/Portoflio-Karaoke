import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export function resolveDesktopPaths() {
  const isPackaged = app.isPackaged;
  const resources = process.resourcesPath;
  const appRoot = app.getAppPath();

  const distDir = isPackaged
    ? path.join(appRoot, 'dist')
    : path.resolve(process.cwd(), 'dist');

  const asarSongsPath = path.join(resources, 'songs.asar');
  const dirSongsPath = path.join(resources, 'songs');
  const songsDir = isPackaged
    ? (fs.existsSync(asarSongsPath) ? asarSongsPath : dirSongsPath)
    : path.resolve(process.cwd(), 'public', 'songs');

  const soundfontDir = isPackaged
    ? path.join(resources, 'soundfont')
    : path.resolve(process.cwd(), 'public', 'soundfont');

  const publicDir = isPackaged
    ? distDir
    : path.resolve(process.cwd(), 'public');

  const dataDir = app.getPath('userData'); // %APPDATA%\DNM Karaoke

  return {
    isPackaged,
    distDir,
    songsDir,
    soundfontDir,
    publicDir,
    dataDir,
  };
}

