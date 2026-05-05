import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'wouter';
import type { SavedCalibration } from '@/engine/calibration';
import type { SessionRecord } from '@/engine/session';
import { clearProfile } from '@/storage/profiles-store';
import {
  clearActiveProfiles,
  preloadActiveProfiles,
} from '@/audio/active-profiles';
import {
  clearSessions,
  listAllSessions,
} from '@/storage/sessions-store';
import {
  applyBackup,
  buildBackup,
  parseBackup,
} from '@/storage/backup';
import { formatRelativeTime, useI18n, type TFn } from '@/i18n';
import { useRealRhythm } from '@/settings/real-rhythm';
import { usePwaInstall } from '@/settings/use-pwa-install';
import { getMicDeviceId, setMicDeviceId } from '@/audio/mic-device';
import { useAuth } from '@/cloud/auth';
import { isCloudConfigured } from '@/cloud/supabase';
import { deleteMyAccount, wipeMyData } from '@/cloud/account';

/**
 * Local-data management. Everything in this app lives in the browser
 * (calibration profiles + session history via IndexedDB), so the user
 * needs a way to inspect and wipe both.
 */

type Busy = 'calibration' | 'sessions' | 'export' | 'import' | null;

export function Settings() {
  const { t } = useI18n();
  const { realRhythm, setRealRhythm } = useRealRhythm();
  const install = usePwaInstall();
  const { user, profile, updateProfile, signOut } = useAuth();
  const [accountBusy, setAccountBusy] = useState<'wipe' | 'delete' | 'anon' | null>(null);
  const [accountMsg, setAccountMsg] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<SavedCalibration | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void preloadActiveProfiles().then((saved) => {
      if (!cancelled) setCalibration(saved);
    });
    void listAllSessions().then((list) => {
      if (!cancelled) setSessions(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onClearCalibration = async () => {
    if (!confirm(t('settings.clear_calibration_confirm'))) return;
    setBusy('calibration');
    const ok = await clearProfile();
    if (ok) {
      clearActiveProfiles();
      setCalibration(null);
    }
    setBusy(null);
  };

  const onClearSessions = async () => {
    if (!confirm(t('settings.clear_sessions_confirm', { n: sessions.length }))) return;
    setBusy('sessions');
    const ok = await clearSessions();
    if (ok) setSessions([]);
    setBusy(null);
  };

  const flashToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  const onExport = async () => {
    setBusy('export');
    try {
      const doc = await buildBackup();
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `berimbau-pro-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      flashToast(t('settings.export_done', { n: doc.sessions.length }));
    } finally {
      setBusy(null);
    }
  };

  const onImport = async (file: File) => {
    setBusy('import');
    try {
      const text = await file.text();
      const { ok, error, doc } = parseBackup(text);
      if (!ok || !doc) {
        flashToast(
          error ? t('settings.import_failed', { reason: error }) : t('settings.import_failed_generic'),
        );
        return;
      }
      const maybeCal = doc.calibration ? t('settings.import_with_calibration') : '';
      const replace = confirm(
        t('settings.import_confirm', {
          sessions: doc.sessions.length,
          maybe_calibration: maybeCal,
        }),
      );
      const result = await applyBackup(doc, { replaceExisting: replace });
      // Invalidate the in-memory profile cache so the next mic-start
      // reads the freshly-imported record from IDB rather than the stale
      // pre-import value.
      clearActiveProfiles();
      const [loaded, all] = await Promise.all([preloadActiveProfiles(), listAllSessions()]);
      setCalibration(loaded);
      setSessions(all);
      const importedMaybeCal = result.calibrationWritten ? t('settings.import_with_calibration') : '';
      flashToast(
        t('settings.import_done', {
          sessions: result.sessionsWritten,
          maybe_calibration: importedMaybeCal,
        }),
      );
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const totalMinutes = Math.round(
    sessions.reduce((sum, s) => sum + s.elapsedSec, 0) / 60,
  );
  const totalBeats = sessions.reduce((sum, s) => sum + s.totalScoredBeats, 0);

  return (
    <main className="min-h-full px-6 py-8 max-w-2xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
          <p className="text-text-dim text-sm">{t('settings.subtitle')}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>

      {isCloudConfigured && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
            {t('settings.account')}
          </h2>
          {user ? (
            <>
              <Card>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {profile?.display_name ?? user.email}
                  </span>
                  <span className="text-xs text-text-dim">
                    {t('settings.signed_in_as', { email: user.email ?? '' })}
                  </span>
                </div>
                <Link href="/profile" className="btn-ghost shrink-0">
                  {t('settings.account_open')}
                </Link>
              </Card>
              <Card>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {t('settings.anonymous_toggle')}
                  </span>
                  <span className="text-xs text-text-dim leading-relaxed max-w-md">
                    {t('settings.anonymous_help')}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={profile?.anonymous ?? false}
                  disabled={accountBusy === 'anon'}
                  onClick={async () => {
                    setAccountBusy('anon');
                    setAccountMsg(null);
                    const err = await updateProfile({
                      anonymous: !(profile?.anonymous ?? false),
                    });
                    if (err) setAccountMsg(err);
                    setAccountBusy(null);
                  }}
                  className={`shrink-0 inline-flex items-center px-4 py-1.5 rounded-full border text-sm transition disabled:opacity-50 ${
                    profile?.anonymous
                      ? 'bg-accent text-bg border-accent'
                      : 'bg-bg-elev text-text-dim border-border hover:border-border-strong'
                  }`}
                >
                  {profile?.anonymous ? t('settings.anonymous_on') : t('settings.anonymous_off')}
                </button>
              </Card>
              <Card>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{t('settings.wipe_cloud_title')}</span>
                  <span className="text-xs text-text-dim leading-relaxed max-w-md">
                    {t('settings.wipe_cloud_body')}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={accountBusy === 'wipe'}
                  onClick={async () => {
                    if (!confirm(t('settings.wipe_cloud_confirm'))) return;
                    setAccountBusy('wipe');
                    setAccountMsg(null);
                    const err = await wipeMyData();
                    setAccountMsg(err ?? t('settings.wipe_cloud_done'));
                    setAccountBusy(null);
                  }}
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border text-sm text-text-dim hover:border-red-400/60 hover:text-red-400 transition disabled:opacity-50"
                >
                  {t('settings.clear')}
                </button>
              </Card>
              <Card>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{t('settings.delete_account_title')}</span>
                  <span className="text-xs text-text-dim leading-relaxed max-w-md">
                    {t('settings.delete_account_body')}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={accountBusy === 'delete'}
                  onClick={async () => {
                    if (!confirm(t('settings.delete_account_confirm'))) return;
                    setAccountBusy('delete');
                    setAccountMsg(null);
                    const err = await deleteMyAccount();
                    setAccountMsg(err ?? t('settings.delete_account_done'));
                    setAccountBusy(null);
                  }}
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-red-400/40 text-sm text-red-400 hover:border-red-400 transition disabled:opacity-50"
                >
                  {t('settings.delete_account_cta')}
                </button>
              </Card>
              <Card>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{t('settings.subscribe_title')}</span>
                  <span className="text-xs text-text-dim leading-relaxed max-w-md">
                    {t('settings.subscribe_body')}
                  </span>
                </div>
                <Link href="/subscribe" className="btn-ghost shrink-0">
                  {t('settings.subscribe_cta')}
                </Link>
              </Card>
              <button
                type="button"
                onClick={() => void signOut()}
                className="self-start text-xs text-text-dim underline mt-1"
              >
                {t('profile.sign_out')}
              </button>
              {accountMsg && (
                <p className="text-xs text-text-dim font-mono">{accountMsg}</p>
              )}
            </>
          ) : (
            <Card>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{t('settings.account_signed_out')}</span>
                <span className="text-xs text-text-dim leading-relaxed max-w-md">
                  {t('settings.account_signed_out_body')}
                </span>
              </div>
              <Link href="/auth" className="btn-primary shrink-0">
                {t('settings.account_sign_in')}
              </Link>
            </Card>
          )}
        </section>
      )}

      {install.status !== 'already-installed' && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
            {t('settings.install_section')}
          </h2>
          <Card>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{t('settings.install_title')}</span>
              <span className="text-xs text-text-dim leading-relaxed max-w-md">
                {install.status === 'can-prompt'
                  ? t('settings.install_body_can_prompt')
                  : install.status === 'ios-manual'
                  ? t('settings.install_body_ios')
                  : t('settings.install_body_unavailable')}
              </span>
            </div>
            {install.status === 'can-prompt' && (
              <button
                type="button"
                onClick={() => void install.prompt()}
                className="shrink-0 btn-primary px-4 py-1.5 text-sm"
              >
                {t('settings.install_button')}
              </button>
            )}
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          {t('settings.mic_section')}
        </h2>
        <Card>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{t('settings.mic_device_label')}</span>
            <span className="text-xs text-text-dim leading-relaxed max-w-md">
              {t('settings.mic_device_hint')}
            </span>
          </div>
          <MicPicker t={t} />
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          {t('settings.calibration_profile')}
        </h2>
        <Card>
          {calibration ? (
            <>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {t('settings.calibration_summary', {
                    count: totalSamples(calibration),
                    time: formatRelativeTime(t, calibration.savedAt),
                  })}
                </span>
                <span className="text-xs text-text-dim">
                  {t('settings.calibration_breakdown', {
                    dong: calibration.sampleCount.dong,
                    ch: calibration.sampleCount.ch,
                    ding: calibration.sampleCount.ding,
                  })}
                </span>
              </div>
              <button
                type="button"
                onClick={onClearCalibration}
                disabled={busy === 'calibration'}
                className="shrink-0 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border text-sm text-text-dim hover:border-red-400/60 hover:text-red-400 transition disabled:opacity-50"
              >
                {t('settings.clear')}
              </button>
            </>
          ) : (
            <>
              <span className="text-sm text-text-dim">
                {t('settings.calibration_none')}
              </span>
              <Link href="/calibrate" className="btn-ghost shrink-0">
                {t('home.calibrate')}
              </Link>
            </>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          {t('settings.history')}
        </h2>
        <Card>
          {sessions.length > 0 ? (
            <>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {t('settings.history_summary', {
                    sessions: sessions.length,
                    minutes: totalMinutes,
                    beats: totalBeats,
                  })}
                </span>
                <span className="text-xs text-text-dim">
                  {t('settings.history_first_ever', {
                    date: sessions[sessions.length - 1]
                      ? new Date(sessions[sessions.length - 1]!.startedAt).toLocaleDateString()
                      : '—',
                  })}
                </span>
              </div>
              <button
                type="button"
                onClick={onClearSessions}
                disabled={busy === 'sessions'}
                className="shrink-0 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border text-sm text-text-dim hover:border-red-400/60 hover:text-red-400 transition disabled:opacity-50"
              >
                {t('settings.clear_all')}
              </button>
            </>
          ) : (
            <span className="text-sm text-text-dim">
              {t('settings.history_none')}
            </span>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          {t('settings.display')}
        </h2>
        <Card>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{t('settings.real_rhythm_label')}</span>
            <span className="text-xs text-text-dim leading-relaxed max-w-md">
              {t('settings.real_rhythm_body')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRealRhythm(!realRhythm)}
            role="switch"
            aria-checked={realRhythm}
            className={`shrink-0 inline-flex items-center px-4 py-1.5 rounded-full border text-sm transition ${
              realRhythm
                ? 'bg-accent text-bg border-accent'
                : 'bg-bg-elev text-text-dim border-border hover:border-border-strong'
            }`}
          >
            {realRhythm ? t('settings.real_rhythm_on') : t('settings.real_rhythm_off')}
          </button>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          {t('settings.leaderboard')}
        </h2>
        <Card>
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {t('settings.leaderboard_title')}
            </span>
            <span className="text-xs text-text-dim leading-relaxed max-w-md">
              {t('settings.leaderboard_body')}
            </span>
            <span className="text-xs text-text-dim font-mono mt-1">
              🔥 5d &nbsp;·&nbsp; 💎 30d &nbsp;·&nbsp; 👑 100d
            </span>
          </div>
          <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-text-dim">
            {t('common.coming_soon')}
          </span>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          {t('settings.backup')}
        </h2>
        <Card>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{t('settings.backup_title')}</span>
            <span className="text-xs text-text-dim">{t('settings.backup_subtitle')}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onExport}
              disabled={busy === 'export' || (calibration === null && sessions.length === 0)}
              className="btn-ghost"
            >
              {busy === 'export' ? t('settings.exporting') : t('settings.export')}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy === 'import'}
              className="btn-ghost"
            >
              {busy === 'import' ? t('settings.importing') : t('settings.import')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImport(file);
              }}
            />
          </div>
        </Card>
        {toast && (
          <p className="text-xs text-text-dim font-mono text-center">{toast}</p>
        )}
      </section>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="card flex items-center justify-between gap-4 px-4 py-3">
      {children}
    </div>
  );
}

function totalSamples(c: SavedCalibration): number {
  return c.sampleCount.dong + c.sampleCount.ch + c.sampleCount.ding;
}

/**
 * Mic input picker. Lists every audioinput device the browser knows
 * about and writes the chosen deviceId to localStorage; AudioInput
 * reads that on its next start(). Device labels come up empty until
 * the user has granted mic permission once — the parent's hint copy
 * acknowledges that, but we also generate a fallback "Microphone N"
 * label so unknowns are still distinguishable.
 */
function MicPicker({ t }: { t: TFn }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selected, setSelected] = useState<string>(() => getMicDeviceId() ?? '');
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      setAvailable(false);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setDevices(all.filter((d) => d.kind === 'audioinput'));
      } catch {
        // Some browsers throw if the page is in an exotic context.
        // Treat as 'no devices known' rather than crashing.
        if (!cancelled) setDevices([]);
      }
    };
    void refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener('devicechange', refresh);
    };
  }, []);

  if (!available) {
    return (
      <span className="shrink-0 text-xs text-text-dim font-mono">
        {t('settings.mic_device_unavailable')}
      </span>
    );
  }

  const onChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    setSelected(v);
    setMicDeviceId(v || null);
  };

  return (
    <select
      value={selected}
      onChange={onChange}
      className="shrink-0 max-w-[14rem] truncate rounded-md bg-bg-elev border border-border text-sm px-3 py-1.5 text-text focus:outline-none focus:border-accent"
    >
      <option value="">{t('settings.mic_device_default')}</option>
      {devices.map((d, i) => (
        <option key={d.deviceId} value={d.deviceId}>
          {d.label || t('settings.mic_device_unknown', { n: i + 1 })}
        </option>
      ))}
    </select>
  );
}
