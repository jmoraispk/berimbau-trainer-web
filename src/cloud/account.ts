import { supabase } from './supabase';

/**
 * Account-level destructive actions. Both gate on a signed-in user;
 * RLS / SECURITY DEFINER on the SQL side does the actual enforcement.
 *
 *   wipeMyData    — delete every row in public.sessions for this user.
 *                   Auth row + profile remain. Useful as a "start
 *                   fresh" without losing the account.
 *   deleteMyAccount — call the SQL RPC that nukes the auth.users row.
 *                   Cascades to profiles + sessions via FK.
 */

export async function wipeMyData(): Promise<string | null> {
  if (!supabase) return 'Cloud is not configured.';
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return 'Not signed in.';
  const { error } = await supabase.from('sessions').delete().eq('user_id', u.user.id);
  if (error) return error.message;
  return null;
}

export async function deleteMyAccount(): Promise<string | null> {
  if (!supabase) return 'Cloud is not configured.';
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return error.message;
  await supabase.auth.signOut();
  return null;
}
