import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { AudioInput } from '@/audio/AudioInput';
import { audioBus } from '@/audio/AudioBus';
import {
  SOUND_COLORS,
  SOUND_LABELS,
  TOQUES,
  type Sound,
  type ToqueName,
} from '@/engine/rhythms';
import { ToqueScheduler, clampBpm, type TargetBeat } from '@/engine/scheduler';
import {
  ScoringEngine,
  type BeatResult,
  type DetectedNote,
  type Outcome,
} from '@/engine/scoring';
import { saveSession } from '@/storage/sessions-store';

/**
 * Practice screen — rhythm timeline + mic scoring.
 *
 * Geometry:
 *                ◀── incoming beats sweep left ──
 *     ┌────────────┬─────────────────────────────┐
 *     │ history    │ HIT   upcoming              │
 *     │ (past)     │ LINE                        │
 *     └────────────┴─────────────────────────────┘
 *            x = 0.25·W
 *
 * Each beat at `beatTime` is drawn at x = hitX + (beatTime − now) · pxPerSec.
 * When beatTime − now ≈ 0, it's on the hit line. Detected mic notes use the
 * same mapping, so hit/miss is visually obvious.
 *
 * The canvas loop drives everything: it pulls pending target beats from the
 * scheduler, registers them with the ScoringEngine just before the hit line,
 * consumes new detected notes from audioBus, and renders outcomes. React
 * owns the pre-start overlay and the pause / summary overlay; the audio
 * frame never touches React state.
 */

const LEAD_SECONDS = 3;
const REGISTER_LEAD_SEC = 0.3;
const COUNT_IN_SECONDS = 2;
const RESUME_LEAD_SEC = 1.0;
const OUTCOME_FADE_SEC = 1.5;

const OUTCOME_COLORS: Record<Outcome, string> = {
  perfect: '#64f08c',
  good: '#a7e87a',
  wrong_sound: '#f2b640',
  late: '#e48140',
  miss: '#e2506c',
  mistake: '#8a93b0',
};

type Status = 'idle' | 'starting' | 'running' | 'paused' | 'error';

export function Practice() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const { toque, bpm } = useMemo(() => parseParams(search), [search]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<AudioInput | null>(null);
  const scoringRef = useRef(new ScoringEngine());
  const schedulerRef = useRef<ToqueScheduler | null>(null);
  const registeredBeatsRef = useRef<Set<number>>(new Set());
  const outcomesRef = useRef<Map<number, BeatResult & { at: number }>>(new Map());
  const lastDetectedTsRef = useRef(-Infinity);
  const pausedRef = useRef(false);

  // Session timing. We track active (unpaused) seconds (via the audio
  // clock) so the summary reports real play time, AND the wall-clock
  // start time so history records can be ordered and shown as dates.
  const sessionStartRef = useRef(0);
  const sessionStartWallRef = useRef(0);
  const pausedDurationRef = useRef(0);
  const pauseStartedAtRef = useRef<number | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [mode, setMode] = useState<'mic' | 'keyboard'>('mic');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Snapshot of stats shown in the paused summary overlay — re-read each
  // time we pause so React doesn't need to mirror the scoring engine live.
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  const pauseNow = useCallback(() => {
    if (pausedRef.current) return;
    const input = inputRef.current;
    const now = input ? input.now() : performance.now() / 1000;
    pausedRef.current = true;
    pauseStartedAtRef.current = now;
    setStatus('paused');
    setSummary(buildSummary(scoringRef.current, elapsedActive(now)));
  }, []);

  const resumeNow = useCallback(() => {
    const input = inputRef.current;
    if (!input || !pausedRef.current) return;
    const now = input.now();
    if (pauseStartedAtRef.current != null) {
      pausedDurationRef.current += now - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }
    // Fresh scheduler so the pattern picks up after a short lead-in rather
    // than rushing through every beat missed while paused.
    schedulerRef.current = new ToqueScheduler({
      toque,
      bpm,
      startTime: now + RESUME_LEAD_SEC,
    });
    registeredBeatsRef.current = new Set();
    lastDetectedTsRef.current = now;
    pausedRef.current = false;
    setSummary(null);
    setStatus('running');
  }, [toque, bpm]);

  const restartNow = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const now = input.now();
    scoringRef.current.reset();
    registeredBeatsRef.current = new Set();
    outcomesRef.current = new Map();
    lastDetectedTsRef.current = now;
    sessionStartRef.current = now;
    sessionStartWallRef.current = Date.now();
    pausedDurationRef.current = 0;
    pauseStartedAtRef.current = null;
    schedulerRef.current = new ToqueScheduler({
      toque,
      bpm,
      startTime: now + COUNT_IN_SECONDS,
    });
    pausedRef.current = false;
    setSummary(null);
    setStatus('running');
  }, [toque, bpm]);

  const endSession = useCallback(() => {
    const input = inputRef.current;
    const now = input ? input.now() : performance.now() / 1000;
    const scoring = scoringRef.current;
    const built = buildSummary(scoring, elapsedActive(now));

    // Only persist if there's something worth recording — anything less
    // would clutter the history with accidental taps of 'End session'.
    if (built.totalScoredBeats > 0 && sessionStartWallRef.current > 0) {
      void saveSession({
        startedAt: sessionStartWallRef.current,
        endedAt: Date.now(),
        toqueName: toque.name,
        bpm,
        elapsedSec: built.elapsedSec,
        accuracy: built.accuracy,
        totalScoredBeats: built.totalScoredBeats,
        bestStreak: built.bestStreak,
        outcomeCounts: built.outcomeCounts,
        perSound: built.perSound,
      });
    }
    void input?.stop();
    inputRef.current = null;
    navigate('/');
  }, [navigate, toque, bpm]);

  const elapsedActive = (now: number): number => {
    if (!sessionStartRef.current) return 0;
    const total = now - sessionStartRef.current;
    const paused =
      pausedDurationRef.current +
      (pauseStartedAtRef.current != null ? now - pauseStartedAtRef.current : 0);
    return Math.max(0, total - paused);
  };

  // Canvas render loop — runs whether or not the mic is live.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: w, clientHeight: h } = canvas;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let lastT = performance.now();
    let frames = 0;
    let fps = 0;
    let fpsAccum = 0;

    const draw = (t: number) => {
      const dt = t - lastT;
      lastT = t;
      frames += 1;
      fpsAccum += dt;
      if (fpsAccum >= 500) {
        fps = Math.round((frames * 1000) / fpsAccum);
        frames = 0;
        fpsAccum = 0;
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const hitX = Math.round(w * 0.25);
      const pxPerSec = (w - hitX) / LEAD_SECONDS;

      ctx.fillStyle = '#0b0f1a';
      ctx.fillRect(0, 0, w, h);

      const scoring = scoringRef.current;
      const toleranceW = 0.08 * pxPerSec;
      ctx.fillStyle = 'rgba(255,138,61,0.08)';
      ctx.fillRect(hitX - toleranceW, 0, toleranceW * 2, h);
      ctx.strokeStyle = '#ff8a3d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hitX, 0);
      ctx.lineTo(hitX, h);
      ctx.stroke();

      const laneY = (sound: Sound) => {
        if (sound === 'dong') return h * 0.72;
        if (sound === 'ding') return h * 0.28;
        return h * 0.5;
      };
      ctx.strokeStyle = '#141a2a';
      ctx.lineWidth = 1;
      for (const s of ['dong', 'ch', 'ding'] as const) {
        const y = laneY(s);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const input = inputRef.current;
      const now = input ? input.now() : performance.now() / 1000;
      // When paused we freeze the virtual clock used by the renderer so
      // beats don't drift off-screen while the user is reading the summary.
      const renderNow = pausedRef.current && pauseStartedAtRef.current != null
        ? pauseStartedAtRef.current
        : now;

      const scheduler = schedulerRef.current;
      if (scheduler) {
        const beats = scheduler.beatsInWindow(renderNow - 0.3, renderNow + LEAD_SECONDS);

        for (const beat of beats) {
          if (
            !pausedRef.current &&
            !registeredBeatsRef.current.has(beat.id) &&
            beat.beatTime - renderNow < REGISTER_LEAD_SEC
          ) {
            scoring.registerTargetBeat(beat.step, beat.sound, beat.beatTime, renderNow);
            registeredBeatsRef.current.add(beat.id);
          }
          const x = hitX + (beat.beatTime - renderNow) * pxPerSec;
          if (x < -40 || x > w + 40) continue;
          const outcome = outcomesRef.current.get(beat.id);
          drawTarget(ctx, beat, x, laneY(beat.sound), outcome);
        }

        if (!pausedRef.current) {
          for (const miss of scoring.flushMissedBeats(renderNow)) {
            if (miss.step != null) {
              const beatId = findBeatId(scheduler, miss, renderNow);
              if (beatId != null) outcomesRef.current.set(beatId, { ...miss, at: renderNow });
            }
          }
        }
      }

      if (!pausedRef.current) {
        const notes = audioBus.recentNotes;
        for (let i = 0; i < notes.length; i++) {
          const note = notes[i]!;
          if (note.timestamp <= lastDetectedTsRef.current) continue;
          lastDetectedTsRef.current = note.timestamp;
          const result = scoring.registerDetectedNote(note, renderNow);
          if (result && result.step != null) {
            const scheduler2 = schedulerRef.current;
            if (scheduler2) {
              const id = findBeatId(scheduler2, result, renderNow);
              if (id != null) outcomesRef.current.set(id, { ...result, at: renderNow });
            }
          }
        }
      }

      const notes = audioBus.recentNotes;
      for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i]!;
        const x = hitX + (note.timestamp - renderNow) * pxPerSec;
        if (x < -40 || x > w + 40) continue;
        drawDetectedNote(ctx, note, x, laneY(note.soundClass === 'unknown' ? 'ch' : (note.soundClass as Sound)));
      }

      drawHUD(ctx, scoring, fps, w, pausedRef.current);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Keyboard shortcuts:
  //   space        — toggle pause (running ↔ paused)
  //   1 / 2 / 3    — inject DONG / TCH / DING (scored like a real hit)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        if (status !== 'running' && status !== 'paused') return;
        e.preventDefault();
        if (status === 'running') pauseNow();
        else resumeNow();
        return;
      }

      if (status !== 'running') return;
      const input = inputRef.current;
      if (!input) return;
      if (e.code === 'Digit1' || e.key === '1') {
        e.preventDefault();
        input.inject('dong');
      } else if (e.code === 'Digit2' || e.key === '2') {
        e.preventDefault();
        input.inject('ch');
      } else if (e.code === 'Digit3' || e.key === '3') {
        e.preventDefault();
        input.inject('ding');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, pauseNow, resumeNow]);

  useEffect(() => {
    return () => {
      void inputRef.current?.stop();
      inputRef.current = null;
    };
  }, []);

  const beginSession = (input: AudioInput) => {
    inputRef.current = input;
    const now = input.now();
    scoringRef.current.reset();
    registeredBeatsRef.current = new Set();
    outcomesRef.current = new Map();
    lastDetectedTsRef.current = now;
    sessionStartRef.current = now;
    sessionStartWallRef.current = Date.now();
    pausedDurationRef.current = 0;
    pauseStartedAtRef.current = null;
    pausedRef.current = false;
    schedulerRef.current = new ToqueScheduler({
      toque,
      bpm,
      startTime: now + COUNT_IN_SECONDS,
    });
    setStatus('running');
  };

  const handleStart = async () => {
    if (status === 'starting' || status === 'running') return;
    setStatus('starting');
    setErrorMsg(null);
    try {
      const input = new AudioInput();
      await input.start();
      setMode('mic');
      beginSession(input);
    } catch (err) {
      console.error('[Practice] mic start failed', err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleStartKeyboard = async () => {
    if (status === 'starting' || status === 'running') return;
    setStatus('starting');
    setErrorMsg(null);
    try {
      const input = new AudioInput();
      await input.startKeyboardMode();
      setMode('keyboard');
      beginSession(input);
    } catch (err) {
      console.error('[Practice] keyboard-mode start failed', err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  return (
    <main className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" />

      <div className="absolute top-4 left-4 text-xs text-text-dim font-mono">
        {toque.name} · {bpm} bpm
      </div>

      <div className="absolute top-4 right-4 flex items-center gap-2">
        {status === 'running' && (
          <button
            type="button"
            onClick={pauseNow}
            className="px-3 py-1.5 rounded-full bg-bg-elev/80 backdrop-blur text-text text-sm border border-border"
            title="Pause (space)"
          >
            Pause
          </button>
        )}
        <Link
          href="/"
          className="px-3 py-1.5 rounded-full bg-bg-elev/80 backdrop-blur text-text-dim text-sm border border-border"
        >
          ← Back
        </Link>
      </div>

      {(status === 'idle' || status === 'starting' || status === 'error') && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg/70 backdrop-blur-sm px-4">
          <div className="flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-bg-elev border border-border max-w-sm w-full">
            <h2 className="text-xl font-semibold">Ready?</h2>
            <p className="text-text-dim text-sm text-center">
              Playing <span className="text-text">{toque.name}</span> at{' '}
              <span className="font-mono">{bpm} bpm</span>. Start the mic to
              play along, or use the keyboard to try without an instrument.
            </p>
            <div className="flex flex-col items-stretch gap-2 w-full">
              <button
                type="button"
                onClick={handleStart}
                disabled={status === 'starting'}
                className="px-6 py-2 rounded-full bg-accent text-bg font-semibold disabled:opacity-60"
              >
                {status === 'starting' ? 'Starting…' : 'Start microphone'}
              </button>
              <button
                type="button"
                onClick={handleStartKeyboard}
                disabled={status === 'starting'}
                className="px-6 py-2 rounded-full bg-bg border border-border text-text-dim hover:text-text disabled:opacity-60"
                title="Use the number keys 1 / 2 / 3 as DONG / TCH / DING"
              >
                Try keyboard mode
              </button>
            </div>
            {errorMsg && <p className="text-sm text-red-400 text-center">{errorMsg}</p>}
          </div>
        </div>
      )}

      {status === 'running' && mode === 'keyboard' && <KeyboardHint />}

      {status === 'paused' && summary && (
        <SummaryOverlay
          summary={summary}
          onResume={resumeNow}
          onRestart={restartNow}
          onEnd={endSession}
        />
      )}
    </main>
  );
}

function KeyboardHint() {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-elev/80 backdrop-blur border border-border text-[11px] text-text-dim">
      <Kbd label="1" color={SOUND_COLORS.dong} name="DONG" />
      <Kbd label="2" color={SOUND_COLORS.ch} name="TCH" />
      <Kbd label="3" color={SOUND_COLORS.ding} name="DING" />
      <span className="mx-1 text-text-dim/70">·</span>
      <span>space to pause</span>
    </div>
  );
}

function Kbd({ label, color, name }: { label: string; color: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd
        className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-mono font-bold text-bg"
        style={{ background: color }}
      >
        {label}
      </kbd>
      <span>{name}</span>
    </span>
  );
}

function parseParams(search: string): { toque: (typeof TOQUES)[ToqueName]; bpm: number } {
  const params = new URLSearchParams(search);
  const requestedName = params.get('toque') as ToqueName | null;
  const toque = requestedName && requestedName in TOQUES ? TOQUES[requestedName] : TOQUES['Angola'];
  const bpmParam = Number(params.get('bpm'));
  const bpm = Number.isFinite(bpmParam) && bpmParam > 0 ? clampBpm(toque, bpmParam) : toque.defaultBpm;
  return { toque, bpm };
}

function findBeatId(
  scheduler: ToqueScheduler,
  result: BeatResult,
  now: number,
): number | null {
  if (result.step == null) return null;
  const beats = scheduler.beatsInWindow(now - 0.5, now + 0.1);
  let closest: { id: number; delta: number } | null = null;
  for (const beat of beats) {
    if (beat.step !== result.step) continue;
    const delta = Math.abs(beat.beatTime - result.timestamp);
    if (!closest || delta < closest.delta) closest = { id: beat.id, delta };
  }
  return closest?.id ?? null;
}

function drawTarget(
  ctx: CanvasRenderingContext2D,
  beat: TargetBeat,
  x: number,
  y: number,
  outcome: (BeatResult & { at: number }) | undefined,
) {
  const color = SOUND_COLORS[beat.sound];
  const r = beat.accent === 2 ? 16 : 12;
  const now = performance.now() / 1000;

  if (outcome) {
    const age = now - outcome.at;
    const alpha = Math.max(0, 1 - age / OUTCOME_FADE_SEC);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = OUTCOME_COLORS[outcome.outcome];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = color;
  ctx.globalAlpha = outcome ? 0.35 : 0.9;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#0b0f1a';
  ctx.font = `bold ${beat.accent === 2 ? 12 : 10}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(SOUND_LABELS[beat.sound], x, y);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

function drawDetectedNote(
  ctx: CanvasRenderingContext2D,
  note: DetectedNote,
  x: number,
  y: number,
) {
  const sound = note.soundClass;
  const color = sound === 'unknown' ? '#8a93b0' : SOUND_COLORS[sound as Sound];
  const r = 4 + note.amplitude * 6;

  ctx.globalAlpha = note.isMistake ? 0.35 : 0.75;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y + 30, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  scoring: ScoringEngine,
  fps: number,
  w: number,
  paused: boolean,
) {
  const accuracy = scoring.rollingAccuracy(20);
  const recent = scoring.beatResults.slice(-30);
  const counts: Record<Outcome, number> = {
    perfect: 0,
    good: 0,
    wrong_sound: 0,
    late: 0,
    miss: 0,
    mistake: 0,
  };
  for (const r of recent) counts[r.outcome]++;

  ctx.fillStyle = '#8a93b0';
  ctx.font = '12px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`fps ${fps}`, w - 16, 56);
  if (paused) {
    ctx.fillStyle = '#ff8a3d';
    ctx.fillText('PAUSED', w - 16, 36);
  }
  ctx.textAlign = 'start';

  ctx.fillStyle = '#e6e8f0';
  ctx.font = 'bold 28px ui-monospace, Consolas, monospace';
  ctx.fillText(`${Math.round(accuracy * 100)}%`, 16, 40);
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#8a93b0';
  ctx.fillText('accuracy (last 20)', 16, 56);

  const labels: Outcome[] = ['perfect', 'good', 'wrong_sound', 'late', 'miss', 'mistake'];
  let x = 16;
  const y = 76;
  ctx.font = '10px ui-monospace, Consolas, monospace';
  for (const key of labels) {
    const n = counts[key];
    ctx.fillStyle = n === 0 ? '#2a3048' : OUTCOME_COLORS[key];
    ctx.fillRect(x, y, 18, 4);
    ctx.fillStyle = '#8a93b0';
    ctx.fillText(`${key[0]?.toUpperCase()}${n > 0 ? n : ''}`, x, y + 18);
    x += 30;
  }
}

// --------------------------------------------------------------------------
// Session summary
// --------------------------------------------------------------------------

interface SessionSummary {
  elapsedSec: number;
  totalScoredBeats: number;
  accuracy: number;
  outcomeCounts: Record<Outcome, number>;
  perSound: Record<'dong' | 'ch' | 'ding', number | null>;
  bestStreak: number;
}

function buildSummary(scoring: ScoringEngine, elapsedSec: number): SessionSummary {
  const counts: Record<Outcome, number> = {
    perfect: 0,
    good: 0,
    wrong_sound: 0,
    late: 0,
    miss: 0,
    mistake: 0,
  };
  let bestStreak = 0;
  let currentStreak = 0;
  let positiveScore = 0;
  let scoredBeats = 0;
  for (const r of scoring.beatResults) {
    if (r.outcome === 'mistake') continue;
    counts[r.outcome] += 1;
    scoredBeats += 1;
    if (r.score > 0) {
      positiveScore += r.score;
      currentStreak += 1;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }
  counts.mistake = scoring.mistakeCount();

  return {
    elapsedSec,
    totalScoredBeats: scoredBeats,
    accuracy: scoredBeats > 0 ? positiveScore / scoredBeats : 0,
    outcomeCounts: counts,
    perSound: scoring.soundAccuracy(),
    bestStreak,
  };
}

function SummaryOverlay({
  summary,
  onResume,
  onRestart,
  onEnd,
}: {
  summary: SessionSummary;
  onResume: () => void;
  onRestart: () => void;
  onEnd: () => void;
}) {
  const minutes = Math.floor(summary.elapsedSec / 60);
  const seconds = Math.floor(summary.elapsedSec % 60);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg/75 backdrop-blur-sm px-4">
      <div className="flex flex-col gap-5 px-6 py-6 rounded-2xl bg-bg-elev border border-border w-full max-w-md">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Paused</h2>
          <span className="text-xs text-text-dim font-mono">
            {minutes}:{String(seconds).padStart(2, '0')} active
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Accuracy" value={`${Math.round(summary.accuracy * 100)}%`} />
          <Stat label="Beats" value={String(summary.totalScoredBeats)} />
          <Stat label="Best streak" value={String(summary.bestStreak)} />
        </div>

        <OutcomeBreakdown counts={summary.outcomeCounts} />
        <PerSoundBreakdown perSound={summary.perSound} />

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={onResume}
            className="flex-1 px-4 py-2 rounded-full bg-accent text-bg font-semibold"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="flex-1 px-4 py-2 rounded-full bg-bg border border-border text-text"
          >
            Restart
          </button>
          <button
            type="button"
            onClick={onEnd}
            className="flex-1 px-4 py-2 rounded-full bg-bg border border-border text-text-dim"
          >
            End session
          </button>
        </div>
        <p className="text-[10px] text-text-dim text-center -mt-2">
          press space to resume
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-2 rounded-xl bg-bg border border-border">
      <span className="font-mono text-xl font-semibold text-text">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-text-dim">{label}</span>
    </div>
  );
}

function OutcomeBreakdown({ counts }: { counts: Record<Outcome, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const order: Outcome[] = ['perfect', 'good', 'wrong_sound', 'late', 'miss', 'mistake'];
  if (total === 0) {
    return <p className="text-xs text-text-dim text-center">No beats scored yet.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex w-full h-2 rounded-full overflow-hidden bg-bg border border-border">
        {order.map((key) => {
          const n = counts[key];
          if (n === 0) return null;
          const pct = (n / total) * 100;
          return (
            <div
              key={key}
              style={{ width: `${pct}%`, background: OUTCOME_COLORS[key] }}
              title={`${key}: ${n}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
        {order.map((key) => (
          <div key={key} className="flex items-center gap-1.5 text-text-dim">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: OUTCOME_COLORS[key] }}
            />
            <span className="capitalize">{key.replace('_', ' ')}</span>
            <span className="ml-auto font-mono text-text">{counts[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerSoundBreakdown({
  perSound,
}: {
  perSound: Record<'dong' | 'ch' | 'ding', number | null>;
}) {
  const rows: Array<'dong' | 'ch' | 'ding'> = ['dong', 'ch', 'ding'];
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-text-dim">Per sound</span>
      <div className="grid grid-cols-3 gap-2">
        {rows.map((s) => {
          const v = perSound[s];
          return (
            <div
              key={s}
              className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg bg-bg border border-border"
            >
              <span
                className="w-3 h-3 rounded-full"
                style={{ background: SOUND_COLORS[s] }}
              />
              <span className="text-xs font-medium tracking-wider">{SOUND_LABELS[s]}</span>
              <span className="font-mono text-sm text-text">
                {v == null ? '—' : `${Math.round(v * 100)}%`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
