import { describe, it, expect } from 'vitest';
import { ToqueScheduler, clampBpm } from './scheduler';
import { GLOBAL_BPM_RANGE, TOQUES } from './rhythms';

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

describe('clampBpm (global range, toque-independent)', () => {
  it('clamps below the global minimum', () => {
    expect(clampBpm(angola, 1)).toBe(GLOBAL_BPM_RANGE[0]);
  });

  it('clamps above the global maximum', () => {
    expect(clampBpm(angola, 500)).toBe(GLOBAL_BPM_RANGE[1]);
  });

  it('passes through values inside the global range', () => {
    expect(clampBpm(angola, 70)).toBe(70);
  });

  it('allows tempos outside any toque traditional range', () => {
    // Angola's traditional range is ~40-80; 30 and 150 are both valid now.
    expect(clampBpm(angola, 30)).toBe(30);
    expect(clampBpm(angola, 150)).toBe(150);
  });
});
