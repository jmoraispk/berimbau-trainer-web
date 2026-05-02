import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import type { Heatmap, SessionRecord, ToqueStats } from '@/engine/session';
import {
  buildHeatmap,
  computeToqueStats,
  dayKey,
  streakDays,
  totalDaysPracticed,
} from '@/engine/session';
import { SOUND_COLORS } from '@/engine/rhythms';
import type { Sound } from '@/engine/rhythms';
import { listAllSessions } from '@/storage/sessions-store';
import { useI18n, type TFn } from '@/i18n';

/**
 * Full practice history: lifetime counters, per-toque aggregates, and
 * the complete session log. Optional toque filter narrows the log.
 */

type ToqueFilter = 'all' | ToqueStats['toqueName'];

export function Stats() {
  const { t } = useI18n();
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
  const heatmap = useMemo(
    () => (sessions ? buildHeatmap(sessions) : null),
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
        <p className="text-text-dim text-sm">{t('stats.loading')}</p>
      </main>
    );
  }

  return (
    <main className="min-h-full px-6 py-8 max-w-2xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t('stats.title')}</h1>
          <p className="text-text-dim text-sm">{t('stats.subtitle')}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>

      {sessions.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <>
          <LifetimeCard sessions={sessions} t={t} />
          {heatmap && <HeatmapCard heatmap={heatmap} t={t} />}
          {toqueStats.length > 0 && <ToqueCards stats={toqueStats} t={t} />}
          <SessionLog
            sessions={filtered}
            totalCount={sessions.length}
            toqueStats={toqueStats}
            toqueFilter={toqueFilter}
            setToqueFilter={setToqueFilter}
            t={t}
          />
        </>
      )}
    </main>
  );
}

function EmptyState({ t }: { t: TFn }) {
  return (
    <div className="card flex flex-col items-center gap-3 py-10 text-center">
      <span className="text-sm text-text-dim">{t('stats.empty')}</span>
      <Link href="/" className="btn-ghost">
        {t('stats.start_session')}
      </Link>
    </div>
  );
}

function LifetimeCard({ sessions, t }: { sessions: SessionRecord[]; t: TFn }) {
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
      <Stat label={t('stats.sessions')} value={String(sessions.length)} />
      <Stat label={t('stats.total_time')} value={`${totalMinutes}m`} />
      <Stat label={t('stats.beats_scored')} value={String(totalBeats)} />
      <Stat label={t('stats.avg_accuracy')} value={`${Math.round(avg * 100)}%`} />
      <Stat label={t('stats.days_practiced')} value={String(uniqueDays)} />
      <Stat
        label={t('stats.current_streak')}
        value={streak > 0 ? `${streak}d` : '—'}
        emphasis={streak > 0}
      />
      <Stat label={t('stats.first_session')} value={firstSessionLabel(sessions)} />
      <Stat label={t('stats.last_session')} value={lastSessionLabel(sessions)} />
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

function HeatmapCard({ heatmap, t }: { heatmap: Heatmap; t: TFn }) {
  const todayKey = dayKey(Date.now());
  const flat = heatmap.weeks.flat();
  const days = flat.filter((c) => c.minutes > 0).length;
  const totalMinutes = Math.round(flat.reduce((a, c) => a + c.minutes, 0));
  const legend = [0, 0.25, 0.5, 0.75, 1];

  // Month labels above the grid: one label per first-week-of-month column.
  const monthLabels: Array<{ col: number; label: string }> = [];
  let lastMonth = -1;
  heatmap.weeks.forEach((col, i) => {
    const firstDay = col[0]!;
    const m = new Date(firstDay.timestamp).getMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      monthLabels.push({
        col: i,
        label: new Date(firstDay.timestamp).toLocaleDateString(undefined, {
          month: 'short',
        }),
      });
    }
  });

  const summaryKey = days === 1 ? 'stats.heatmap_summary' : 'stats.heatmap_summary_plural';

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          {t('stats.last_n_weeks', { n: heatmap.weeks.length })}
        </h2>
        <span className="text-xs text-text-dim font-mono">
          {t(summaryKey, { days, minutes: totalMinutes })}
        </span>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <div
          className="inline-grid gap-[3px] text-[9px]"
          style={{
            gridTemplateColumns: `repeat(${heatmap.weeks.length}, 11px)`,
            gridTemplateRows: `12px repeat(7, 11px)`,
          }}
        >
          {/* Month header row */}
          {heatmap.weeks.map((_, col) => {
            const label = monthLabels.find((m) => m.col === col)?.label;
            return (
              <div
                key={`h-${col}`}
                className="text-text-dim font-mono leading-none"
                style={{ gridColumn: col + 1, gridRow: 1 }}
              >
                {label ?? ''}
              </div>
            );
          })}
          {/* Cells */}
          {heatmap.weeks.map((col, cIdx) =>
            col.map((cell, dIdx) => {
              const isToday = cell.day === todayKey;
              const isFuture = cell.timestamp > Date.now();
              return (
                <div
                  key={`${cIdx}-${dIdx}`}
                  className={`rounded-[2px] ${isToday ? 'ring-1 ring-accent' : ''}`}
                  style={{
                    gridColumn: cIdx + 1,
                    gridRow: dIdx + 2,
                    background: isFuture ? 'transparent' : intensityColor(cell.intensity),
                    opacity: isFuture ? 0.15 : 1,
                  }}
                  title={`${new Date(cell.timestamp).toLocaleDateString()} · ${
                    cell.minutes > 0 ? `${cell.minutes.toFixed(0)} min` : '—'
                  }`}
                />
              );
            }),
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-text-dim self-end">
        <span>{t('stats.less')}</span>
        <div className="flex gap-[3px]">
          {legend.map((v) => (
            <div
              key={v}
              className="w-[11px] h-[11px] rounded-[2px]"
              style={{ background: intensityColor(v) }}
            />
          ))}
        </div>
        <span>{t('stats.more')}</span>
      </div>
    </section>
  );
}

function intensityColor(intensity: number): string {
  if (intensity <= 0) return '#1a2135';
  // 4-stop ramp from a dim-cool base to a warm accent — matches the app's
  // navy→orange palette without introducing a new hue.
  if (intensity < 0.25) return '#2a3556';
  if (intensity < 0.5) return '#634d5b';
  if (intensity < 0.8) return '#c06d3e';
  return '#ff8a3d';
}

function ToqueCards({ stats, t }: { stats: ToqueStats[]; t: TFn }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
        {t('stats.by_toque')}
      </h2>
      <ul className="flex flex-col gap-2">
        {stats.map((s) => {
          const countKey =
            s.sessionCount === 1 ? 'stats.session_count_singular' : 'stats.session_count';
          return (
            <li
              key={s.toqueName}
              className="card flex items-center gap-4 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{s.toqueName}</div>
                <div className="text-xs text-text-dim font-mono">
                  {t(countKey, {
                    n: s.sessionCount,
                    minutes: s.totalMinutes,
                    beats: s.totalBeats,
                  })}
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-mono text-base text-text">
                  {Math.round(s.bestAccuracy * 100)}%
                </span>
                <span className="text-[10px] text-text-dim font-mono">
                  {t('stats.best_avg', { pct: Math.round(s.averageAccuracy * 100) })}
                </span>
              </div>
            </li>
          );
        })}
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
  t,
}: {
  sessions: SessionRecord[];
  totalCount: number;
  toqueStats: ToqueStats[];
  toqueFilter: ToqueFilter;
  setToqueFilter: (f: ToqueFilter) => void;
  t: TFn;
}) {
  const haveMultipleToques = toqueStats.length > 1;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          {t('stats.session_log')}
        </h2>
        <span className="text-xs text-text-dim">
          {sessions.length === totalCount
            ? t('stats.total', { n: totalCount })
            : t('stats.shown_of_total', { shown: sessions.length, total: totalCount })}
        </span>
      </div>

      {haveMultipleToques && (
        <div className="flex flex-wrap gap-2">
          <Pill
            active={toqueFilter === 'all'}
            onClick={() => setToqueFilter('all')}
          >
            {t('stats.filter_all')}
          </Pill>
          {toqueStats.map((ts) => (
            <Pill
              key={ts.toqueName}
              active={toqueFilter === ts.toqueName}
              onClick={() => setToqueFilter(ts.toqueName)}
            >
              {ts.toqueName}
            </Pill>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-1.5 font-mono text-xs">
        {sessions.map((s, i) => {
          const prev = sessions[i - 1];
          const showDateHeader = !prev || dayKey(prev.endedAt) !== dayKey(s.endedAt);
          return (
            <LogRow key={s.id ?? i} session={s} dateHeader={showDateHeader} t={t} />
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

function LogRow({
  session,
  dateHeader,
  t,
}: {
  session: SessionRecord;
  dateHeader: boolean;
  t: TFn;
}) {
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
          {t('stats.hits', { n: session.totalScoredBeats })}
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
