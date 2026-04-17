import { describe, it, expect } from 'vitest';
import { ToqueScheduler, clampBpm } from './scheduler';
import { TOQUES } from './rhythms';

const angola = TOQUES['Angola'];

describe('ToqueScheduler', () => {
  it('computes cycle duration from BPM', () => {
    // 60 BPM, 16 subdivisions across 4 beats → 4 seconds per cycle.
    const s = new ToqueScheduler({ toque: angola, bpm: 60, startTime: 0 });
    expect(s.cycleSeconds).toBeCloseTo(4.0, 5);
  });

  it('emits one beat per playable step in the first cycle', () => {
    const s = new ToqueScheduler({ toque: angola, bpm: 60, startTime: 0 });
    const beats = s.beatsInWindow(0, s.cycleSeconds + 0.001);
    // Angola has 6 non-rest steps per cycle: ch ch DONG DING + ch ch DONG DING.
    const playable = angola.pattern.filter((e) => e.sound !== 'rest').length;
    // Two cycles overlap the window boundary at 0 and at cycleSeconds — the
    // second cycle's step 0 lands at cycleSeconds exactly.
    expect(beats.length).toBe(playable + 1);
  });

  it('schedules beats at the right absolute times', () => {
    // At 60 BPM: stepDuration = 0.25s. Angola step 2 = DONG.
    const s = new ToqueScheduler({ toque: angola, bpm: 60, startTime: 100 });
    const beats = s.beatsInWindow(100, 101);
    const dong = beats.find((b) => b.step === 2);
    expect(dong?.beatTime).toBeCloseTo(100.5, 5);
    expect(dong?.sound).toBe('dong');
  });

  it('returns empty when the window is before startTime', () => {
    const s = new ToqueScheduler({ toque: angola, bpm: 60, startTime: 10 });
    expect(s.beatsInWindow(0, 5)).toEqual([]);
  });

  it('gives each beat a unique monotonic id across cycles', () => {
    const s = new ToqueScheduler({ toque: angola, bpm: 60, startTime: 0 });
    const beats = s.beatsInWindow(0, 3 * s.cycleSeconds);
    const ids = beats.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]!).toBeGreaterThan(ids[i - 1]!);
    }
  });
});

describe('clampBpm', () => {
  it('clamps below the range', () => {
    expect(clampBpm(angola, 20)).toBe(angola.bpmRange[0]);
  });

  it('clamps above the range', () => {
    expect(clampBpm(angola, 500)).toBe(angola.bpmRange[1]);
  });

  it('passes through values inside the range', () => {
    expect(clampBpm(angola, 70)).toBe(70);
  });
});
