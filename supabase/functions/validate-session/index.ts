// validate-session — Supabase Edge Function (Deno).
//
// Server-side sanity check before a session row lands in the database.
// The current direct-insert path from the browser is fine for a
// trusted-user MVP; switch the client to call this function once the
// leaderboard is live so obviously-fake submissions get rejected
// before they pollute the rankings.
//
// Deploy:
//   supabase functions deploy validate-session
//
// Invoke from the browser:
//   await supabase.functions.invoke('validate-session', { body: { ...sessionRecord } })
//
// We then perform the insert from the function using the service role,
// applying these checks first.

// deno-lint-ignore-file
// @ts-nocheck — runs in Deno, not the Vite TypeScript project.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface SessionPayload {
  toque_name: string;
  bpm: number;
  started_at: string;
  ended_at: string;
  elapsed_sec: number;
  total_scored_beats: number;
  accuracy: number;
  best_streak: number;
  outcome_counts?: unknown;
  per_sound?: unknown;
}

const ALLOWED_TOQUES = new Set([
  'São Bento Pequeno',
  'Angola',
  'São Bento Grande de Angola',
  'Benguela',
  'São Bento Grande (Regional)',
  'Iuna',
  'Cavalaria',
  'Viradas',
]);

function rejection(reason: string, status = 400): Response {
  return new Response(JSON.stringify({ error: reason }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function validate(p: SessionPayload): string | null {
  if (!ALLOWED_TOQUES.has(p.toque_name)) return 'unknown toque';
  if (p.bpm < 10 || p.bpm > 200) return 'bpm out of range';
  if (p.elapsed_sec < 5 || p.elapsed_sec > 60 * 60 * 4) return 'elapsed_sec out of range';
  if (p.accuracy < 0 || p.accuracy > 1) return 'accuracy out of range';
  if (p.total_scored_beats < 0 || p.total_scored_beats > 100_000) return 'beats out of range';
  if (p.best_streak < 0 || p.best_streak > 100_000) return 'best_streak out of range';
  const start = Date.parse(p.started_at);
  const end = Date.parse(p.ended_at);
  if (!isFinite(start) || !isFinite(end)) return 'invalid timestamps';
  if (end < start) return 'ended_at before started_at';
  // Wall-clock duration must be within 30s of the reported elapsed_sec
  // (allow some slop for paused time + clock skew).
  const wall = (end - start) / 1000;
  if (Math.abs(wall - p.elapsed_sec) > 30 + p.elapsed_sec) return 'wall vs elapsed mismatch';
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return rejection('POST only', 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return rejection('missing auth', 401);

  let payload: SessionPayload;
  try {
    payload = await req.json();
  } catch {
    return rejection('invalid json');
  }
  const why = validate(payload);
  if (why) return rejection(why);

  // Use the user's JWT so RLS still applies.
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: u, error: userErr } = await sb.auth.getUser();
  if (userErr || !u.user) return rejection('not signed in', 401);

  const { error } = await sb.from('sessions').insert({
    user_id: u.user.id,
    ...payload,
  });
  if (error) return rejection(error.message, 500);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
