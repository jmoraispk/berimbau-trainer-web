/**
 * ToqueScheduler — enumerate target beats for a toque at a given BPM.
 *
 *   - BPM is per quarter note (4 subdivisions per beat), matching v1 where
 *     cycle_beats = 4 and subdivisions = 16.
 *   - A single cycle is `(subdivisions / 4) * 60/bpm` seconds long.
 *   - Each pattern entry with sound !== 'rest' is a target beat. Rests are
 *     skipped — scoring only cares about notes to play.
 *
 * The scheduler is stateless: give it a window [fromT, toT] in seconds
 * (audio-context time) and it returns every target beat whose beatTime
 * falls in that window. The caller tracks which beats have already been
 * registered with the ScoringEngine to avoid duplicates.
 */

import type { BeatEvent, ToquePattern, Sound } from './rhythms';

export interface TargetBeat {
  /** Global beat index since startTime — unique, monotonic. */
  id: number;
  /** 0..subdivisions-1 within the cycle. */
  step: number;
  /** Which cycle this came from (0, 1, 2, ...). */
  cycle: number;
  /** AudioContext time (seconds) when the beat should land on the hit line. */
  beatTime: number;
  sound: Exclude<Sound, 'rest'>;
  accent: BeatEvent['accent'];
}

export interface SchedulerOptions {
  toque: ToquePattern;
  /** Quarter-note BPM; clamped to the toque's bpmRange by the caller. */
  bpm: number;
  /** AudioContext time (seconds) when cycle 0, step 0 lands on the hit line. */
  startTime: number;
}

export class ToqueScheduler {
  private readonly options: SchedulerOptions;
  private readonly playableSteps: BeatEvent[];
  private readonly stepDuration: number;
  private readonly cycleDuration: number;

  constructor(options: SchedulerOptions) {
    this.options = options;
    const { toque, bpm } = options;
    // One quarter note = 60/bpm seconds. Each subdivision is a quarter of
    // that, matching v1's 16-steps-over-4-beats layout.
    this.stepDuration = 60 / bpm / (toque.subdivisions / toque.cycleBeats);
    this.cycleDuration = this.stepDuration * toque.subdivisions;
    this.playableSteps = toque.pattern.filter((e) => e.sound !== 'rest');
  }

  /** Seconds per full cycle. */
  get cycleSeconds(): number {
    return this.cycleDuration;
  }

  /**
   * Every target beat with `fromT <= beatTime <= toT`, in chronological order.
   *
   * The window is inclusive on both ends so a beat exactly on `toT` is
   * emitted once rather than missed; the caller deduplicates by `id`.
   */
  beatsInWindow(fromT: number, toT: number): TargetBeat[] {
    if (toT < fromT) return [];
    const { startTime } = this.options;

    const firstCycle = Math.max(0, Math.floor((fromT - startTime) / this.cycleDuration));
    const lastCycle = Math.floor((toT - startTime) / this.cycleDuration);

    const out: TargetBeat[] = [];
    for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
      const cycleStart = startTime + cycle * this.cycleDuration;
      for (const event of this.playableSteps) {
        const beatTime = cycleStart + event.step * this.stepDuration;
        if (beatTime < fromT || beatTime > toT) continue;
        out.push({
          id: cycle * this.options.toque.subdivisions + event.step,
          step: event.step,
          cycle,
          beatTime,
          sound: event.sound as Exclude<Sound, 'rest'>,
          accent: event.accent,
        });
      }
    }
    return out;
  }
}

/** Clamp a BPM request into the toque's supported range. */
export function clampBpm(toque: ToquePattern, bpm: number): number {
  const [lo, hi] = toque.bpmRange;
  return Math.max(lo, Math.min(hi, bpm));
}
