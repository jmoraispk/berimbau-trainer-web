import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  SOUND_LABELS,
  TOQUES,
  toquesByDifficulty,
  type Sound,
  type ToqueName,
} from '@/engine/rhythms';
import { SoundSymbol } from '@/components/SoundSymbol';
import { PatternPreview } from '@/components/PatternPreview';
import { preloadActiveProfiles } from '@/audio/active-profiles';
import type { SavedCalibration } from '@/engine/calibration';
import { listRecentSessions } from '@/storage/sessions-store';
import type { SessionRecord } from '@/engine/session';
import { streakDays } from '@/engine/session';
import {
  LanguageToggle,
  difficultyLabelKey,
  formatRelativeTime,
  toqueDescKey,
  useI18n,
  type TFn,
} from '@/i18n';

const SOUNDS: Sound[] = ['ch', 'dong', 'ding'];

export function Home() {
  const [, navigate] = useLocation();
  const { t } = useI18n();
  const [toqueName, setToqueName] = useState<ToqueName>('Angola');
  const toque = TOQUES[toqueName];
  const [calibration, setCalibration] = useState<SavedCalibration | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    void preloadActiveProfiles().then((saved) => {
      if (!cancelled) setCalibration(saved);
    });
    void listRecentSessions(5).then((list) => {
      if (!cancelled) setSessions(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onPickToque = (name: ToqueName) => {
    setToqueName(name);
  };

  const groups = useMemo(() => toquesByDifficulty(), []);
  const totalToques = useMemo(
    () => Object.values(TOQUES).filter((t) => !t.comingSoon).length,
    [],
  );

  const start = () => {
    if (toque.comingSoon) return;
    const params = new URLSearchParams({
      toque: toqueName,
      bpm: String(toque.defaultBpm),
    });
    navigate(`/practice?${params.toString()}`);
  };

  return (
    <main className="relative min-h-full flex flex-col items-center px-6 pt-12 pb-14 gap-8 max-w-3xl mx-auto">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LanguageToggle />
        <Link
          href="/settings"
          aria-label={t('home.settings_aria')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-elev/80 border border-border text-text-dim hover:text-text hover:border-border-strong transition"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-[18px] h-[18px]"
            aria-hidden
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Link>
      </div>

      <header className="flex flex-col items-center gap-3">
        <img src="/icon.svg" alt="" className="w-20 h-20 drop-shadow-[0_6px_30px_rgba(255,138,61,0.25)]" />
        {/* Solid text-token color instead of bg-clip-text + gradient.
            The clip-to-text trick rendered as a white block in iOS PWA
            standalone mode because Tailwind v4 doesn't emit the
            -webkit-background-clip prefix and the gradient painted the
            full bounding box. The visible difference vs the gradient
            is negligible. */}
        <h1 className="text-4xl font-semibold tracking-tight text-text">
          Berimbau Pro
        </h1>
        <p className="text-text-dim text-center text-sm max-w-sm">{t('home.tagline')}</p>
      </header>

      <section className="w-full grid grid-cols-3 gap-2">
        {SOUNDS.map((s) => (
          <div key={s} className="card flex flex-col items-center gap-1.5 px-3 py-3">
            <SoundSymbol sound={s} size={36} />
            <div className="text-[11px] font-semibold tracking-[0.15em]">
              {SOUND_LABELS[s]}
            </div>
          </div>
        ))}
      </section>

      <section className="w-full flex flex-col md:flex-row gap-6 items-start">
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <SectionLabel>{t('home.toque')}</SectionLabel>
          {groups.map((group) => (
            <div key={group.difficulty} className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono text-text-dim/70 tracking-[0.18em] uppercase">
                {t(difficultyLabelKey(group.difficulty))}
              </span>
              <div className="flex flex-wrap gap-2">
                {group.toques.map((tq) => {
                  const active = tq.name === toqueName;
                  const disabled = !!tq.comingSoon;
                  return (
                    <button
                      key={tq.name}
                      type="button"
                      onClick={() => !disabled && onPickToque(tq.name)}
                      disabled={disabled}
                      title={disabled ? t('common.coming_soon') : undefined}
                      className={`px-3.5 py-1.5 rounded-full text-sm border transition ${
                        active && !disabled
                          ? 'bg-accent text-bg border-accent shadow-[0_4px_16px_-6px_rgba(255,138,61,0.5)]'
                          : disabled
                          ? 'bg-bg-elev/40 text-text-dim/60 border-border/60 cursor-not-allowed italic'
                          : 'bg-bg-elev text-text border-border hover:border-border-strong'
                      }`}
                    >
                      {tq.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-72 md:shrink-0">
          {/* Every slot uses a *fixed* height (h-[X], not min-h) so the
              column is exactly the same total regardless of which toque
              is selected. min-h was letting pixel-level overruns push
              the action buttons by a few pixels per toggle. */}
          <div className="flex items-baseline justify-between gap-3 h-[2.8rem] overflow-hidden">
            <SectionLabel>{toque.name}</SectionLabel>
            <span className="text-[10px] font-mono text-text-dim shrink-0">
              {t('home.default_bpm', { bpm: toque.defaultBpm })}
            </span>
          </div>
          {/* 3 lines fits every current description (the longest is
              ~2.4 lines at this width). Was 4; tightening it pulls the
              rhythm widget up by ~1.2 rem. */}
          <p
            className="text-xs text-text-dim leading-relaxed line-clamp-3 h-[3.6rem]"
            title={t(toqueDescKey(toque.name))}
          >
            {t(toqueDescKey(toque.name))}
          </p>
          {/* 10.5 rem (168 px) holds São Bento Grande Regional's 4×2
              grid (~154 px) with a couple of pixels to spare. Shorter
              patterns sit at the top of the slot. */}
          <div className="h-[10.5rem]">
            <PatternPreview toque={toque} cellSize="compact" />
          </div>
        </div>
      </section>

      <div className="w-full flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={start}
          disabled={toque.comingSoon}
          className="btn-primary flex-1 py-4 text-base"
        >
          {t('home.start_practicing')}
        </button>
        <Link
          href="/calibrate"
          className="btn-secondary flex-1 py-4 text-base flex flex-col items-center gap-0"
        >
          <span>{calibration ? t('home.recalibrate') : t('home.calibrate')}</span>
          {calibration && (
            <span className="text-[10px] text-text-dim font-mono">
              {t('home.calibration_subtitle', {
                count: totalSamples(calibration),
                time: formatRelativeTime(t, calibration.savedAt),
              })}
            </span>
          )}
        </Link>
      </div>

      <RecentSessionsCard sessions={sessions} t={t} />

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
        <Link
          href="/classes"
          className="text-text-dim underline underline-offset-4 hover:text-text"
        >
          {t('home.browse_classes')}
        </Link>
        <Link
          href="/songs"
          className="text-text-dim underline underline-offset-4 hover:text-text"
        >
          {t('home.browse_songs', { n: 185 })}
        </Link>
        <Link
          href="/roadmap"
          className="text-text-dim underline underline-offset-4 hover:text-text"
        >
          {t('home.browse_roadmap')}
        </Link>
        <Link
          href="/changelog"
          className="text-text-dim underline underline-offset-4 hover:text-text"
        >
          {t('home.browse_changelog')}
        </Link>
      </div>

      <footer className="text-text-dim text-[10px] font-mono tracking-wider mt-auto">
        {t('home.footer', { n: totalToques })}
      </footer>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
      {children}
    </h2>
  );
}

function totalSamples(c: SavedCalibration): number {
  return c.sampleCount.dong + c.sampleCount.ch + c.sampleCount.ding;
}

function RecentSessionsCard({ sessions, t }: { sessions: SessionRecord[]; t: TFn }) {
  if (sessions.length === 0) return null;
  const streak = streakDays(sessions);
  const averageAccuracy =
    sessions.reduce((s, r) => s + r.accuracy, 0) / sessions.length;

  return (
    <section className="card w-full flex flex-col gap-3 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel>{t('home.recent_sessions')}</SectionLabel>
        <div className="flex items-center gap-3 text-xs text-text-dim">
          {streak > 0 && (
            <span className="font-mono">{t('home.streak', { n: streak })}</span>
          )}
          <span>
            {t('home.avg')}{' '}
            <span className="font-mono text-text">
              {Math.round(averageAccuracy * 100)}%
            </span>
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5">
        {sessions.map((s, i) => (
          <SessionRow key={s.id ?? i} session={s} t={t} />
        ))}
      </ul>
      <Link
        href="/stats"
        className="text-[11px] text-text-dim hover:text-text transition self-end"
      >
        {t('home.view_all_stats')}
      </Link>
    </section>
  );
}

function SessionRow({ session, t }: { session: SessionRecord; t: TFn }) {
  const mins = Math.max(1, Math.round(session.elapsedSec / 60));
  return (
    <li className="flex items-center gap-3 text-xs">
      <span className="text-text-dim w-20 shrink-0 font-mono">
        {formatRelativeTime(t, session.endedAt)}
      </span>
      <span className="flex-1 truncate text-text">{session.toqueName}</span>
      <span className="font-mono text-text-dim">{session.bpm} bpm</span>
      <span className="font-mono text-text-dim w-10 text-right">{mins}m</span>
      <AccuracyPill accuracy={session.accuracy} />
    </li>
  );
}

function AccuracyPill({ accuracy }: { accuracy: number }) {
  const pct = Math.round(accuracy * 100);
  const color =
    pct >= 80 ? 'text-[#64f08c]' : pct >= 60 ? 'text-[#a7e87a]' : pct >= 40 ? 'text-[#f2b640]' : 'text-[#e2506c]';
  return <span className={`font-mono w-11 text-right ${color}`}>{pct}%</span>;
}
