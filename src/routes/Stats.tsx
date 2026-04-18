import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import type { SessionRecord, ToqueStats } from '@/engine/session';
import {
  computeToqueStats,
  dayKey,
  streakDays,
  totalDaysPracticed,
} from '@/engine/session';
import { SOUND_COLORS } from '@/engine/rhythms';
import type { Sound } from '@/engine/rhythms';
import { listAllSessions } from '@/storage/sessions-store';

/**
 * Full practice history: lifetime counters, per-toque aggregates, and
 * the complete session log. Optional toque filter narrows the log.
 */

type ToqueFilter = 'all' | ToqueStats['toqueName'];

export function Stats() {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [toqueFilter, setToqueFilter] = useState<ToqueFilter>('all');

  useEffect(() => {
    let cancelled = false;
    void listAllSessions().then((all) => {
      if (!cancelled) setSessions(all);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toqueStats = useMemo(
    () => (sessions ? computeToqueStats(sessions) : []),
    [sessions],
  );

  const filtered = useMemo(() => {
    if (!sessions) return [];
    const narrowed =
      toqueFilter === 'all' ? sessions : sessions.filter((s) => s.toqueName === toqueFilter);
    return [...narrowed].sort((a, b) => b.endedAt - a.endedAt);
  }, [sessions, toqueFilter]);

  if (!sessions) {
    return (
      <main className="min-h-full px-6 py-8 max-w-2xl mx-auto">
        <p className="text-text-dim text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-full px-6 py-8 max-w-2xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
          <p className="text-text-dim text-sm">
            Your practice history on this device.
          </p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          ← Back
        </Link>
      </header>

      {sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <LifetimeCard sessions={sessions} />
          {toqueStats.length > 0 && <ToqueCards stats={toqueStats} />}
          <SessionLog
            sessions={filtered}
            totalCount={sessions.length}
            toqueStats={toqueStats}
            toqueFilter={toqueFilter}
            setToqueFilter={setToqueFilter}
          />
        </>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center gap-3 py-10 text-center">
      <span className="text-sm text-text-dim">
        No practice history yet.
      </span>
      <Link href="/" className="btn-ghost">
        Start a session
      </Link>
    </div>
  );
}

function LifetimeCard({ sessions }: { sessions: SessionRecord[] }) {
  const totalMinutes = Math.round(
    sessions.reduce((s, r) => s + r.elapsedSec, 0) / 60,
  );
  const totalBeats = sessions.reduce((s, r) => s + r.totalScoredBeats, 0);
  const streak = streakDays(sessions);
  const uniqueDays = totalDaysPracticed(sessions);
  const avg =
    sessions.reduce((s, r) => s + r.accuracy, 0) / Math.max(1, sessions.length);

  return (
    <section className="card grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
      <Stat label="Sessions" value={String(sessions.length)} />
      <Stat label="Total time" value={`${totalMinutes}m`} />
      <Stat label="Beats scored" value={String(totalBeats)} />
      <Stat label="Avg accuracy" value={`${Math.round(avg * 100)}%`} />
      <Stat label="Days practiced" value={String(uniqueDays)} />
      <Stat
        label="Current streak"
        value={streak > 0 ? `${streak}d` : '—'}
        emphasis={streak > 0}
      />
      <Stat label="First session" value={firstSessionLabel(sessions)} />
      <Stat label="Last session" value={lastSessionLabel(sessions)} />
    </section>
  );
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span
        className={`font-mono text-xl font-semibold ${emphasis ? 'text-accent' : 'text-text'}`}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-[0.18em] text-text-dim mt-0.5">
        {label}
      </span>
    </div>
  );
}

function ToqueCards({ stats }: { stats: ToqueStats[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
        By toque
      </h2>
      <ul className="flex flex-col gap-2">
        {stats.map((s) => (
          <li
            key={s.toqueName}
            className="card flex items-center gap-4 px-4 py-3"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{s.toqueName}</div>
              <div className="text-xs text-text-dim font-mono">
                {s.sessionCount} session{s.sessionCount === 1 ? '' : 's'} ·{' '}
                {s.totalMinutes}m · {s.totalBeats} beats
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-mono text-base text-text">
                {Math.round(s.bestAccuracy * 100)}%
              </span>
              <span className="text-[10px] text-text-dim font-mono">
                best · avg {Math.round(s.averageAccuracy * 100)}%
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SessionLog({
  sessions,
  totalCount,
  toqueStats,
  toqueFilter,
  setToqueFilter,
}: {
  sessions: SessionRecord[];
  totalCount: number;
  toqueStats: ToqueStats[];
  toqueFilter: ToqueFilter;
  setToqueFilter: (f: ToqueFilter) => void;
}) {
  const haveMultipleToques = toqueStats.length > 1;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          Session log
        </h2>
        <span className="text-xs text-text-dim">
          {sessions.length === totalCount
            ? `${totalCount} total`
            : `${sessions.length} of ${totalCount}`}
        </span>
      </div>

      {haveMultipleToques && (
        <div className="flex flex-wrap gap-2">
          <Pill
            active={toqueFilter === 'all'}
            onClick={() => setToqueFilter('all')}
          >
            All
          </Pill>
          {toqueStats.map((t) => (
            <Pill
              key={t.toqueName}
              active={toqueFilter === t.toqueName}
              onClick={() => setToqueFilter(t.toqueName)}
            >
              {t.toqueName}
            </Pill>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-1.5 font-mono text-xs">
        {sessions.map((s, i) => {
          const prev = sessions[i - 1];
          const showDateHeader = !prev || dayKey(prev.endedAt) !== dayKey(s.endedAt);
          return (
            <LogRow key={s.id ?? i} session={s} dateHeader={showDateHeader} />
          );
        })}
      </ul>
    </section>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs border transition ${
        active
          ? 'bg-accent text-bg border-accent'
          : 'bg-bg-elev text-text border-border hover:border-border-strong'
      }`}
    >
      {children}
    </button>
  );
}

function LogRow({ session, dateHeader }: { session: SessionRecord; dateHeader: boolean }) {
  const mins = Math.max(1, Math.round(session.elapsedSec / 60));
  return (
    <>
      {dateHeader && (
        <li className="pt-2 text-[10px] uppercase tracking-wider text-text-dim font-mono select-none">
          {new Date(session.endedAt).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </li>
      )}
      <li className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-elev border border-border">
        <span className="text-text-dim w-14 shrink-0">
          {new Date(session.endedAt).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        <span className="flex-1 truncate text-text">{session.toqueName}</span>
        <span className="text-text-dim">{session.bpm} bpm</span>
        <span className="text-text-dim w-10 text-right">{mins}m</span>
        <span className="text-text-dim w-14 text-right">
          {session.totalScoredBeats} hits
        </span>
        <AccuracyCell accuracy={session.accuracy} />
        <SoundDots perSound={session.perSound} />
      </li>
    </>
  );
}

function AccuracyCell({ accuracy }: { accuracy: number }) {
  const pct = Math.round(accuracy * 100);
  const color =
    pct >= 80 ? 'text-[#64f08c]' : pct >= 60 ? 'text-[#a7e87a]' : pct >= 40 ? 'text-[#f2b640]' : 'text-[#e2506c]';
  return <span className={`w-11 text-right ${color}`}>{pct}%</span>;
}

function SoundDots({
  perSound,
}: {
  perSound: SessionRecord['perSound'];
}) {
  const keys: Sound[] = ['dong', 'ch', 'ding'];
  return (
    <span className="hidden sm:inline-flex items-center gap-1">
      {keys.map((k) => {
        const v = perSound[k as 'dong' | 'ch' | 'ding'];
        const filled = v != null;
        return (
          <span
            key={k}
            title={`${k.toUpperCase()}: ${v == null ? '—' : `${Math.round(v * 100)}%`}`}
            className="w-2 h-2 rounded-full"
            style={{
              background: filled ? SOUND_COLORS[k as 'dong' | 'ch' | 'ding'] : '#2a3048',
              opacity: filled ? Math.max(0.3, v ?? 0.3) : 1,
            }}
          />
        );
      })}
    </span>
  );
}

function firstSessionLabel(sessions: SessionRecord[]): string {
  if (sessions.length === 0) return '—';
  const first = sessions.reduce((a, b) => (a.startedAt < b.startedAt ? a : b));
  return new Date(first.startedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function lastSessionLabel(sessions: SessionRecord[]): string {
  if (sessions.length === 0) return '—';
  const last = sessions.reduce((a, b) => (a.endedAt > b.endedAt ? a : b));
  return new Date(last.endedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
