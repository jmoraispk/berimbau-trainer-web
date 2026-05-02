import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { AudioInput } from '@/audio/AudioInput';
import { audioBus, type RawCapture } from '@/audio/AudioBus';
import { SOUND_COLORS, SOUND_LABELS } from '@/engine/rhythms';
import { SoundSymbol } from '@/components/SoundSymbol';
import { extractFeatures } from '@/engine/features';
import {
  computeProfiles,
  type CalibrationSample,
  type SavedCalibration,
} from '@/engine/calibration';
import type { ClassifiableSound } from '@/engine/profiles';
import { saveProfile } from '@/storage/profiles-store';
import { setActiveProfiles } from '@/audio/active-profiles';
import { useI18n, type TFn } from '@/i18n';

/**
 * Three-stage guided calibration: TCH → DONG → DING.
 *
 * A circular cue paces the user (3-second cycle: ~2s prep ramp, ~0.4s
 * strike pulse, ~0.6s decay). Each captured strike becomes a sample with
 * a waveform thumbnail; click to play it back, × to discard.
 *
 * Tiers: 3 captured = good, 5 = great, 7+ = perfect. Skip-after-3 is the
 * escape hatch when the cluster looks tight already.
 *
 * Subscribes to audioBus.subscribeRawCapture (the worklet's longer
 * 'onsetFull' message — 50 ms pre + 450 ms post-onset) so we have raw PCM
 * for thumbnails and playback. Live Practice uses the lower-latency
 * 'onsetQuick' message and never sees these.
 */

const STAGES: ClassifiableSound[] = ['ch', 'dong', 'ding'];
const MIN_SAMPLES_PER_CLASS = 3;
const TIER_GOOD = 3;
const TIER_GREAT = 5;
const TIER_PERFECT = 7;
const CYCLE_SEC = 3;
const PREP_SEC = 2;
const STRIKE_SEC = 0.4;
// Classifier window: 150 ms (20 ms pre + 130 ms post-onset) — same as
// the live worklet's 'onsetQuick' message, so calibration profiles
// describe exactly what Practice sees. Long enough for stable
// autocorrelation f0 across the berimbau's typical 80–250 Hz range.
const CLASSIFIER_PRE_SEC = 0.02;
const CLASSIFIER_TOTAL_SEC = 0.15;

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'recording'; stage: number }
  | { kind: 'review' }
  | { kind: 'saving' }
  | { kind: 'saved'; savedAt: number }
  | { kind: 'error'; message: string };

export function Calibrate() {
  const [, navigate] = useLocation();
  const { t } = useI18n();
  const inputRef = useRef<AudioInput | null>(null);
  const lastSeenTsRef = useRef(-Infinity);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [samples, setSamples] = useState<CalibrationSample[]>([]);

  const byClass = useMemo(() => {
    const counts: Record<ClassifiableSound, number> = { dong: 0, ch: 0, ding: 0 };
    for (const s of samples) counts[s.sound] += 1;
    return counts;
  }, [samples]);

  const activeSound: ClassifiableSound | null =
    phase.kind === 'recording' ? STAGES[phase.stage] ?? null : null;

  // Subscribe to raw 'full' captures while a stage is active. Each capture
  // is tagged with the active stage's sound (we ignore the live classifier
  // — calibration is the source of truth, not the consumer).
  useEffect(() => {
    if (!activeSound) return;
    const unsub = audioBus.subscribeRawCapture((capture: RawCapture) => {
      if (capture.timestamp <= lastSeenTsRef.current) return;
      lastSeenTsRef.current = capture.timestamp;
      // Reject dead-silent onsets that slip through the worklet threshold.
      if (capture.rms < 0.02) return;

      const features = extractClassifierFeatures(capture);
      setSamples((prev) => [
        ...prev,
        {
          sound: activeSound,
          f0: features.f0,
          centroid: features.centroid,
          rms: capture.rms,
          at: capture.timestamp,
          segment: capture.segment,
          sampleRate: capture.sampleRate,
          preSec: capture.preSec,
        },
      ]);
    });
    return unsub;
  }, [activeSound]);

  useEffect(() => {
    return () => {
      void inputRef.current?.stop();
      inputRef.current = null;
    };
  }, []);

  const handleStartMic = async () => {
    if (phase.kind !== 'idle' && phase.kind !== 'error') return;
    setPhase({ kind: 'starting' });
    try {
      const input = new AudioInput();
      await input.start();
      inputRef.current = input;
      lastSeenTsRef.current = input.now();
      setSamples([]);
      setPhase({ kind: 'recording', stage: 0 });
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const advanceStage = () => {
    if (phase.kind !== 'recording') return;
    if (phase.stage < STAGES.length - 1) {
      setPhase({ kind: 'recording', stage: phase.stage + 1 });
    } else {
      setPhase({ kind: 'review' });
    }
  };

  const handleRestart = () => {
    setSamples([]);
    setPhase({ kind: 'recording', stage: 0 });
  };

  const handleDiscardSample = (at: number) => {
    setSamples((prev) => prev.filter((s) => s.at !== at));
  };

  const handlePlaySample = (sample: CalibrationSample) => {
    const ctx = inputRef.current?.audioContext;
    if (!ctx || !sample.segment || !sample.sampleRate) return;
    try {
      const buffer = ctx.createBuffer(1, sample.segment.length, sample.sampleRate);
      // copyToChannel's type sig is fussy about ArrayBuffer-vs-ArrayBufferLike;
      // copy via getChannelData to avoid the cast dance.
      const channel = buffer.getChannelData(0);
      channel.set(sample.segment);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 1.6;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch (err) {
      console.warn('[calibrate] playback failed', err);
    }
  };

  const handleSave = async () => {
    setPhase({ kind: 'saving' });
    const profiles = computeProfiles(samples);
    const saved: SavedCalibration = {
      version: 1,
      savedAt: Date.now(),
      profiles,
      sampleCount: { ...byClass },
    };
    const ok = await saveProfile(saved);
    if (ok) {
      setActiveProfiles(saved);
      setPhase({ kind: 'saved', savedAt: saved.savedAt });
    } else setPhase({ kind: 'error', message: t('calibrate.error_save') });
  };

  return (
    <main className="min-h-full flex flex-col items-center px-6 py-10 gap-6 max-w-3xl mx-auto">
      <header className="flex flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('calibrate.title')}</h1>
        <p className="text-text-dim text-sm text-center max-w-md">{t('calibrate.tagline')}</p>
      </header>

      {phase.kind === 'idle' && <Idle onStart={handleStartMic} t={t} />}
      {phase.kind === 'starting' && (
        <p className="text-text-dim">{t('calibrate.starting_mic')}</p>
      )}

      {phase.kind === 'recording' && activeSound && (
        <>
          <RecordingPanel
            activeSound={activeSound}
            samples={samples.filter((s) => s.sound === activeSound)}
            onPlay={handlePlaySample}
            onDiscard={handleDiscardSample}
            t={t}
          />
          <StageStrip byClass={byClass} activeStage={phase.stage} />
          <RecordingActions
            stageCount={byClass[activeSound]}
            isLastStage={phase.stage === STAGES.length - 1}
            onAdvance={advanceStage}
            t={t}
          />
        </>
      )}

      {phase.kind === 'review' && (
        <ReviewPanel
          samples={samples}
          byClass={byClass}
          onPlay={handlePlaySample}
          onDiscard={handleDiscardSample}
          onRestart={handleRestart}
          onSave={handleSave}
          t={t}
        />
      )}

      {phase.kind === 'saving' && <p className="text-text-dim">{t('calibrate.saving')}</p>}

      {phase.kind === 'saved' && (
        <Saved onHome={() => navigate('/')} onRestart={handleRestart} t={t} />
      )}

      {phase.kind === 'error' && (
        <div className="card flex flex-col items-center gap-3 px-6 py-4">
          <p className="text-red-400 text-sm">{phase.message}</p>
          <button type="button" onClick={handleStartMic} className="btn-primary">
            {t('common.try_again')}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/')}
        className="mt-2 text-xs text-text-dim underline"
      >
        {t('calibrate.cancel_return')}
      </button>
    </main>
  );
}

// ─── Recording panel ─────────────────────────────────────────────────────

function RecordingPanel({
  activeSound,
  samples,
  onPlay,
  onDiscard,
  t,
}: {
  activeSound: ClassifiableSound;
  samples: CalibrationSample[];
  onPlay: (sample: CalibrationSample) => void;
  onDiscard: (at: number) => void;
  t: TFn;
}) {
  return (
    <div className="w-full grid md:grid-cols-[auto_1fr] gap-6 items-start">
      <div className="flex justify-center md:justify-start">
        <CycleRing sound={activeSound} t={t} />
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
            {t('calibrate.captured', { sound: SOUND_LABELS[activeSound] })}
          </span>
          <TierBadge count={samples.length} t={t} />
        </div>
        <SampleGrid samples={samples} onPlay={onPlay} onDiscard={onDiscard} t={t} />
      </div>
    </div>
  );
}

function RecordingActions({
  stageCount,
  isLastStage,
  onAdvance,
  t,
}: {
  stageCount: number;
  isLastStage: boolean;
  onAdvance: () => void;
  t: TFn;
}) {
  const canAdvance = stageCount >= MIN_SAMPLES_PER_CLASS;
  const label = isLastStage ? t('calibrate.finish_review') : t('calibrate.next_sound');
  return (
    <button
      type="button"
      onClick={onAdvance}
      disabled={!canAdvance}
      className="btn-primary px-8 py-2.5 disabled:opacity-50"
    >
      {label}{' '}
      <span className="text-bg/70 font-mono text-xs ml-1.5">
        ({stageCount}/{MIN_SAMPLES_PER_CLASS}+)
      </span>
    </button>
  );
}

// ─── Cycle ring ──────────────────────────────────────────────────────────

/**
 * Circular pacing cue. The orange stroke fills clockwise over the prep
 * window (~2 s), then the whole ring flashes accent during the strike
 * window (~0.4 s), then dims for the decay (~0.6 s) before resetting.
 *
 * Animated via rAF — single SVG re-render per frame. Cheap.
 */
function CycleRing({ sound, t }: { sound: ClassifiableSound; t: TFn }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = ((now - start) / 1000) % CYCLE_SEC;
      setPhase(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Three-segment envelope:
  //   [0, PREP)            — fill ramps 0→1
  //   [PREP, PREP+STRIKE)  — full bright pulse
  //   [PREP+STRIKE, CYCLE) — decay 1→0
  let fill: number;
  let strike = false;
  if (phase < PREP_SEC) {
    fill = phase / PREP_SEC;
  } else if (phase < PREP_SEC + STRIKE_SEC) {
    fill = 1;
    strike = true;
  } else {
    fill = Math.max(0, 1 - (phase - PREP_SEC - STRIKE_SEC) / (CYCLE_SEC - PREP_SEC - STRIKE_SEC));
  }

  const SIZE = 200;
  const STROKE = 8;
  const r = SIZE / 2 - STROKE - 6;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - fill);
  const color = SOUND_COLORS[sound];

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0"
      >
        {/* Background ring */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          stroke="#1a2135"
          strokeWidth={STROKE}
          fill="none"
        />
        {/* Strike-window glow halo */}
        {strike && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            stroke={color}
            strokeWidth={STROKE * 2}
            fill="none"
            opacity={0.25}
          />
        )}
        {/* Progress fill (rotates clockwise) */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          stroke={strike ? color : '#ff8a3d'}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: 'stroke 80ms linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
        <SoundSymbol sound={sound} size={64} />
        <span className="text-xs font-semibold tracking-[0.2em] text-text-dim">
          {strike ? t('calibrate.cue_play') : t('calibrate.cue_get_ready')}
        </span>
      </div>
    </div>
  );
}

// ─── Samples ─────────────────────────────────────────────────────────────

function SampleGrid({
  samples,
  onPlay,
  onDiscard,
  t,
}: {
  samples: CalibrationSample[];
  onPlay: (sample: CalibrationSample) => void;
  onDiscard: (at: number) => void;
  t: TFn;
}) {
  if (samples.length === 0) {
    return (
      <div className="card flex items-center justify-center min-h-[80px] text-xs text-text-dim">
        {t('calibrate.empty')}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 gap-2">
      {samples.map((s) => (
        <SampleThumbnail
          key={s.at}
          sample={s}
          onPlay={() => onPlay(s)}
          onDiscard={() => onDiscard(s.at)}
          t={t}
        />
      ))}
    </div>
  );
}

function SampleThumbnail({
  sample,
  onPlay,
  onDiscard,
  t,
}: {
  sample: CalibrationSample;
  onPlay: () => void;
  onDiscard: () => void;
  t: TFn;
}) {
  const path = useMemo(() => {
    if (!sample.segment) return '';
    return waveformPath(sample.segment, 100, 36);
  }, [sample.segment]);
  const onsetX = sample.segment && sample.preSec != null && sample.sampleRate != null
    ? (sample.preSec * sample.sampleRate) / sample.segment.length * 100
    : null;
  const color = SOUND_COLORS[sample.sound];

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onPlay}
        className="w-full block rounded-md bg-bg border border-border hover:border-accent transition overflow-hidden"
        title={t('calibrate.thumbnail_title', {
          f0: sample.f0.toFixed(0),
          centroid: sample.centroid.toFixed(0),
        })}
      >
        <svg viewBox="0 0 100 36" className="block w-full h-9">
          {onsetX != null && (
            <line x1={onsetX} y1={0} x2={onsetX} y2={36} stroke="#ff8a3d" strokeWidth={0.5} opacity={0.4} />
          )}
          <path d={path} stroke={color} strokeWidth={1} fill="none" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onDiscard}
        title={t('calibrate.discard_title')}
        aria-label={t('calibrate.discard_aria')}
        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-bg-elev border border-border text-text-dim hover:text-red-400 hover:border-red-400/60 flex items-center justify-center text-[10px] leading-none transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

function waveformPath(segment: Float32Array, w: number, h: number, points = 120): string {
  if (segment.length === 0) return '';
  const stride = Math.max(1, Math.floor(segment.length / points));
  const yMid = h / 2;
  // Find peak so we can normalise — quiet captures still read.
  let peak = 0;
  for (let i = 0; i < segment.length; i += stride) {
    const v = Math.abs(segment[i]!);
    if (v > peak) peak = v;
  }
  const scale = peak > 0 ? (h * 0.45) / peak : 0;
  let d = '';
  for (let i = 0, j = 0; i < segment.length; i += stride, j++) {
    const x = (i / segment.length) * w;
    const y = yMid - segment[i]! * scale;
    d += (j === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  return d;
}

function extractClassifierFeatures(capture: RawCapture): { f0: number; centroid: number } {
  const sr = capture.sampleRate;
  // Match Practice's 'onsetQuick' window: 20 ms pre + 80 ms post.
  const startSec = Math.max(0, capture.preSec - CLASSIFIER_PRE_SEC);
  const startSample = Math.floor(startSec * sr);
  const winSamples = Math.floor(CLASSIFIER_TOTAL_SEC * sr);
  const endSample = Math.min(capture.segment.length, startSample + winSamples);
  const window = capture.segment.subarray(startSample, endSample);
  const features = extractFeatures(window, sr);
  return { f0: features.f0, centroid: features.centroid };
}

// ─── Tier badge ──────────────────────────────────────────────────────────

function TierBadge({ count, t }: { count: number; t: TFn }) {
  const tier =
    count >= TIER_PERFECT
      ? { label: t('calibrate.perfect'), color: '#64f08c' }
      : count >= TIER_GREAT
      ? { label: t('calibrate.great'), color: '#a7e87a' }
      : count >= TIER_GOOD
      ? { label: t('calibrate.good'), color: '#f2b640' }
      : null;
  if (!tier) {
    return (
      <span className="text-[10px] font-mono text-text-dim">
        {t('calibrate.need_more', {
          count,
          min: TIER_GOOD,
          n: TIER_GOOD - count,
        })}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-mono">
      <span className="text-text-dim">{count} · </span>
      <span style={{ color: tier.color }}>{tier.label}</span>
    </span>
  );
}

// ─── Stage strip ─────────────────────────────────────────────────────────

function StageStrip({
  byClass,
  activeStage,
}: {
  byClass: Record<ClassifiableSound, number>;
  activeStage: number;
}) {
  return (
    <div className="w-full flex gap-3">
      {STAGES.map((sound, i) => {
        const isActive = i === activeStage;
        const isDone = i < activeStage;
        const count = byClass[sound];
        return (
          <div
            key={sound}
            className={`card flex-1 flex flex-col items-center gap-1.5 px-3 py-2.5 transition ${
              isActive ? 'border-accent shadow-[0_6px_24px_-12px_rgba(255,138,61,0.5)]' : isDone ? 'opacity-70' : 'opacity-50'
            }`}
          >
            <SoundSymbol sound={sound} size={20} glow={false} />
            <span className="text-[11px] font-medium tracking-wider">
              {SOUND_LABELS[sound]}
            </span>
            <span className="text-[10px] text-text-dim font-mono">
              {count} sample{count === 1 ? '' : 's'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Idle / Review / Saved ───────────────────────────────────────────────

function Idle({ onStart, t }: { onStart: () => void; t: TFn }) {
  return (
    <div className="flex flex-col items-center gap-4 card px-6 py-5 max-w-md text-center">
      <p className="text-text-dim text-sm">{t('calibrate.idle_body')}</p>
      <button type="button" onClick={onStart} className="btn-primary">
        {t('calibrate.open_mic')}
      </button>
    </div>
  );
}

function ReviewPanel({
  samples,
  byClass,
  onPlay,
  onDiscard,
  onRestart,
  onSave,
  t,
}: {
  samples: CalibrationSample[];
  byClass: Record<ClassifiableSound, number>;
  onPlay: (sample: CalibrationSample) => void;
  onDiscard: (at: number) => void;
  onRestart: () => void;
  onSave: () => void;
  t: TFn;
}) {
  const canSave = STAGES.every((s) => byClass[s] >= MIN_SAMPLES_PER_CLASS);
  return (
    <div className="w-full flex flex-col gap-5">
      <p className="text-text-dim text-sm text-center">
        {t('calibrate.review_summary', { n: samples.length, m: STAGES.length })}
      </p>
      <div className="flex flex-col gap-4">
        {STAGES.map((sound) => {
          const stageSamples = samples.filter((s) => s.sound === sound);
          return (
            <div key={sound} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <SoundSymbol sound={sound} size={20} glow={false} />
                  {SOUND_LABELS[sound]}
                </span>
                <TierBadge count={stageSamples.length} t={t} />
              </div>
              <SampleGrid samples={stageSamples} onPlay={onPlay} onDiscard={onDiscard} t={t} />
            </div>
          );
        })}
      </div>
      <Scatter samples={samples} />
      <div className="flex justify-center gap-3">
        <button type="button" onClick={onRestart} className="btn-secondary">
          {t('calibrate.review_restart')}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="btn-primary disabled:opacity-50"
          title={
            canSave
              ? t('calibrate.review_save')
              : t('calibrate.review_save_disabled', { n: MIN_SAMPLES_PER_CLASS })
          }
        >
          {t('calibrate.review_save')}
        </button>
      </div>
    </div>
  );
}

function Saved({
  onHome,
  onRestart,
  t,
}: {
  onHome: () => void;
  onRestart: () => void;
  t: TFn;
}) {
  return (
    <div className="flex flex-col items-center gap-4 card px-6 py-5 max-w-md text-center">
      <p className="text-text">{t('calibrate.saved')}</p>
      <p className="text-text-dim text-sm">{t('calibrate.saved_body')}</p>
      <div className="flex gap-3">
        <button type="button" onClick={onRestart} className="btn-secondary">
          {t('home.recalibrate')}
        </button>
        <button type="button" onClick={onHome} className="btn-primary">
          {t('practice.back_home')}
        </button>
      </div>
    </div>
  );
}

/**
 * Tiny feature-space scatter for the review screen — same axes as the
 * classifier (X = centroid, Y = f0). Helps spot stragglers before saving.
 */
function Scatter({ samples }: { samples: CalibrationSample[] }) {
  const W = 360;
  const H = 160;
  const padding = 24;
  const xMin = 0;
  const xMax = 4000;
  const yMin = 0;
  const yMax = 500;
  const fx = (v: number) => padding + ((v - xMin) / (xMax - xMin)) * (W - padding * 2);
  const fy = (v: number) => H - padding - ((v - yMin) / (yMax - yMin)) * (H - padding * 2);

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="bg-bg-elev border border-border rounded-xl"
    >
      <line x1={padding} y1={H - padding} x2={W - padding} y2={H - padding} stroke="#2a3048" />
      <line x1={padding} y1={padding} x2={padding} y2={H - padding} stroke="#2a3048" />
      <text x={W - padding} y={H - 6} textAnchor="end" fontSize="9" fill="#8a93b0">
        centroid Hz
      </text>
      <text x={6} y={padding - 6} fontSize="9" fill="#8a93b0">
        f0 Hz
      </text>
      {samples.map((s, i) => (
        <circle
          key={i}
          cx={fx(s.centroid)}
          cy={fy(s.f0)}
          r={4}
          fill={SOUND_COLORS[s.sound]}
          opacity={0.85}
        />
      ))}
    </svg>
  );
}
