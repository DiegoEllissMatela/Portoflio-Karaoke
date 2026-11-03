import { app, BrowserWindow, Menu, shell, session, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'node:child_process';
import { resolveDesktopPaths } from './paths';
import { startServer } from './server';

// Prevent duplicate application instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Ensure audio/video can autoplay without requiring initial user interaction
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow: BrowserWindow | null = null;
let serverInstance: { port: number; close: () => Promise<void> } | null = null;

async function createWindow(port: number) {
  const isDev = !app.isPackaged;
  const preloadPath = path.join(__dirname, 'preload.cjs');

  mainWindow = new BrowserWindow({
    fullscreen: true, // Start in full screen per user requirement
    autoHideMenuBar: true,
    backgroundColor: '#0a0b10',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Restrict navigation to local server
  mainWindow.webContents.on('will-navigate', (e, targetUrl) => {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        e.preventDefault();
        shell.openExternal(targetUrl);
      }
    } catch {
      e.preventDefault();
    }
  });

  // Keyboard controls: F11 toggles fullscreen
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow?.setFullScreen(!mainWindow.isFullScreen());
    }
    if (isDev && input.control && input.shift && input.key.toLowerCase() === 'i' && input.type === 'keyDown') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  await mainWindow.loadURL(`http://localhost:${port}`);
}

// IPC: Allow Phone Connections via Windows Firewall rule
ipcMain.handle('request-firewall-access', async () => {
  const port = serverInstance?.port || 51730;
  return new Promise<{ success: boolean; message: string }>((resolve) => {
    // Elevate netsh command with UAC prompt
    const psCmd = `Start-Process netsh -ArgumentList 'advfirewall firewall add rule name="DNM Karaoke" dir=in action=allow protocol=TCP localport=${port} profile=any' -Verb RunAs -Wait`;
    exec(`powershell -Command "${psCmd}"`, (err) => {
      if (err) {
        resolve({ success: false, message: err.message || 'Permission denied or canceled by user.' });
      } else {
        resolve({ success: true, message: `Firewall access enabled for port ${port}!` });
      }
    });
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  const paths = resolveDesktopPaths();

  // Create userData directory if it doesn't exist
  if (!fs.existsSync(paths.dataDir)) {
    fs.mkdirSync(paths.dataDir, { recursive: true });
  }

  // Grant required media and fullscreen permissions
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'fullscreen', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });

  try {
    serverInstance = await startServer({
      distDir: paths.distDir,
      songsDir: paths.songsDir,
      soundfontDir: paths.soundfontDir,
      publicDir: paths.publicDir,
      dataDir: paths.dataDir,
      preferredPort: 51730,
    });

    await createWindow(serverInstance.port);
  } catch (err: any) {
    dialog.showErrorBox('DNM Karaoke Server Error', `Failed to start local server:\n${err?.message || err}`);
    app.quit();
  }
});

app.on('window-all-closed', async () => {
  if (serverInstance) {
    await serverInstance.close();
  }
  app.quit();
});

