import type { LyricLine, WordTiming } from '../types/logicTypes';

export interface ParsedLyrics {
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
 * Formats time in seconds to mm:ss format
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Fetches lyrics file from a relative URL and parses it as JSON
 */
export async function fetchAndParseLRC(url: string): Promise<ParsedLyrics> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch lyrics from ${url}: ${response.statusText}`);
    }
    const text = await response.text();
    return parseJSONLyrics(text);
  } catch (error) {
    console.error('Error loading lyrics file:', error);
    return { lyrics: [] };
  }
}

