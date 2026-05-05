import { supabase } from './supabase';

/**
 * Leaderboard fetch + ranking. Pulls aggregate rows from the
 * leaderboard_view (one row per user × day × toque) and reduces
 * client-side to the requested metric and time window. Doing the
 * reduction in the browser keeps the SQL view small and lets us add
 * new metrics without database migrations.
 */

export type LeaderboardMetric =
  | 'songs_today'      // minutes / 3, default
  | 'total_beats'      // sum of total_scored_beats over window
  | 'longest_streak'   // longest current streak (days; computed by daysSet)
  | 'practice_minutes' // sum of elapsed_sec / 60 over window
  | 'toques_practiced'; // distinct toques touched in window

export type LeaderboardWindow = 'today' | 'week' | 'month' | 'all';

export interface LeaderboardRow {
  userId: string;
  /** null if user is in anonymous mode; render as "Anonymous". */
  displayName: string | null;
  value: number;
}

/** Local-tz day key (YYYY-MM-DD) for streak calculations. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function windowStart(window: LeaderboardWindow, now: Date = new Date()): Date | null {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  switch (window) {
    case 'today':
      return d;
    case 'week':
      d.setDate(d.getDate() - 7);
      return d;
    case 'month':
      d.setDate(d.getDate() - 30);
      return d;
    case 'all':
    default:
      return null;
  }
}

interface Aggregate {
  userId: string;
  displayName: string | null;
  totalMinutes: number;
  totalBeats: number;
  toques: Set<string>;
  days: Set<string>;
}

/** Reduce a flat list of view rows into per-user aggregates. */
function aggregate(rows: ViewRow[]): Map<string, Aggregate> {
  const out = new Map<string, Aggregate>();
  for (const r of rows) {
    let agg = out.get(r.user_id);
    if (!agg) {
      agg = {
        userId: r.user_id,
        displayName: r.display_name,
        totalMinutes: 0,
        totalBeats: 0,
        toques: new Set(),
        days: new Set(),
      };
      out.set(r.user_id, agg);
    }
    agg.totalMinutes += Number(r.minutes ?? 0);
    agg.totalBeats += Number(r.beats ?? 0);
    if (r.toque_name) agg.toques.add(r.toque_name);
    if (r.day) agg.days.add(dayKey(new Date(r.day)));
  }
  return out;
}

/** Longest run of consecutive days in `days`, ending at today or earlier. */
function longestStreak(days: Set<string>): number {
  if (days.size === 0) return 0;
  const sorted = Array.from(days).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev === null) {
      run = 1;
    } else {
      const prevDate = new Date(prev);
      const cur = new Date(d);
      const diff = (cur.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000);
      run = diff === 1 ? run + 1 : 1;
    }
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

interface ViewRow {
  user_id: string;
  display_name: string | null;
  toque_name: string | null;
  day: string | null;
  session_count: number;
  minutes: number;
  beats: number;
  best_accuracy: number;
  avg_accuracy: number;
}

export async function fetchLeaderboard(
  metric: LeaderboardMetric,
  window: LeaderboardWindow,
  limit = 50,
): Promise<LeaderboardRow[]> {
  if (!supabase) return [];
  const since = windowStart(window);
  let q = supabase
    .from('leaderboard_view')
    .select('user_id, display_name, toque_name, day, session_count, minutes, beats, best_accuracy, avg_accuracy');
  if (since) q = q.gte('day', since.toISOString());
  const { data, error } = await q;
  if (error) {
    console.warn('[leaderboard] fetch failed', error.message);
    return [];
  }

  const aggMap = aggregate((data as ViewRow[]) ?? []);
  const rows: LeaderboardRow[] = [];
  for (const a of aggMap.values()) {
    let value: number;
    switch (metric) {
      case 'songs_today':
        value = a.totalMinutes / 3;
        break;
      case 'total_beats':
        value = a.totalBeats;
        break;
      case 'longest_streak':
        value = longestStreak(a.days);
        break;
      case 'practice_minutes':
        value = a.totalMinutes;
        break;
      case 'toques_practiced':
        value = a.toques.size;
        break;
    }
    rows.push({ userId: a.userId, displayName: a.displayName, value });
  }
  rows.sort((x, y) => y.value - x.value);
  return rows.slice(0, limit);
}
