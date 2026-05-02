/**
 * ToqueScheduler — enumerate target beats for a toque at a given BPM.
 *
 *   - intervalDuration = 60 / bpm   (one quarter note at the chosen tempo)
 *   - cycleDuration    = intervalDuration * intervals.length
 *
 * Each interval token is expanded into 0, 1, or 2 TargetBeats:
 *
 *     'rest'    → no beats
 *     'dong'    → one beat at offset 0 within the interval
 *     'ding'    → one beat at offset 0
 *     'tch'     → one beat at offset 0
 *     'tch_tch' → two beats at offsets 0 and 0.5 (two eighths in the beat)
 *
 * Stateless: give it a window [fromT, toT] in seconds (audio-context time)
 * and it returns every target beat with `fromT <= beatTime <= toT`.
 * Caller deduplicates by `id`.
 */

import type { IntervalToken, Sound, ToquePattern } from './rhythms';
import { GLOBAL_BPM_RANGE, soundFromToken } from './rhythms';

export interface TargetBeat {
  /** Globally-monotonic beat index. */
  id: number;
  /** Index into the toque's intervals[] array (0..length-1). */
  intervalIndex: number;
  /** 0 for the only beat in single-sound intervals, 0 or 1 within tch_tch. */
  subIndex: number;
  /** Used by ScoringEngine for matching — encodes (intervalIndex, subIndex). */
  step: number;
  /** Which cycle this came from (0, 1, 2, ...). */
  cycle: number;
  /** AudioContext time (seconds) when the beat lands on the hit line. */
  beatTime: number;
  sound: Sound;
  /** Whether this beat sits on a downbeat (interval start), used for rendering. */
  accent: boolean;
}

export interface SchedulerOptions {
  toque: ToquePattern;
  /** Quarter-note BPM; clamped to GLOBAL_BPM_RANGE by the caller. */
  bpm: number;
  /** AudioContext time (seconds) when interval 0 starts. */
  startTime: number;
}

/** Steps per interval — the maximum number of sub-beats any token can emit. */
const STEPS_PER_INTERVAL = 2;

interface ExpandedEvent {
  subIndex: number;
  /** Offset within the interval, in [0, 1). */
  offset: number;
  sound: Sound;
  accent: boolean;
}

function expand(token: IntervalToken): ExpandedEvent[] {
  switch (token) {
    case 'rest':
      return [];
    case 'tch_tch':
      return [
        { subIndex: 0, offset: 0,   sound: 'ch', accent: true  },
        { subIndex: 1, offset: 0.5, sound: 'ch', accent: false },
      ];
    case 'tch':
      return [{ subIndex: 0, offset: 0, sound: 'ch', accent: true }];
    default:
      return [{ subIndex: 0, offset: 0, sound: soundFromToken(token), accent: true }];
  }
}

export class ToqueScheduler {
  private readonly options: SchedulerOptions;
  private readonly intervalDuration: number;
  private readonly cycleDuration: number;
  /** Pre-computed events for one cycle, in chronological order. */
  private readonly events: ExpandedEvent[][];
  private readonly intervalLength: number;

  constructor(options: SchedulerOptions) {
    this.options = options;
    const { toque, bpm } = options;
    this.intervalLength = toque.intervals.length;
    this.intervalDuration = 60 / bpm;
    this.cycleDuration = this.intervalDuration * this.intervalLength;
    this.events = toque.intervals.map(expand);
  }

  /** Seconds per full cycle (0 if the toque has no intervals). */
  get cycleSeconds(): number {
    return this.cycleDuration;
  }

  /**
   * Every target beat with `fromT <= beatTime <= toT`, in chronological
   * order. The window is inclusive on both ends.
   */
  beatsInWindow(fromT: number, toT: number): TargetBeat[] {
    if (this.intervalLength === 0 || this.cycleDuration <= 0) return [];
    if (toT < fromT) return [];
    const { startTime } = this.options;

    const firstCycle = Math.max(0, Math.floor((fromT - startTime) / this.cycleDuration));
    const lastCycle = Math.floor((toT - startTime) / this.cycleDuration);

    const out: TargetBeat[] = [];
    for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
      const cycleStart = startTime + cycle * this.cycleDuration;
      for (let intervalIndex = 0; intervalIndex < this.intervalLength; intervalIndex++) {
        const events = this.events[intervalIndex]!;
        if (events.length === 0) continue;
        const intervalStart = cycleStart + intervalIndex * this.intervalDuration;
        for (const event of events) {
          const beatTime = intervalStart + event.offset * this.intervalDuration;
          if (beatTime < fromT || beatTime > toT) continue;
          const step = intervalIndex * STEPS_PER_INTERVAL + event.subIndex;
          out.push({
            id: cycle * this.intervalLength * STEPS_PER_INTERVAL + step,
            intervalIndex,
            subIndex: event.subIndex,
            step,
            cycle,
            beatTime,
            sound: event.sound,
            accent: event.accent,
          });
        }
      }
    }
    return out;
  }
}

/**
 * Clamp a BPM request into GLOBAL_BPM_RANGE. Accepts a toque for callsite
 * symmetry but ignores the toque's defaultBpm — every toque is rehearsable
 * at any tempo the global range permits.
 */
export function clampBpm(_toque: ToquePattern | null | undefined, bpm: number): number {
  const [lo, hi] = GLOBAL_BPM_RANGE;
  return Math.max(lo, Math.min(hi, bpm));
}
