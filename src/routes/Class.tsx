import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Metronome } from '@/audio/Metronome';
import { ToqueScheduler } from '@/engine/scheduler';
import type { ToquePattern } from '@/engine/rhythms';
import { CLASSES, getClass, type ClassDef } from '@/engine/classes';
import { useI18n, type TFn } from '@/i18n';

/**
 * Class player — runs a guided progression with a metronome ticking
 * through the part's pattern and the chant for each interval surfaced
 * as big text. Three-part progress indicator at the top, repeat
 * toggle, auto-advance to the next part once cyclesToAdvance is hit.
 *
 * Audio model:
 *   - Fresh AudioContext per session (gesture-gated by the Start button).
 *   - Metronome schedules clicks ~3 cycles ahead; rAF tops up the queue.
 *   - rAF reads ctx.currentTime and writes the current chant + cycle
 *     into React state. State rate is bounded by interval boundaries,
 *     so we re-render at most ~5 times per cycle, not 60 times/sec.
 *
 * No mic input / scoring in MVP. The user plays along while the click
 * runs; the chant text tells them what to say.
 */

export function Class({ params }: { params: { id: string } }) {
  const [, navigate] = useLocation();
  const { t } = useI18n();
  const cls = getClass(params.id);
  if (!cls) {
    return (
      <main className="min-h-full px-6 py-10 max-w-2xl mx-auto flex flex-col gap-4">
        <p className="text-text-dim">{t('classes.not_found', { id: params.id })}</p>
        <Link href="/classes" className="text-accent underline underline-offset-4 text-sm">
          {t('common.back')}
        </Link>
      </main>
    );
  }
  return <ClassPlayer key={cls.id} classDef={cls} t={t} navigate={navigate} />;
}

function ClassPlayer({
  classDef,
  t,
  navigate,
}: {
  classDef: ClassDef;
  t: TFn;
  navigate: (to: string) => void;
}) {
  const [partIndex, setPartIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [cycleIndex, setCycleIndex] = useState(-1);
  const [intervalIndex, setIntervalIndex] = useState(-1);

  const part = classDef.parts[partIndex]!;

  // Refs that the rAF callback reads — avoids stale-closure surprises
  // when the user toggles repeat or switches part mid-run.
  const repeatRef = useRef(repeat);
  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);

  const audioRef = useRef<{
    ctx: AudioContext;
    metro: Metronome;
    scheduler: ToqueScheduler;
    startTime: number;
    scheduledThrough: number;
    raf: number;
  } | null>(null);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      cancelAnimationFrame(audio.raf);
      void audio.ctx.close();
      audioRef.current = null;
    }
    setRunning(false);
    setIntervalIndex(-1);
  }, []);

  // Stop on unmount.
  useEffect(() => stop, [stop]);

  // Reset state when switching parts.
  useEffect(() => {
    stop();
    setCycleIndex(-1);
    setIntervalIndex(-1);
  }, [partIndex, stop]);

  const start = useCallback(() => {
    stop();
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const metro = new Metronome(ctx);
    const syntheticToque: ToquePattern = {
      name: classDef.toqueName,
      difficulty: 'easy',
      description: '',
      defaultBpm: classDef.defaultBpm,
      intervals: part.intervals,
    };
    const startTime = ctx.currentTime + 0.5; // small lead-in so the first click isn't clipped
    const scheduler = new ToqueScheduler({
      toque: syntheticToque,
      bpm: classDef.defaultBpm,
      startTime,
    });

    // Pre-schedule the first three cycles' clicks. rAF tops this up.
    let scheduledThrough = startTime + scheduler.cycleSeconds * 3;
    for (const beat of scheduler.beatsInWindow(startTime, scheduledThrough)) {
      metro.scheduleTick(beat.beatTime, beat.accent);
    }

    setRunning(true);
    setCycleIndex(0);
    setIntervalIndex(-1);

    let lastReportedCycle = -1;
    let lastReportedInterval = -1;
    const intervalDuration = 60 / classDef.defaultBpm;
    const cycleSeconds = scheduler.cycleSeconds;

    const tick = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const tFromStart = ctx.currentTime - startTime;

      if (tFromStart >= 0) {
        const ci = Math.floor(tFromStart / cycleSeconds);
        const tInCycle = tFromStart - ci * cycleSeconds;
        const ii = Math.floor(tInCycle / intervalDuration);

        if (ci !== lastReportedCycle) {
          lastReportedCycle = ci;
          setCycleIndex(ci);

          // Auto-advance / stop logic at the cycle boundary.
          if (ci >= part.cyclesToAdvance && !repeatRef.current) {
            stop();
            const nextPart = partIndex + 1;
            if (nextPart < classDef.parts.length) {
              setPartIndex(nextPart);
            }
            return;
          }

          // Look-ahead: keep ~3 cycles' worth of clicks queued up.
          const targetT = startTime + (ci + 3) * cycleSeconds;
          if (targetT > scheduledThrough) {
            for (const b of scheduler.beatsInWindow(scheduledThrough, targetT)) {
              metro.scheduleTick(b.beatTime, b.accent);
            }
            scheduledThrough = targetT;
            audio.scheduledThrough = scheduledThrough;
          }
        }

        if (ii !== lastReportedInterval) {
          lastReportedInterval = ii;
          setIntervalIndex(ii);
        }
      }

      audio.raf = requestAnimationFrame(tick);
    };

    audioRef.current = {
      ctx,
      metro,
      scheduler,
      startTime,
      scheduledThrough,
      raf: requestAnimationFrame(tick),
    };
  }, [classDef, part, partIndex, stop]);

  // Current cycle's chants for the chant strip; falls back to first
  // entry when intervalIndex is out of range.
  const safeCycleIndex = Math.max(0, cycleIndex);
  const chants =
    part.chantsByCycle[safeCycleIndex % part.chantsByCycle.length] ?? part.chantsByCycle[0]!;
  const currentChant = intervalIndex >= 0 ? chants[intervalIndex] ?? '' : '';

  return (
    <main className="min-h-full px-6 py-8 max-w-2xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t(classDef.titleKey)}</h1>
          <p className="text-text-dim text-sm">{t(classDef.subtitleKey)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RepeatToggle value={repeat} onChange={setRepeat} t={t} />
          <Link href="/classes" className="btn-ghost">
            {t('common.back')}
          </Link>
        </div>
      </header>

      <PartIndicator parts={classDef.parts} current={partIndex} t={t} />

      {/* Big chant display + chant strip. */}
      <section className="card flex flex-col items-center gap-4 py-10">
        <div
          className="text-7xl sm:text-8xl font-semibold uppercase tracking-wider transition-colors"
          style={{ color: currentChant ? '#ff8a3d' : '#2a3556', minHeight: '6rem', lineHeight: 1 }}
        >
          {currentChant || '·'}
        </div>
        <div className="flex gap-3 font-mono text-sm uppercase tracking-wider">
          {chants.map((c, i) => (
            <span
              key={i}
              className={i === intervalIndex ? 'text-accent' : 'text-text-dim/60'}
            >
              {c || '·'}
            </span>
          ))}
        </div>
        <div className="text-xs text-text-dim">
          {t('classes.cycle_progress', {
            current: Math.min(Math.max(0, cycleIndex) + (running ? 1 : 0), part.cyclesToAdvance),
            total: part.cyclesToAdvance,
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-3 justify-center">
        {running ? (
          <button type="button" onClick={stop} className="btn-secondary px-6">
            {t('practice.pause')}
          </button>
        ) : (
          <button type="button" onClick={start} className="btn-primary px-6">
            {cycleIndex >= part.cyclesToAdvance - 1 ? t('classes.start_again') : t('classes.start')}
          </button>
        )}
        {!running && partIndex > 0 && (
          <button
            type="button"
            onClick={() => setPartIndex(partIndex - 1)}
            className="btn-ghost"
          >
            ← {t('classes.prev_part')}
          </button>
        )}
        {!running && partIndex < classDef.parts.length - 1 && (
          <button
            type="button"
            onClick={() => setPartIndex(partIndex + 1)}
            className="btn-ghost"
          >
            {t('classes.next_part')} →
          </button>
        )}
        {!running && partIndex === classDef.parts.length - 1 && (
          <button
            type="button"
            onClick={() => navigate('/classes')}
            className="btn-ghost"
          >
            {t('classes.finish')}
          </button>
        )}
      </div>
    </main>
  );
}

function PartIndicator({
  parts,
  current,
  t,
}: {
  parts: ClassDef['parts'];
  current: number;
  t: TFn;
}) {
  return (
    <div className="flex items-center gap-2">
      {parts.map((p, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <div
            key={i}
            className={`flex-1 flex flex-col gap-1 px-3 py-2 rounded-md border transition ${
              active
                ? 'bg-bg-elev border-accent'
                : done
                ? 'bg-bg-elev/60 border-border opacity-70'
                : 'bg-bg/40 border-border/60 opacity-60'
            }`}
          >
            <span
              className={`text-[9px] font-mono uppercase tracking-[0.18em] ${
                active ? 'text-accent' : 'text-text-dim'
              }`}
            >
              {t('classes.part_n', { n: i + 1 })}
            </span>
            <span className={`text-xs ${active ? 'text-text' : 'text-text-dim'}`}>
              {t(p.titleKey)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RepeatToggle({
  value,
  onChange,
  t,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  t: TFn;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      title={t('classes.repeat')}
      className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full border text-[11px] font-mono uppercase tracking-wider transition ${
        value
          ? 'bg-accent text-bg border-accent'
          : 'bg-bg-elev text-text-dim border-border hover:border-border-strong'
      }`}
    >
      ⟳ {t('classes.repeat')}
    </button>
  );
}

// Used by the index page to enumerate classes; re-exported here so the
// list page doesn't need to import the engine module separately.
export { CLASSES };
