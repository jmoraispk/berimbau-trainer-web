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
          className="btn-primary disabled:opacity-50"
        >
          {busy ? '…' : mode === 'signin' ? t('auth.mode_signin') : t('auth.mode_signup')}
        </button>
      </form>

      <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-text-dim font-mono">
        <div className="flex-1 h-px bg-border" />
        {t('auth.or')}
        <div className="flex-1 h-px bg-border" />
      </div>

      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        className="btn-ghost w-full"
      >
        {t('auth.google')}
      </button>

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
