import { describe, it, expect } from 'vitest';
import {
  buildHeatmap,
  computeToqueStats,
  dayKey,
  streakDays,
  totalDaysPracticed,
  type SessionRecord,
} from './session';

function rec(endedAt: number): SessionRecord {
  return {
    startedAt: endedAt - 60_000,
    endedAt,
    toqueName: 'Angola',
    bpm: 60,
    elapsedSec: 60,
    accuracy: 0.8,
    totalScoredBeats: 10,
    bestStreak: 3,
    outcomeCounts: { perfect: 5, good: 3, wrong_sound: 0, late_correct: 1, late_wrong: 0, miss: 1, mistake: 0 },
    perSound: { dong: 0.9, ch: 0.7, ding: 0.8 },
  };
}

function dayOffset(base: number, days: number): number {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

const NOW = new Date(2026, 3, 17, 14, 0, 0).getTime(); // arbitrary fixed 'today'

describe('dayKey', () => {
  it('produces stable YYYY-MM-DD keys', () => {
    expect(dayKey(new Date(2026, 3, 17, 23, 59).getTime())).toBe('2026-04-17');
    expect(dayKey(new Date(2026, 3, 18, 0, 1).getTime())).toBe('2026-04-18');
  });
});

describe('streakDays', () => {
  it('returns 0 with no sessions', () => {
    expect(streakDays([], NOW)).toBe(0);
  });

  it('counts today-only as a 1-day streak', () => {
    expect(streakDays([rec(NOW)], NOW)).toBe(1);
  });

  it('counts consecutive days ending today', () => {
    const sessions = [
      rec(dayOffset(NOW, -2)),
      rec(dayOffset(NOW, -1)),
      rec(NOW),
    ];
    expect(streakDays(sessions, NOW)).toBe(3);
  });

  it('still counts the streak if today is empty but yesterday has one', () => {
    const sessions = [rec(dayOffset(NOW, -2)), rec(dayOffset(NOW, -1))];
    expect(streakDays(sessions, NOW)).toBe(2);
  });

  it('returns 0 if the most recent session is older than yesterday', () => {
    const sessions = [rec(dayOffset(NOW, -3)), rec(dayOffset(NOW, -5))];
    expect(streakDays(sessions, NOW)).toBe(0);
  });

  it('ignores gaps in the middle of the history', () => {
    const sessions = [
      rec(dayOffset(NOW, -10)),
      rec(dayOffset(NOW, -9)),
      rec(dayOffset(NOW, -1)),
      rec(NOW),
    ];
    expect(streakDays(sessions, NOW)).toBe(2);
  });
});

describe('totalDaysPracticed', () => {
  it('counts unique days, not sessions', () => {
    const sessions = [
      rec(dayOffset(NOW, 0)),
      rec(dayOffset(NOW, 0) + 3_600_000), // same day, later
      rec(dayOffset(NOW, -3)),
    ];
    expect(totalDaysPracticed(sessions)).toBe(2);
  });
});

describe('buildHeatmap', () => {
  it('returns the requested number of week columns', () => {
    const map = buildHeatmap([], NOW, 10);
    expect(map.weeks).toHaveLength(10);
    for (const w of map.weeks) expect(w).toHaveLength(7);
  });

  it('ends with the Saturday of the current week', () => {
    const map = buildHeatmap([], NOW, 4);
    const lastCol = map.weeks[map.weeks.length - 1]!;
    const satCell = lastCol[6]!;
    expect(new Date(satCell.timestamp).getDay()).toBe(6);
  });

  it('aggregates multiple sessions on the same day into the same cell', () => {
    const sessions = [
      { ...rec(NOW), elapsedSec: 600 },
      { ...rec(NOW + 3_600_000), elapsedSec: 900 }, // same day, later
    ];
    const map = buildHeatmap(sessions, NOW, 4);
    const todayKey = dayKey(NOW);
    const cell = map.weeks.flat().find((c) => c.day === todayKey);
    expect(cell?.minutes).toBeCloseTo(25, 1); // (600+900)/60
    expect(cell?.intensity).toBe(1); // sole non-zero day
  });

  it('scales intensity relative to the busiest day', () => {
    const sessions = [
      { ...rec(dayOffset(NOW, -2)), elapsedSec: 1200 }, // 20 min
      { ...rec(dayOffset(NOW, -1)), elapsedSec: 2400 }, // 40 min — max
    ];
    const map = buildHeatmap(sessions, NOW, 4);
    const a = map.weeks.flat().find((c) => c.day === dayKey(dayOffset(NOW, -2)))!;
    const b = map.weeks.flat().find((c) => c.day === dayKey(dayOffset(NOW, -1)))!;
    expect(b.intensity).toBe(1);
    expect(a.intensity).toBeCloseTo(0.5, 2);
  });
});

describe('computeToqueStats', () => {
  it('returns empty for no sessions', () => {
    expect(computeToqueStats([])).toEqual([]);
  });

  it('aggregates per toque and sorts by most-recent first', () => {
    const s1 = { ...rec(dayOffset(NOW, -5)), toqueName: 'Angola' as const, accuracy: 0.6 };
    const s2 = { ...rec(dayOffset(NOW, -1)), toqueName: 'Angola' as const, accuracy: 0.9 };
    const s3 = { ...rec(dayOffset(NOW, -3)), toqueName: 'Cavalaria' as const, accuracy: 0.7 };
    const stats = computeToqueStats([s1, s2, s3]);

    expect(stats.map((s) => s.toqueName)).toEqual(['Angola', 'Cavalaria']);
    const angola = stats[0]!;
    expect(angola.sessionCount).toBe(2);
    expect(angola.bestAccuracy).toBeCloseTo(0.9, 5);
    expect(angola.averageAccuracy).toBeCloseTo(0.75, 5);
    expect(angola.totalBeats).toBe(20);
  });
});
