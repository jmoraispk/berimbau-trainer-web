import { describe, it, expect } from 'vitest';
import {
  ScoringEngine,
  TIMING_TOLERANCE_SEC,
  LATE_ZONE_SEC,
  type DetectedNote,
  type DetectedSound,
} from './scoring';

function makeNote(
  sound: DetectedSound,
  timestamp: number,
  confidence = 0.95,
  f0 = 200,
): DetectedNote {
  return { timestamp, soundClass: sound, confidence, f0, amplitude: 0.8 };
}

describe('ScoringEngine — timing and outcomes', () => {
  it('scores a perfect hit when timing and sound match', () => {
    const scorer = new ScoringEngine();
    const t0 = 1000;
    scorer.registerTargetBeat(0, 'dong', t0, t0);
    const r = scorer.registerDetectedNote(makeNote('dong', t0), t0);
    expect(r?.outcome).toBe('perfect');
    expect(r?.score).toBeGreaterThan(0.9);
  });

  it('matches against the note onset timestamp, not the frame time', () => {
    // Regression: v1 bug where matching used the UI frame time and lost
    // ~50ms of lag, pushing near-perfect hits into 'good' or 'late'.
    const scorer = new ScoringEngine();
    const t0 = 1000;
    scorer.registerTargetBeat(0, 'dong', t0, t0);
    const note = makeNote('dong', t0 + 0.005); // 5ms real offset
    const frameTime = t0 + 0.06; // UI saw it 60ms later
    const r = scorer.registerDetectedNote(note, frameTime);
    expect(r?.outcome).toBe('perfect');
  });

  it('scores "good" between 50% and 100% of tolerance', () => {
    const scorer = new ScoringEngine();
    const t0 = 1000;
    scorer.registerTargetBeat(0, 'dong', t0, t0);
    const offset = TIMING_TOLERANCE_SEC * 0.8;
    const r = scorer.registerDetectedNote(makeNote('dong', t0 + offset), t0);
    expect(r?.outcome).toBe('good');
  });

  it('scores wrong_sound with partial credit when timing is correct', () => {
    const scorer = new ScoringEngine();
    const t0 = 1000;
    scorer.registerTargetBeat(0, 'dong', t0, t0);
    const r = scorer.registerDetectedNote(makeNote('ding', t0), t0);
    expect(r?.outcome).toBe('wrong_sound');
    expect(r?.score).toBeGreaterThan(0);
    expect(r?.score).toBeLessThan(1);
  });

  it('scores "late" past tolerance but within late zone', () => {
    const scorer = new ScoringEngine();
    const t0 = 1000;
    scorer.registerTargetBeat(0, 'dong', t0, t0);
    const offset = (TIMING_TOLERANCE_SEC + LATE_ZONE_SEC) / 2;
    const r = scorer.registerDetectedNote(makeNote('dong', t0 + offset), t0);
    expect(r?.outcome).toBe('late');
  });

  it('flushes unresolved beats past the late zone as misses', () => {
    const scorer = new ScoringEngine();
    const t0 = 1000;
    scorer.registerTargetBeat(0, 'dong', t0, t0);
    const misses = scorer.flushMissedBeats(t0 + LATE_ZONE_SEC + 0.01);
    expect(misses.length).toBe(1);
    expect(misses[0]?.outcome).toBe('miss');
    expect(misses[0]?.step).toBe(0);
  });

  it('ignores spurious hits with no nearby pending beat', () => {
    const scorer = new ScoringEngine();
    const t0 = 1000;
    const r = scorer.registerDetectedNote(makeNote('dong', t0), t0);
    expect(r).toBeNull();
  });

  it('records a mistake detection as a negative-score mistake', () => {
    const scorer = new ScoringEngine();
    const t0 = 1000;
    const note: DetectedNote = {
      timestamp: t0,
      soundClass: 'unknown',
      confidence: 0,
      f0: 300,
      amplitude: 0.5,
      isMistake: true,
      mistakeType: 'pitch_glide',
    };
    const r = scorer.registerDetectedNote(note, t0);
    expect(r?.outcome).toBe('mistake');
    expect(r?.score).toBeLessThan(0);
  });

  it('only the first detection in the tolerance window resolves a beat', () => {
    const scorer = new ScoringEngine();
    const t0 = 1000;
    scorer.registerTargetBeat(0, 'dong', t0, t0);
    const r1 = scorer.registerDetectedNote(makeNote('dong', t0), t0);
    const r2 = scorer.registerDetectedNote(makeNote('dong', t0 + 0.01), t0);
    expect(r1?.outcome).toBe('perfect');
    expect(r2).toBeNull();
  });

  it('ignores unknown-class detections without consuming the target beat', () => {
    // Regression: without this guard, a 'huh?' detection in the late
    // window of a dong target resolves the beat as wrong_sound, hiding
    // the real miss and penalising the user for nothing.
    const scorer = new ScoringEngine();
    const t0 = 1000;
    scorer.registerTargetBeat(0, 'dong', t0, t0);
    const r1 = scorer.registerDetectedNote(makeNote('unknown', t0), t0);
    expect(r1).toBeNull();
    const r2 = scorer.registerDetectedNote(makeNote('dong', t0 + 0.01), t0);
    expect(r2?.outcome).toBe('perfect');
  });
});
