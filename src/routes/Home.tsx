import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  GLOBAL_BPM_RANGE,
  TOQUES,
  SOUND_COLORS,
  SOUND_LABELS,
  type ToqueName,
  type Sound,
} from '@/engine/rhythms';
import { preloadActiveProfiles } from '@/audio/active-profiles';
import type { SavedCalibration } from '@/engine/calibration';
import { listRecentSessions } from '@/storage/sessions-store';
import type { SessionRecord } from '@/engine/session';
import { streakDays } from '@/engine/session';

const SOUNDS: Sound[] = ['dong', 'ch', 'ding'];
const TOQUE_NAMES = Object.keys(TOQUES) as ToqueName[];

export function Home() {
  const [, navigate] = useLocation();
  const [toqueName, setToqueName] = useState<ToqueName>('Angola');
  const toque = TOQUES[toqueName];
  const [bpm, setBpm] = useState(toque.defaultBpm);
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
    setBpm(TOQUES[name].defaultBpm);
  };

  const preview = useMemo(() => toque.pattern, [toque]);

  const start = () => {
    const params = new URLSearchParams({ toque: toqueName, bpm: String(bpm) });
    navigate(`/practice?${params.toString()}`);
  };

  return (
    <main className="relative min-h-full flex flex-col items-center px-6 pt-12 pb-14 gap-8 max-w-2xl mx-auto">
      <Link
        href="/settings"
        aria-label="Settings"
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-bg-elev/80 border border-border text-text-dim hover:text-text hover:border-border-strong transition"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
          aria-hidden
        >
          <circle cx="10" cy="10" r="2.2" />
          <path d="M10 3v2.2M10 14.8V17M3 10h2.2M14.8 10H17M5.2 5.2l1.6 1.6M13.2 13.2l1.6 1.6M5.2 14.8l1.6-1.6M13.2 6.8l1.6-1.6" />
        </svg>
      </Link>

      <header className="flex flex-col items-center gap-3">
        <img src="/icon.svg" alt="" className="w-20 h-20 drop-shadow-[0_6px_30px_rgba(255,138,61,0.25)]" />
        <h1
          className="text-4xl font-semibold tracking-tight bg-clip-text text-transparent"
          style={{
            backgroundImage: 'linear-gradient(180deg, #fff 0%, #cfd5ea 100%)',
          }}
        >
          Berimbau Trainer
        </h1>
        <p className="text-text-dim text-center text-sm max-w-sm">
          Pick a toque, set the tempo, play along into your mic.
        </p>
      </header>

      <section className="w-full grid grid-cols-3 gap-2">
        {SOUNDS.map((s) => (
          <div key={s} className="card flex flex-col items-center gap-1 px-3 py-3">
            <div
              className="w-8 h-8 rounded-full shadow-inner"
              style={{
                background: SOUND_COLORS[s],
                boxShadow: `0 0 24px -4px ${SOUND_COLORS[s]}55`,
              }}
            />
            <div className="text-[11px] font-semibold tracking-[0.15em]">
              {SOUND_LABELS[s]}
            </div>
          </div>
        ))}
      </section>

      <section className="w-full flex flex-col gap-3">
        <SectionLabel>Toque</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {TOQUE_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onPickToque(name)}
              className={`px-3.5 py-1.5 rounded-full text-sm border transition ${
                name === toqueName
                  ? 'bg-accent text-bg border-accent shadow-[0_4px_16px_-6px_rgba(255,138,61,0.5)]'
                  : 'bg-bg-elev text-text border-border hover:border-border-strong'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-dim">{toque.description}</p>
      </section>

      <section className="w-full flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Tempo</SectionLabel>
          <span className="font-mono text-sm text-text">
            <span className="text-base">{bpm}</span> <span className="text-text-dim text-xs">bpm</span>
          </span>
        </div>
        <input
          type="range"
          min={GLOBAL_BPM_RANGE[0]}
          max={GLOBAL_BPM_RANGE[1]}
          step={1}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          className="w-full accent-accent"
        />
        <div className="flex justify-between text-[10px] text-text-dim font-mono">
          <span>{GLOBAL_BPM_RANGE[0]}</span>
          <button
            type="button"
            onClick={() => setBpm(toque.defaultBpm)}
            className="hover:text-text transition"
          >
            default {toque.defaultBpm}
          </button>
          <span>{GLOBAL_BPM_RANGE[1]}</span>
        </div>
      </section>

      <section className="w-full flex flex-col gap-2">
        <SectionLabel>Pattern</SectionLabel>
        <div className="card p-2 grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1">
          {preview.map((e) => (
            <div
              key={e.step}
              className="aspect-square rounded-[4px] flex items-center justify-center text-[10px] font-bold relative"
              style={{
                background: e.sound === 'rest' ? '#2a3048' : SOUND_COLORS[e.sound],
                color: e.sound === 'rest' ? '#4a5370' : '#0b0f1a',
                opacity: e.sound === 'rest' ? 0.5 : e.accent === 2 ? 1 : 0.75,
              }}
              title={`step ${e.step} · ${SOUND_LABELS[e.sound]}${e.accent === 2 ? ' (accent)' : ''}`}
            >
              {e.sound === 'rest' ? '' : SOUND_LABELS[e.sound][0]}
              {e.step % 4 === 0 && e.sound === 'rest' && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-border-strong" />
              )}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-text-dim">
          16 steps over 2 bars · accented beats are fully saturated
        </p>
      </section>

      <CalibrationCard calibration={calibration} />

      <RecentSessionsCard sessions={sessions} />

      <div className="flex flex-col items-center gap-3 w-full pt-2">
        <button type="button" onClick={start} className="btn-primary px-10 py-3">
          Start practicing
        </button>
        <Link
          href="/songs"
          className="text-sm text-text-dim underline underline-offset-4 hover:text-text"
        >
          Browse 185 songs
        </Link>
      </div>

      <footer className="text-text-dim text-[10px] font-mono tracking-wider mt-auto">
        {TOQUE_NAMES.length} toques · v2 · web
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

function CalibrationCard({ calibration }: { calibration: SavedCalibration | null }) {
  return (
    <section className="card w-full flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium">
          {calibration ? 'Using your calibration' : 'Using default profile'}
        </span>
        <span className="text-xs text-text-dim truncate">
          {calibration
            ? `Saved ${formatRelative(calibration.savedAt)} · ${totalSamples(calibration)} samples`
            : 'Calibrate for best accuracy on your berimbau.'}
        </span>
      </div>
      <Link href="/calibrate" className="btn-ghost shrink-0">
        {calibration ? 'Recalibrate' : 'Calibrate'}
      </Link>
    </section>
  );
}

function totalSamples(c: SavedCalibration): number {
  return c.sampleCount.dong + c.sampleCount.ch + c.sampleCount.ding;
}

function RecentSessionsCard({ sessions }: { sessions: SessionRecord[] }) {
  if (sessions.length === 0) return null;
  const streak = streakDays(sessions);
  const averageAccuracy =
    sessions.reduce((s, r) => s + r.accuracy, 0) / sessions.length;

  return (
    <section className="card w-full flex flex-col gap-3 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel>Recent sessions</SectionLabel>
        <div className="flex items-center gap-3 text-xs text-text-dim">
          {streak > 0 && (
            <span>
              <span className="text-accent font-mono">{streak}</span>-day streak
            </span>
          )}
          <span>
            avg{' '}
            <span className="font-mono text-text">
              {Math.round(averageAccuracy * 100)}%
            </span>
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5">
        {sessions.map((s, i) => (
          <SessionRow key={s.id ?? i} session={s} />
        ))}
      </ul>
    </section>
  );
}

function SessionRow({ session }: { session: SessionRecord }) {
  const mins = Math.max(1, Math.round(session.elapsedSec / 60));
  return (
    <li className="flex items-center gap-3 text-xs">
      <span className="text-text-dim w-20 shrink-0 font-mono">
        {formatRelative(session.endedAt)}
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

function formatRelative(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}
