/**
 * Completed-practice record and history helpers.
 *
 * A SessionRecord is what gets persisted when the user hits "End session"
 * in Practice. Records are immutable once written; we add new ones rather
 * than updating existing ones so the history is a natural timeline.
 */

import type { ToqueName } from './rhythms';
import type { Outcome } from './scoring';

export interface SessionRecord {
  /** IDB-assigned id; undefined before insert. */
  id?: number;
  /** ms since epoch when the session started. */
  startedAt: number;
  /** ms since epoch when "End session" was pressed. */
  endedAt: number;
  toqueName: ToqueName;
  bpm: number;
  /** Active seconds, excluding time spent paused. */
  elapsedSec: number;
  accuracy: number;
  totalScoredBeats: number;
  bestStreak: number;
  outcomeCounts: Record<Outcome, number>;
  perSound: Record<'dong' | 'ch' | 'ding', number | null>;
}

/** Local-calendar-day key (YYYY-MM-DD) for a ms timestamp. */
export function dayKey(ts: number, now: Date = new Date(ts)): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Current streak: number of *consecutive* calendar days up to and including
 * today (or yesterday — we don't want the streak to vanish during the day
 * before the user has practiced) on which at least one session was recorded.
 *
 * Returns 0 if the most recent session is older than "yesterday".
 */
export function streakDays(
  sessions: SessionRecord[],
  now: number = Date.now(),
): number {
  if (sessions.length === 0) return 0;

  const days = new Set<string>();
  for (const s of sessions) days.add(dayKey(s.endedAt));

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // If neither today nor yesterday has a session, there's no live streak.
  const todayKey = dayKey(today.getTime());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dayKey(yesterday.getTime());

  let cursor: Date;
  if (days.has(todayKey)) {
    cursor = today;
  } else if (days.has(yesterdayKey)) {
    cursor = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  while (days.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Total unique days practiced across the whole history — a cheap "lifetime"
 * metric that won't reset if the user skips a day.
 */
export function totalDaysPracticed(sessions: SessionRecord[]): number {
  const days = new Set<string>();
  for (const s of sessions) days.add(dayKey(s.endedAt));
  return days.size;
}

export interface HeatmapCell {
  /** Local-calendar day key (YYYY-MM-DD). */
  day: string;
  /** Timestamp at local 00:00:00 on that day — useful for tooltips. */
  timestamp: number;
  /** Total active minutes practiced on this day. 0 when nothing happened. */
  minutes: number;
  /** Intensity in [0, 1] relative to the busiest day in the range. */
  intensity: number;
}

export interface Heatmap {
  /** Each column is a week (Sun–Sat), oldest first, 7 cells per column. */
  weeks: HeatmapCell[][];
  /** Right-most week's Sunday, for labeling. */
  lastDay: number;
}

/**
 * Weeks × days grid of practice intensity for a rolling window ending
 * today. `weeks` param defaults to 26 (~6 months). The first column
 * starts on a Sunday so the grid lines up with conventional calendars.
 */
export function buildHeatmap(
  sessions: SessionRecord[],
  now: number = Date.now(),
  weeks = 26,
): Heatmap {
  // Aggregate active minutes per day up-front so the loop below is cheap.
  const perDay = new Map<string, number>();
  for (const s of sessions) {
    const key = dayKey(s.endedAt);
    perDay.set(key, (perDay.get(key) ?? 0) + s.elapsedSec / 60);
  }
  const maxMinutes = Math.max(1, ...Array.from(perDay.values()));

  // End at the Saturday of the current week so the right-most column
  // always has today visible somewhere in it.
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const endDow = end.getDay(); // 0 Sun .. 6 Sat
  const daysUntilSat = 6 - endDow;
  end.setDate(end.getDate() + daysUntilSat);
  // Start weeks*7 days earlier, floored to a Sunday.
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));

  const cols: HeatmapCell[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < weeks; w++) {
    const col: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const key = dayKey(cursor.getTime());
      const minutes = perDay.get(key) ?? 0;
      col.push({
        day: key,
        timestamp: cursor.getTime(),
        minutes,
        intensity: minutes > 0 ? Math.min(1, minutes / maxMinutes) : 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    cols.push(col);
  }

  return { weeks: cols, lastDay: end.getTime() };
}

export interface ToqueStats {
  toqueName: ToqueName;
  sessionCount: number;
  totalMinutes: number;
  totalBeats: number;
  averageAccuracy: number;
  bestAccuracy: number;
  lastPracticed: number;
}

/**
 * Per-toque aggregates over a set of sessions. Sorted by most-recently-
 * practiced first so the stats page leads with what the user is currently
 * working on.
 */
export function computeToqueStats(sessions: SessionRecord[]): ToqueStats[] {
  const byToque = new Map<ToqueName, SessionRecord[]>();
  for (const s of sessions) {
    const list = byToque.get(s.toqueName);
    if (list) list.push(s);
    else byToque.set(s.toqueName, [s]);
  }
  const out: ToqueStats[] = [];
  for (const [toqueName, list] of byToque) {
    const totalSec = list.reduce((a, b) => a + b.elapsedSec, 0);
    const totalBeats = list.reduce((a, b) => a + b.totalScoredBeats, 0);
    const avg = list.reduce((a, b) => a + b.accuracy, 0) / list.length;
    const best = list.reduce((a, b) => Math.max(a, b.accuracy), 0);
    const last = list.reduce((a, b) => Math.max(a, b.endedAt), 0);
    out.push({
      toqueName,
      sessionCount: list.length,
      totalMinutes: Math.round(totalSec / 60),
      totalBeats,
      averageAccuracy: avg,
      bestAccuracy: best,
      lastPracticed: last,
    });
  }
  out.sort((a, b) => b.lastPracticed - a.lastPracticed);
  return out;
}
