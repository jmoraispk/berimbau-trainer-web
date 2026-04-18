import { useEffect, useState } from 'react';
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

/**
 * Local-data management. Everything in this app lives in the browser
 * (calibration profiles + session history via IndexedDB), so the user
 * needs a way to inspect and wipe both.
 */

export function Settings() {
  const [calibration, setCalibration] = useState<SavedCalibration | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [busy, setBusy] = useState<'calibration' | 'sessions' | null>(null);

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
    if (!confirm('Clear your saved calibration? The classifier will fall back to the default profile.')) return;
    setBusy('calibration');
    const ok = await clearProfile();
    if (ok) {
      clearActiveProfiles();
      setCalibration(null);
    }
    setBusy(null);
  };

  const onClearSessions = async () => {
    if (!confirm(`Delete all ${sessions.length} saved sessions? This cannot be undone.`)) return;
    setBusy('sessions');
    const ok = await clearSessions();
    if (ok) setSessions([]);
    setBusy(null);
  };

  const totalMinutes = Math.round(
    sessions.reduce((sum, s) => sum + s.elapsedSec, 0) / 60,
  );
  const totalBeats = sessions.reduce((sum, s) => sum + s.totalScoredBeats, 0);

  return (
    <main className="min-h-full px-6 py-8 max-w-2xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-text-dim text-sm">
            Your calibration and practice history live only in this browser.
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 px-3 py-1.5 rounded-full bg-bg-elev border border-border text-sm text-text-dim"
        >
          ← Back
        </Link>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-text-dim tracking-wider uppercase">
          Calibration profile
        </h2>
        <Card>
          {calibration ? (
            <>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {totalSamples(calibration)} samples · saved{' '}
                  {new Date(calibration.savedAt).toLocaleString()}
                </span>
                <span className="text-xs text-text-dim">
                  DONG {calibration.sampleCount.dong} · TCH{' '}
                  {calibration.sampleCount.ch} · DING {calibration.sampleCount.ding}
                </span>
              </div>
              <button
                type="button"
                onClick={onClearCalibration}
                disabled={busy === 'calibration'}
                className="shrink-0 px-3 py-1.5 rounded-full border border-border text-sm text-text-dim hover:border-red-400 hover:text-red-400 disabled:opacity-50"
              >
                Clear
              </button>
            </>
          ) : (
            <>
              <span className="text-sm text-text-dim">
                No calibration saved — using default profile.
              </span>
              <Link
                href="/calibrate"
                className="shrink-0 px-3 py-1.5 rounded-full border border-border text-sm hover:border-text-dim"
              >
                Calibrate
              </Link>
            </>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-text-dim tracking-wider uppercase">
          Practice history
        </h2>
        <Card>
          {sessions.length > 0 ? (
            <>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {sessions.length} sessions · {totalMinutes} min · {totalBeats} beats
                </span>
                <span className="text-xs text-text-dim">
                  First ever:{' '}
                  {sessions[sessions.length - 1]
                    ? new Date(sessions[sessions.length - 1]!.startedAt).toLocaleDateString()
                    : '—'}
                </span>
              </div>
              <button
                type="button"
                onClick={onClearSessions}
                disabled={busy === 'sessions'}
                className="shrink-0 px-3 py-1.5 rounded-full border border-border text-sm text-text-dim hover:border-red-400 hover:text-red-400 disabled:opacity-50"
              >
                Clear all
              </button>
            </>
          ) : (
            <span className="text-sm text-text-dim">
              No sessions recorded yet. Hit "End session" after practicing to save.
            </span>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-text-dim tracking-wider uppercase">
          About
        </h2>
        <Card>
          <div className="flex flex-col gap-1 text-sm">
            <span>Berimbau Trainer — v2 · web</span>
            <span className="text-xs text-text-dim">
              Ground-up TypeScript rewrite of the{' '}
              <a
                href="https://github.com/jmoraispk/berimbau-trainer"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                Python + Kivy v1
              </a>
              , running entirely in the browser. No data leaves your device.
            </span>
          </div>
        </Card>
      </section>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-bg-elev border border-border">
      {children}
    </div>
  );
}

function totalSamples(c: SavedCalibration): number {
  return c.sampleCount.dong + c.sampleCount.ch + c.sampleCount.ding;
}
