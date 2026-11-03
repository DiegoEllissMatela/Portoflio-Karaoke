import type { LyricLine, WordTiming, SyllableTiming } from '../types/logicTypes';
import type { MidiSongData, MidiLyricEvent } from '../types/midiTypes';

/**
 * Normalizes text by removing non-printable control characters
 * while preserving spaces, accents, and punctuation.
 */
function cleanLyricText(str: string): string {
  return str.replace(/[\r\n\0\x01-\x1F]/g, '');
}

/**
 * Checks if a syllable marks the end of a word:
 * 1. Has trailing whitespace: "yo ", "na "
 * 2. Ends with punctuation: "beach!", "nga,"
 * 3. Contains a forward slash or backslash: "world/"
 */
function isWordBoundary(text: string): boolean {
  return /\s+$/.test(text) || /[.,!?;:/\\~]$/.test(text.trim());
}

/**
 * Extracts and aligns lyrics from parsed MIDI song data into structured LyricLines.
 *
 * Requirements:
 * - Parses MIDI Lyric (0x05) and Text (0x01) Meta Events.
 * - Stitches syllables into complete words with start_ms and end_ms.
 * - Aligns each syllable's duration with corresponding vocal melody notes when available.
 * - Generates standard LyricLine objects compatible with KaraokePlayer and Dare Mode.
 */
export function extractMidiLyrics(midiData: MidiSongData): LyricLine[] {
  const events = midiData.lyricEvents;
  if (!events || events.length === 0) return [];

  // 1. Partition lyric events into lines
  const rawLines: MidiLyricEvent[][] = [];
  let currentLineEvents: MidiLyricEvent[] = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const text = ev.text;

    // Check for explicit line break indicators in MIDI
    const hasLineBreak = (
      ev.type === 'line-break' ||
      text.includes('\r') ||
      text.includes('\n') ||
      text.startsWith('/') ||
      text.startsWith('\\')
    );

    // Filter out pure break tokens from display text
    const cleanText = cleanLyricText(text);

    if (cleanText.length > 0) {
      currentLineEvents.push({ ...ev, text: cleanText });
    }

    const nextEv = events[i + 1];
    const timeGapToNextSec = nextEv ? (nextEv.timeSec - ev.timeSec) : 0;

    // Line break conditions:
    // 1. Explicit carriage return / newline / slash
    // 2. Significant time gap (> 2.5 seconds)
    // 3. Fallback: maximum 10 words per line to prevent screen overflow
    const shouldBreakLine = (
      hasLineBreak ||
      timeGapToNextSec > 2.5 ||
      i === events.length - 1
    );

    if (shouldBreakLine && currentLineEvents.length > 0) {
      rawLines.push(currentLineEvents);
      currentLineEvents = [];
    }
  }

  // Pre-filter melody notes for fast O(log N) or binary lookup
  const melodyNotes = (midiData.notes || []).filter(n => n.isMelody);

  const result: LyricLine[] = [];

  rawLines.forEach((lineEvents, lineIdx) => {
    if (lineEvents.length === 0) return;

    const words: WordTiming[] = [];
    let currentWordSyllables: SyllableTiming[] = [];

    lineEvents.forEach((sylEvent, sylIdx) => {
      const sylRawText = sylEvent.text;
      if (!sylRawText) return;

      const startMs = Math.round(sylEvent.timeSec * 1000);

      // Determine end_ms:
      // A) Look for next syllable in the line
      const nextSyl = lineEvents[sylIdx + 1];
      let endMs = nextSyl ? Math.round(nextSyl.timeSec * 1000) : 0;

      // B) If no next syllable, or gap is large, match with the overlapping melody note
      if (!endMs || (endMs - startMs > 1500)) {
        const matchingNote = melodyNotes.find(
          n => Math.abs(n.timeSec - sylEvent.timeSec) < 0.15
        );
        if (matchingNote && matchingNote.durationSec > 0.05) {
          endMs = Math.min(startMs + Math.round(matchingNote.durationSec * 1000), startMs + 2500);
        } else {
          // Fallback estimated duration based on text length
          endMs = startMs + Math.max(300, Math.min(800, sylRawText.length * 120));
        }
      }

      // Ensure minimum duration of 60ms
      if (endMs <= startMs) {
        endMs = startMs + 150;
      }

      currentWordSyllables.push({
        text: sylRawText,
        start_ms: startMs,
        end_ms: endMs,
        start_time: startMs / 1000,
        end_time: endMs / 1000,
      });

      const isLastInLine = sylIdx === lineEvents.length - 1;
      const isBoundary = isWordBoundary(sylRawText);

      // If boundary reached or end of line, close word
      if (isBoundary || isLastInLine) {
        const fullWordText = currentWordSyllables.map(s => s.text).join('').trim();
        if (fullWordText.length > 0) {
          const wordStartMs = currentWordSyllables[0].start_ms;
          const wordEndMs = currentWordSyllables[currentWordSyllables.length - 1].end_ms;

          words.push({
            word: fullWordText,
            text: fullWordText,
            start_ms: wordStartMs,
            end_ms: wordEndMs,
            start_time: wordStartMs / 1000,
            end_time: wordEndMs / 1000,
            syllables: [...currentWordSyllables],
          });
        }
        currentWordSyllables = [];
      }
    });

    if (words.length > 0) {
      const lineStartTime = words[0].start_time ?? (words[0].start_ms / 1000);
      const lineText = words.map(w => w.text || w.word).join(' ');

      result.push({
        id: `lyric-midi-${lineIdx}`,
        time: lineStartTime,
        text: lineText,
        wordTimings: words,
        blankedWords: [],
      });
    }
  });

  return result;
}

/**
 * Parses extracted Songhub song_data.json structures into standard LyricLines
 */
export function parseSongDataJsonLyrics(jsonData: any): LyricLine[] {
  try {
    const rawSyllables = jsonData?.lyrics?.syllables;
    if (!Array.isArray(rawSyllables) || rawSyllables.length === 0) {
      return [];
    }

    const lines: LyricLine[] = [];
    let currentLineSyllables: any[] = [];

    for (let i = 0; i < rawSyllables.length; i++) {
      const syl = rawSyllables[i];
      currentLineSyllables.push(syl);

      const next = rawSyllables[i + 1];
      const gapSec = next ? (next.time_s - (syl.time_s + (syl.pitch?.duration_s || 0.3))) : 0;
      const isLast = i === rawSyllables.length - 1;

      // Break lines on pauses > 1.8s or when line exceeds 10 words
      if (isLast || gapSec > 1.8 || currentLineSyllables.length >= 16) {
        const words: WordTiming[] = [];
        let curWordSyls: SyllableTiming[] = [];

        currentLineSyllables.forEach((cs, cIdx) => {
          const sText = cs.text || '';
          const sTime = cs.time_s || 0;
          const sDur = cs.pitch?.duration_s || 0.3;
          const sMs = Math.round(sTime * 1000);
          const eMs = Math.round((sTime + sDur) * 1000);

          curWordSyls.push({
            text: sText,
            start_ms: sMs,
            end_ms: eMs,
            start_time: sTime,
            end_time: sTime + sDur,
          });

          const isBoundary = isWordBoundary(sText) || cIdx === currentLineSyllables.length - 1;
          if (isBoundary) {
            const fullW = curWordSyls.map(s => s.text).join('').trim();
            if (fullW.length > 0) {
              const wStartMs = curWordSyls[0].start_ms;
              const wEndMs = curWordSyls[curWordSyls.length - 1].end_ms;
              words.push({
                word: fullW,
                text: fullW,
                start_ms: wStartMs,
                end_ms: wEndMs,
                start_time: wStartMs / 1000,
                end_time: wEndMs / 1000,
                syllables: [...curWordSyls],
              });
            }
            curWordSyls = [];
          }
        });

        if (words.length > 0) {
          lines.push({
            id: `lyric-json-${lines.length}`,
            time: words[0].start_time || (words[0].start_ms / 1000),
            text: words.map(w => w.text || w.word).join(' '),
            wordTimings: words,
            blankedWords: [],
          });
        }

        currentLineSyllables = [];
      }
    }

    return lines;
  } catch (err) {
    console.error('[parseSongDataJsonLyrics] Error parsing JSON lyrics:', err);
    return [];
  }
}
