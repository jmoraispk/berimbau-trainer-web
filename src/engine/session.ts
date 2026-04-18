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
