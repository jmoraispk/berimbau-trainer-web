import type { ClassifiableSound } from '@/engine/profiles';

/**
 * Plays the toque's notes alongside the metronome — so the user hears
 * the rhythm instead of practicing against silence. Sample-accurate
 * scheduling on the same AudioContext as the rest of the audio
 * pipeline.
 *
 * Today: synthesised tones for the three sounds. Future: when the
 * saved calibration carries raw audio per sound (one representative
 * sample per class), play those instead so the rhythm is in the
 * user's own berimbau timbre.
 */

interface PlayAlongOptions {
  /** Linear gain 0..1 for each scheduled play. */
  volume?: number;
}

const DEFAULT_VOLUME = 0.55;

export class PlayAlong {
  private readonly ctx: AudioContext;
  private readonly opts: Required<PlayAlongOptions>;
  private buffers: Partial<Record<ClassifiableSound, AudioBuffer>> = {};
  muted: boolean;

  constructor(ctx: AudioContext, options: PlayAlongOptions = {}, muted = true) {
    this.ctx = ctx;
    this.opts = { volume: options.volume ?? DEFAULT_VOLUME };
    this.muted = muted;
    this.buildSynthBuffers();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** Schedule a sound to play at AudioContext time `when`. No-op if muted. */
  schedulePlay(when: number, sound: ClassifiableSound): void {
    if (this.muted) return;
    const buf = this.buffers[sound];
    if (!buf) return;
    const start = Math.max(when, this.ctx.currentTime);
    const source = this.ctx.createBufferSource();
    source.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = this.opts.volume;
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start(start);
  }

  // ── synth ─────────────────────────────────────────────────────────

  private buildSynthBuffers(): void {
    // Numbers picked to *sound like* a berimbau without trying too hard:
    //   DONG: warm low body around 95 Hz, soft attack, medium decay.
    //   DING: brighter pitch ~180 Hz with a touch of second harmonic.
    //   TCH:  a short noise burst, no pitch.
    this.buffers.dong = this.synthTone(95, 0.45, /*bright=*/ false);
    this.buffers.ding = this.synthTone(180, 0.35, /*bright=*/ true);
    this.buffers.ch = this.synthNoise(0.12);
  }

  private synthTone(freq: number, duration: number, bright: boolean): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const n = Math.floor(sr * duration);
    const buf = this.ctx.createBuffer(1, n, sr);
    const data = buf.getChannelData(0);
    const decayRate = bright ? 6 : 4;
    const attackRate = 250;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      // Smooth onset (1 - e^-attack·t) × exponential decay (e^-decay·t).
      const env = (1 - Math.exp(-attackRate * t)) * Math.exp(-decayRate * t);
      const fundamental = Math.sin(2 * Math.PI * freq * t);
      const harmonic = bright ? 0.25 * Math.sin(2 * Math.PI * freq * 2 * t) : 0;
      data[i] = env * (fundamental + harmonic);
    }
    return buf;
  }

  private synthNoise(duration: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const n = Math.floor(sr * duration);
    const buf = this.ctx.createBuffer(1, n, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      // Sharp attack, very fast decay — chiado-like scratch.
      const env = (1 - Math.exp(-400 * t)) * Math.exp(-18 * t);
      data[i] = env * (Math.random() * 2 - 1) * 0.7;
    }
    return buf;
  }
}
