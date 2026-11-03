const asar = require('@electron/asar');
const path = require('path');
const fs = require('fs');

async function packSongs() {
  const projectRoot = path.resolve(__dirname, '..');
  const src = path.join(projectRoot, 'public', 'songs');
  const outDir = path.join(projectRoot, 'build', 'resources');
  const dest = path.join(outDir, 'songs.asar');
  const catalogPath = path.join(src, 'catalog.json');

  if (!fs.existsSync(src)) {
    console.error(`[packSongs] Error: songs directory not found at ${src}`);
    process.exit(1);
  }

  if (!fs.existsSync(catalogPath)) {
    console.error(`[packSongs] Error: catalog.json missing in ${src}. Run "npm run catalog" first.`);
    process.exit(1);
  }

  // Skip if already packed and newer than catalog.json
  if (fs.existsSync(dest)) {
    const asarStat = fs.statSync(dest);
    const catStat = fs.statSync(catalogPath);
    if (asarStat.mtimeMs > catStat.mtimeMs && asarStat.size > 1000000000) {
      console.log(`[packSongs] songs.asar exists (${(asarStat.size / (1024 * 1024 * 1024)).toFixed(2)} GB) and is up to date. Skipping re-pack.`);
      return;
    }
  }

  fs.mkdirSync(outDir, { recursive: true });
  console.log('[packSongs] Packing ~48,000 song files into build/resources/songs.asar...');
  console.log(`[packSongs] Source: ${src}`);
  console.log(`[packSongs] Destination: ${dest}`);
  const startTime = Date.now();

  await asar.createPackage(src, dest);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const sizeGB = (fs.statSync(dest).size / (1024 * 1024 * 1024)).toFixed(2);
  console.log(`[packSongs] Successfully created songs.asar (${sizeGB} GB) in ${durationSec}s`);
}

packSongs().catch((err) => {
  console.error('[packSongs] Fatal error:', err);
  process.exit(1);
});

