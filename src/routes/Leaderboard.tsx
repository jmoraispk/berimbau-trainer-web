import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useI18n, type TFn } from '@/i18n';
import { isCloudConfigured } from '@/cloud/supabase';
import {
  fetchLeaderboard,
  type LeaderboardMetric,
  type LeaderboardRow,
  type LeaderboardWindow,
} from '@/cloud/leaderboard';
import { streakEmoji } from '@/engine/session';

/**
 * Leaderboard — public ranking. Pulls from the `leaderboard_view` and
 * reduces client-side to one of five metrics across one of four time
 * windows. Empty / cloud-disabled states fall back to placeholder copy
 * so the route stays usable.
 */

const METRICS: LeaderboardMetric[] = [
  'songs_today',
  'practice_minutes',
  'total_beats',
  'longest_streak',
  'toques_practiced',
];
const WINDOWS: LeaderboardWindow[] = ['today', 'week', 'month', 'all'];

const METRIC_KEY: Record<LeaderboardMetric, string> = {
  songs_today: 'leaderboard.metric.songs_today',
  practice_minutes: 'leaderboard.metric.practice_minutes',
  total_beats: 'leaderboard.metric.total_beats',
  longest_streak: 'leaderboard.metric.longest_streak',
  toques_practiced: 'leaderboard.metric.toques_practiced',
};

const WINDOW_KEY: Record<LeaderboardWindow, string> = {
  today: 'leaderboard.window.today',
  week: 'leaderboard.window.week',
  month: 'leaderboard.window.month',
  all: 'leaderboard.window.all',
};

function formatValue(metric: LeaderboardMetric, value: number, t: TFn): string {
  switch (metric) {
    case 'songs_today':
      return value.toFixed(1);
    case 'practice_minutes':
      return `${Math.round(value)}m`;
    case 'total_beats':
      return String(Math.round(value));
    case 'longest_streak':
      return t('leaderboard.value_days', { n: Math.round(value) });
    case 'toques_practiced':
      return String(Math.round(value));
  }
}

export function Leaderboard() {
  const { t } = useI18n();
  const [metric, setMetric] = useState<LeaderboardMetric>('songs_today');
  const [window, setWindow] = useState<LeaderboardWindow>('today');
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isCloudConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchLeaderboard(metric, window).then((r) => {
      if (cancelled) return;
      setRows(r);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [metric, window]);

  return (
    <main className="min-h-full px-6 py-8 max-w-2xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t('leaderboard.title')}</h1>
          <p className="text-text-dim text-sm">{t('leaderboard.subtitle')}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>

      {!isCloudConfigured ? (
        <section className="card flex flex-col gap-3 p-5">
          <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
            {t('classes.coming_label')}
          </span>
          <p className="text-sm text-text-dim leading-relaxed">{t('leaderboard.body')}</p>
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {METRICS.map((m) => (
                <FilterPill
                  key={m}
                  active={metric === m}
                  label={t(METRIC_KEY[m] as never)}
                  onClick={() => setMetric(m)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WINDOWS.map((w) => (
                <FilterPill
                  key={w}
                  active={window === w}
                  label={t(WINDOW_KEY[w] as never)}
                  onClick={() => setWindow(w)}
                />
              ))}
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-text-dim">{t('stats.loading')}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-text-dim">{t('leaderboard.empty')}</p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {rows.map((r, i) => (
                <li
                  key={r.userId}
                  className="card flex items-center gap-3 px-4 py-2.5"
                >
                  <span className="font-mono text-sm text-text-dim w-7 shrink-0">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-sm">
                    {r.displayName ?? t('leaderboard.anonymous')}
                  </span>
                  {metric === 'longest_streak' && (
                    <span className="text-base">{streakEmoji(Math.round(r.value))}</span>
                  )}
                  <span className="font-mono text-sm text-text shrink-0">
                    {formatValue(metric, r.value, t)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </main>
  );
}

function FilterPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs border transition ${
        active
          ? 'bg-accent text-bg border-accent'
          : 'bg-bg-elev text-text-dim border-border hover:border-border-strong'
      }`}
    >
      {label}
    </button>
  );
}
