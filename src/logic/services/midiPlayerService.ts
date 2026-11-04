/**
 * ============================================================================
 * MIDI & AUDIO PLAYBACK SERVICE WITH MEGA.SF2 SOUNDFONT SYNTHESIS
 * ============================================================================
 *
 * Implements high-fidelity SoundFont sample synthesis matching Songhub:
 * - Powered by SpessaSynth WebAssembly/Core soundfont engine
 * - Uses exact 98.5 MB studio SoundFont (mega.sf2)
 * - 128-voice polyphony with sample-accurate rendering
 * - Channel 10 drum protection & isolated melody tone guide
 * - Hybrid support for pre-extracted audio streams (.wav / .mp3)
 *
 * ============================================================================
 */

import { SpessaSynthProcessor, SoundBankLoader } from 'spessasynth_core';
import { soundfontLoader } from './soundfontLoader';
import { AudioDspChain } from './audioDspChain';
import { MidiParser } from '../utils/midiParser';
import type { MidiSongData, MidiNoteEvent, MidiPlaybackStatus, MidiPlayerOptions } from '../types/midiTypes';

export type TimeUpdateCallback = (currentTime: number) => void;
export type DurationChangeCallback = (duration: number) => void;
export type PlaybackEndedCallback = () => void;
export type LoadingChangeCallback = (isLoading: boolean) => void;
export type StatusChangeCallback = (status: MidiPlaybackStatus) => void;

interface ActiveNoteVoice {
  channel: number;
  note: number;
  stopSec: number;
}

export class MidiPlayerService {
  private static instance: MidiPlayerService | null = null;

  // Web Audio Context & Nodes
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private backingGain: GainNode | null = null;
  private toneGuideGain: GainNode | null = null;
  private dspChain: AudioDspChain | null = null;
  private scriptNode: ScriptProcessorNode | null = null;

  // SoundFont Synthesis Engine
  private synth: SpessaSynthProcessor | null = null;
  private isSoundfontLoaded = false;
  private isSoundfontLoading = false;
  private channelProgramCache: number[] = new Array(16).fill(-1);
  private activeNotes: ActiveNoteVoice[] = [];

  // Pre-extracted HTMLAudio Fallback elements
  private audioElement: HTMLAudioElement | null = null;
  private toneGuideAudioElement: HTMLAudioElement | null = null;
  private audioSourceNode: MediaElementAudioSourceNode | null = null;
  private toneGuideSourceNode: MediaElementAudioSourceNode | null = null;

  // Current Song & Scheduling State
  private parsedSong: MidiSongData | null = null;
  private currentMode: 'midi-synth' | 'audio-stream' | 'idle' = 'idle';

  private isPlayingState = false;
  private currentTimeState = 0;
  private durationState = 0;
  private volumeState = 1.0;
  private isMutedState = false;
  private pitchSemitones = 0;
  private isToneGuideEnabledState = true;
  private toneGuideVolumeState = 0.50; // Songhub Level 5 Default (50% / -6 dB)
  private isLoadingState = false;

  // Scheduler internals
  private playbackStartTime = 0;
  private playbackStartOffset = 0;
  private schedulerTimerId: number | null = null;
  private animFrameId: number | null = null;
  private nextNoteIndex = 0;

  // Subscriptions
  private timeUpdateListeners: Set<TimeUpdateCallback> = new Set();
  private durationChangeListeners: Set<DurationChangeCallback> = new Set();
  private endedListeners: Set<PlaybackEndedCallback> = new Set();
  private loadingChangeListeners: Set<LoadingChangeCallback> = new Set();
  private statusChangeListeners: Set<StatusChangeCallback> = new Set();

  private constructor(options?: MidiPlayerOptions) {
    if (options?.enableToneGuideByDefault !== undefined) {
      this.isToneGuideEnabledState = options.enableToneGuideByDefault;
    }
    if (options?.toneGuideVolume !== undefined) {
      this.toneGuideVolumeState = options.toneGuideVolume;
    }
    if (options?.masterVolume !== undefined) {
      this.volumeState = options.masterVolume;
    }
  }

  public static getInstance(options?: MidiPlayerOptions): MidiPlayerService {
    if (!MidiPlayerService.instance) {
      MidiPlayerService.instance = new MidiPlayerService(options);
    }
    return MidiPlayerService.instance;
  }

  /**
   * Initializes the Web Audio graph and SpessaSynth SoundFont audio processor
   */
  public async initAudio(): Promise<AudioContext> {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      // Master gain
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.isMutedState ? 0 : this.volumeState;

      // Backing accompaniment channel
      this.backingGain = this.audioCtx.createGain();
      this.backingGain.gain.value = 1.0;

      // Tone Guide channel (isolated for vocal melody)
      this.toneGuideGain = this.audioCtx.createGain();
      this.toneGuideGain.gain.value = this.isToneGuideEnabledState ? this.toneGuideVolumeState : 0;

      // Songhub Acoustic DSP Chain: 3-band EQ (+3.5 dB 80Hz bass boost), Reverb, Chorus, Compressor
      this.dspChain = new AudioDspChain(this.audioCtx);

      // Route: backingGain & toneGuideGain -> dspChain -> masterGain -> destination
      this.backingGain.connect(this.dspChain.inputNode);
      this.toneGuideGain.connect(this.dspChain.inputNode);
      this.dspChain.outputNode.connect(this.masterGain);
      this.masterGain.connect(this.audioCtx.destination);

      // Create SoundFont Processor Node (2048 buffer size = ~46ms chunk @ 44.1kHz)
      this.scriptNode = this.audioCtx.createScriptProcessor(2048, 0, 2);
      this.scriptNode.onaudioprocess = (event) => {
        const outL = event.outputBuffer.getChannelData(0);
        const outR = event.outputBuffer.getChannelData(1);

        if (this.synth && this.isSoundfontLoaded && this.isPlayingState) {
          // Render audio in 128-sample slices
          for (let offset = 0; offset < outL.length; offset += 128) {
            this.synth.process(outL, outR, offset, 128);
          }
        } else {
          outL.fill(0);
          outR.fill(0);
        }
      };

      this.scriptNode.connect(this.backingGain);

      // Initialize SoundFont engine
      this.synth = new SpessaSynthProcessor(this.audioCtx.sampleRate);
    }

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    return this.audioCtx;
  }

  /**
   * Pre-hydrates the mega.sf2 SoundFont into the synth engine
   */
  public async ensureSoundfont(): Promise<void> {
    if (this.isSoundfontLoaded) return;
    if (this.isSoundfontLoading) {
      while (this.isSoundfontLoading) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return;
    }

    this.isSoundfontLoading = true;
    try {
      await this.initAudio();
      const sfBuffer = await soundfontLoader.loadSoundfont();
      if (this.synth) {
        const loadedBank = SoundBankLoader.fromArrayBuffer(sfBuffer);
        this.synth.soundBankManager.addSoundBank(loadedBank, 'mega_sf2', 0);
        this.synth.reset();
        this.isSoundfontLoaded = true;
        this.channelProgramCache.fill(-1);
      }
    } finally {
      this.isSoundfontLoading = false;
    }
  }

  /**
   * Loads a song source: accepts MIDI URL, raw ArrayBuffer, or Audio Stream URL (.wav/.mp3/.opus)
   */
  public async loadSource(
    source: string | ArrayBuffer,
    options?: {
      title?: string;
      artist?: string;
      toneGuideAudioUrl?: string;
    }
  ): Promise<MidiSongData | null> {
    this.setLoading(true);
    this.stopPlayback();

    try {
      if (typeof source === 'string' && source.match(/\.(opus|mp3|wav|ogg|m4a|aac)$/i)) {
        // Streamed Audio Mode
        await this.loadAudioStream(source, options?.toneGuideAudioUrl);
        this.currentMode = 'audio-stream';
        this.parsedSong = null;
      } else {
        // MIDI File Mode
        let buffer: ArrayBuffer;
        if (typeof source === 'string') {
          const response = await fetch(source);
          if (!response.ok) throw new Error(`HTTP ${response.status} fetching MIDI: ${source}`);
          buffer = await response.arrayBuffer();
        } else {
          buffer = source;
        }

        // Validate Standard MIDI Header ('MThd')
        const header = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
        const isMidi =
          header.length >= 4 &&
          header[0] === 0x4d && // 'M'
          header[1] === 0x54 && // 'T'
          header[2] === 0x68 && // 'h'
          header[3] === 0x64;   // 'd'

        if (!isMidi) {
          throw new Error(`Invalid MIDI file header for "${source}". Received non-MIDI data (likely HTML rewrite).`);
        }

        const parser = new MidiParser(buffer);
        const data = parser.parse();
        if (options?.title) data.title = options.title;
        if (options?.artist) data.artist = options.artist;

        this.parsedSong = data;
        this.currentMode = 'midi-synth';
        this.durationState = data.durationSec;
        this.notifyDurationChange(this.durationState);

        // Preload SoundFont in parallel so playback is instant
        this.ensureSoundfont().catch((err) => console.warn('[MidiPlayerService] SoundFont pre-warm error:', err));
      }

      this.currentTimeState = 0;
      this.notifyTimeUpdate(0);
      this.notifyStatusChange();
      return this.parsedSong;
    } catch (err) {
      console.error('[MidiPlayerService] Error loading song source:', err);
      throw err;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Plays the current loaded song
   */
  public async play(): Promise<void> {
    await this.initAudio();

    if (this.isPlayingState) return;

    if (this.currentMode === 'audio-stream') {
      if (this.audioElement) {
        await this.audioElement.play();
        if (this.toneGuideAudioElement && this.isToneGuideEnabledState) {
          await this.toneGuideAudioElement.play().catch(() => {});
        }
      }
    } else if (this.currentMode === 'midi-synth') {
      if (!this.parsedSong) return;
      await this.ensureSoundfont();

      this.playbackStartTime = this.audioCtx!.currentTime;
      this.playbackStartOffset = this.currentTimeState;
      this.locateNextNoteIndex(this.currentTimeState);
      this.startMidiScheduler();
    }

    this.isPlayingState = true;
    this.startProgressTracker();
    this.notifyStatusChange();
  }

  /**
   * Pauses playback
   */
  public pause(): void {
    if (!this.isPlayingState) return;

    if (this.currentMode === 'audio-stream') {
      this.audioElement?.pause();
      this.toneGuideAudioElement?.pause();
    } else if (this.currentMode === 'midi-synth') {
      this.stopMidiScheduler();
      this.silenceActiveVoices();
    }

    this.isPlayingState = false;
    this.stopProgressTracker();
    this.notifyStatusChange();
  }

  /**
   * Toggles play/pause
   */
  public togglePlay(): void {
    if (this.isPlayingState) {
      this.pause();
    } else {
      this.play().catch(console.error);
    }
  }

  /**
   * Seeks to a specific timestamp in seconds
   */
  public seek(seconds: number): void {
    const target = Math.max(0, Math.min(seconds, this.durationState || 99999));
    this.currentTimeState = target;

    if (this.currentMode === 'audio-stream') {
      if (this.audioElement) this.audioElement.currentTime = target;
      if (this.toneGuideAudioElement) this.toneGuideAudioElement.currentTime = target;
    } else if (this.currentMode === 'midi-synth') {
      this.silenceActiveVoices();
      this.playbackStartOffset = target;
      this.locateNextNoteIndex(target);
      if (this.isPlayingState && this.audioCtx) {
        this.playbackStartTime = this.audioCtx.currentTime;
      }
    }

    this.notifyTimeUpdate(target);
    this.notifyStatusChange();
  }

  /**
   * Sets master volume (0.0 to 1.0)
   */
  public setVolume(volume: number): void {
    this.volumeState = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.masterGain.gain.setValueAtTime(this.isMutedState ? 0 : this.volumeState, now);
    }
    if (this.audioElement) {
      this.audioElement.volume = this.volumeState;
    }
    this.notifyStatusChange();
  }

  /**
   * Toggles audio mute
   */
  public toggleMute(): void {
    this.setMuted(!this.isMutedState);
  }

  public setMuted(muted: boolean): void {
    this.isMutedState = muted;
    if (this.masterGain && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.masterGain.gain.setValueAtTime(this.isMutedState ? 0 : this.volumeState, now);
    }
    if (this.audioElement) {
      this.audioElement.muted = this.isMutedState;
    }
    this.notifyStatusChange();
  }

  /**
   * Sets song pitch in semitones (-6 to +6) with Channel 10 drum protection & CC 123 flush
   */
  public setPitch(semitones: number): void {
    const clamped = Math.max(-6, Math.min(6, Math.round(semitones)));
    if (this.pitchSemitones === clamped) return;
    this.pitchSemitones = clamped;

    if (this.currentMode === 'audio-stream' && this.audioElement) {
      const rate = Math.pow(2, this.pitchSemitones / 12);
      this.audioElement.playbackRate = rate;
      if (this.toneGuideAudioElement) {
        this.toneGuideAudioElement.playbackRate = rate;
      }
    } else if (this.currentMode === 'midi-synth') {
      // Broadcast MIDI CC 123 (All Notes Off) & CC 120 (All Sound Off) across all channels
      if (this.synth) {
        for (let ch = 0; ch < 16; ch++) {
          try {
            this.synth.controllerChange(ch, 123, 0);
            this.synth.controllerChange(ch, 120, 0);
          } catch {}
        }
      }
      this.silenceActiveVoices();
    }

    this.notifyStatusChange();
  }

  public transposeUp(): void {
    this.setPitch(this.pitchSemitones + 1);
  }

  public transposeDown(): void {
    this.setPitch(this.pitchSemitones - 1);
  }

  public resetPitch(): void {
    this.setPitch(0);
  }

  public getPitch(): number {
    return this.pitchSemitones;
  }

  // ==========================================================================
  // SONGHUB ACOUSTIC DSP CONTROLS (3-BAND EQ, REVERB, CHORUS)
  // ==========================================================================

  public setBassGain(db: number): void {
    this.dspChain?.setBassGain(db);
  }

  public getBassGain(): number {
    return this.dspChain?.getBassGain() ?? 3.5;
  }

  public setMidGain(db: number): void {
    this.dspChain?.setMidGain(db);
  }

  public getMidGain(): number {
    return this.dspChain?.getMidGain() ?? 0.0;
  }

  public setTrebleGain(db: number): void {
    this.dspChain?.setTrebleGain(db);
  }

  public getTrebleGain(): number {
    return this.dspChain?.getTrebleGain() ?? 2.5;
  }

  public setReverbEnabled(enabled: boolean): void {
    this.dspChain?.setReverbEnabled(enabled);
  }

  public isReverbEnabled(): boolean {
    return this.dspChain?.isReverbEnabled() ?? true;
  }

  public setChorusEnabled(enabled: boolean): void {
    this.dspChain?.setChorusEnabled(enabled);
  }

  public isChorusEnabled(): boolean {
    return this.dspChain?.isChorusEnabled() ?? true;
  }

  // ==========================================================================
  // SONG TONE GUIDE CONTROLS
  // ==========================================================================

  public toggleToneGuide(): void {
    this.setToneGuideEnabled(!this.isToneGuideEnabledState);
  }

  public setToneGuideEnabled(enabled: boolean): void {
    this.isToneGuideEnabledState = enabled;

    if (this.synth) {
      const melodyVol = this.isToneGuideEnabledState ? Math.round(127 * this.toneGuideVolumeState) : 0;
      // Target melody track (Channel 0 / Track 1)
      this.synth.controllerChange(0, 7, melodyVol);
      if (!this.isToneGuideEnabledState) {
        try {
          this.synth.controllerChange(0, 123, 0);
          this.synth.controllerChange(0, 120, 0);
        } catch {}
      }
    }

    if (this.toneGuideGain && this.audioCtx) {
      const targetGain = this.isToneGuideEnabledState ? this.toneGuideVolumeState : 0;
      this.toneGuideGain.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.015);
    }

    if (this.toneGuideAudioElement) {
      this.toneGuideAudioElement.muted = !this.isToneGuideEnabledState;
    }

    this.notifyStatusChange();
  }

  public isToneGuideEnabled(): boolean {
    return this.isToneGuideEnabledState;
  }

  public setToneGuideVolume(volume: number): void {
    this.toneGuideVolumeState = Math.max(0, Math.min(1, volume));

    if (this.synth && this.isToneGuideEnabledState) {
      const melodyVol = Math.round(127 * this.toneGuideVolumeState);
      this.synth.controllerChange(0, 7, melodyVol);
    }

    if (this.toneGuideGain && this.audioCtx && this.isToneGuideEnabledState) {
      this.toneGuideGain.gain.setTargetAtTime(this.toneGuideVolumeState, this.audioCtx.currentTime, 0.015);
    }

    if (this.toneGuideAudioElement) {
      this.toneGuideAudioElement.volume = this.toneGuideVolumeState;
    }

    this.notifyStatusChange();
  }

  public getToneGuideVolume(): number {
    return this.toneGuideVolumeState;
  }

  // ==========================================================================
  // GETTERS & STATUS
  // ==========================================================================

  public isPlaying(): boolean {
    return this.isPlayingState;
  }

  public getCurrentTime(): number {
    return this.currentTimeState;
  }

  public getDuration(): number {
    return this.durationState;
  }

  public getStatus(): MidiPlaybackStatus {
    return {
      isPlaying: this.isPlayingState,
      currentTime: this.currentTimeState,
      duration: this.durationState,
      volume: this.volumeState,
      isMuted: this.isMutedState,
      pitch: this.pitchSemitones,
      isToneGuideEnabled: this.isToneGuideEnabledState,
      toneGuideVolume: this.toneGuideVolumeState,
      isLoading: this.isLoadingState,
      audioMode: this.currentMode,
    };
  }

  public getParsedSongData(): MidiSongData | null {
    return this.parsedSong;
  }

  // ==========================================================================
  // EVENT SUBSCRIPTIONS
  // ==========================================================================

  public onTimeUpdate(cb: TimeUpdateCallback): () => void {
    this.timeUpdateListeners.add(cb);
    return () => this.timeUpdateListeners.delete(cb);
  }

  public onDurationChange(cb: DurationChangeCallback): () => void {
    this.durationChangeListeners.add(cb);
    return () => this.durationChangeListeners.delete(cb);
  }

  public onEnded(cb: PlaybackEndedCallback): () => void {
    this.endedListeners.add(cb);
    return () => this.endedListeners.delete(cb);
  }

  public onLoadingChange(cb: LoadingChangeCallback): () => void {
    this.loadingChangeListeners.add(cb);
    return () => this.loadingChangeListeners.delete(cb);
  }

  public onStatusChange(cb: StatusChangeCallback): () => void {
    this.statusChangeListeners.add(cb);
    return () => this.statusChangeListeners.delete(cb);
  }

  // ==========================================================================
  // MIDI SYNTHESIS ENGINE INTERNALS
  // ==========================================================================

  private startMidiScheduler(): void {
    this.stopMidiScheduler();

    const scheduleAheadSec = 0.15; // 150ms lookahead
    const intervalMs = 25;         // 25ms scheduler loop

    this.schedulerTimerId = window.setInterval(() => {
      if (!this.parsedSong || !this.audioCtx || !this.isPlayingState) return;

      const currentAudioTime = this.audioCtx.currentTime;
      const songCurrentSec = this.playbackStartOffset + (currentAudioTime - this.playbackStartTime);
      const scheduleUntilSec = songCurrentSec + scheduleAheadSec;

      // 1. Release active notes whose duration has ended
      for (let i = this.activeNotes.length - 1; i >= 0; i--) {
        const v = this.activeNotes[i];
        if (v.stopSec <= songCurrentSec) {
          this.synth?.noteOff(v.channel, v.note);
          this.activeNotes.splice(i, 1);
        }
      }

      // 2. Schedule upcoming note events
      const notes = this.parsedSong.notes;
      while (this.nextNoteIndex < notes.length) {
        const note = notes[this.nextNoteIndex];
        if (note.timeSec <= scheduleUntilSec) {
          if (note.timeSec >= songCurrentSec - 0.10) {
            this.scheduleMidiVoice(note);
          }
          this.nextNoteIndex++;
        } else {
          break;
        }
      }

      // 3. Check song completion
      if (songCurrentSec >= this.durationState && this.durationState > 0) {
        this.pause();
        this.currentTimeState = this.durationState;
        this.notifyTimeUpdate(this.durationState);
        this.endedListeners.forEach((cb) => cb());
      }
    }, intervalMs);
  }

  private stopMidiScheduler(): void {
    if (this.schedulerTimerId !== null) {
      clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
  }

  private locateNextNoteIndex(targetSec: number): void {
    if (!this.parsedSong) {
      this.nextNoteIndex = 0;
      return;
    }
    const notes = this.parsedSong.notes;
    let idx = 0;
    while (idx < notes.length && notes[idx].timeSec < targetSec) {
      idx++;
    }
    this.nextNoteIndex = idx;
  }

  /**
   * Synthesizes an individual MIDI note voice via SpessaSynth and mega.sf2
   */
  private scheduleMidiVoice(note: MidiNoteEvent): void {
    if (!this.synth || !this.isSoundfontLoaded) return;

    // 1. Channel Program Change
    const prog = note.program ?? 0;
    if (this.channelProgramCache[note.channel] !== prog) {
      this.synth.programChange(note.channel, prog);
      this.channelProgramCache[note.channel] = prog;
    }

    // 2. Transposition: MIDI Channel 9 (Drums / Channel 10 GM) is NEVER transposed!
    let finalNoteNumber = note.noteNumber;
    if (note.channel !== 9) {
      finalNoteNumber = Math.max(0, Math.min(127, note.noteNumber + this.pitchSemitones));
    }

    // 3. Tone guide melody channel volume balancing
    if (note.isMelody) {
      if (!this.isToneGuideEnabledState || this.toneGuideVolumeState <= 0) {
        return; // Tone guide muted: do not schedule or play vocal guide note
      }
      const melodyVol = Math.round(127 * this.toneGuideVolumeState);
      this.synth.controllerChange(note.channel, 7, melodyVol);
    }

    // 4. Trigger Note On with sample playback
    this.synth.noteOn(note.channel, finalNoteNumber, note.velocity);

    // 5. Register note release tracker
    const duration = Math.max(0.06, note.durationSec);
    this.activeNotes.push({
      channel: note.channel,
      note: finalNoteNumber,
      stopSec: note.timeSec + duration,
    });
  }

  private silenceActiveVoices(): void {
    if (this.synth) {
      this.synth.stopAll(true);
    }
    this.activeNotes = [];
  }

  // ==========================================================================
  // PRE-EXTRACTED AUDIO STREAM MODE
  // ==========================================================================

  private async loadAudioStream(audioUrl: string, toneGuideUrl?: string): Promise<void> {
    await this.initAudio();

    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.audioElement.preload = 'auto';
      if (this.audioCtx && this.backingGain) {
        this.audioSourceNode = this.audioCtx.createMediaElementSource(this.audioElement);
        this.audioSourceNode.connect(this.backingGain);
      }
      this.audioElement.addEventListener('ended', () => {
        this.pause();
        this.currentTimeState = this.durationState;
        this.endedListeners.forEach((cb) => cb());
      });
      this.audioElement.addEventListener('loadedmetadata', () => {
        if (this.audioElement) {
          this.durationState = this.audioElement.duration || 0;
          this.notifyDurationChange(this.durationState);
        }
      });
    }

    if (toneGuideUrl && !this.toneGuideAudioElement) {
      this.toneGuideAudioElement = new Audio();
      this.toneGuideAudioElement.preload = 'auto';
      if (this.audioCtx && this.toneGuideGain) {
        this.toneGuideSourceNode = this.audioCtx.createMediaElementSource(this.toneGuideAudioElement);
        this.toneGuideSourceNode.connect(this.toneGuideGain);
      }
    }

    this.audioElement.src = audioUrl;
    this.audioElement.volume = this.volumeState;
    this.audioElement.muted = this.isMutedState;

    if (this.toneGuideAudioElement && toneGuideUrl) {
      this.toneGuideAudioElement.src = toneGuideUrl;
      this.toneGuideAudioElement.muted = !this.isToneGuideEnabledState;
      this.toneGuideAudioElement.volume = this.toneGuideVolumeState;
    }
  }

  // ==========================================================================
  // PROGRESS TRACKER (RAF)
  // ==========================================================================

  private startProgressTracker(): void {
    this.stopProgressTracker();

    const tick = () => {
      if (!this.isPlayingState) return;

      if (this.currentMode === 'audio-stream' && this.audioElement) {
        this.currentTimeState = this.audioElement.currentTime;
      } else if (this.currentMode === 'midi-synth' && this.audioCtx) {
        this.currentTimeState = this.playbackStartOffset + (this.audioCtx.currentTime - this.playbackStartTime);
      }

      if (this.durationState > 0 && this.currentTimeState > this.durationState) {
        this.currentTimeState = this.durationState;
      }

      this.notifyTimeUpdate(this.currentTimeState);
      this.animFrameId = requestAnimationFrame(tick);
    };

    this.animFrameId = requestAnimationFrame(tick);
  }

  private stopProgressTracker(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private stopPlayback(): void {
    this.pause();
    this.stopMidiScheduler();
    this.silenceActiveVoices();
    this.currentTimeState = 0;
  }

  private setLoading(isLoading: boolean): void {
    this.isLoadingState = isLoading;
    this.loadingChangeListeners.forEach((cb) => cb(isLoading));
    this.notifyStatusChange();
  }

  private notifyTimeUpdate(time: number): void {
    this.timeUpdateListeners.forEach((cb) => cb(time));
  }

  private notifyDurationChange(dur: number): void {
    this.durationChangeListeners.forEach((cb) => cb(dur));
  }

  private notifyStatusChange(): void {
    const status = this.getStatus();
    this.statusChangeListeners.forEach((cb) => cb(status));
  }
}

// Export singleton helper
export const midiPlayer = MidiPlayerService.getInstance();
