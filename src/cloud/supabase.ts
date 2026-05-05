import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cloud client. Initialised lazily from env vars; if either is missing
 * the export is null and every cloud feature short-circuits (auth UI
 * shows a "cloud not configured" message, leaderboard renders empty,
 * sync is a no-op). The app keeps working offline-only without errors.
 *
 * The anon key is safe in the browser bundle — RLS policies are what
 * actually protect data.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          // Persist session in localStorage; refresh access tokens silently.
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const isCloudConfigured = supabase !== null;
