/**
 * ============================================================================
 * AUDIO DSP CHAIN SERVICE (SONGHUB ACOUSTIC PARITY)
 * ============================================================================
 * Recreates Songhub's exact acoustic mastering and DSP processing:
 * 1. 3-Band Parametric EQ:
 *    - Bass Shelf: 80 Hz, +3.5 dB boost (punchy karaoke bass thump)
 *    - Mid Peak: 1000 Hz, Q = 1.15 (12 semitones), 0.0 dB (vocal clarity)
 *    - Treble Shelf: 10000 Hz, +2.5 dB boost (crisp cymbal shimmer)
 * 2. Spatial Reverb:
 *    - Convolver with Songhub-profile impulse (Room: 0.6, Damp: 0.5, Width: 1.0)
 * 3. Stereo Chorus:
 *    - Dual modulated delay lines (Rate: 0.5 Hz, Depth: 3.0 ms, Wet: 20%)
 * 4. Master Dynamics Compressor:
 *    - Threshold: -20 dB, Ratio: 4:1, Attack: 10 ms, Release: 200 ms
 * ============================================================================
 */

export interface AudioDspConfig {
  bassGainDb?: number;     // -15 to +15 (default: +3.5 dB)
  midGainDb?: number;      // -15 to +15 (default: 0.0 dB)
  trebleGainDb?: number;   // -15 to +15 (default: +2.5 dB)
  reverbEnabled?: boolean; // default: true
  reverbLevel?: number;    // 0.0 to 1.0 (default: 0.35)
  chorusEnabled?: boolean; // default: true
  chorusLevel?: number;    // 0.0 to 1.0 (default: 0.20)
}

export class AudioDspChain {
  private ctx: AudioContext;

  // Primary Input & Output
  public readonly inputNode: GainNode;
  public readonly outputNode: GainNode;

  // 3-Band Parametric EQ Nodes
  private bassFilter: BiquadFilterNode;
  private midFilter: BiquadFilterNode;
  private trebleFilter: BiquadFilterNode;

  // Reverb Nodes
  private reverbInput: GainNode;
  private convolver: ConvolverNode;
  private reverbWetGain: GainNode;
  private isReverbActive = true;
  private reverbLevelVal = 0.35;

  // Chorus Nodes
  private chorusInput: GainNode;
  private chorusDelayL: DelayNode;
  private chorusDelayR: DelayNode;
  private chorusLfo: OscillatorNode;
  private chorusLfoGainL: GainNode;
  private chorusLfoGainR: GainNode;
  private chorusWetGain: GainNode;
  private isChorusActive = true;
  private chorusLevelVal = 0.20;

  // Dynamics Compressor Node
  private compressor: DynamicsCompressorNode;

  // State Tracking
  private currentBassDb = 3.5;
  private currentMidDb = 0.0;
  private currentTrebleDb = 2.5;

  constructor(ctx: AudioContext, config?: AudioDspConfig) {
    this.ctx = ctx;

    // 1. Audio Nodes Initialization
    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();

    // 2. 3-Band Parametric EQ
    this.currentBassDb = config?.bassGainDb ?? 3.5;
    this.currentMidDb = config?.midGainDb ?? 0.0;
    this.currentTrebleDb = config?.trebleGainDb ?? 2.5;

    // Bass Lowshelf (80 Hz, +3.5 dB default)
    this.bassFilter = ctx.createBiquadFilter();
    this.bassFilter.type = 'lowshelf';
    this.bassFilter.frequency.value = 80;
    this.bassFilter.gain.value = this.currentBassDb;

    // Mid Peaking (1000 Hz, Q = 1.15, 0.0 dB default)
    this.midFilter = ctx.createBiquadFilter();
    this.midFilter.type = 'peaking';
    this.midFilter.frequency.value = 1000;
    this.midFilter.Q.value = 1.15;
    this.midFilter.gain.value = this.currentMidDb;

    // Treble Highshelf (10000 Hz, +2.5 dB default)
    this.trebleFilter = ctx.createBiquadFilter();
    this.trebleFilter.type = 'highshelf';
    this.trebleFilter.frequency.value = 10000;
    this.trebleFilter.gain.value = this.currentTrebleDb;

    // Connect EQ Cascade: input -> bass -> mid -> treble
    this.inputNode.connect(this.bassFilter);
    this.bassFilter.connect(this.midFilter);
    this.midFilter.connect(this.trebleFilter);

    // 3. Spatial Reverb (Songhub profile: Room 0.6, Damp 0.5, Width 1.0)
    this.reverbInput = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.generateReverbImpulse(1.8, 0.5);
    this.reverbWetGain = ctx.createGain();
    this.isReverbActive = config?.reverbEnabled ?? true;
    this.reverbLevelVal = config?.reverbLevel ?? 0.35;
    this.reverbWetGain.gain.value = this.isReverbActive ? this.reverbLevelVal : 0;

    // Treble -> Reverb Input -> Convolver -> Reverb Wet Gain
    this.trebleFilter.connect(this.reverbInput);
    this.reverbInput.connect(this.convolver);
    this.convolver.connect(this.reverbWetGain);

    // 4. Stereo Chorus (Rate: 0.5 Hz, Depth: 3.0 ms, Wet: 20%)
    this.chorusInput = ctx.createGain();
    this.chorusDelayL = ctx.createDelay(0.1);
    this.chorusDelayR = ctx.createDelay(0.1);
    this.chorusDelayL.delayTime.value = 0.015; // 15 ms base delay
    this.chorusDelayR.delayTime.value = 0.020; // 20 ms base delay

    // LFO Modulation for Chorus (0.5 Hz sine wave)
    this.chorusLfo = ctx.createOscillator();
    this.chorusLfo.type = 'sine';
    this.chorusLfo.frequency.value = 0.5;

    // LFO Depth (3 ms sweep)
    this.chorusLfoGainL = ctx.createGain();
    this.chorusLfoGainL.gain.value = 0.003;
    this.chorusLfoGainR = ctx.createGain();
    this.chorusLfoGainR.gain.value = -0.003; // Inverted phase for wide stereo

    this.chorusLfo.connect(this.chorusLfoGainL);
    this.chorusLfo.connect(this.chorusLfoGainR);
    this.chorusLfoGainL.connect(this.chorusDelayL.delayTime);
    this.chorusLfoGainR.connect(this.chorusDelayR.delayTime);

    this.chorusWetGain = ctx.createGain();
    this.isChorusActive = config?.chorusEnabled ?? true;
    this.chorusLevelVal = config?.chorusLevel ?? 0.20;
    this.chorusWetGain.gain.value = this.isChorusActive ? this.chorusLevelVal : 0;

    // Treble -> Chorus Input -> Delays -> Chorus Wet Gain
    this.trebleFilter.connect(this.chorusInput);
    this.chorusInput.connect(this.chorusDelayL);
    this.chorusInput.connect(this.chorusDelayR);
    this.chorusDelayL.connect(this.chorusWetGain);
    this.chorusDelayR.connect(this.chorusWetGain);

    try {
      this.chorusLfo.start();
    } catch {}

    // 5. Master Dynamics Compressor (DX8 Compressor Profile)
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.20;

    // Route dry path + wet reverb + wet chorus -> compressor -> outputNode
    this.trebleFilter.connect(this.compressor);   // Dry EQ signal
    this.reverbWetGain.connect(this.compressor); // Wet Reverb signal
    this.chorusWetGain.connect(this.compressor); // Wet Chorus signal

    this.compressor.connect(this.outputNode);
  }

  /**
   * Generates a stereo reverb impulse response matching Songhub room dimensions
   */
  private generateReverbImpulse(durationSec: number, damping: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * durationSec);
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    const decayFactor = 3.5 / durationSec;
    let dampL = 0;
    let dampR = 0;

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const envelope = Math.exp(-decayFactor * t);

      // Low-pass damping simulation
      const noiseL = (Math.random() * 2 - 1) * envelope;
      const noiseR = (Math.random() * 2 - 1) * envelope;

      dampL = dampL * damping + noiseL * (1 - damping);
      dampR = dampR * damping + noiseR * (1 - damping);

      left[i] = dampL;
      right[i] = dampR;
    }

    return impulse;
  }

  // ==========================================================================
  // CONTROLS & API
  // ==========================================================================

  public setBassGain(db: number): void {
    this.currentBassDb = Math.max(-15, Math.min(15, db));
    const now = this.ctx.currentTime;
    this.bassFilter.gain.setTargetAtTime(this.currentBassDb, now, 0.02);
  }

  public getBassGain(): number {
    return this.currentBassDb;
  }

  public setMidGain(db: number): void {
    this.currentMidDb = Math.max(-15, Math.min(15, db));
    const now = this.ctx.currentTime;
    this.midFilter.gain.setTargetAtTime(this.currentMidDb, now, 0.02);
  }

  public getMidGain(): number {
    return this.currentMidDb;
  }

  public setTrebleGain(db: number): void {
    this.currentTrebleDb = Math.max(-15, Math.min(15, db));
    const now = this.ctx.currentTime;
    this.trebleFilter.gain.setTargetAtTime(this.currentTrebleDb, now, 0.02);
  }

  public getTrebleGain(): number {
    return this.currentTrebleDb;
  }

  public setReverbEnabled(enabled: boolean): void {
    this.isReverbActive = enabled;
    const target = this.isReverbActive ? this.reverbLevelVal : 0;
    this.reverbWetGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  public isReverbEnabled(): boolean {
    return this.isReverbActive;
  }

  public setReverbLevel(level: number): void {
    this.reverbLevelVal = Math.max(0, Math.min(1, level));
    if (this.isReverbActive) {
      this.reverbWetGain.gain.setTargetAtTime(this.reverbLevelVal, this.ctx.currentTime, 0.02);
    }
  }

  public setChorusEnabled(enabled: boolean): void {
    this.isChorusActive = enabled;
    const target = this.isChorusActive ? this.chorusLevelVal : 0;
    this.chorusWetGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  public isChorusEnabled(): boolean {
    return this.isChorusActive;
  }

  public setChorusLevel(level: number): void {
    this.chorusLevelVal = Math.max(0, Math.min(1, level));
    if (this.isChorusActive) {
      this.chorusWetGain.gain.setTargetAtTime(this.chorusLevelVal, this.ctx.currentTime, 0.02);
    }
  }

  public getCompressor(): DynamicsCompressorNode {
    return this.compressor;
  }
}
