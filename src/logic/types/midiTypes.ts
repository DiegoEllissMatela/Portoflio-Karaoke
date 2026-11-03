/**
 * Types for MIDI parsing, synthesis, and tone guide playback
 */

export interface MidiHeader {
  format: number; // 0 = single track, 1 = multi-track synchronous, 2 = multi-track asynchronous
  trackCount: number;
  ticksPerQuarterNote: number; // Division (PPQ)
}

export interface MidiNoteEvent {
  tick: number;
  timeSec: number;
  durationSec: number;
  noteNumber: number; // 0 - 127
  noteName: string;   // e.g. "C4", "G#4"
  velocity: number;   // 0 - 127
  channel: number;    // 0 - 15 (channel 9 = percussion)
  trackIndex: number;
  isMelody: boolean;
  program?: number;   // General MIDI program (0 - 127)
}

export interface MidiLyricEvent {
  tick: number;
  timeSec: number;
  text: string;
  type: 'lyric' | 'text' | 'line-break';
  trackIndex: number;
}

export interface MidiTrackInfo {
  index: number;
  name: string;
  channels: number[];
  program: number;
  instrumentName: string;
  noteCount: number;
  isMelody: boolean;
}

export interface MidiSongData {
  title: string;
  artist: string;
  filename?: string;
  durationSec: number;
  division: number;
  bpm: number;
  tracks: MidiTrackInfo[];
  melodyTrackIndex: number;
  notes: MidiNoteEvent[];
  lyricEvents: MidiLyricEvent[];
  parsedLyrics?: import('./logicTypes').LyricLine[];
}

export interface MidiPlayerOptions {
  soundFontUrl?: string;
  enableToneGuideByDefault?: boolean;
  toneGuideVolume?: number; // 0.0 - 1.0 (default: 0.85)
  masterVolume?: number;    // 0.0 - 1.0 (default: 1.0)
}

export interface MidiPlaybackStatus {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  pitch: number; // semitones (-6 to +6)
  isToneGuideEnabled: boolean;
  toneGuideVolume: number;
  isLoading: boolean;
  audioMode: 'midi-synth' | 'audio-stream' | 'idle';
}
