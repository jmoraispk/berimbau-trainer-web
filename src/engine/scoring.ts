/**
 * Scoring engine — compares detected notes against the target rhythm pattern.
 *
 *   - Each target beat has a time window [t ± TIMING_TOLERANCE_SEC]
 *   - A detected note within the window scores points
 *   - Wrong sound within window: partial credit
 *   - Pitch glide / note bleed: negative penalty (is_mistake)
 *   - Unresolved beats past LATE_ZONE_SEC: miss
 *
 * All times are in **seconds**, sourced from a single monotonic clock
 * (AudioContext.currentTime or performance.now()/1000). The caller is
 * responsible for ensuring detected-note timestamps and target-beat
 * timestamps share that clock.
 *
 * Ported from engine/scoring.py.
 */

import type { Sound } from './rhythms';

export const TIMING_TOLERANCE_SEC = 0.08;
export const LATE_ZONE_SEC = 0.25; // generous — beginners get partial credit

export const SCORE_CORRECT_TIMING_CORRECT_SOUND = 1.0;
export const SCORE_CORRECT_TIMING_WRONG_SOUND = 0.4;
/**
 * Right note, off-time. Worth more than wrong-sound-on-time because the
 * sound match is the harder signal — the user identified the right
 * gesture, just didn't sync it tightly.
 */
export const SCORE_LATE_CORRECT = 0.5;
/** Wrong note AND off-time — token credit for at least playing something. */
export const SCORE_LATE_WRONG = 0.2;
export const SCORE_MISS = 0.0;
export const SCORE_MISTAKE_PENALTY = -0.2;

export type Outcome =
  | 'perfect'      // tight timing + right sound
  | 'good'         // within tolerance + right sound
  | 'wrong_sound'  // tight timing, wrong sound
  | 'late_correct' // outside tolerance but right sound — credit retained
  | 'late_wrong'   // outside tolerance, wrong sound — token credit
  | 'miss'         // never matched
  | 'mistake';     // pitch glide / note bleed flagged by classifier

export type DetectedSound = Sound | 'unknown';

export interface DetectedNote {
  timestamp: number;
  soundClass: DetectedSound;
  confidence: number;
  f0: number;
  centroid: number;
  amplitude: number;
  isMistake?: boolean;
  mistakeType?: string;
}

export interface BeatResult {
  step: number | null;
  targetSound: Sound | null;
  detectedNote: DetectedNote | null;
  score: number;
  outcome: Outcome;
  timestamp: number;
}

interface PendingBeat {
  step: number;
  sound: Sound;
  time: number;
  resolved: boolean;
}

export class ScoringEngine {
  readonly beatResults: BeatResult[] = [];
  readonly sessionScores: number[] = [];
  private pendingBeats: PendingBeat[] = [];
  private readonly maxResults = 500;

  reset(): void {
    this.beatResults.length = 0;
    this.sessionScores.length = 0;
    this.pendingBeats = [];
  }

  registerTargetBeat(step: number, sound: Sound, beatTime: number, now: number): void {
    this.pendingBeats.push({ step, sound, time: beatTime, resolved: false });
    // Expire old pending beats (matches v1: now - time < LATE_ZONE * 2).
    this.pendingBeats = this.pendingBeats.filter(
      (b) => !b.resolved && now - b.time < LATE_ZONE_SEC * 2,
    );
  }

  registerDetectedNote(note: DetectedNote, currentTime: number): BeatResult | null {
    if (note.isMistake) {
      return this.commit({
        step: null,
        targetSound: null,
        detectedNote: note,
        score: SCORE_MISTAKE_PENALTY,
        outcome: 'mistake',
        timestamp: currentTime,
      });
    }

    // Unknown detections must not consume a nearby beat — the classifier
    // refused to commit, so scoring can't either (would hide real misses).
    if (note.soundClass === 'unknown') return null;

    const matchTime = note.timestamp || currentTime;

    let best: PendingBeat | null = null;
    let bestDelta = Infinity;
    for (const beat of this.pendingBeats) {
      if (beat.resolved) continue;
      const delta = Math.abs(matchTime - beat.time);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = beat;
      }
    }

    if (!best || bestDelta > LATE_ZONE_SEC) return null;

    best.resolved = true;
    const correctSound = note.soundClass === best.sound;

    let score: number;
    let outcome: Outcome;
    if (bestDelta <= TIMING_TOLERANCE_SEC) {
      if (correctSound) {
        score = SCORE_CORRECT_TIMING_CORRECT_SOUND * note.confidence;
        outcome = bestDelta < TIMING_TOLERANCE_SEC * 0.5 ? 'perfect' : 'good';
      } else {
        score = SCORE_CORRECT_TIMING_WRONG_SOUND;
        outcome = 'wrong_sound';
      }
    } else if (correctSound) {
      score = SCORE_LATE_CORRECT;
      outcome = 'late_correct';
    } else {
      score = SCORE_LATE_WRONG;
      outcome = 'late_wrong';
    }

    return this.commit({
      step: best.step,
      targetSound: best.sound,
      detectedNote: note,
      score,
      outcome,
      timestamp: currentTime,
    });
  }

  flushMissedBeats(currentTime: number): BeatResult[] {
    const misses: BeatResult[] = [];
    for (const beat of this.pendingBeats) {
      if (beat.resolved) continue;
      if (currentTime - beat.time > LATE_ZONE_SEC) {
        beat.resolved = true;
        misses.push(
          this.commit({
            step: beat.step,
            targetSound: beat.sound,
            detectedNote: null,
            score: SCORE_MISS,
            outcome: 'miss',
            timestamp: currentTime,
          }),
        );
      }
    }
    return misses;
  }

  rollingAccuracy(lastN = 20): number {
    const recent = this.sessionScores.slice(-lastN);
    if (recent.length === 0) return 0;
    const positive = recent.filter((s) => s > 0);
    return positive.reduce((a, b) => a + b, 0) / recent.length;
  }

  soundAccuracy(): Record<'dong' | 'ch' | 'ding', number | null> {
    const counts: Record<'dong' | 'ch' | 'ding', [number, number]> = {
      dong: [0, 0],
      ch: [0, 0],
      ding: [0, 0],
    };
    for (const r of this.beatResults) {
      if (r.targetSound && r.targetSound in counts) {
        const key = r.targetSound as 'dong' | 'ch' | 'ding';
        counts[key][1] += 1;
        // late_correct still counted as a "right note" hit for per-sound
        // accuracy — they identified the gesture, even if the timing
        // was off.
        if (
          r.outcome === 'perfect' ||
          r.outcome === 'good' ||
          r.outcome === 'late_correct'
        ) {
          counts[key][0] += 1;
        }
      }
    }
    return {
      dong: counts.dong[1] > 0 ? counts.dong[0] / counts.dong[1] : null,
      ch: counts.ch[1] > 0 ? counts.ch[0] / counts.ch[1] : null,
      ding: counts.ding[1] > 0 ? counts.ding[0] / counts.ding[1] : null,
    };
  }

  mistakeCount(): number {
    return this.beatResults.reduce((n, r) => (r.outcome === 'mistake' ? n + 1 : n), 0);
  }

  private commit(result: BeatResult): BeatResult {
    this.beatResults.push(result);
    if (this.beatResults.length > this.maxResults) this.beatResults.shift();
    this.sessionScores.push(result.score);
    return result;
  }
}
