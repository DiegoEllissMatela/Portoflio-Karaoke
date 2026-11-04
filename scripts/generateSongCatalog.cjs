const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function findDir(candidates) {
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const instrumentalDir = findDir([
  path.join(projectRoot, 'public', 'songs', 'New_Instrumental'),
  path.join(projectRoot, 'public', 'New_Instrumental'),
  path.join(projectRoot, 'public', 'songs', 'audio'),
  path.resolve(projectRoot, '..', 'Automate Karaoke', 'public', 'songs', 'New_Instrumental')
]);

const midiDir = findDir([
  path.join(projectRoot, 'public', 'songs', 'songs'),
  path.join(projectRoot, 'public', 'songs', 'midi'),
  path.join(projectRoot, 'public', 'midi'),
  process.env.SONGS_DIR || ''
].filter(Boolean));

const lyricsDir = findDir([
  path.join(projectRoot, 'public', 'songs', 'New_Lyrics'),
  path.join(projectRoot, 'public', 'New_Lyrics'),
  path.join(projectRoot, 'public', 'songs', 'lyrics'),
  path.resolve(projectRoot, '..', 'Automate Karaoke', 'public', 'songs', 'New_Lyrics')
]);

const outputCatalogPath = path.join(projectRoot, 'public', 'songs', 'catalog.json');

const force = process.argv.includes('--force') || process.env.FORCE_CATALOG === '1';
if (!force && fs.existsSync(outputCatalogPath) && fs.statSync(outputCatalogPath).size > 100000) {
  const sizeMB = (fs.statSync(outputCatalogPath).size / (1024 * 1024)).toFixed(2);
  console.log(`[Catalog Generator] catalog.json exists (${sizeMB} MB). Use "npm run catalog -- --force" to regenerate. Skipping rebuild.`);
  require("./buildWebCatalog.cjs");
  process.exit(0);
}

console.log('[Catalog Generator] Scanning karaoke library...');
console.log(`[Catalog Generator] Audio folder: ${instrumentalDir}`);
console.log(`[Catalog Generator] Lyrics folder: ${lyricsDir}`);
const startTime = Date.now();

if (!fs.existsSync(instrumentalDir)) {
  console.error(`[Catalog Generator] Error: Instrumental directory not found at ${instrumentalDir}`);
  process.exit(1);
}

// 1. Build an O(1) lookup map of lyric files
const lyricMap = new Map();
if (fs.existsSync(lyricsDir)) {
  const lyricFiles = fs.readdirSync(lyricsDir);
  for (const file of lyricFiles) {
    const base = file.replace(/\.(lrc|json)$/i, '').toLowerCase().trim();
    lyricMap.set(base, file);
  }
}

// 1b. Build O(1) lookup map of companion MIDI files for melodic tone guide
const midiMapByClean = new Map();
const midiMapByTitle = new Map();
if (midiDir && fs.existsSync(midiDir)) {
  const midiFiles = fs.readdirSync(midiDir);
  for (const m of midiFiles) {
    if (!m.toLowerCase().endsWith('.mid')) continue;
    const parts = m.slice(0, -4).split(' - ');
    if (parts.length >= 2) {
      const titleClean = parts[1].toLowerCase().replace(/[^a-z0-9]/g, '');
      const artistClean = parts.slice(2).join(' - ').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (titleClean && artistClean) {
        midiMapByClean.set(`${titleClean}___${artistClean}`, m);
      }
      if (titleClean && !midiMapByTitle.has(titleClean)) {
        midiMapByTitle.set(titleClean, m);
      }
    }
  }
}

// 2. Read all instrumental audio files
const audioFiles = fs.readdirSync(instrumentalDir);
const compactSongs = [];

// Known title-first overrides for local filenaming conventions
const knownTitleFirst = {
  'harana parokya ni edgar': { title: 'Harana', artist: 'Parokya ni Edgar' },
  'torete moonstar88': { title: 'Torete', artist: 'Moonstar88' },
  'parokya halaga': { title: 'Halaga', artist: 'Parokya ni Edgar' },
  'check list': { title: 'Checklist', artist: 'Unknown' },
};

const seenIds = new Set();

for (let i = 0; i < audioFiles.length; i++) {
  const audioFile = audioFiles[i];
  const extMatch = audioFile.match(/\.(mp3|m4a|wav|ogg|opus|flac|webm|aac|mid|midi)$/i);
  if (!extMatch) continue;

  const filename = audioFile.slice(0, extMatch.index);
  const lowerFilename = filename.toLowerCase().trim();
  const lyricFile = lyricMap.get(lowerFilename) || '';

  let cleanFilename = filename;
  let isHiddenByDefault = 0;
  if (cleanFilename.toLowerCase().endsWith('-u')) {
    isHiddenByDefault = 1;
    cleanFilename = cleanFilename.slice(0, -2).trim();
  }

  let title = '';
  let artist = '';
  const cleanLower = cleanFilename.toLowerCase().trim();

  // 1. Try reading clean metadata from the LRC file if available
  if (lyricFile) {
    try {
      const lyricPath = path.join(lyricsDir, lyricFile);
      const lrcContent = fs.readFileSync(lyricPath, 'utf8');
      const tiMatch = lrcContent.match(/\[ti:\s*(.+?)\]/i);
      const arMatch = lrcContent.match(/\[ar:\s*(.+?)\]/i);

      if (tiMatch && tiMatch[1].trim()) {
        title = tiMatch[1].trim().replace(/^["']|["']$/g, '');
      }
      if (arMatch && arMatch[1].trim()) {
        artist = arMatch[1].trim().replace(/^["']|["']$/g, '');
      }
    } catch {}
  }

  // 2. Fallback to filename parsing if metadata is missing or partial
  if (!title || !artist) {
    if (knownTitleFirst[cleanLower]) {
      if (!title) title = knownTitleFirst[cleanLower].title;
      if (!artist) artist = knownTitleFirst[cleanLower].artist;
    } else if (cleanFilename.includes(' - ')) {
      const parts = cleanFilename.split(' - ');
      if (!artist) artist = parts[0].replace(/_/g, ' ').replace(/-/g, ' ').trim();
      if (!title) title = parts[1].trim();
    } else if (cleanFilename.includes(' ')) {
      const parts = cleanFilename.split(' ');
      if (!artist) artist = parts[0].replace(/_/g, ' ').replace(/-/g, ' ').trim();
      if (!title) title = parts.slice(1).join(' ').trim();
    } else {
      if (!title) title = cleanFilename;
      if (!artist) artist = 'Unknown Artist';
    }
  }

  // Format numeric titles like "12_51" -> "12:51"
  title = title.replace(/(\d)_(\d)/g, '$1:$2');

  // Convert trailing underscore to question mark (e.g. "Do You Hear What I Hear_" -> "Do You Hear What I Hear?")
  if (title.endsWith('_')) {
    title = title.slice(0, -1).trim() + '?';
  }

  // Remove any remaining underscores in title
  title = title.replace(/_/g, ' ').trim();

  // Normalize artist prefixes & symbols
  if (artist.startsWith('& ')) {
    artist = artist.slice(2).trim();
  } else if (artist.startsWith('&_')) {
    artist = artist.slice(2).trim();
  } else if (artist.startsWith('&')) {
    artist = artist.slice(1).trim();
  } else if (artist === '..' || artist === '.') {
    artist = 'Unknown Artist';
  }

  if (artist.length > 0) {
    artist = artist.charAt(0).toUpperCase() + artist.slice(1);
  }

  if (artist.toUpperCase() === 'PAROKYA NI EDGAR') {
    artist = 'Parokya Ni Edgar';
  }

  let id = filename.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (seenIds.has(id)) {
    let suffix = 2;
    while (seenIds.has(`${id}-${suffix}`)) {
      suffix++;
    }
    id = `${id}-${suffix}`;
  }
  seenIds.add(id);

  // Match companion MIDI file for tone guide
  const cTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '');
  const midiFile = midiMapByClean.get(`${cTitle}___${cArtist}`) || midiMapByTitle.get(cTitle) || '';

  // Store in compact tuple format:
  // [0: id, 1: title, 2: artist, 3: audioFilename, 4: lyricFilename, 5: isHidden, 6: midiFilename]
  compactSongs.push([
    id,
    title,
    artist,
    audioFile,
    lyricFile,
    isHiddenByDefault,
    midiFile
  ]);
}

const duration = Date.now() - startTime;
console.log(`[Catalog Generator] Processed ${compactSongs.length} songs in ${duration}ms`);

fs.mkdirSync(path.dirname(outputCatalogPath), { recursive: true });
fs.writeFileSync(outputCatalogPath, JSON.stringify(compactSongs));
const fileSizeMB = (fs.statSync(outputCatalogPath).size / (1024 * 1024)).toFixed(2);
console.log(`[Catalog Generator] Successfully generated ${outputCatalogPath} (${fileSizeMB} MB)`);
require("./buildWebCatalog.cjs");
