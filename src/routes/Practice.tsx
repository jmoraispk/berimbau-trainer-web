import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearch } from 'wouter';
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
 * consumes new detected notes from audioBus, and renders outcomes. React only
 * owns the pre-start overlay — it never re-renders per audio frame.
 */

const LEAD_SECONDS = 3;
const REGISTER_LEAD_SEC = 0.3;
const COUNT_IN_SECONDS = 2;
const OUTCOME_FADE_SEC = 1.5;

const OUTCOME_COLORS: Record<Outcome, string> = {
  perfect: '#64f08c',
  good: '#a7e87a',
  wrong_sound: '#f2b640',
  late: '#e48140',
  miss: '#e2506c',
  mistake: '#8a93b0',
};

export function Practice() {
  const search = useSearch();
  const { toque, bpm } = useMemo(() => parseParams(search), [search]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<AudioInput | null>(null);
  const scoringRef = useRef(new ScoringEngine());
  const schedulerRef = useRef<ToqueScheduler | null>(null);
  const registeredBeatsRef = useRef<Set<number>>(new Set());
  const outcomesRef = useRef<Map<number, BeatResult & { at: number }>>(new Map());
  const lastDetectedTsRef = useRef(-Infinity);
  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Render loop — runs whether or not the mic is live.
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

      // Backdrop
      ctx.fillStyle = '#0b0f1a';
      ctx.fillRect(0, 0, w, h);

      // Hit line + tolerance band
      const scoring = scoringRef.current;
      const toleranceW = 0.08 * pxPerSec; // TIMING_TOLERANCE_SEC
      ctx.fillStyle = 'rgba(255,138,61,0.08)';
      ctx.fillRect(hitX - toleranceW, 0, toleranceW * 2, h);
      ctx.strokeStyle = '#ff8a3d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hitX, 0);
      ctx.lineTo(hitX, h);
      ctx.stroke();

      // Lane guides (DONG/TCH/DING vertical positions)
      const laneY = (sound: Sound) => {
        if (sound === 'dong') return h * 0.72;
        if (sound === 'ding') return h * 0.28;
        return h * 0.5; // ch
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

      // Timing source — prefer the audio clock for scoring sync.
      const input = inputRef.current;
      const now = input ? input.now() : performance.now() / 1000;

      // Pull upcoming beats from the scheduler and draw them.
      const scheduler = schedulerRef.current;
      if (scheduler) {
        const beats = scheduler.beatsInWindow(now - 0.3, now + LEAD_SECONDS);

        for (const beat of beats) {
          // Register with the scoring engine just before the hit line.
          if (
            !registeredBeatsRef.current.has(beat.id) &&
            beat.beatTime - now < REGISTER_LEAD_SEC
          ) {
            scoring.registerTargetBeat(beat.step, beat.sound, beat.beatTime, now);
            registeredBeatsRef.current.add(beat.id);
          }
          const x = hitX + (beat.beatTime - now) * pxPerSec;
          if (x < -40 || x > w + 40) continue;
          const outcome = outcomesRef.current.get(beat.id);
          drawTarget(ctx, beat, x, laneY(beat.sound), outcome);
        }

        // Expire beats past the late zone as misses.
        for (const miss of scoring.flushMissedBeats(now)) {
          if (miss.step != null) {
            const beatId = findBeatId(scheduler, miss, now);
            if (beatId != null) outcomesRef.current.set(beatId, { ...miss, at: now });
          }
        }
      }

      // Consume new detected notes from audioBus and feed them to the scoring
      // engine. Detected notes are pushed in chronological order — we only
      // process anything newer than the last one we've seen.
      const notes = audioBus.recentNotes;
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i]!;
        if (note.timestamp <= lastDetectedTsRef.current) continue;
        lastDetectedTsRef.current = note.timestamp;
        const result = scoring.registerDetectedNote(note, now);
        if (result && result.step != null) {
          const scheduler2 = schedulerRef.current;
          if (scheduler2) {
            const id = findBeatId(scheduler2, result, now);
            if (id != null) outcomesRef.current.set(id, { ...result, at: now });
          }
        }
      }

      // Render detected notes. Their age maps to x just like target beats.
      for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i]!;
        const x = hitX + (note.timestamp - now) * pxPerSec;
        if (x < -40 || x > w + 40) continue;
        drawDetectedNote(ctx, note, x, laneY(note.soundClass === 'unknown' ? 'ch' : (note.soundClass as Sound)));
      }

      // HUD: tempo / accuracy / counters, painted onto the canvas
      drawHUD(ctx, scoring, fps, w, now);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      void inputRef.current?.stop();
      inputRef.current = null;
    };
  }, []);

  const handleStart = async () => {
    if (status === 'starting' || status === 'running') return;
    setStatus('starting');
    setErrorMsg(null);
    try {
      const input = new AudioInput();
      await input.start();
      inputRef.current = input;

      // Schedule the first beat COUNT_IN_SECONDS in the future so the user
      // sees the pattern approaching before they need to play.
      scoringRef.current.reset();
      registeredBeatsRef.current.clear();
      outcomesRef.current.clear();
      lastDetectedTsRef.current = input.now();
      schedulerRef.current = new ToqueScheduler({
        toque,
        bpm,
        startTime: input.now() + COUNT_IN_SECONDS,
      });

      setStatus('running');
    } catch (err) {
      console.error('[Practice] mic start failed', err);
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

      <Link
        href="/"
        className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-bg-elev/80 backdrop-blur text-text-dim text-sm border border-border"
      >
        ← Back
      </Link>

      {status !== 'running' && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-bg-elev border border-border max-w-sm">
            <h2 className="text-xl font-semibold">Ready?</h2>
            <p className="text-text-dim text-sm text-center">
              Playing <span className="text-text">{toque.name}</span> at{' '}
              <span className="font-mono">{bpm} bpm</span>. Tap to open your mic —
              the pattern will start after a 2-second count-in.
            </p>
            <button
              type="button"
              onClick={handleStart}
              disabled={status === 'starting'}
              className="px-6 py-2 rounded-full bg-accent text-bg font-semibold disabled:opacity-60"
            >
              {status === 'starting' ? 'Starting…' : 'Start microphone'}
            </button>
            {errorMsg && <p className="text-sm text-red-400 text-center">{errorMsg}</p>}
          </div>
        </div>
      )}
    </main>
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
  // Look up the beat whose step matches within the recent window. This is
  // cheap at our scale (~16 beats per second) and avoids threading beat ids
  // through the scoring engine API.
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
  const now = performance.now() / 1000; // for outcome fade — UI-local clock is fine

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
  _now: number,
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
  ctx.textAlign = 'start';

  // Accuracy readout, bottom-left
  ctx.fillStyle = '#e6e8f0';
  ctx.font = 'bold 28px ui-monospace, Consolas, monospace';
  ctx.fillText(`${Math.round(accuracy * 100)}%`, 16, 40);
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#8a93b0';
  ctx.fillText('accuracy (last 20)', 16, 56);

  // Outcome bar
  const labels: Outcome[] = ['perfect', 'good', 'wrong_sound', 'late', 'miss', 'mistake'];
  let x = 16;
  const y = 76;
  ctx.font = '10px ui-monospace, Consolas, monospace';
  for (const key of labels) {
    const n = counts[key];
    if (n === 0) {
      ctx.fillStyle = '#2a3048';
    } else {
      ctx.fillStyle = OUTCOME_COLORS[key];
    }
    ctx.fillRect(x, y, 18, 4);
    ctx.fillStyle = '#8a93b0';
    ctx.fillText(`${key[0]?.toUpperCase()}${n > 0 ? n : ''}`, x, y + 18);
    x += 30;
  }
}
