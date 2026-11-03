import type { MidiNoteEvent, MidiLyricEvent, MidiTrackInfo, MidiSongData } from '../types/midiTypes';
import { extractMidiLyrics } from './wordAlignment';

/**
 * Standard note names for MIDI pitch numbers (0 - 127)
 */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiNoteToName(noteNumber: number): string {
  const octave = Math.floor(noteNumber / 12) - 1;
  const name = NOTE_NAMES[noteNumber % 12];
  return `${name}${octave}`;
}

/**
 * Converts MIDI note number to frequency in Hertz
 */
export function midiNoteToFreq(noteNumber: number, pitchOffsetSemitones = 0): number {
  return 440 * Math.pow(2, (noteNumber + pitchOffsetSemitones - 69) / 12);
}

/**
 * General MIDI Instrument Names map
 */
export const GM_INSTRUMENTS: Record<number, string> = {
  0: 'Acoustic Grand Piano',
  1: 'Bright Acoustic Piano',
  2: 'Electric Grand Piano',
  4: 'Electric Piano 1',
  5: 'Electric Piano 2',
  16: 'Drawbar Organ',
  19: 'Church Organ',
  24: 'Acoustic Guitar (nylon)',
  25: 'Acoustic Guitar (steel)',
  26: 'Electric Guitar (jazz)',
  27: 'Electric Guitar (clean)',
  28: 'Electric Guitar (muted)',
  29: 'Overdriven Guitar',
  30: 'Distortion Guitar',
  32: 'Acoustic Bass',
  33: 'Electric Bass (finger)',
  34: 'Electric Bass (pick)',
  35: 'Fretless Bass',
  36: 'Slap Bass 1',
  37: 'Slap Bass 2',
  38: 'Synth Bass 1',
  39: 'Synth Bass 2',
  40: 'Violin',
  41: 'Viola',
  42: 'Cello',
  48: 'String Ensemble 1',
  49: 'String Ensemble 2',
  56: 'Trumpet',
  57: 'Trombone',
  60: 'French Horn',
  61: 'Brass Section',
  65: 'Alto Sax',
  66: 'Tenor Sax',
  71: 'Clarinet',
  73: 'Flute',
  75: 'Pan Flute',
  80: 'Lead 1 (square)',
  81: 'Lead 2 (sawtooth)',
  88: 'Pad 1 (new age)',
  89: 'Pad 2 (warm)',
};

interface TempoChange {
  tick: number;
  usPerQuarter: number;
  timeSec: number;
}

/**
 * Parser for Standard MIDI Files (SMF format 0 and 1)
 */
export class MidiParser {
  private view: DataView;
  private offset = 0;

  constructor(buffer: ArrayBuffer | Uint8Array) {
    if (buffer instanceof Uint8Array) {
      this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else {
      this.view = new DataView(buffer);
    }
  }

  public parse(): MidiSongData {
    this.offset = 0;

    // Read header chunk: 'MThd'
    const headerChunkType = this.readString(4);
    if (headerChunkType !== 'MThd') {
      throw new Error(`Invalid MIDI file header: expected MThd, got "${headerChunkType}"`);
    }

    const headerLength = this.view.getUint32(this.offset);
    this.offset += 4;
    if (headerLength < 6) {
      throw new Error(`Invalid MIDI header length: ${headerLength}`);
    }

    // format (0 = single track, 1 = multi-track sync, 2 = multi-track async)
    this.offset += 2;
    const trackCount = this.view.getUint16(this.offset);
    this.offset += 2;
    const division = this.view.getUint16(this.offset);
    this.offset += 2;

    // Skip any extra header bytes if length > 6
    if (headerLength > 6) {
      this.offset += headerLength - 6;
    }

    const ticksPerQuarterNote = (division & 0x8000) === 0 ? division : 120;

    // Raw tracks container
    const tracksRaw: {
      trackIndex: number;
      name: string;
      channels: Set<number>;
      programs: Map<number, number>;
      rawNotes: {
        note: number;
        velocity: number;
        channel: number;
        startTick: number;
        endTick?: number;
      }[];
      lyrics: MidiLyricEvent[];
      tempos: { tick: number; usPerQuarter: number }[];
      endTick?: number;
    }[] = [];

    // Parse each Track chunk: 'MTrk'
    for (let t = 0; t < trackCount && this.offset < this.view.byteLength; t++) {
      if (this.offset + 8 > this.view.byteLength) break;

      const chunkType = this.readString(4);
      const chunkLength = this.view.getUint32(this.offset);
      this.offset += 4;

      if (chunkType !== 'MTrk') {
        // Skip non-track chunks
        this.offset += chunkLength;
        continue;
      }

      const trackEnd = this.offset + chunkLength;
      let currentTick = 0;
      let lastStatus = 0;

      let trackName = '';
      const trackChannels = new Set<number>();
      const trackPrograms = new Map<number, number>();
      const openNotes: Map<string, { note: number; velocity: number; channel: number; startTick: number }> = new Map();
      const closedNotes: { note: number; velocity: number; channel: number; startTick: number; endTick: number }[] = [];
      const trackLyrics: MidiLyricEvent[] = [];
      const trackTempos: { tick: number; usPerQuarter: number }[] = [];
      let trackEndTick = 0;

      while (this.offset < trackEnd) {
        // Read delta time (VLQ)
        const delta = this.readVarInt();
        currentTick += delta;

        let statusByte = this.view.getUint8(this.offset);

        // Running status check
        if ((statusByte & 0x80) === 0) {
          statusByte = lastStatus;
        } else {
          this.offset++;
          lastStatus = statusByte;
        }

        // Meta Events
        if (statusByte === 0xFF) {
          const metaType = this.view.getUint8(this.offset++);
          const metaLength = this.readVarInt();
          const metaDataOffset = this.offset;
          this.offset += metaLength;

          if (metaType === 0x03) {
            // Track Name
            trackName = this.readStringFromOffset(metaDataOffset, metaLength).trim();
          } else if (metaType === 0x01 || metaType === 0x05) {
            // Text (0x01) or Lyric (0x05)
            const lyricText = this.readStringFromOffset(metaDataOffset, metaLength);
            if (lyricText && !/^\0+$/.test(lyricText)) {
              const isBreakOnly = /^[\r\n]+$/.test(lyricText);
              trackLyrics.push({
                tick: currentTick,
                timeSec: 0, // Computed below
                text: lyricText,
                type: isBreakOnly ? 'line-break' : (metaType === 0x05 ? 'lyric' : 'text'),
                trackIndex: t,
              });
            }
          } else if (metaType === 0x51 && metaLength === 3) {
            // Set Tempo (microseconds per quarter note)
            const b0 = this.view.getUint8(metaDataOffset);
            const b1 = this.view.getUint8(metaDataOffset + 1);
            const b2 = this.view.getUint8(metaDataOffset + 2);
            const usPerQuarter = (b0 << 16) | (b1 << 8) | b2;
            trackTempos.push({ tick: currentTick, usPerQuarter });
          } else if (metaType === 0x2F) {
            // End of track
            trackEndTick = currentTick;
            break;
          }
          continue;
        }

        // SysEx Events
        if (statusByte === 0xF0 || statusByte === 0xF7) {
          const sysexLength = this.readVarInt();
          this.offset += sysexLength;
          continue;
        }

        // Channel Voice Events
        const eventType = statusByte & 0xF0;
        const channel = statusByte & 0x0F;
        trackChannels.add(channel);

        if (eventType === 0x90) {
          // Note On
          const noteNumber = this.view.getUint8(this.offset++);
          const velocity = this.view.getUint8(this.offset++);
          const noteKey = `${channel}-${noteNumber}`;

          if (velocity > 0) {
            // If already open, close it first
            if (openNotes.has(noteKey)) {
              const existing = openNotes.get(noteKey)!;
              closedNotes.push({ ...existing, endTick: currentTick });
            }
            openNotes.set(noteKey, { note: noteNumber, velocity, channel, startTick: currentTick });
          } else {
            // Velocity 0 is Note Off
            if (openNotes.has(noteKey)) {
              const existing = openNotes.get(noteKey)!;
              openNotes.delete(noteKey);
              closedNotes.push({ ...existing, endTick: currentTick });
            }
          }
        } else if (eventType === 0x80) {
          // Note Off
          const noteNumber = this.view.getUint8(this.offset++);
          this.offset++; // skip release velocity
          const noteKey = `${channel}-${noteNumber}`;
          if (openNotes.has(noteKey)) {
            const existing = openNotes.get(noteKey)!;
            openNotes.delete(noteKey);
            closedNotes.push({ ...existing, endTick: currentTick });
          }
        } else if (eventType === 0xC0) {
          // Program Change
          const program = this.view.getUint8(this.offset++);
          trackPrograms.set(channel, program);
        } else if (eventType === 0xB0) {
          // Control Change
          this.offset += 2;
        } else if (eventType === 0xA0) {
          // Polyphonic Aftertouch
          this.offset += 2;
        } else if (eventType === 0xD0) {
          // Channel Aftertouch
          this.offset += 1;
        } else if (eventType === 0xE0) {
          // Pitch Bend
          this.offset += 2;
        }
      }

      if (trackEndTick === 0) {
        trackEndTick = currentTick;
      }

      // Close any dangling notes
      for (const [, dangling] of openNotes) {
        closedNotes.push({ ...dangling, endTick: currentTick + ticksPerQuarterNote });
      }

      // Ensure offset matches chunk length exactly
      this.offset = trackEnd;

      tracksRaw.push({
        trackIndex: t,
        name: trackName,
        channels: trackChannels,
        programs: trackPrograms,
        rawNotes: closedNotes,
        lyrics: trackLyrics,
        tempos: trackTempos,
        endTick: trackEndTick,
      });
    }

    // Combine and sort all tempo changes across all tracks
    const allTempos: { tick: number; usPerQuarter: number }[] = [];
    tracksRaw.forEach(t => allTempos.push(...t.tempos));
    allTempos.sort((a, b) => a.tick - b.tick);

    // Build timeline tempo changes
    const tempoMap: TempoChange[] = [];
    let currentUs = 500000; // Default 120 BPM (500,000 us/quarter)
    let lastTick = 0;
    let accumulatedTime = 0;

    if (allTempos.length === 0 || allTempos[0].tick > 0) {
      tempoMap.push({ tick: 0, usPerQuarter: currentUs, timeSec: 0 });
    }

    for (const tc of allTempos) {
      if (tc.tick > lastTick) {
        const deltaTicks = tc.tick - lastTick;
        accumulatedTime += (deltaTicks / ticksPerQuarterNote) * (currentUs / 1000000);
        lastTick = tc.tick;
      }
      currentUs = tc.usPerQuarter;
      tempoMap.push({ tick: tc.tick, usPerQuarter: currentUs, timeSec: accumulatedTime });
    }

    const tickToSeconds = (tick: number): number => {
      let activeTempo = tempoMap[0];
      for (let i = 0; i < tempoMap.length; i++) {
        if (tempoMap[i].tick <= tick) {
          activeTempo = tempoMap[i];
        } else {
          break;
        }
      }
      const deltaTicks = tick - activeTempo.tick;
      return activeTempo.timeSec + (deltaTicks / ticksPerQuarterNote) * (activeTempo.usPerQuarter / 1000000);
    };

    // Calculate initial BPM from first tempo
    const initialUs = tempoMap.length > 0 ? tempoMap[0].usPerQuarter : 500000;
    const initialBpm = Math.round((60000000 / initialUs) * 10) / 10;

    // Identify Melody / Vocal Track
    // 1. Explicit track name match (e.g. "Melody", "Vocal", "Lead")
    // 2. Track with lyric events
    // 3. Track with single-note melody profile in vocal pitch range
    let melodyTrackIndex = -1;
    for (const trk of tracksRaw) {
      if (/melody|vocal|lead/i.test(trk.name)) {
        melodyTrackIndex = trk.trackIndex;
        break;
      }
    }

    if (melodyTrackIndex === -1) {
      for (const trk of tracksRaw) {
        if (trk.lyrics.length > 0) {
          melodyTrackIndex = trk.trackIndex;
          break;
        }
      }
    }

    if (melodyTrackIndex === -1 && tracksRaw.length > 1) {
      // Fallback: track 1 is standard General MIDI melody
      melodyTrackIndex = 1;
    } else if (melodyTrackIndex === -1) {
      melodyTrackIndex = 0;
    }

    // Convert notes and lyrics to absolute time (seconds)
    const allNotes: MidiNoteEvent[] = [];
    const allLyrics: MidiLyricEvent[] = [];
    let maxTimeSec = 0;

    tracksRaw.forEach((trk) => {
      const isMelody = trk.trackIndex === melodyTrackIndex;

      trk.rawNotes.forEach((n) => {
        const startSec = tickToSeconds(n.startTick);
        const endSec = tickToSeconds(n.endTick ?? (n.startTick + ticksPerQuarterNote));
        const durSec = Math.max(0.05, endSec - startSec);

        if (endSec > maxTimeSec) {
          maxTimeSec = endSec;
        }

        const noteProgram = trk.programs.get(n.channel) ?? 0;

        allNotes.push({
          tick: n.startTick,
          timeSec: Math.round(startSec * 1000) / 1000,
          durationSec: Math.round(durSec * 1000) / 1000,
          noteNumber: n.note,
          noteName: midiNoteToName(n.note),
          velocity: n.velocity,
          channel: n.channel,
          trackIndex: trk.trackIndex,
          isMelody,
          program: noteProgram,
        });
      });

      trk.lyrics.forEach((lyr) => {
        const lyrSec = tickToSeconds(lyr.tick);
        if (lyrSec > maxTimeSec) {
          maxTimeSec = lyrSec;
        }
        allLyrics.push({
          ...lyr,
          timeSec: Math.round(lyrSec * 1000) / 1000,
        });
      });

      if (trk.endTick && trk.endTick > 0) {
        const trkSec = tickToSeconds(trk.endTick);
        if (trkSec > maxTimeSec) {
          maxTimeSec = trkSec;
        }
      }
    });

    // Sort notes and lyrics in temporal order
    allNotes.sort((a, b) => a.timeSec - b.timeSec);
    allLyrics.sort((a, b) => a.timeSec - b.timeSec);

    // Build track summary info
    const trackInfos: MidiTrackInfo[] = tracksRaw.map((trk) => {
      const prog = trk.programs.size > 0 ? Array.from(trk.programs.values())[0] : 0;
      return {
        index: trk.trackIndex,
        name: trk.name || `Track ${trk.trackIndex}`,
        channels: Array.from(trk.channels),
        program: prog,
        instrumentName: GM_INSTRUMENTS[prog] || `Prog ${prog}`,
        noteCount: trk.rawNotes.length,
        isMelody: trk.trackIndex === melodyTrackIndex,
      };
    });

    const songData: MidiSongData = {
      title: tracksRaw[0]?.name || 'Unknown Track',
      artist: 'Songhub MIDI',
      durationSec: Math.round(maxTimeSec * 10) / 10,
      division: ticksPerQuarterNote,
      bpm: initialBpm,
      tracks: trackInfos,
      melodyTrackIndex,
      notes: allNotes,
      lyricEvents: allLyrics,
    };

    songData.parsedLyrics = extractMidiLyrics(songData);
    return songData;
  }

  private readString(length: number): string {
    let str = '';
    for (let i = 0; i < length && this.offset < this.view.byteLength; i++) {
      str += String.fromCharCode(this.view.getUint8(this.offset++));
    }
    return str;
  }

  private readStringFromOffset(offset: number, length: number): string {
    const bytes: number[] = [];
    for (let i = 0; i < length && (offset + i) < this.view.byteLength; i++) {
      bytes.push(this.view.getUint8(offset + i));
    }
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
    } catch {
      return bytes.map(b => String.fromCharCode(b)).join('');
    }
  }

  private readVarInt(): number {
    let result = 0;
    while (this.offset < this.view.byteLength) {
      const byte = this.view.getUint8(this.offset++);
      result = (result << 7) | (byte & 0x7F);
      if ((byte & 0x80) === 0) break;
    }
    return result;
  }
}
