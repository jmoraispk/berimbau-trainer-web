import { describe, it, expect } from 'vitest';
import { ToqueScheduler, clampBpm } from './scheduler';
import { GLOBAL_BPM_RANGE, TOQUES } from './rhythms';

const angola = TOQUES['Angola']; // intervals: ['tch_tch', 'dong', 'ding', 'rest']
const sbgRegional = TOQUES['São Bento Grande (Regional)']; // 8-interval cycle

describe('ToqueScheduler — interval-based model', () => {
  it('cycle duration equals (60/bpm) * intervals.length', () => {
    // Angola has 4 intervals → 4 quarters at 60 bpm = 4 seconds.
    const s = new ToqueScheduler({ toque: angola, bpm: 60, startTime: 0 });
    expect(s.cycleSeconds).toBeCloseTo(4.0, 5);
  });

  it('emits the right beats and timestamps within one cycle of Angola', () => {
    // intervals: tch_tch (2 beats), dong, ding, rest. Total: 4 beats per cycle.
    const s = new ToqueScheduler({ toque: angola, bpm: 60, startTime: 100 });
    const beats = s.beatsInWindow(100, 100 + s.cycleSeconds - 0.001);
    expect(beats.map((b) => b.sound)).toEqual(['ch', 'ch', 'dong', 'ding']);
    // Times: tch1 at +0, tch2 at +0.5 (eighth note inside beat 1), dong at
    // +1 (beat 2), ding at +2 (beat 3). Beat 4 is rest.
    expect(beats.map((b) => +(b.beatTime - 100).toFixed(3))).toEqual([0, 0.5, 1, 2]);
  });

  it('spans cycles correctly — Angola cycle 1 immediately follows cycle 0', () => {
    const s = new ToqueScheduler({ toque: angola, bpm: 60, startTime: 0 });
    // Cap just shy of cycle 2's first beat so we don't pull a 9th in.
    const beats = s.beatsInWindow(0, 2 * s.cycleSeconds - 0.001);
    expect(beats.length).toBe(8);
    expect(beats[4]?.cycle).toBe(1);
    expect(beats[4]?.beatTime).toBeCloseTo(s.cycleSeconds, 5);
  });

  it('expands tch_tch into two beats half an interval apart', () => {
    const s = new ToqueScheduler({ toque: angola, bpm: 60, startTime: 0 });
    const beats = s.beatsInWindow(0, 0.6);
    expect(beats.length).toBe(2);
    expect(beats[0]?.subIndex).toBe(0);
    expect(beats[1]?.subIndex).toBe(1);
    expect(beats[1]!.beatTime - beats[0]!.beatTime).toBeCloseTo(0.5, 5);
  });

  it('schedules SBG (Regional) — 8-beat cycle with three tch_tch pairs', () => {
    // Pattern: tch_tch dong tch_tch ding tch_tch dong dong ding
    //   beats per cycle = 3*2 + 5 = 11
    const s = new ToqueScheduler({ toque: sbgRegional, bpm: 120, startTime: 0 });
    const beats = s.beatsInWindow(0, s.cycleSeconds - 0.001);
    expect(beats.length).toBe(11);
    expect(beats.map((b) => b.sound).filter((s) => s === 'ch')).toHaveLength(6);
    // Last sound in the cycle is ding on interval 7.
    expect(beats[beats.length - 1]?.sound).toBe('ding');
    expect(beats[beats.length - 1]?.intervalIndex).toBe(7);
  });

  it('returns empty when the window is before startTime', () => {
    const s = new ToqueScheduler({ toque: angola, bpm: 60, startTime: 10 });
    expect(s.beatsInWindow(0, 5)).toEqual([]);
  });

  it('returns empty when intervals is empty (comingSoon toque)', () => {
    const iuna = TOQUES['Iuna'];
    const s = new ToqueScheduler({ toque: iuna, bpm: 70, startTime: 0 });
    expect(s.cycleSeconds).toBe(0);
    expect(s.beatsInWindow(0, 100)).toEqual([]);
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

  it('marks the second tch in a pair as non-accent', () => {
    const s = new ToqueScheduler({ toque: angola, bpm: 60, startTime: 0 });
    const beats = s.beatsInWindow(0, 0.6);
    expect(beats[0]?.accent).toBe(true);
    expect(beats[1]?.accent).toBe(false);
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

  it('allows tempos that no traditional range would permit', () => {
    expect(clampBpm(angola, 30)).toBe(30);
    expect(clampBpm(angola, 150)).toBe(150);
  });
});
