import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { AudioInput } from '@/audio/AudioInput';
import { audioBus } from '@/audio/AudioBus';
import { Metronome } from '@/audio/Metronome';
import { PatternPreview } from '@/components/PatternPreview';
import { SoundSymbol as SoundSymbolImported } from '@/components/SoundSymbol';
import {
  GLOBAL_BPM_RANGE,
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
import { useI18n, type TFn } from '@/i18n';

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
  late_correct: '#a7e87a', // same green as 'good' — right note
  late_wrong: '#e48140',   // amber/orange — at least played something
  miss: '#e2506c',
  mistake: '#8a93b0',
};

/** Per-outcome message keys used in the summary breakdown. */
const OUTCOME_KEYS: Record<Outcome, 'practice.outcome.perfect' | 'practice.outcome.good' | 'practice.outcome.wrong_sound' | 'practice.outcome.late_correct' | 'practice.outcome.late_wrong' | 'practice.outcome.miss' | 'practice.outcome.mistake'> = {
  perfect: 'practice.outcome.perfect',
  good: 'practice.outcome.good',
  wrong_sound: 'practice.outcome.wrong_sound',
  late_correct: 'practice.outcome.late_correct',
  late_wrong: 'practice.outcome.late_wrong',
  miss: 'practice.outcome.miss',
  mistake: 'practice.outcome.mistake',
};

const OUTCOME_ORDER: Outcome[] = [
  'perfect',
  'good',
  'late_correct',
  'wrong_sound',
  'late_wrong',
  'miss',
  'mistake',
];

type Status = 'idle' | 'starting' | 'running' | 'paused' | 'error';

const BPM_STEP = 5;
const METRONOME_LOOKAHEAD_SEC = 0.25;
const METRONOME_PREF_KEY = 'berimbau:metronome';
const DISPLAY_PREF_KEY = 'berimbau:display';
type DisplayMode = 'linear' | 'circular';

export function Practice() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const { t } = useI18n();
  const { toque, bpm: initialBpm } = useMemo(() => parseParams(search), [search]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<AudioInput | null>(null);
  const scoringRef = useRef(new ScoringEngine());
  const schedulerRef = useRef<ToqueScheduler | null>(null);
  const registeredBeatsRef = useRef<Set<number>>(new Set());
  const tickedBeatsRef = useRef<Set<number>>(new Set());
  const outcomesRef = useRef<Map<number, BeatResult & { at: number }>>(new Map());
  const lastDetectedTsRef = useRef(-Infinity);
  const pausedRef = useRef(false);
  const metronomeRef = useRef<Metronome | null>(null);
  /** Audio-clock time of the scheduler's first beat; used for the count-in. */
  const firstBeatAtRef = useRef(0);

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
  // BPM is adjustable mid-practice. Display value in state; the render
  // loop reads the ref so a BPM bump doesn't re-render until the HUD flash.
  const [bpm, setBpm] = useState(initialBpm);
  const bpmRef = useRef(initialBpm);
  const bpmFlashUntilRef = useRef(0);
  const [metronomeOn, setMetronomeOn] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(METRONOME_PREF_KEY) === '1';
  });

  // Display mode: linear (sweeping right→left, default landscape) vs
  // circular (rotating clock face, default portrait). The render loop
  // reads the ref so toggling doesn't trigger a re-render.
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
    if (typeof localStorage === 'undefined') return 'circular';
    const stored = localStorage.getItem(DISPLAY_PREF_KEY);
    if (stored === 'linear' || stored === 'circular') return stored;
    return 'circular'; // default for both portrait and landscape
  });
  const displayModeRef = useRef<DisplayMode>(displayMode);
  useEffect(() => {
    displayModeRef.current = displayMode;
  }, [displayMode]);
  const toggleDisplayMode = useCallback(() => {
    setDisplayMode((prev) => {
      const next: DisplayMode = prev === 'linear' ? 'circular' : 'linear';
      try {
        localStorage.setItem(DISPLAY_PREF_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
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
    const firstBeat = now + RESUME_LEAD_SEC;
    schedulerRef.current = new ToqueScheduler({
      toque,
      bpm: bpmRef.current,
      startTime: firstBeat,
    });
    firstBeatAtRef.current = firstBeat;
    registeredBeatsRef.current = new Set();
    tickedBeatsRef.current = new Set();
    lastDetectedTsRef.current = now;
    pausedRef.current = false;
    setSummary(null);
    setStatus('running');
  }, [toque]);

  // Persist the current session if there's anything worth recording.
  // Idempotent via sessionSavedRef so visibilitychange / beforeunload /
  // explicit end-session don't produce duplicates.
  const sessionSavedRef = useRef(false);
  const persistSession = useCallback(() => {
    if (sessionSavedRef.current) return;
    if (sessionStartWallRef.current <= 0) return;
    const input = inputRef.current;
    const now = input ? input.now() : performance.now() / 1000;
    const built = buildSummary(scoringRef.current, elapsedActive(now));
    if (built.totalScoredBeats === 0) return;
    sessionSavedRef.current = true;
    void saveSession({
      startedAt: sessionStartWallRef.current,
      endedAt: Date.now(),
      toqueName: toque.name,
      bpm: bpmRef.current,
      elapsedSec: built.elapsedSec,
      accuracy: built.accuracy,
      totalScoredBeats: built.totalScoredBeats,
      bestStreak: built.bestStreak,
      outcomeCounts: built.outcomeCounts,
      perSound: built.perSound,
    });
  }, [toque]);

  const endSession = useCallback(() => {
    persistSession();
    void inputRef.current?.stop();
    inputRef.current = null;
    navigate('/');
  }, [navigate, persistSession]);

  const restartNow = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    // Persist the finished-up-to-now run before clearing state so a
    // restart still counts as a completed session.
    persistSession();
    const now = input.now();
    scoringRef.current.reset();
    registeredBeatsRef.current = new Set();
    tickedBeatsRef.current = new Set();
    outcomesRef.current = new Map();
    lastDetectedTsRef.current = now;
    sessionStartRef.current = now;
    sessionStartWallRef.current = Date.now();
    pausedDurationRef.current = 0;
    pauseStartedAtRef.current = null;
    sessionSavedRef.current = false;
    const firstBeat = now + COUNT_IN_SECONDS;
    schedulerRef.current = new ToqueScheduler({
      toque,
      bpm: bpmRef.current,
      startTime: firstBeat,
    });
    firstBeatAtRef.current = firstBeat;
    pausedRef.current = false;
    setSummary(null);
    setStatus('running');
  }, [toque, persistSession]);

  const changeBpm = useCallback((delta: number) => {
    const next = clampBpm(toque, bpmRef.current + delta);
    if (next === bpmRef.current) return;
    bpmRef.current = next;
    setBpm(next);
    bpmFlashUntilRef.current = performance.now() / 1000 + 1.2;

    // Mid-session change: rebuild the scheduler at the new tempo with a
    // short lead-in so the next beat doesn't jump on top of the hit line.
    const input = inputRef.current;
    if (status === 'running' && input) {
      const now = input.now();
      const firstBeat = now + RESUME_LEAD_SEC;
      schedulerRef.current = new ToqueScheduler({
        toque,
        bpm: next,
        startTime: firstBeat,
      });
      firstBeatAtRef.current = firstBeat;
      registeredBeatsRef.current = new Set();
      tickedBeatsRef.current = new Set();
    }
  }, [toque, status]);

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

    const draw = (_t: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      ctx.fillStyle = '#0b0f1a';
      ctx.fillRect(0, 0, w, h);

      const scoring = scoringRef.current;
      const input = inputRef.current;
      const now = input ? input.now() : performance.now() / 1000;
      // When paused, freeze the virtual clock used by the renderer so beats
      // don't drift off-screen while the user is reading the summary.
      const renderNow = pausedRef.current && pauseStartedAtRef.current != null
        ? pauseStartedAtRef.current
        : now;

      // ── Engine work (mode-independent): register target beats, schedule
      //    metronome ticks, consume detected notes, flush misses. ──────────
      const scheduler = schedulerRef.current;
      if (scheduler) {
        const beats = scheduler.beatsInWindow(renderNow - 0.3, renderNow + LEAD_SECONDS);
        const metronome = metronomeRef.current;
        for (const beat of beats) {
          if (
            !pausedRef.current &&
            !registeredBeatsRef.current.has(beat.id) &&
            beat.beatTime - renderNow < REGISTER_LEAD_SEC
          ) {
            scoring.registerTargetBeat(beat.step, beat.sound, beat.beatTime, renderNow);
            registeredBeatsRef.current.add(beat.id);
          }
          if (
            !pausedRef.current &&
            metronome &&
            !tickedBeatsRef.current.has(beat.id) &&
            beat.beatTime - renderNow < METRONOME_LOOKAHEAD_SEC
          ) {
            metronome.scheduleTick(beat.beatTime, beat.accent);
            tickedBeatsRef.current.add(beat.id);
          }
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

      // ── Paint (mode-specific) ──────────────────────────────────────────
      if (displayModeRef.current === 'circular' && scheduler) {
        paintCircular(ctx, w, h, scheduler, renderNow, outcomesRef.current, firstBeatAtRef.current);
      } else if (scheduler) {
        paintLinear(ctx, w, h, scheduler, renderNow, outcomesRef.current);
      } else {
        // No scheduler yet (idle / starting). Just paint the linear hit line
        // so the screen isn't blank.
        paintLinear(ctx, w, h, null, renderNow, outcomesRef.current);
      }

      // Count-in overlay — visible when the first beat is still more
      // than ~50 ms away. A large centered number fades over the last
      // second so it doesn't linger on top of the first real beat.
      if (firstBeatAtRef.current > 0 && !pausedRef.current) {
        const untilStart = firstBeatAtRef.current - renderNow;
        if (untilStart > 0.05) {
          drawCountIn(ctx, w, h, untilStart);
        } else if (untilStart > -0.6) {
          drawGo(ctx, w, h, untilStart);
        }
      }

      drawHUD(ctx, scoring, w, h, pausedRef.current, displayModeRef.current);

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
      } else if (e.key === '-' || e.key === '_' || e.code === 'ArrowDown') {
        e.preventDefault();
        changeBpm(-BPM_STEP);
      } else if (e.key === '=' || e.key === '+' || e.code === 'ArrowUp') {
        e.preventDefault();
        changeBpm(BPM_STEP);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, pauseNow, resumeNow, changeBpm]);

  useEffect(() => {
    return () => {
      persistSession();
      void inputRef.current?.stop();
      inputRef.current = null;
    };
  }, [persistSession]);

  // Best-effort autosave when the tab is hidden or about to unload. Both
  // fire synchronously; saveSession is fire-and-forget so we can't await,
  // but IDB will usually commit before the page actually tears down.
  useEffect(() => {
    const flush = () => persistSession();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [persistSession]);

  const beginSession = (input: AudioInput) => {
    inputRef.current = input;
    const now = input.now();
    scoringRef.current.reset();
    registeredBeatsRef.current = new Set();
    tickedBeatsRef.current = new Set();
    outcomesRef.current = new Map();
    lastDetectedTsRef.current = now;
    sessionStartRef.current = now;
    sessionStartWallRef.current = Date.now();
    pausedDurationRef.current = 0;
    pauseStartedAtRef.current = null;
    pausedRef.current = false;
    sessionSavedRef.current = false;
    bpmRef.current = initialBpm;
    setBpm(initialBpm);
    const ctx = input.audioContext;
    metronomeRef.current = ctx ? new Metronome(ctx, {}, !metronomeOn) : null;
    const firstBeat = now + COUNT_IN_SECONDS;
    schedulerRef.current = new ToqueScheduler({
      toque,
      bpm: initialBpm,
      startTime: firstBeat,
    });
    firstBeatAtRef.current = firstBeat;
    setStatus('running');
  };

  const toggleMetronome = useCallback(() => {
    setMetronomeOn((prev) => {
      const next = !prev;
      metronomeRef.current?.setMuted(!next);
      try {
        localStorage.setItem(METRONOME_PREF_KEY, next ? '1' : '0');
      } catch {
        // localStorage unavailable (private mode, quota exceeded) — ignore.
      }
      return next;
    });
  }, []);

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

      <div className="absolute top-4 left-4 flex items-center gap-2">
        <span className="text-xs text-text-dim font-mono">{toque.name}</span>
        {status === 'running' ? (
          <div className="inline-flex items-center gap-0 rounded-full bg-bg-elev/80 backdrop-blur border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => changeBpm(-BPM_STEP)}
              disabled={bpm <= GLOBAL_BPM_RANGE[0]}
              className="w-7 h-7 flex items-center justify-center text-text-dim hover:text-text disabled:opacity-30"
              title={t('practice.slower')}
              aria-label={t('practice.slower')}
            >
              −
            </button>
            <span className="px-2 font-mono text-sm text-text min-w-[4.5rem] text-center">
              {bpm} bpm
            </span>
            <button
              type="button"
              onClick={() => changeBpm(BPM_STEP)}
              disabled={bpm >= GLOBAL_BPM_RANGE[1]}
              className="w-7 h-7 flex items-center justify-center text-text-dim hover:text-text disabled:opacity-30"
              title={t('practice.faster')}
              aria-label={t('practice.faster')}
            >
              +
            </button>
          </div>
        ) : (
          <span className="text-xs text-text-dim font-mono">· {bpm} bpm</span>
        )}
      </div>

      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleDisplayMode}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-elev/80 backdrop-blur border border-border text-text-dim hover:text-text transition"
          title={`Switch to ${displayMode === 'circular' ? 'linear' : 'circular'} layout`}
          aria-label={
            displayMode === 'circular'
              ? t('practice.switch_to_linear')
              : t('practice.switch_to_circular')
          }
        >
          <DisplayModeIcon mode={displayMode} />
        </button>
        {(status === 'running' || status === 'paused') && (
          <button
            type="button"
            onClick={toggleMetronome}
            className={`w-9 h-9 flex items-center justify-center rounded-full bg-bg-elev/80 backdrop-blur border text-sm transition ${
              metronomeOn ? 'border-accent text-accent' : 'border-border text-text-dim hover:text-text'
            }`}
            title={metronomeOn ? t('practice.metronome_on') : t('practice.metronome_off')}
            aria-label={metronomeOn ? t('practice.metronome_on') : t('practice.metronome_off')}
            aria-pressed={metronomeOn}
          >
            <MetronomeIcon on={metronomeOn} />
          </button>
        )}
        {status === 'running' && (
          <button
            type="button"
            onClick={pauseNow}
            className="px-3 py-1.5 rounded-full bg-bg-elev/80 backdrop-blur text-text text-sm border border-border hover:border-border-strong transition"
            title={t('practice.pause_title')}
          >
            {t('practice.pause')}
          </button>
        )}
        <Link href="/" className="btn-ghost">
          {t('common.back')}
        </Link>
      </div>

      {(status === 'idle' || status === 'starting' || status === 'error') && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg/70 backdrop-blur-sm px-4">
          <div className="flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-bg-elev border border-border max-w-sm w-full">
            {toque.comingSoon ? (
              <>
                <h2 className="text-xl font-semibold">{toque.name}</h2>
                <p className="text-text-dim text-sm text-center">
                  {t('practice.coming_soon_body')}
                </p>
                <Link href="/" className="btn-primary">
                  {t('practice.back_home')}
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold">{t('practice.ready')}</h2>
                <p className="text-text-dim text-sm text-center">
                  {t('practice.playing_at', { toque: toque.name, bpm })}
                </p>
                <PatternPreview toque={toque} cellSize="compact" />
                <div className="flex flex-col items-stretch gap-2 w-full">
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={status === 'starting'}
                    className="px-6 py-2 rounded-full bg-accent text-bg font-semibold disabled:opacity-60"
                  >
                    {status === 'starting' ? t('practice.starting') : t('practice.start_mic')}
                  </button>
                  <button
                    type="button"
                    onClick={handleStartKeyboard}
                    disabled={status === 'starting'}
                    className="px-6 py-2 rounded-full bg-bg border border-border text-text-dim hover:text-text disabled:opacity-60"
                    title={t('practice.keyboard_mode_hint')}
                  >
                    {t('practice.try_keyboard')}
                  </button>
                </div>
                {errorMsg && <p className="text-sm text-red-400 text-center">{errorMsg}</p>}
              </>
            )}
          </div>
        </div>
      )}

      {status === 'running' && mode === 'keyboard' && (
        <KeyboardPad
          onDong={() => inputRef.current?.inject('dong')}
          onCh={() => inputRef.current?.inject('ch')}
          onDing={() => inputRef.current?.inject('ding')}
        />
      )}

      {(status === 'running' || status === 'paused') && <Legend />}

      {status === 'paused' && summary && (
        <SummaryOverlay
          summary={summary}
          onResume={resumeNow}
          onRestart={restartNow}
          onEnd={endSession}
          t={t}
        />
      )}
    </main>
  );
}

/**
 * Legend chip in the bottom-right of the practice canvas. Three rows mapping
 * each glyph to its label so the user can recall what × / ○ / ● mean
 * without leaving the screen.
 */
function Legend() {
  return (
    <div className="absolute bottom-4 right-4 hidden sm:flex flex-col gap-1.5 px-3 py-2 rounded-xl bg-bg-elev/70 backdrop-blur border border-border text-[11px] text-text-dim font-mono pointer-events-none">
      <LegendRow sound="ch" label="TCH" />
      <LegendRow sound="dong" label="DONG" />
      <LegendRow sound="ding" label="DING" />
    </div>
  );
}

function LegendRow({ sound, label }: { sound: Sound; label: string }) {
  return (
    <div className="flex items-center gap-2 leading-none">
      <SoundSymbolImported sound={sound} size={14} glow={false} />
      <span>{label}</span>
    </div>
  );
}

/** Toggle icon: shows the layout the user would switch *to*. */
function DisplayModeIcon({ mode }: { mode: DisplayMode }) {
  return (
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
      {mode === 'circular' ? (
        // currently circular → icon previews linear
        <>
          <line x1="3" y1="10" x2="17" y2="10" />
          <circle cx="6" cy="10" r="1.5" fill="currentColor" />
          <circle cx="11" cy="10" r="1.5" fill="currentColor" />
          <circle cx="15.5" cy="10" r="1.5" fill="currentColor" />
        </>
      ) : (
        // currently linear → icon previews circular
        <>
          <circle cx="10" cy="10" r="6.5" />
          <line x1="10" y1="10" x2="13" y2="6.5" />
          <circle cx="10" cy="3.5" r="0.8" fill="currentColor" />
          <circle cx="16.5" cy="10" r="0.8" fill="currentColor" />
          <circle cx="10" cy="16.5" r="0.8" fill="currentColor" />
          <circle cx="3.5" cy="10" r="0.8" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

function MetronomeIcon({ on }: { on: boolean }) {
  return (
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
      {/* Classic mechanical-metronome silhouette: trapezoid body + pendulum */}
      <path d="M6 17 L14 17 L12 4 L8 4 Z" />
      <line x1="10" y1="17" x2={on ? 13 : 10} y2="6" />
      {!on && <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" />}
    </svg>
  );
}

/**
 * On-screen triggers for keyboard mode — the same 1/2/3 keys as buttons so
 * touch devices (phones, iPads, kiosks) can use the trainer without a
 * physical keyboard. Tappable with mouse or finger; shows the key label
 * in a corner for discoverability.
 */
function KeyboardPad({
  onDong,
  onCh,
  onDing,
}: {
  onDong: () => void;
  onCh: () => void;
  onDing: () => void;
}) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-stretch gap-2">
      <PadButton label="1" color={SOUND_COLORS.dong} name="DONG" onPress={onDong} />
      <PadButton label="2" color={SOUND_COLORS.ch} name="TCH" onPress={onCh} />
      <PadButton label="3" color={SOUND_COLORS.ding} name="DING" onPress={onDing} />
    </div>
  );
}

function PadButton({
  label,
  color,
  name,
  onPress,
}: {
  label: string;
  color: string;
  name: string;
  onPress: () => void;
}) {
  // Fire on pointerdown (not click) so latency matches keyboard injection:
  // we want the beat timestamp to be as close to the user's intent as
  // possible. preventDefault stops a trailing mouse click from double-firing.
  const handler = (e: React.PointerEvent) => {
    e.preventDefault();
    onPress();
  };
  return (
    <button
      type="button"
      onPointerDown={handler}
      onClick={(e) => e.preventDefault()}
      className="relative min-w-[80px] px-4 pt-4 pb-2 rounded-xl bg-bg-elev/85 backdrop-blur border border-border text-bg font-bold tracking-wider text-sm flex flex-col items-center gap-0.5 active:scale-95 transition"
      style={{
        color: '#0b0f1a',
        background: `linear-gradient(180deg, ${color} 0%, ${color}dd 100%)`,
        boxShadow: `0 10px 28px -14px ${color}aa`,
      }}
    >
      <span className="text-[10px] font-mono absolute top-1.5 left-2 opacity-70">
        {label}
      </span>
      <span>{name}</span>
    </button>
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

/**
 * Linear timeline — beats sweep right→left toward a fixed hit line at
 * x = 0.25 W. Three lanes (DING / TCH / DONG). Detected mic notes plot
 * just below the lane centre so they don't collide with the targets.
 */
function paintLinear(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scheduler: ToqueScheduler | null,
  renderNow: number,
  outcomes: Map<number, BeatResult & { at: number }>,
) {
  const hitX = Math.round(w * 0.25);
  const pxPerSec = (w - hitX) / LEAD_SECONDS;
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

  if (scheduler) {
    const beats = scheduler.beatsInWindow(renderNow - 0.3, renderNow + LEAD_SECONDS);
    for (const beat of beats) {
      const x = hitX + (beat.beatTime - renderNow) * pxPerSec;
      if (x < -40 || x > w + 40) continue;
      drawTarget(ctx, beat, x, laneY(beat.sound), outcomes.get(beat.id));
    }
  }

  const notes = audioBus.recentNotes;
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i]!;
    const x = hitX + (note.timestamp - renderNow) * pxPerSec;
    if (x < -40 || x > w + 40) continue;
    drawDetectedNote(
      ctx,
      note,
      x,
      laneY(note.soundClass === 'unknown' ? 'ch' : (note.soundClass as Sound)),
    );
  }
}

/**
 * Circular timeline — fixed pattern, rotating sweep hand. The cycle wraps
 * once per cycleSeconds. Beats sit at fixed angles; the orange hand
 * passes each one at exactly the right moment. Detected mic notes plot
 * inside the ring at their detection angle.
 */
function paintCircular(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scheduler: ToqueScheduler,
  renderNow: number,
  outcomes: Map<number, BeatResult & { at: number }>,
  firstBeatAt: number,
) {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.36;
  const cycleSeconds = scheduler.cycleSeconds;
  if (cycleSeconds <= 0) return;
  const intervalLen = scheduler['options'].toque.intervals.length;
  const slotCount = intervalLen * 2;

  // Background ring
  ctx.strokeStyle = '#1a2135';
  ctx.lineWidth = radius * 0.16;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Tolerance band painted along the entire ring (thin glow). Distinct
  // arcs at each beat would be more accurate but harder to read; this
  // hint communicates "inside-the-ring is the hit zone."
  ctx.strokeStyle = 'rgba(255,138,61,0.07)';
  ctx.lineWidth = radius * 0.16;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Slot dividers — every eighth-note position. Downbeats stronger.
  for (let i = 0; i < slotCount; i++) {
    const angle = (i / slotCount) * Math.PI * 2 - Math.PI / 2;
    const r1 = radius - radius * 0.1;
    const r2 = radius + radius * 0.1;
    ctx.strokeStyle = i % 2 === 0 ? '#2a3556' : '#1f2740';
    ctx.lineWidth = i % 2 === 0 ? 1.2 : 0.6;
    ctx.beginPath();
    ctx.moveTo(cx + r1 * Math.cos(angle), cy + r1 * Math.sin(angle));
    ctx.lineTo(cx + r2 * Math.cos(angle), cy + r2 * Math.sin(angle));
    ctx.stroke();
  }

  // Pick the cycle to render — clamp to 0 during count-in so the user
  // sees the upcoming pattern before the first beat fires.
  const cycleIndex = Math.max(
    0,
    Math.floor((renderNow - firstBeatAt) / cycleSeconds),
  );
  const cycleStart = firstBeatAt + cycleIndex * cycleSeconds;
  const cycleBeats = scheduler.beatsInWindow(
    cycleStart - 0.001,
    cycleStart + cycleSeconds - 0.001,
  );

  // Target glyphs around the ring
  for (const beat of cycleBeats) {
    const tInCycle = beat.beatTime - cycleStart;
    const angle = (tInCycle / cycleSeconds) * Math.PI * 2 - Math.PI / 2;
    const bx = cx + radius * Math.cos(angle);
    const by = cy + radius * Math.sin(angle);
    drawTarget(ctx, beat, bx, by, outcomes.get(beat.id));
  }

  // Detected notes — plot inside the ring at the angle they were heard.
  const innerR = radius - radius * 0.32;
  const notes = audioBus.recentNotes;
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i]!;
    const tSinceCycleStart = note.timestamp - cycleStart;
    if (tSinceCycleStart < -0.2 || tSinceCycleStart > cycleSeconds + 0.05) continue;
    const angle = (tSinceCycleStart / cycleSeconds) * Math.PI * 2 - Math.PI / 2;
    const dx = cx + innerR * Math.cos(angle);
    const dy = cy + innerR * Math.sin(angle);
    drawDetectedNoteCircular(ctx, note, dx, dy);
  }

  // Sweep hand — only after the first beat is reachable. During count-in
  // the pattern shows but the hand is hidden so it isn't crashing through
  // a 12 o'clock seam.
  if (renderNow >= firstBeatAt) {
    const tInCycle =
      ((renderNow - cycleStart) % cycleSeconds + cycleSeconds) % cycleSeconds;
    const sweepAngle = (tInCycle / cycleSeconds) * Math.PI * 2 - Math.PI / 2;

    // Comet trail — short, fading
    for (let i = 8; i > 0; i--) {
      const dt = (0.35 * i) / 8;
      const a = sweepAngle - (dt / cycleSeconds) * Math.PI * 2;
      const tx = cx + radius * Math.cos(a);
      const ty = cy + radius * Math.sin(a);
      ctx.globalAlpha = (1 - i / 8) * 0.35;
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath();
      ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const hx = cx + radius * Math.cos(sweepAngle);
    const hy = cy + radius * Math.sin(sweepAngle);
    ctx.strokeStyle = '#ff8a3d';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(hx, hy);
    ctx.stroke();

    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.arc(hx, hy, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Center pivot
  ctx.fillStyle = '#2a3556';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawDetectedNoteCircular(
  ctx: CanvasRenderingContext2D,
  note: DetectedNote,
  x: number,
  y: number,
) {
  const sound = note.soundClass;
  const color = sound === 'unknown' ? '#8a93b0' : SOUND_COLORS[sound as Sound];
  const r = 4 + note.amplitude * 5;
  ctx.globalAlpha = note.isMistake ? 0.3 : 0.55;
  if (sound === 'unknown') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawSoundGlyph(ctx, sound as Sound, x, y, r, color);
  }
  ctx.globalAlpha = 1;
}

function drawTarget(
  ctx: CanvasRenderingContext2D,
  beat: TargetBeat,
  x: number,
  y: number,
  outcome: (BeatResult & { at: number }) | undefined,
) {
  const color = SOUND_COLORS[beat.sound];
  // Constant size — accent still drives metronome pitch but shouldn't make
  // the offbeat tch in a tch_tch pair look smaller than the downbeat one.
  const r = 16;
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

  ctx.globalAlpha = outcome ? 0.4 : 1;
  drawSoundGlyph(ctx, beat.sound, x, y, r, color);
  ctx.globalAlpha = 1;
}

/**
 * Three glyphs encode the berimbau's sound classes:
 *   ×  TCH  — chiado (coin muting the string)
 *   ○  DONG — open string
 *   ●  DING — closed string ("painted in the middle")
 *
 * Drawn at the centre (x, y) with effective radius r, in the sound's
 * colour. Stroke widths scale with r so accents read at a glance.
 */
function drawSoundGlyph(
  ctx: CanvasRenderingContext2D,
  sound: Sound,
  x: number,
  y: number,
  r: number,
  color: string,
) {
  ctx.lineCap = 'round';
  if (sound === 'ch') {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2.5, r * 0.22);
    const k = r * 0.78;
    ctx.beginPath();
    ctx.moveTo(x - k, y - k);
    ctx.lineTo(x + k, y + k);
    ctx.moveTo(x + k, y - k);
    ctx.lineTo(x - k, y + k);
    ctx.stroke();
  } else if (sound === 'dong') {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2.5, r * 0.2);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // ding — filled disc with a slight rim to make it distinct from a
    // dimmed dong at low contrast.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDetectedNote(
  ctx: CanvasRenderingContext2D,
  note: DetectedNote,
  x: number,
  y: number,
) {
  const sound = note.soundClass;
  const color = sound === 'unknown' ? '#8a93b0' : SOUND_COLORS[sound as Sound];
  const r = 6 + note.amplitude * 8;

  ctx.globalAlpha = note.isMistake ? 0.35 : 0.7;
  if (sound === 'unknown') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y + 32, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawSoundGlyph(ctx, sound as Sound, x, y + 32, r, color);
  }
  ctx.globalAlpha = 1;
}

/**
 * Pre-first-beat countdown overlay. Shows the integer ceiling of the
 * seconds remaining, fading in over the trailing 0.4 s of each digit so
 * 2 → 1 doesn't feel like a hard cut.
 */
function drawCountIn(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  untilStart: number,
) {
  const label = Math.ceil(untilStart).toString();
  const frac = untilStart - Math.floor(untilStart); // 0 .. 1, where 0 = "digit just appeared"
  const alpha = Math.min(0.9, 0.35 + frac * 0.6);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 120px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#141a2a';
  ctx.fillText(label, w / 2 + 3, h / 2 + 3);
  ctx.fillStyle = '#ff8a3d';
  ctx.fillText(label, w / 2, h / 2);
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#8a93b0';
  ctx.fillText('GET READY', w / 2, h / 2 + 78);
  ctx.restore();
}

/** "GO" flash for the first ~0.6 s after the first beat lands. */
function drawGo(ctx: CanvasRenderingContext2D, w: number, h: number, untilStart: number) {
  const age = -untilStart; // 0 at start, grows
  const alpha = Math.max(0, 1 - age / 0.5);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 64px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#64f08c';
  ctx.fillText('GO', w / 2, h / 2);
  ctx.restore();
}

/**
 * HUD layout (no FPS, no duplicated BPM):
 *
 *   - Circular mode: accuracy % is centered inside the ring; outcome bar
 *     sits at the bottom-left.
 *   - Linear mode:   accuracy + caption + outcome bar all stacked at
 *     bottom-left.
 *   - PAUSED tag (when paused) flashes top-right just below the toolbar.
 */
function drawHUD(
  ctx: CanvasRenderingContext2D,
  scoring: ScoringEngine,
  w: number,
  h: number,
  paused: boolean,
  displayMode: DisplayMode,
) {
  const accuracy = scoring.rollingAccuracy(20);
  const recent = scoring.beatResults.slice(-30);
  const counts: Record<Outcome, number> = {
    perfect: 0,
    good: 0,
    wrong_sound: 0,
    late_correct: 0,
    late_wrong: 0,
    miss: 0,
    mistake: 0,
  };
  for (const r of recent) counts[r.outcome]++;

  if (paused) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff8a3d';
    ctx.font = 'bold 11px ui-monospace, Consolas, monospace';
    ctx.fillText('PAUSED', w - 16, h - 16);
    ctx.textAlign = 'start';
  }

  // Accuracy readout — centered in circular mode, bottom-left in linear.
  if (displayMode === 'circular') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e6e8f0';
    ctx.font = 'bold 36px ui-monospace, Consolas, monospace';
    ctx.fillText(`${Math.round(accuracy * 100)}%`, w / 2, h / 2);
    ctx.font = '10px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#8a93b0';
    ctx.fillText('accuracy', w / 2, h / 2 + 24);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  } else {
    ctx.fillStyle = '#e6e8f0';
    ctx.font = 'bold 28px ui-monospace, Consolas, monospace';
    ctx.fillText(`${Math.round(accuracy * 100)}%`, 16, h - 56);
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#8a93b0';
    ctx.fillText('accuracy (last 20)', 16, h - 40);
  }

  // Outcome bar — bottom-left, same in both modes.
  const hudLabels: Record<Outcome, string> = {
    perfect: 'P',
    good: 'G',
    wrong_sound: 'W',
    late_correct: 'L+',
    late_wrong: 'L-',
    miss: 'M',
    mistake: '!',
  };
  let x = 16;
  const barY = h - 24;
  ctx.font = '10px ui-monospace, Consolas, monospace';
  for (const key of OUTCOME_ORDER) {
    const n = counts[key];
    ctx.fillStyle = n === 0 ? '#2a3048' : OUTCOME_COLORS[key];
    ctx.fillRect(x, barY, 18, 4);
    ctx.fillStyle = '#8a93b0';
    ctx.fillText(`${hudLabels[key]}${n > 0 ? n : ''}`, x, barY + 14);
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
    late_correct: 0,
    late_wrong: 0,
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
  t,
}: {
  summary: SessionSummary;
  onResume: () => void;
  onRestart: () => void;
  onEnd: () => void;
  t: TFn;
}) {
  const minutes = Math.floor(summary.elapsedSec / 60);
  const seconds = Math.floor(summary.elapsedSec % 60);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg/75 backdrop-blur-sm px-4">
      <div className="flex flex-col gap-5 px-6 py-6 rounded-2xl bg-bg-elev border border-border w-full max-w-md">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">{t('practice.summary_paused')}</h2>
          <span className="text-xs text-text-dim font-mono">
            {t('practice.summary_active', {
              minutes,
              seconds: String(seconds).padStart(2, '0'),
            })}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label={t('practice.summary_accuracy')} value={`${Math.round(summary.accuracy * 100)}%`} />
          <Stat label={t('practice.summary_beats')} value={String(summary.totalScoredBeats)} />
          <Stat label={t('practice.summary_best_streak')} value={String(summary.bestStreak)} />
        </div>

        <OutcomeBreakdown counts={summary.outcomeCounts} t={t} />
        <PerSoundBreakdown perSound={summary.perSound} t={t} />

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={onResume}
            className="flex-1 px-4 py-2 rounded-full bg-accent text-bg font-semibold"
          >
            {t('practice.resume')}
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="flex-1 px-4 py-2 rounded-full bg-bg border border-border text-text"
          >
            {t('practice.restart')}
          </button>
          <button
            type="button"
            onClick={onEnd}
            className="flex-1 px-4 py-2 rounded-full bg-bg border border-border text-text-dim"
          >
            {t('practice.end_session')}
          </button>
        </div>
        <p className="text-[10px] text-text-dim text-center -mt-2">
          {t('practice.summary_resume_hint')}
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

function OutcomeBreakdown({ counts, t }: { counts: Record<Outcome, number>; t: TFn }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <p className="text-xs text-text-dim text-center">
        {t('practice.summary_no_beats')}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex w-full h-2 rounded-full overflow-hidden bg-bg border border-border">
        {OUTCOME_ORDER.map((key) => {
          const n = counts[key];
          if (n === 0) return null;
          const pct = (n / total) * 100;
          return (
            <div
              key={key}
              style={{ width: `${pct}%`, background: OUTCOME_COLORS[key] }}
              title={`${t(OUTCOME_KEYS[key])}: ${n}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
        {OUTCOME_ORDER.map((key) => (
          <div key={key} className="flex items-center gap-1.5 text-text-dim">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: OUTCOME_COLORS[key] }}
            />
            <span>{t(OUTCOME_KEYS[key])}</span>
            <span className="ml-auto font-mono text-text">{counts[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerSoundBreakdown({
  perSound,
  t,
}: {
  perSound: Record<'dong' | 'ch' | 'ding', number | null>;
  t: TFn;
}) {
  const rows: Array<'dong' | 'ch' | 'ding'> = ['dong', 'ch', 'ding'];
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-text-dim">
        {t('practice.summary_per_sound')}
      </span>
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
