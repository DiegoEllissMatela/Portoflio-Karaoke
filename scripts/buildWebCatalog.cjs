const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const catalogPath = path.join(projectRoot, 'public', 'songs', 'catalog.json');
const webCatalogPath = path.join(projectRoot, 'public', 'songs', 'web_catalog.json');
const defaultSongsPath = path.join(projectRoot, 'src', 'logic', 'constants', 'defaultSongs.ts');

if (!fs.existsSync(catalogPath)) {
  console.error('[WebCatalog] catalog.json not found at', catalogPath);
  process.exit(1);
}

if (!fs.existsSync(defaultSongsPath)) {
  console.error('[WebCatalog] defaultSongs.ts not found at', defaultSongsPath);
  process.exit(1);
}

const defaultSongsContent = fs.readFileSync(defaultSongsPath, 'utf8');
const match = defaultSongsContent.match(/export const DEFAULT_DARE_DRINK_SONG_IDS: string\[\] = (\[[\s\S]*?\]);/);
if (!match) {
  console.error('[WebCatalog] Could not extract DEFAULT_DARE_DRINK_SONG_IDS from defaultSongs.ts');
  process.exit(1);
}

const songIds = new Set(eval(match[1]));
const fullCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const webSongs = fullCatalog.filter(s => songIds.has(s[0]));

fs.mkdirSync(path.dirname(webCatalogPath), { recursive: true });
fs.writeFileSync(webCatalogPath, JSON.stringify(webSongs));

const sizeKB = (fs.statSync(webCatalogPath).size / 1024).toFixed(1);
console.log(`[WebCatalog] Successfully generated ${webCatalogPath} with ${webSongs.length} songs (${sizeKB} KB)`);

