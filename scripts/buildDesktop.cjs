const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const outDir = path.resolve(__dirname, '..', 'electron-dist');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('[esbuild] Bundling Electron main and preload scripts...');
esbuild.buildSync({
  entryPoints: [
    path.resolve(__dirname, '..', 'src', 'logic', 'desktop', 'main.ts'),
    path.resolve(__dirname, '..', 'src', 'logic', 'desktop', 'preload.ts'),
  ],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  outdir: outDir,
  outExtension: { '.js': '.cjs' },
  sourcemap: false,
  logLevel: 'info',
});

console.log('[esbuild] Electron bundle created in electron-dist/');

