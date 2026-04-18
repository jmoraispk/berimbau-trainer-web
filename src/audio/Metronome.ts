/**
 * Audible metronome — schedules short ticks at given AudioContext times.
 *
 *   - Accent beats get a slightly higher-pitched click so bar-1 beats
 *     stand out without any extra ceremony.
 *   - Uses the same AudioContext as the mic pipeline so scheduled times
 *     line up with the scoring / scheduler clock (sample-accurate).
 *   - Each tick is a short oscillator + gain envelope routed straight to
 *     the context destination. No preloaded samples, no network.
 *
 * Practice tracks which beat ids have been scheduled already so the
 * look-ahead loop doesn't double-fire the same click.
 */

export interface MetronomeOptions {
  /** Gain of a normal tick, 0-1. */
  volume?: number;
  /** Base frequency (Hz) of a normal tick. */
  frequency?: number;
  /** Accent tick frequency (Hz). */
  accentFrequency?: number;
  /** Tick duration in seconds — short enough to not smear into the next beat. */
  duration?: number;
}

const DEFAULTS: Required<MetronomeOptions> = {
  volume: 0.18,
  frequency: 880,
  accentFrequency: 1760,
  duration: 0.05,
};

export class Metronome {
  private readonly ctx: AudioContext;
  private readonly opts: Required<MetronomeOptions>;
  /** Mute toggle; ticks still get queued so the schedule catches up on unmute. */
  muted: boolean;

  constructor(ctx: AudioContext, options: MetronomeOptions = {}, muted = false) {
    this.ctx = ctx;
    this.opts = { ...DEFAULTS, ...options };
    this.muted = muted;
  }

  /**
   * Schedule a tick to play at `when` (AudioContext seconds). Safe to call
   * for times in the past — the context just won't hear anything. Returns
   * whether the tick was actually queued (i.e. not muted).
   */
  scheduleTick(when: number, accent = false): boolean {
    if (this.muted) return false;
    const { ctx, opts } = this;
    const start = Math.max(when, ctx.currentTime);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = accent ? opts.accentFrequency : opts.frequency;
    osc.connect(gain);
    gain.connect(ctx.destination);

    // Short attack (1ms) → near-silent tail, avoids click/pop. The exponential
    // ramp target can't be zero, so aim at 1e-4 and then hard stop.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(opts.volume, start + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);

    osc.start(start);
    osc.stop(start + opts.duration + 0.02);
    return true;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }
}
