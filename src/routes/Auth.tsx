import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/cloud/auth';
import { isCloudConfigured } from '@/cloud/supabase';
import { useI18n } from '@/i18n';

/**
 * Sign-in / sign-up route. Two paths:
 *   - email + password (sign in or sign up depending on mode)
 *   - Google OAuth
 *
 * Falls back to a "cloud not configured" state when env vars are
 * missing, which keeps the offline-only build perfectly usable.
 */

type Mode = 'signin' | 'signup';

export function Auth() {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const { user, loading, signIn, signUp, signInWithGoogle } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!isCloudConfigured) {
    return (
      <main className="min-h-full px-6 py-10 max-w-md mx-auto flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t('auth.title')}</h1>
        <p className="text-sm text-text-dim">{t('auth.cloud_unavailable')}</p>
        <Link href="/" className="text-accent underline underline-offset-4 text-sm">
          {t('common.back')}
        </Link>
      </main>
    );
  }

  if (user) {
    // Already signed in — bounce to profile.
    navigate('/profile');
    return null;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setInfo(null);
    const err =
      mode === 'signin' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (err) {
      setMsg(err);
      return;
    }
    if (mode === 'signup') setInfo(t('auth.signup_check_email'));
    else navigate('/profile');
  };

  return (
    <main className="min-h-full px-6 py-10 max-w-md mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold">{t('auth.title')}</h1>
          <p className="text-text-dim text-sm">{t('auth.subtitle')}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>

      {/* OAuth comes first — it's the path most people take. The
          email/password form sits below as the explicit alternative.
          Google branding rules ask for the multi-color G mark on a
          neutral background so the button is instantly recognisable;
          the same button handles both first sign-up and subsequent
          sign-ins (Supabase auto-creates the auth row on first OAuth
          connection). */}
      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        className="w-full inline-flex items-center justify-center gap-3 px-4 py-2.5 rounded-full bg-white text-[#1f1f1f] font-medium text-sm hover:bg-white/90 transition shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
      >
        <GoogleG />
        {t('auth.google')}
      </button>

      <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-text-dim font-mono">
        <div className="flex-1 h-px bg-border" />
        {t('auth.or')}
        <div className="flex-1 h-px bg-border" />
      </div>

      <div className="flex gap-2 text-xs">
        <ModeButton current={mode} target="signin" onClick={setMode} label={t('auth.mode_signin')} />
        <ModeButton current={mode} target="signup" onClick={setMode} label={t('auth.mode_signup')} />
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder={t('auth.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="rounded-md bg-bg-elev border border-border px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        />
        <input
          type="password"
          placeholder={t('auth.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          className="rounded-md bg-bg-elev border border-border px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || loading}
          className="btn-ghost disabled:opacity-50"
        >
          {busy ? '…' : mode === 'signin' ? t('auth.mode_signin') : t('auth.mode_signup')}
        </button>
      </form>

      {msg && <p className="text-sm text-red-400">{msg}</p>}
      {info && <p className="text-sm text-text-dim">{info}</p>}

      <p className="text-xs text-text-dim text-center">
        <Link href="/privacy" className="underline">
          {t('auth.legal_privacy')}
        </Link>
        {' · '}
        <Link href="/terms" className="underline">
          {t('auth.legal_terms')}
        </Link>
      </p>
    </main>
  );
}

function ModeButton({
  current,
  target,
  onClick,
  label,
}: {
  current: Mode;
  target: Mode;
  onClick: (m: Mode) => void;
  label: string;
}) {
  const active = current === target;
  return (
    <button
      type="button"
      onClick={() => onClick(target)}
      className={`flex-1 px-3 py-1.5 rounded-full border text-xs transition ${
        active
          ? 'bg-accent text-bg border-accent'
          : 'bg-bg-elev text-text-dim border-border hover:border-border-strong'
      }`}
    >
      {label}
    </button>
  );
}

/** Official multi-colour Google "G" mark, inline SVG. */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
