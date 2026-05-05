import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Auth context. Wraps the app so any route can ask
 *
 *   const { user, profile, signIn, signOut, ... } = useAuth();
 *
 * If Supabase isn't configured (missing env vars), `user` and
 * `profile` stay null forever and the mutators no-op. Components
 * that need cloud features should fall back gracefully on null.
 */

export interface CloudProfile {
  id: string;
  display_name: string | null;
  anonymous: boolean;
}

interface AuthCtx {
  /** True until the initial session has been resolved. */
  loading: boolean;
  /** Auth user (null = signed out / cloud disabled). */
  user: User | null;
  /** Local copy of the profiles row for the signed-in user. */
  profile: CloudProfile | null;
  /** Refresh the cached profile (e.g. after editing display name). */
  refreshProfile: () => Promise<void>;
  /** Email + password sign-in. Returns an error message or null. */
  signIn: (email: string, password: string) => Promise<string | null>;
  /** Email + password sign-up. Same return shape. */
  signUp: (email: string, password: string) => Promise<string | null>;
  /** Sign in with Google OAuth. Redirects on success. */
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Update display name + anonymous flag in the profiles row. */
  updateProfile: (patch: Partial<Pick<CloudProfile, 'display_name' | 'anonymous'>>) => Promise<string | null>;
}

const Context = createContext<AuthCtx | null>(null);

const NOOP_CTX: AuthCtx = {
  loading: false,
  user: null,
  profile: null,
  refreshProfile: async () => {},
  signIn: async () => 'Cloud is not configured.',
  signUp: async () => 'Cloud is not configured.',
  signInWithGoogle: async () => 'Cloud is not configured.',
  signOut: async () => {},
  updateProfile: async () => 'Cloud is not configured.',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState<boolean>(supabase !== null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CloudProfile | null>(null);

  // Pull the current session on mount, then subscribe to changes.
  // Hooks always run — the effect itself bails when cloud is disabled
  // so we don't violate rules-of-hooks ordering.
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    let cancelled = false;
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange(
      (_event, session: Session | null) => {
        setUser(session?.user ?? null);
        if (!session) setProfile(null);
      },
    );
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Whenever the user changes, refresh the cached profile.
  const refreshProfile = async () => {
    if (!supabase || !user) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, anonymous')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      console.warn('[auth] profile fetch failed', error);
      return;
    }
    setProfile((data as CloudProfile | null) ?? null);
  };

  useEffect(() => {
    void refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // No-op early return for the no-cloud case happens AFTER the hooks
  // above so order is stable across renders.
  if (!supabase) {
    return <Context.Provider value={NOOP_CTX}>{children}</Context.Provider>;
  }
  const sb = supabase;

  const signIn: AuthCtx['signIn'] = async (email, password) => {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  };

  const signUp: AuthCtx['signUp'] = async (email, password) => {
    const { error } = await sb.auth.signUp({ email, password });
    return error?.message ?? null;
  };

  const signInWithGoogle: AuthCtx['signInWithGoogle'] = async () => {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return error?.message ?? null;
  };

  const signOut = async () => {
    await sb.auth.signOut();
  };

  const updateProfile: AuthCtx['updateProfile'] = async (patch) => {
    if (!user) return 'Not signed in.';
    const { error } = await sb
      .from('profiles')
      .update(patch)
      .eq('id', user.id);
    if (error) return error.message;
    await refreshProfile();
    return null;
  };

  const value: AuthCtx = {
    loading,
    user,
    profile,
    refreshProfile,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    updateProfile,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Context);
  return ctx ?? NOOP_CTX;
}
