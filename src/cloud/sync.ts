import { supabase } from './supabase';
import type { SessionRecord } from '@/engine/session';

/**
 * Sync — push completed practice sessions to the cloud so they show up
 * in the leaderboard for everyone else and on the profile page across
 * devices. IDB stays as the source of truth + offline cache; cloud is
 * a parallel write.
 *
 * No-op when cloud isn't configured or the user isn't signed in.
 * Errors are logged and swallowed so a flaky network never blocks the
 * local save.
 */

export async function pushSession(session: SessionRecord): Promise<void> {
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;

  const row = {
    user_id: u.user.id,
    toque_name: session.toqueName,
    bpm: session.bpm,
    started_at: new Date(session.startedAt).toISOString(),
    ended_at: new Date(session.endedAt).toISOString(),
    elapsed_sec: session.elapsedSec,
    total_scored_beats: session.totalScoredBeats,
    accuracy: session.accuracy,
    best_streak: session.bestStreak ?? 0,
    outcome_counts: session.outcomeCounts ?? null,
    per_sound: session.perSound ?? null,
  };
  const { error } = await supabase.from('sessions').insert(row);
  if (error) console.warn('[sync] pushSession failed', error.message);
}
