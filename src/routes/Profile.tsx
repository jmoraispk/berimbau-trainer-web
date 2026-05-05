import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/cloud/auth';
import { isCloudConfigured } from '@/cloud/supabase';
import { useI18n } from '@/i18n';

/**
 * Profile — read/edit your display name and anonymous flag, sign out.
 * Account-deletion lives in Settings (next to data wipe) so all the
 * destructive actions are in one place.
 */
export function Profile() {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const { user, profile, loading, signOut, updateProfile } = useAuth();
  const [name, setName] = useState('');
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(profile?.display_name ?? '');
    setAnon(profile?.anonymous ?? false);
  }, [profile?.display_name, profile?.anonymous]);

  if (!isCloudConfigured) {
    return (
      <main className="min-h-full px-6 py-10 max-w-md mx-auto flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t('profile.title')}</h1>
        <p className="text-sm text-text-dim">{t('auth.cloud_unavailable')}</p>
        <Link href="/" className="btn-ghost self-start">
          {t('common.back')}
        </Link>
      </main>
    );
  }

  if (!loading && !user) {
    navigate('/auth');
    return null;
  }

  const onSave = async () => {
    setBusy(true);
    setMsg(null);
    const err = await updateProfile({ display_name: name || null, anonymous: anon });
    setBusy(false);
    setMsg(err ?? t('profile.saved'));
  };

  return (
    <main className="min-h-full px-6 py-10 max-w-md mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold">{t('profile.title')}</h1>
          <p className="text-text-dim text-sm">{user?.email ?? ''}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>

      <section className="flex flex-col gap-3">
        <label className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          {t('profile.display_name')}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('profile.display_name_placeholder')}
          className="rounded-md bg-bg-elev border border-border px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        />
        <label className="flex items-center gap-2 text-sm text-text-dim mt-1">
          <input
            type="checkbox"
            checked={anon}
            onChange={(e) => setAnon(e.target.checked)}
          />
          {t('profile.anonymous')}
        </label>
        <p className="text-xs text-text-dim">{t('profile.anonymous_help')}</p>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={busy}
          className="btn-primary self-start disabled:opacity-50"
        >
          {busy ? '…' : t('common.save')}
        </button>
        {msg && <p className="text-sm text-text-dim">{msg}</p>}
      </section>

      <hr className="border-border" />

      <div className="flex flex-wrap gap-3">
        <Link href="/settings" className="btn-ghost">
          {t('profile.settings_link')}
        </Link>
        <button
          type="button"
          onClick={() => {
            void signOut();
            navigate('/');
          }}
          className="btn-ghost"
        >
          {t('profile.sign_out')}
        </button>
      </div>
    </main>
  );
}
