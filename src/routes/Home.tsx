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

  // When the toque changes, snap BPM to its default (and into range).
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
    <main className="min-h-full flex flex-col items-center px-6 py-10 gap-8 max-w-2xl mx-auto">
      <header className="flex flex-col items-center gap-2">
        <img src="/icon.svg" alt="" className="w-16 h-16" />
        <h1 className="text-3xl font-semibold tracking-tight">Berimbau Trainer</h1>
        <p className="text-text-dim text-center text-sm max-w-md">
          Pick a toque, set the tempo, and play along into your mic.
        </p>
      </header>

      <section className="w-full flex gap-3">
        {SOUNDS.map((s) => (
          <div
            key={s}
            className="flex-1 flex flex-col items-center gap-1 px-3 py-3 rounded-xl bg-bg-elev border border-border"
          >
            <div className="w-8 h-8 rounded-full" style={{ background: SOUND_COLORS[s] }} />
            <div className="text-xs font-medium tracking-wider">{SOUND_LABELS[s]}</div>
          </div>
        ))}
      </section>

      <section className="w-full flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-dim tracking-wider uppercase">Toque</h2>
        <div className="flex flex-wrap gap-2">
          {TOQUE_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onPickToque(name)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                name === toqueName
                  ? 'bg-accent text-bg border-accent'
                  : 'bg-bg-elev text-text border-border hover:border-text-dim'
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
          <h2 className="text-sm font-medium text-text-dim tracking-wider uppercase">Tempo</h2>
          <span className="font-mono text-sm">{bpm} bpm</span>
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
        <div className="flex justify-between text-xs text-text-dim">
          <span>{GLOBAL_BPM_RANGE[0]}</span>
          <span>default {toque.defaultBpm}</span>
          <span>{GLOBAL_BPM_RANGE[1]}</span>
        </div>
      </section>

      <section className="w-full flex flex-col gap-2">
        <h2 className="text-sm font-medium text-text-dim tracking-wider uppercase">Pattern</h2>
        <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1">
          {preview.map((e) => (
            <div
              key={e.step}
              className="aspect-square rounded flex items-center justify-center text-[10px] font-bold"
              style={{
                background: SOUND_COLORS[e.sound],
                color: e.sound === 'rest' ? '#4a5370' : '#0b0f1a',
                opacity: e.sound === 'rest' ? 0.5 : e.accent === 2 ? 1 : 0.7,
              }}
            >
              {e.sound === 'rest' ? '' : SOUND_LABELS[e.sound][0]}
            </div>
          ))}
        </div>
      </section>

      <CalibrationCard calibration={calibration} />

      <RecentSessionsCard sessions={sessions} />

      <div className="flex flex-col items-center gap-3 w-full">
        <button
          type="button"
          onClick={start}
          className="px-8 py-3 rounded-full bg-accent text-bg font-semibold tracking-wide shadow-lg hover:brightness-110 active:scale-95 transition"
        >
          Start practicing
        </button>
        <Link
          href="/songs"
          className="text-sm text-text-dim underline underline-offset-4 hover:text-text"
        >
          Browse 185 songs
        </Link>
      </div>

      <footer className="text-text-dim text-xs">
        {TOQUE_NAMES.length} toques · v2 · web
      </footer>
    </main>
  );
}

function CalibrationCard({ calibration }: { calibration: SavedCalibration | null }) {
  return (
    <section className="w-full flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-bg-elev border border-border">
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
      <Link
        href="/calibrate"
        className="shrink-0 px-3 py-1.5 rounded-full border border-border text-sm hover:border-text-dim"
      >
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
    <section className="w-full flex flex-col gap-3 px-4 py-3 rounded-xl bg-bg-elev border border-border">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-text-dim tracking-wider uppercase">
          Recent sessions
        </h2>
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
  return (
    <span className={`font-mono w-11 text-right ${color}`}>{pct}%</span>
  );
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
