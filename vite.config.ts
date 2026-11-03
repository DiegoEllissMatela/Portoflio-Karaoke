import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { createSettingsHandler } from './src/logic/services/settingsApiServer.ts'
import { remoteQueueApiPlugin } from './src/logic/services/remoteQueueServer.ts'

function songStaticUrlDecoder(): Plugin {
  return {
    name: 'song-static-url-decoder',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        // Safely decode percent-encoded URLs so Vite finds files with special characters (&, +, #, etc.)
        if (req.url && (
          req.url.startsWith('/songs/New_Instrumental/') || 
          req.url.startsWith('/songs/New_Lyrics/') || 
          req.url.startsWith('/songs/midi/')
        )) {
          try {
            const rawUrl = req.url;
            const decoded = decodeURIComponent(rawUrl);
            if (decoded !== rawUrl) {
              req.url = decoded;
            }
          } catch {}
        }
        next();
      });
    }
  };
}

function copyDesktopPublicAssets(): Plugin {
  return {
    name: 'copy-desktop-public-assets',
    closeBundle() {
      const publicDir = path.resolve(import.meta.dirname, 'public');
      const distDir = path.resolve(import.meta.dirname, 'dist');
      if (!fs.existsSync(distDir)) return;

      const itemsToCopy = [
        'AnimatedIcons',
        'icons',
        'Images',
        'sfx',
        'Beer.gif',
        'favicon.svg',
        'icons.svg',
        'manifest.json',
        'sw.js',
      ];

      for (const item of itemsToCopy) {
        const src = path.join(publicDir, item);
        const dest = path.join(distDir, item);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true });
        }
      }
    }
  };
}

function appSettingsStoragePlugin(): Plugin {
  const rootDir = import.meta.dirname;
  const saveDir = path.resolve(rootDir, 'save');
  const rootSaveTxt = path.join(rootDir, 'save.txt');
  const saveTxt = path.join(saveDir, 'save.txt');
  const saveFile = path.join(saveDir, 'save.json');
  const rootSaveFile = path.join(rootDir, 'save.json');
  const settingsDir = path.resolve(rootDir, 'settings');
  const settingsFile = path.join(settingsDir, 'karaoke_settings.json');
  const songsDir = path.join(rootDir, 'public', 'songs');

  const handler = createSettingsHandler({ dataDir: rootDir, songsDir });

  return {
    name: 'app-settings-storage',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
    closeBundle() {
      const distDir = path.resolve(rootDir, 'dist');
      if (fs.existsSync(distDir)) {
        const distSaveDir = path.join(distDir, 'save');
        if (!fs.existsSync(distSaveDir)) fs.mkdirSync(distSaveDir, { recursive: true });
        if (fs.existsSync(saveFile)) {
          fs.copyFileSync(saveFile, path.join(distSaveDir, 'save.json'));
        }
        if (fs.existsSync(saveTxt)) {
          fs.copyFileSync(saveTxt, path.join(distSaveDir, 'save.txt'));
        }
        if (fs.existsSync(rootSaveFile)) {
          fs.copyFileSync(rootSaveFile, path.join(distDir, 'save.json'));
        }
        if (fs.existsSync(rootSaveTxt)) {
          fs.copyFileSync(rootSaveTxt, path.join(distDir, 'save.txt'));
        }
        const distSettingsDir = path.join(distDir, 'settings');
        if (!fs.existsSync(distSettingsDir)) fs.mkdirSync(distSettingsDir, { recursive: true });
        if (fs.existsSync(settingsFile)) {
          fs.copyFileSync(settingsFile, path.join(distSettingsDir, 'karaoke_settings.json'));
        }
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  assetsInclude: ['**/*.lrc'],
  plugins: [react(), songStaticUrlDecoder(), copyDesktopPublicAssets(), appSettingsStoragePlugin(), remoteQueueApiPlugin()],
  server: {
    host: true, // Listen on all network interfaces (0.0.0.0) so phones on local Wi-Fi can connect
    port: 5173,
    strictPort: false,
    watch: {
      ignored: [
        '**/public/songs/**',
        '**/dist/**',
        '**/.git/**',
        '**/settings/**',
        '**/save/**',
        '**/save.json',
        '**/save.txt',
        '**/karaoke_settings.json'
      ]
    }
  },
  optimizeDeps: {
    entries: ['index.html'],
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'lucide-react',
      'lottie-react'
    ],
  },
  css: {
    modules: {
      generateScopedName: '[name]__[local]'
    }
  },
  build: {
    copyPublicDir: false, // Prevents Vite from copying 48k songs from public/ into dist/
    chunkSizeWarningLimit: 2000,
  }
})

