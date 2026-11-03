import type { LyricLine, WordTiming, SyllableTiming } from '../types/logicTypes';

export interface ParsedLyrics {
  title?: string;
  artist?: string;
  lyrics: LyricLine[];
}

/**
 * Parses JSON format for lyrics mode.
 * The JSON has structure: [{ word, start_ms, end_ms }, ...]
 */
export function parseJSONLyrics(jsonString: string): ParsedLyrics {
  try {
    const words: WordTiming[] = JSON.parse(jsonString);
    if (!Array.isArray(words)) return { lyrics: [] };

    const result: LyricLine[] = [];
    let currentLine: WordTiming[] = [];
    
    words.forEach((w, i) => {
      currentLine.push(w);
      const isLastWord = i === words.length - 1;
      const nextWord = words[i + 1];
      
      // Break line if gap > 1.5s or > 8 words
      const shouldBreak = isLastWord || (nextWord && (nextWord.start_ms - w.end_ms > 1500)) || currentLine.length >= 8;
      
      if (shouldBreak && currentLine.length > 0) {
        result.push({
          id: `lyric-json-${result.length}`,
          time: currentLine[0].start_ms / 1000,
          text: currentLine.map(tw => tw.word).join(' '),
          wordTimings: [...currentLine],
          blankedWords: []
        });
        currentLine = [];
      }
    });

    return { lyrics: result };
  } catch(e) {
    console.error('Failed to parse JSON lyrics:', e);
    return { lyrics: [] };
  }
}

/**
 * Helper to parse mm:ss.xx or mm:ss into seconds.
 */
export function parseTimestamp(minStr: string, secStr: string): number {
  const mins = parseFloat(minStr);
  const secs = parseFloat(secStr);
  return Math.round((mins * 60 + secs) * 1000) / 1000;
}

export interface ParseLineOptions {
  nextLineTime?: number;      // in seconds
  fallbackDuration?: number;  // in seconds (default: 0.8)
  declaredLineEnd?: number;   // in seconds
  offsetMs?: number;          // metadata offset in ms
}

/**
 * Parses an enhanced LRC line (with <mm:ss.xx> tags) into a flat list of merged words.
 *
 * Requirements:
 * 1. Reads line, extracts ordered list of (timestamp, text_chunk) pairs via regex.
 * 2. Groups consecutive chunks into a word whenever there's no space between them,
 *    closing the word when a chunk ends in whitespace (or line end).
 * 3. For each merged word, outputs {text, start_time, end_time}, where start_time = first
 *    chunk's timestamp and end_time = start timestamp of the next word (or fallback for last word).
 * 4. Handles edge cases: apostrophes mid-word ("ako'y"), tildes used as hyphen-equivalents
 *    in reduplicated words ("paulit~ulit"), and words that are already single syllables (1:1).
 * 5. Outputs flat list of words per line in the shape expected by per-word blanking logic.
 */
export function parseEnhancedLrcLine(
  line: string,
  options?: ParseLineOptions
): WordTiming[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  const offsetSec = (options?.offsetMs || 0) / 1000;

  // 1. Extract leading timestamp header(s): e.g. [01:16.78]
  const headerRegex = /\[(\d{1,2}):(\d{2}(?:\.\d+)?)\]/g;
  let lastHeaderEnd = 0;
  let headerMatch: RegExpExecArray | null;
  let lineStartTime = 0;

  while ((headerMatch = headerRegex.exec(trimmed)) !== null) {
    if (headerMatch.index === lastHeaderEnd) {
      lineStartTime = Math.max(0, parseTimestamp(headerMatch[1], headerMatch[2]) - offsetSec);
      lastHeaderEnd = headerRegex.lastIndex;
    } else {
      break;
    }
  }

  const body = trimmed.slice(lastHeaderEnd);

  // 2. Extract ordered list of (timestamp, text_chunk) pairs via regex
  const tagRegex = /<(\d{1,2}):(\d{2}(?:\.\d+)?)>/g;
  const tagMatches = [...body.matchAll(tagRegex)];

  // Fallback: If no inline <mm:ss.xx> tags, treat as standard LRC line
  if (tagMatches.length === 0) {
    const rawWords = body.trim().split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) return [];

    const lineEnd = options?.declaredLineEnd ?? options?.nextLineTime ?? (lineStartTime + 3.0);
    const duration = Math.max(0.5, lineEnd - lineStartTime);
    const wordDur = duration / Math.max(1, rawWords.length);

    return rawWords.map((w, idx) => {
      const sTime = Math.round((lineStartTime + idx * wordDur) * 1000) / 1000;
      const eTime = Math.round((lineStartTime + (idx + 1) * wordDur) * 1000) / 1000;
      const sMs = Math.round(sTime * 1000);
      const eMs = Math.round(eTime * 1000);
      return {
        text: w,
        word: w,
        start_time: sTime,
        end_time: eTime,
        start_ms: sMs,
        end_ms: eMs,
        syllables: [{ text: w, start_ms: sMs, end_ms: eMs, start_time: sTime, end_time: eTime }],
      };
    });
  }

  interface RawChunk {
    startTime: number;
    text: string;
  }

  const rawChunks: RawChunk[] = [];

  // Check if text exists before the first inline tag
  if (tagMatches[0].index! > 0) {
    const prefix = body.slice(0, tagMatches[0].index!);
    if (prefix.length > 0) {
      rawChunks.push({
        startTime: lineStartTime,
        text: prefix,
      });
    }
  }

  for (let i = 0; i < tagMatches.length; i++) {
    const match = tagMatches[i];
    const tagTime = Math.max(0, parseTimestamp(match[1], match[2]) - offsetSec);
    const textStart = match.index! + match[0].length;
    const textEnd = (i + 1 < tagMatches.length) ? tagMatches[i + 1].index! : body.length;
    const textChunk = body.slice(textStart, textEnd);

    rawChunks.push({
      startTime: tagTime,
      text: textChunk,
    });
  }

  // Check if the last chunk is an empty tag (e.g. <01:19.50>) declaring the end time of the line
  let declaredLineEnd = options?.declaredLineEnd;
  if (rawChunks.length > 0 && rawChunks[rawChunks.length - 1].text.trim() === '') {
    const trailingChunk = rawChunks.pop()!;
    declaredLineEnd = trailingChunk.startTime;
  }

  // 3. Group consecutive chunks into words whenever there is no space between them,
  // closing the word when a chunk ends in whitespace (or line end).
  interface ChunkEntry {
    text: string;
    startTime: number;
  }
  interface WordGroup {
    chunks: ChunkEntry[];
  }

  const wordGroups: WordGroup[] = [];
  let currentWordChunks: ChunkEntry[] = [];

  for (let i = 0; i < rawChunks.length; i++) {
    const chunk = rawChunks[i];
    let chunkText = chunk.text;

    // If chunk begins with whitespace, any open word ended before this chunk
    if (/^\s/.test(chunkText)) {
      if (currentWordChunks.length > 0) {
        wordGroups.push({ chunks: currentWordChunks });
        currentWordChunks = [];
      }
      chunkText = chunkText.trimStart();
    }

    if (chunkText.length === 0) continue;

    const endsWithSpace = /\s$/.test(chunk.text);
    const tokens = chunkText.split(/\s+/).filter(Boolean);

    if (tokens.length > 1) {
      // Chunk contains multiple words separated by internal whitespace
      currentWordChunks.push({
        text: tokens[0],
        startTime: chunk.startTime,
      });
      wordGroups.push({ chunks: currentWordChunks });
      currentWordChunks = [];

      for (let t = 1; t < tokens.length - 1; t++) {
        wordGroups.push({
          chunks: [{ text: tokens[t], startTime: chunk.startTime }],
        });
      }

      const lastTok = tokens[tokens.length - 1];
      if (endsWithSpace) {
        wordGroups.push({
          chunks: [{ text: lastTok, startTime: chunk.startTime }],
        });
      } else {
        currentWordChunks.push({
          text: lastTok,
          startTime: chunk.startTime,
        });
      }
    } else {
      // Single syllable or single word chunk
      currentWordChunks.push({
        text: tokens[0],
        startTime: chunk.startTime,
      });

      if (endsWithSpace) {
        wordGroups.push({ chunks: currentWordChunks });
        currentWordChunks = [];
      }
    }
  }

  if (currentWordChunks.length > 0) {
    wordGroups.push({ chunks: currentWordChunks });
  }

  // 4. Output each merged word: { text, start_time, end_time }
  // start_time = first chunk's timestamp
  // end_time = START timestamp of the NEXT word
  // (or, for the last word, line's declared end or fallback duration)
  const result: WordTiming[] = [];

  for (let wIdx = 0; wIdx < wordGroups.length; wIdx++) {
    const wordGroup = wordGroups[wIdx];
    const nextWordGroup = wordGroups[wIdx + 1];

    const firstChunk = wordGroup.chunks[0];
    const lastChunk = wordGroup.chunks[wordGroup.chunks.length - 1];

    const wordStartTime = firstChunk.startTime;
    let wordEndTime: number;

    if (nextWordGroup) {
      wordEndTime = nextWordGroup.chunks[0].startTime;
    } else {
      // Last word in line
      if (declaredLineEnd !== undefined && declaredLineEnd > lastChunk.startTime) {
        wordEndTime = declaredLineEnd;
      } else if (options?.nextLineTime && options.nextLineTime > lastChunk.startTime) {
        const fallback = lastChunk.startTime + (options.fallbackDuration ?? 0.8);
        wordEndTime = Math.min(options.nextLineTime, Math.max(lastChunk.startTime + 0.3, fallback));
      } else {
        wordEndTime = Math.round((lastChunk.startTime + (options?.fallbackDuration ?? 0.8)) * 1000) / 1000;
      }
    }

    if (wordEndTime <= wordStartTime) {
      wordEndTime = wordStartTime + 0.3;
    }

    const mergedText = wordGroup.chunks.map(c => c.text).join('');

    // Syllables within the word for sliding karaoke highlight
    const syllables: SyllableTiming[] = wordGroup.chunks.map((c, cIdx) => {
      const nextChunk = wordGroup.chunks[cIdx + 1];
      const sylStart = c.startTime;
      const sylEnd = nextChunk ? nextChunk.startTime : wordEndTime;
      const sMs = Math.round(sylStart * 1000);
      const eMs = Math.round(sylEnd * 1000);

      return {
        text: c.text,
        start_time: sylStart,
        end_time: sylEnd,
        start_ms: sMs,
        end_ms: eMs,
      };
    });

    const startMs = Math.round(wordStartTime * 1000);
    const endMs = Math.round(wordEndTime * 1000);

    result.push({
      text: mergedText,
      word: mergedText,
      start_time: wordStartTime,
      end_time: wordEndTime,
      start_ms: startMs,
      end_ms: endMs,
      syllables,
    });
  }

  return result;
}

/**
 * Returns a flat list of words [{ text, start_time, end_time }, ...] per line.
 */
export function parseLrcLineWords(
  line: string,
  options?: ParseLineOptions
): { text: string; start_time: number; end_time: number }[] {
  return parseEnhancedLrcLine(line, options).map(w => ({
    text: w.text!,
    start_time: w.start_time!,
    end_time: w.end_time!,
  }));
}

/**
 * Parses LRC format (both standard and enhanced syllable/word-timed format like <00:25.00>word).
 */
export function parseLRC(lrcContent: string): ParsedLyrics {
  const lines = lrcContent.split(/\r?\n/);
  let title: string | undefined;
  let artist: string | undefined;
  let offsetMs = 0;

  const rawLines: {
    timeMs: number;
    fullLine: string;
  }[] = [];

  const timeHeaderRegex = /\[(\d{1,2}):(\d{2}(?:\.\d+)?)\]/g;
  const metaRegex = /^\[([a-zA-Z]+):([^\]]*)\]/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check metadata tags
    const metaMatch = trimmed.match(metaRegex);
    if (metaMatch) {
      const tag = metaMatch[1].toLowerCase();
      const val = metaMatch[2].trim();
      if (tag === 'ti') {
        title = val;
        continue;
      } else if (tag === 'ar') {
        artist = val;
        continue;
      } else if (tag === 'offset') {
        offsetMs = parseInt(val, 10) || 0;
        continue;
      }
    }

    // Extract all leading timestamp headers: e.g. [00:25.00] or [00:25.00][01:25.00]
    timeHeaderRegex.lastIndex = 0;
    const timestamps: number[] = [];
    let lastMatchEnd = 0;
    let match: RegExpExecArray | null;

    while ((match = timeHeaderRegex.exec(trimmed)) !== null) {
      if (match.index === lastMatchEnd) {
        const mins = parseFloat(match[1]);
        const secs = parseFloat(match[2]);
        const ms = Math.round((mins * 60 + secs) * 1000);
        timestamps.push(ms);
        lastMatchEnd = timeHeaderRegex.lastIndex;
      } else {
        break;
      }
    }

    if (timestamps.length === 0) continue;

    const body = trimmed.slice(lastMatchEnd);

    // If line has multiple timestamps like [00:10][01:10] text, record for each
    for (const ts of timestamps) {
      rawLines.push({
        timeMs: Math.max(0, ts - offsetMs),
        fullLine: `[${formatTime(ts / 1000)}]${body}`,
      });
    }
  }

  // Sort lines by timestamp
  rawLines.sort((a, b) => a.timeMs - b.timeMs);

  const resultLyrics: LyricLine[] = [];

  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    const { timeMs, fullLine } = rawLines[lineIdx];
    const nextLineTimeMs = rawLines[lineIdx + 1]?.timeMs;
    const nextLineTimeSec = nextLineTimeMs ? nextLineTimeMs / 1000 : undefined;

    const wordTimings = parseEnhancedLrcLine(fullLine, {
      nextLineTime: nextLineTimeSec,
      offsetMs,
    });

    const cleanText = wordTimings.map(wt => wt.text || wt.word).join(' ');
    if (cleanText.length > 0) {
      resultLyrics.push({
        id: `lyric-lrc-${resultLyrics.length}`,
        time: timeMs / 1000,
        text: cleanText,
        wordTimings,
        blankedWords: [],
      });
    }
  }

  return {
    title,
    artist,
    lyrics: resultLyrics,
  };
}

/**
 * Unified lyrics parser that auto-detects JSON or LRC format.
 */
export function parseLyrics(content: string): ParsedLyrics {
  const trimmed = content.trim();
  if (trimmed.startsWith('[') && (trimmed.includes('"word"') || trimmed.includes('"start_ms"'))) {
    try {
      return parseJSONLyrics(trimmed);
    } catch {
      // Fall through to LRC
    }
  }
  return parseLRC(trimmed);
}

/**
 * Formats time in seconds to mm:ss format
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Fetches lyrics file from a relative URL and parses it as LRC or JSON
 */
export async function fetchAndParseLRC(url: string): Promise<ParsedLyrics> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch lyrics from ${url}: ${response.statusText}`);
    }
    const text = await response.text();
    return parseLyrics(text);
  } catch (error) {
    console.error('Error loading lyrics file:', error);
    return { lyrics: [] };
  }
}


