import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { AudioInput, type OnsetParamKey } from '@/audio/AudioInput';
import { audioBus } from '@/audio/AudioBus';
import {
  getActiveProfiles,
  setActiveProfiles,
} from '@/audio/active-profiles';
import { extractFeatures } from '@/engine/features';
import { classify } from '@/engine/classifier';
import { computeProfiles, type CalibrationSample, type SavedCalibration } from '@/engine/calibration';
import type { ClassifiableSound } from '@/engine/profiles';
import { SOUND_COLORS, SOUND_LABELS } from '@/engine/rhythms';

/**
 * /lab — developer-mode prototyping surface.
 *
 * Visibility-first dev tool for tuning calibration: continuous capture
 * (no cycle window), per-strike feature table (RMS, peak, f0, centroid,
 * length), live spectrum, and an in-memory experimental profile you can
 * tag strikes into and apply without persisting. Lets us see *what* the
 * classifier is seeing before we start changing how it works.
 *
 * Not linked from the user-facing nav. Reach via the URL bar.
 */

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'running' }
  | { kind: 'error'; message: string };

interface LabStrike {
  /** AudioContext timestamp from the worklet — used as a stable key. */
  timestamp: number;
  /** Wall-clock when the row landed, for the "t" column. */
  arrivedAt: number;
  rms: number;
  peak: number;
  f0: number;
  centroid: number;
  segLen: number;
  segment: Float32Array;
  sampleRate: number;
  preSec: number;
  classified: ClassifiableSound | 'unknown';
  confidence: number;
  /** User tag for building the experimental profile. */
  tagged: ClassifiableSound | null;
}

const MAX_STRIKES = 200;
const SPECTRUM_MAX_HZ = 4000;
const SPECTRUM_MIN_DB = -110;
const SPECTRUM_MAX_DB = -20;

// Tunable detection params. Defaults mirror the worklet so the UI
// reads the same values the engine starts with — and the localStorage
// hydrator can override these on mount, then push them into the
// worklet right after AudioInput.start() resolves.
const PARAM_DEFAULTS = {
  absFloor: 0.01,
  ratio: 2.2,
  minGapSec: 0.08,
  baselineTauSec: 0.5,
} as const;
type LabParams = { [K in OnsetParamKey]: number };
const FFT_SIZE_OPTIONS = [512, 1024, 2048, 4096, 8192] as const;
const DEFAULT_FFT_SIZE = 2048;
const PARAMS_STORAGE_KEY = 'berimbau:lab-params';

interface ParamSpec {
  key: OnsetParamKey;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}
const PARAM_SPECS: ParamSpec[] = [
  { key: 'absFloor',       label: 'ABS_FLOOR',     min: 0.001, max: 0.1, step: 0.001, fmt: (v) => v.toFixed(3) },
  { key: 'ratio',          label: 'RATIO',         min: 1.2,   max: 5,   step: 0.1,   fmt: (v) => v.toFixed(2) },
  { key: 'minGapSec',      label: 'MIN_GAP',       min: 0.03,  max: 0.5, step: 0.01,  fmt: (v) => `${(v * 1000).toFixed(0)} ms` },
  { key: 'baselineTauSec', label: 'BASELINE_τ',    min: 0.1,   max: 2,   step: 0.05,  fmt: (v) => `${v.toFixed(2)} s` },
];

function readPersistedParams(): { params: LabParams; fftSize: number } {
  try {
    const raw = localStorage.getItem(PARAMS_STORAGE_KEY);
    if (!raw) return { params: { ...PARAM_DEFAULTS }, fftSize: DEFAULT_FFT_SIZE };
    const parsed = JSON.parse(raw) as Partial<LabParams> & { fftSize?: number };
    const merged: LabParams = { ...PARAM_DEFAULTS };
    for (const spec of PARAM_SPECS) {
      const v = parsed[spec.key];
      if (typeof v === 'number' && Number.isFinite(v)) merged[spec.key] = v;
    }
    const fft =
      typeof parsed.fftSize === 'number' && (FFT_SIZE_OPTIONS as readonly number[]).includes(parsed.fftSize)
        ? parsed.fftSize
        : DEFAULT_FFT_SIZE;
    return { params: merged, fftSize: fft };
  } catch {
    return { params: { ...PARAM_DEFAULTS }, fftSize: DEFAULT_FFT_SIZE };
  }
}

function persistParams(params: LabParams, fftSize: number): void {
  try {
    localStorage.setItem(PARAMS_STORAGE_KEY, JSON.stringify({ ...params, fftSize }));
  } catch {
    // ignore — storage may be disabled.
  }
}

export function Lab() {
  const inputRef = useRef<AudioInput | null>(null);
  const [sessionStart, setSessionStart] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [strikes, setStrikes] = useState<LabStrike[]>([]);
  // The profile in use right now for live classification. Starts as
  // whatever's in active-profiles (calibration save or null), can be
  // swapped to an experimental one built from tagged strikes.
  const [activeLabel, setActiveLabel] = useState<'saved' | 'experimental' | 'none'>(() =>
    getActiveProfiles() ? 'saved' : 'none',
  );
  const [savedSnapshot] = useState<SavedCalibration | null>(() => getActiveProfiles());
  // Bumped each time the live profile changes so the capture closure
  // sees the new one without resubscribing the audio bus.
  const profileVersionRef = useRef(0);
  const [{ params, fftSize }, setPersisted] = useState(readPersistedParams);
  // Persist + reflect into the live engine whenever the user changes
  // a parameter. Sliders call setParam, the effect handles both.
  const setParam = (key: OnsetParamKey, value: number) => {
    setPersisted((prev) => {
      const next = { params: { ...prev.params, [key]: value }, fftSize: prev.fftSize };
      persistParams(next.params, next.fftSize);
      return next;
    });
    inputRef.current?.setOnsetParam(key, value);
  };
  const setFftSize = (size: number) => {
    setPersisted((prev) => {
      const next = { params: prev.params, fftSize: size };
      persistParams(next.params, next.fftSize);
      return next;
    });
    inputRef.current?.setFftSize(size);
  };
  const resetParams = () => {
    const fresh = { params: { ...PARAM_DEFAULTS } as LabParams, fftSize: DEFAULT_FFT_SIZE };
    setPersisted(fresh);
    persistParams(fresh.params, fresh.fftSize);
    inputRef.current?.resetOnsetParams();
    inputRef.current?.setFftSize(DEFAULT_FFT_SIZE);
  };

  // Subscribe to raw captures while running.
  useEffect(() => {
    if (phase.kind !== 'running') return;
    const unsub = audioBus.subscribeRawCapture((capture) => {
      if (capture.kind === 'quick') {
        const features = extractFeatures(capture.segment, capture.sampleRate);
        const peak = peakOf(capture.segment);
        const profile = getActiveProfiles();
        const result = profile
          ? classify(features.f0, features.centroid, profile.profiles)
          : { sound: 'unknown' as const, confidence: 0 };
        setStrikes((prev) =>
          [
            {
              timestamp: capture.timestamp,
              arrivedAt: performance.now(),
              rms: capture.rms,
              peak,
              f0: features.f0,
              centroid: features.centroid,
              segLen: capture.segment.length,
              segment: capture.segment,
              sampleRate: capture.sampleRate,
              preSec: capture.preSec,
              classified: result.sound,
              confidence: result.confidence,
              tagged: null,
            } as LabStrike,
            ...prev,
          ].slice(0, MAX_STRIKES),
        );
      } else {
        // 'full' — upgrade the matching strike's segment so playback has the decay tail.
        setStrikes((prev) =>
          prev.map((s) =>
            s.timestamp === capture.timestamp
              ? { ...s, segment: capture.segment, segLen: capture.segment.length, preSec: capture.preSec }
              : s,
          ),
        );
      }
    });
    return unsub;
  }, [phase.kind]);

  useEffect(() => {
    return () => {
      void inputRef.current?.stop();
      inputRef.current = null;
    };
  }, []);

  const onStart = async () => {
    if (phase.kind === 'running' || phase.kind === 'starting') return;
    setPhase({ kind: 'starting' });
    try {
      const input = new AudioInput();
      await input.start();
      inputRef.current = input;
      // Push the persisted params into the freshly-booted worklet so
      // user-tuned values survive a stop/start cycle without a reload.
      for (const spec of PARAM_SPECS) {
        input.setOnsetParam(spec.key, params[spec.key]);
      }
      input.setFftSize(fftSize);
      setSessionStart(performance.now());
      setPhase({ kind: 'running' });
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const onStop = async () => {
    await inputRef.current?.stop();
    inputRef.current = null;
    setPhase({ kind: 'idle' });
  };

  const onClear = () => setStrikes([]);

  const onTag = (timestamp: number, tag: ClassifiableSound | null) => {
    setStrikes((prev) =>
      prev.map((s) => (s.timestamp === timestamp ? { ...s, tagged: tag } : s)),
    );
  };

  const onPlay = (s: LabStrike) => {
    const ctx = inputRef.current?.audioContext;
    if (!ctx) return;
    try {
      const buffer = ctx.createBuffer(1, s.segment.length, s.sampleRate);
      buffer.getChannelData(0).set(s.segment);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 1.6;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    } catch (err) {
      console.warn('[lab] playback failed', err);
    }
  };

  const taggedCounts = useMemo(() => {
    const c: Record<ClassifiableSound, number> = { dong: 0, ch: 0, ding: 0 };
    for (const s of strikes) if (s.tagged) c[s.tagged] += 1;
    return c;
  }, [strikes]);

  const canApplyExperimental =
    taggedCounts.dong >= 1 && taggedCounts.ch >= 1 && taggedCounts.ding >= 1;

  const onApplyExperimental = () => {
    const samples: CalibrationSample[] = strikes
      .filter((s): s is LabStrike & { tagged: ClassifiableSound } => s.tagged !== null)
      .map((s) => ({
        sound: s.tagged,
        f0: s.f0,
        centroid: s.centroid,
        rms: s.rms,
        at: s.timestamp,
        segment: s.segment,
        sampleRate: s.sampleRate,
        preSec: s.preSec,
      }));
    const profiles = computeProfiles(samples);
    const exp: SavedCalibration = {
      version: 1,
      savedAt: Date.now(),
      profiles,
      sampleCount: { ...taggedCounts },
    };
    setActiveProfiles(exp);
    profileVersionRef.current += 1;
    setActiveLabel('experimental');
    // Re-classify existing strikes with the new profile so the table
    // reflects the change immediately.
    setStrikes((prev) =>
      prev.map((s) => {
        const r = classify(s.f0, s.centroid, exp.profiles);
        return { ...s, classified: r.sound, confidence: r.confidence };
      }),
    );
  };

  const onRevertProfile = () => {
    if (!savedSnapshot) {
      // No saved snapshot — clear the cache entirely.
      // (We don't import clearActiveProfiles to avoid touching IDB; just
      // overwriting with something usable would be wrong. Just label it.)
      setActiveLabel('none');
      return;
    }
    setActiveProfiles(savedSnapshot);
    setActiveLabel('saved');
    setStrikes((prev) =>
      prev.map((s) => {
        const r = classify(s.f0, s.centroid, savedSnapshot.profiles);
        return { ...s, classified: r.sound, confidence: r.confidence };
      }),
    );
  };

  return (
    <main className="min-h-full px-5 py-8 max-w-6xl mx-auto flex flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Lab</h1>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">
              dev mode
            </span>
          </div>
          <p className="text-text-dim text-sm">
            Continuous capture · live spectrum · per-strike features · in-memory experimental profile.
          </p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          Back
        </Link>
      </header>

      <Toolbar
        phase={phase}
        onStart={() => void onStart()}
        onStop={() => void onStop()}
        onClear={onClear}
        strikeCount={strikes.length}
        activeLabel={activeLabel}
        onApplyExperimental={onApplyExperimental}
        canApplyExperimental={canApplyExperimental}
        taggedCounts={taggedCounts}
        onRevertProfile={onRevertProfile}
        canRevert={activeLabel === 'experimental' && savedSnapshot !== null}
      />

      {phase.kind === 'error' && (
        <p className="text-sm text-red-400">{phase.message}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr] items-start">
        <div className="flex flex-col gap-3">
          <SpectrumPanel
            getSpectrum={() => inputRef.current?.getSpectrum() ?? null}
            getSampleRate={() => inputRef.current?.getSampleRate() ?? 0}
            getFftSize={() => inputRef.current?.getFftSize() ?? 0}
            getLevel={() => inputRef.current?.getLevel() ?? 0}
            running={phase.kind === 'running'}
          />
          <SelectedStrikePanel
            strike={strikes[0] ?? null}
            onPlay={onPlay}
          />
          <ParametersPanel
            params={params}
            fftSize={fftSize}
            onParam={setParam}
            onFftSize={setFftSize}
            onReset={resetParams}
          />
        </div>
        <StrikeTable
          strikes={strikes}
          onPlay={onPlay}
          onTag={onTag}
          sessionStart={sessionStart}
        />
      </div>
    </main>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────

function Toolbar({
  phase,
  onStart,
  onStop,
  onClear,
  strikeCount,
  activeLabel,
  onApplyExperimental,
  canApplyExperimental,
  taggedCounts,
  onRevertProfile,
  canRevert,
}: {
  phase: Phase;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  strikeCount: number;
  activeLabel: 'saved' | 'experimental' | 'none';
  onApplyExperimental: () => void;
  canApplyExperimental: boolean;
  taggedCounts: Record<ClassifiableSound, number>;
  onRevertProfile: () => void;
  canRevert: boolean;
}) {
  const running = phase.kind === 'running';
  const starting = phase.kind === 'starting';
  return (
    <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
      {!running ? (
        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className="btn-primary disabled:opacity-50"
        >
          {starting ? 'Starting…' : 'Start mic'}
        </button>
      ) : (
        <button type="button" onClick={onStop} className="btn-secondary">
          Stop
        </button>
      )}
      <button
        type="button"
        onClick={onClear}
        disabled={strikeCount === 0}
        className="btn-ghost disabled:opacity-50"
      >
        Clear strikes
      </button>
      <span className="text-xs font-mono text-text-dim ml-1">
        {strikeCount} captured
      </span>
      <div className="grow" />
      <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
        Profile · {activeLabel}
      </span>
      <span className="text-[10px] font-mono text-text-dim">
        tagged TCH {taggedCounts.ch} · DONG {taggedCounts.dong} · DING {taggedCounts.ding}
      </span>
      <button
        type="button"
        onClick={onApplyExperimental}
        disabled={!canApplyExperimental}
        className="btn-primary disabled:opacity-40"
        title="Build a profile from tagged strikes and use it for live classification (in memory)"
      >
        Apply experimental
      </button>
      <button
        type="button"
        onClick={onRevertProfile}
        disabled={!canRevert}
        className="btn-ghost disabled:opacity-40"
      >
        Revert to saved
      </button>
    </div>
  );
}

// ─── Spectrum + level meter ──────────────────────────────────────────

function SpectrumPanel({
  getSpectrum,
  getSampleRate,
  getFftSize,
  getLevel,
  running,
}: {
  getSpectrum: () => Float32Array | null;
  getSampleRate: () => number;
  getFftSize: () => number;
  getLevel: () => number;
  running: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [readout, setReadout] = useState({ rms: 0, fft: 0, sr: 0 });

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let lastReadout = 0;
    const tick = (now: number) => {
      const canvas = canvasRef.current;
      const spectrum = getSpectrum();
      if (canvas && spectrum) {
        drawSpectrum(canvas, spectrum, getSampleRate());
      }
      if (now - lastReadout >= 100) {
        setReadout({
          rms: getLevel(),
          fft: getFftSize(),
          sr: getSampleRate(),
        });
        lastReadout = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, getSpectrum, getSampleRate, getFftSize, getLevel]);

  return (
    <div className="card flex flex-col gap-2 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          Spectrum · 0–{SPECTRUM_MAX_HZ / 1000} kHz
        </span>
        <span className="text-[10px] font-mono text-text-dim tabular-nums">
          rms {readout.rms.toFixed(3)} · fft {readout.fft || '—'} · sr {readout.sr || '—'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={640}
        height={160}
        className="w-full h-40 rounded-md bg-bg border border-border"
      />
      {!running && (
        <p className="text-xs text-text-dim text-center">Start the mic to see the live spectrum.</p>
      )}
    </div>
  );
}

function drawSpectrum(canvas: HTMLCanvasElement, spectrum: Float32Array, sampleRate: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || sampleRate === 0) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#0b0f1a';
  ctx.fillRect(0, 0, w, h);

  // bin -> Hz: i * (sampleRate / fftSize). spectrum length = fftSize/2.
  const fftSize = spectrum.length * 2;
  const hzPerBin = sampleRate / fftSize;
  const maxBin = Math.min(spectrum.length, Math.ceil(SPECTRUM_MAX_HZ / hzPerBin));

  // Frequency axis labels: 1k, 2k, 3k.
  ctx.strokeStyle = '#1a2135';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#5a6480';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textBaseline = 'bottom';
  for (let hz = 1000; hz < SPECTRUM_MAX_HZ; hz += 1000) {
    const x = (hz / SPECTRUM_MAX_HZ) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h - 12);
    ctx.stroke();
    ctx.fillText(`${hz / 1000}k`, x + 2, h - 1);
  }

  // Bars: for each pixel column, take max-of-bin in that column to look smooth.
  ctx.fillStyle = '#ff8a3d';
  for (let x = 0; x < w; x++) {
    const binStart = Math.floor((x / w) * maxBin);
    const binEnd = Math.max(binStart + 1, Math.floor(((x + 1) / w) * maxBin));
    let peakDb = SPECTRUM_MIN_DB;
    for (let b = binStart; b < binEnd && b < spectrum.length; b++) {
      const v = spectrum[b]!;
      if (v > peakDb) peakDb = v;
    }
    const norm = Math.max(0, Math.min(1, (peakDb - SPECTRUM_MIN_DB) / (SPECTRUM_MAX_DB - SPECTRUM_MIN_DB)));
    const barH = norm * (h - 14);
    ctx.fillRect(x, h - 12 - barH, 1, barH);
  }
}

// ─── Strike table ────────────────────────────────────────────────────

function StrikeTable({
  strikes,
  onPlay,
  onTag,
  sessionStart,
}: {
  strikes: LabStrike[];
  onPlay: (s: LabStrike) => void;
  onTag: (timestamp: number, tag: ClassifiableSound | null) => void;
  sessionStart: number;
}) {
  return (
    <div className="card flex flex-col px-3 py-3 max-h-[640px] overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 px-2 pb-2 border-b border-border/60">
        <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          Strikes (newest first)
        </span>
        <span className="text-[10px] font-mono text-text-dim">
          click row to play · tag to feed experimental profile
        </span>
      </div>
      <div className="overflow-y-auto flex flex-col">
        {strikes.length === 0 && (
          <p className="text-xs text-text-dim text-center py-12">
            No strikes captured yet. Start the mic and play the berimbau.
          </p>
        )}
        {strikes.map((s) => (
          <StrikeRow
            key={s.timestamp}
            strike={s}
            onPlay={onPlay}
            onTag={onTag}
            sessionStart={sessionStart}
          />
        ))}
      </div>
    </div>
  );
}

function StrikeRow({
  strike,
  onPlay,
  onTag,
  sessionStart,
}: {
  strike: LabStrike;
  onPlay: (s: LabStrike) => void;
  onTag: (timestamp: number, tag: ClassifiableSound | null) => void;
  sessionStart: number;
}) {
  const lengthMs = (strike.segLen / strike.sampleRate) * 1000;
  const tSec = (strike.arrivedAt - sessionStart) / 1000;
  const classified = strike.classified;
  const classColor = classified !== 'unknown' ? SOUND_COLORS[classified] : '#5a6480';
  const classLabel = classified !== 'unknown' ? SOUND_LABELS[classified] : '?';
  return (
    <div className="grid grid-cols-[3rem_minmax(0,1fr)_5rem] gap-2 items-center px-2 py-1.5 border-b border-border/30 hover:bg-bg-elev/50 text-xs font-mono tabular-nums">
      <span className="text-text-dim">{tSec.toFixed(1)}s</span>
      <button
        type="button"
        onClick={() => onPlay(strike)}
        className="grid grid-cols-6 gap-2 items-baseline text-left hover:text-text"
        title={`fft=${strike.segLen}, preSec=${strike.preSec.toFixed(3)}`}
      >
        <span style={{ color: classColor }} className="text-[11px]">
          {classLabel}
          <span className="text-text-dim/70 ml-1">{(strike.confidence * 100).toFixed(0)}%</span>
        </span>
        <span title="RMS at onset"><span className="text-text-dim">rms </span>{strike.rms.toFixed(3)}</span>
        <span title="peak amplitude"><span className="text-text-dim">pk </span>{strike.peak.toFixed(2)}</span>
        <span title="fundamental"><span className="text-text-dim">f₀ </span>{strike.f0.toFixed(0)}</span>
        <span title="spectral centroid"><span className="text-text-dim">cent </span>{strike.centroid.toFixed(0)}</span>
        <span title="segment length"><span className="text-text-dim">len </span>{lengthMs.toFixed(0)}ms</span>
      </button>
      <TagPills value={strike.tagged} onChange={(t) => onTag(strike.timestamp, t)} />
    </div>
  );
}

function TagPills({
  value,
  onChange,
}: {
  value: ClassifiableSound | null;
  onChange: (v: ClassifiableSound | null) => void;
}) {
  const opts: ClassifiableSound[] = ['ch', 'dong', 'ding'];
  return (
    <div className="flex gap-0.5">
      {opts.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(active ? null : o)}
            title={`Tag as ${SOUND_LABELS[o]}`}
            className={`w-6 h-6 rounded text-[10px] font-bold transition ${
              active ? '' : 'bg-bg border border-border hover:border-border-strong text-text-dim'
            }`}
            style={
              active
                ? { background: SOUND_COLORS[o], color: '#0b0f1a' }
                : undefined
            }
          >
            {SOUND_LABELS[o][0]}
          </button>
        );
      })}
    </div>
  );
}

// ─── Selected-strike waveform ────────────────────────────────────────

function SelectedStrikePanel({
  strike,
  onPlay,
}: {
  strike: LabStrike | null;
  onPlay: (s: LabStrike) => void;
}) {
  const path = useMemo(() => {
    if (!strike?.segment) return '';
    return waveformPath(strike.segment, 320, 60);
  }, [strike]);
  if (!strike) {
    return (
      <div className="card px-4 py-3 text-xs text-text-dim text-center">
        Newest strike preview will show here.
      </div>
    );
  }
  const onsetX =
    strike.preSec != null && strike.sampleRate != null
      ? ((strike.preSec * strike.sampleRate) / strike.segment.length) * 320
      : null;
  return (
    <div className="card flex flex-col gap-2 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          Newest strike
        </span>
        <button
          type="button"
          onClick={() => onPlay(strike)}
          className="btn-ghost px-2 py-0.5 text-xs"
        >
          ▶ play
        </button>
      </div>
      <svg viewBox="0 0 320 60" className="w-full h-16">
        <rect width={320} height={60} fill="#0b0f1a" />
        {onsetX != null && (
          <line x1={onsetX} y1={0} x2={onsetX} y2={60} stroke="#ff8a3d" strokeWidth={0.5} opacity={0.4} />
        )}
        <path d={path} stroke="#64f08c" strokeWidth={1} fill="none" />
      </svg>
    </div>
  );
}

// ─── Parameters panel ────────────────────────────────────────────────

function ParametersPanel({
  params,
  fftSize,
  onParam,
  onFftSize,
  onReset,
}: {
  params: LabParams;
  fftSize: number;
  onParam: (key: OnsetParamKey, value: number) => void;
  onFftSize: (size: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="card flex flex-col gap-3 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          Detection parameters
        </span>
        <button
          type="button"
          onClick={onReset}
          className="btn-ghost px-2 py-0.5 text-[10px]"
          title="Restore worklet defaults and clear the saved tuning"
        >
          Reset to defaults
        </button>
      </div>

      {PARAM_SPECS.map((spec) => (
        <ParamSlider
          key={spec.key}
          spec={spec}
          value={params[spec.key]}
          onChange={(v) => onParam(spec.key, v)}
        />
      ))}

      <div className="flex items-center gap-2 pt-1">
        <span className="text-[10px] font-mono text-text-dim w-24 shrink-0">
          FFT_SIZE
        </span>
        <div className="flex gap-1 flex-wrap">
          {FFT_SIZE_OPTIONS.map((opt) => {
            const active = fftSize === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onFftSize(opt)}
                className={`text-[10px] font-mono px-2 py-0.5 rounded-md transition ${
                  active
                    ? 'bg-accent text-bg'
                    : 'text-text-dim hover:text-text border border-border hover:border-border-strong'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[10px] text-text-dim leading-relaxed pt-1">
        Tuning is persisted to localStorage; pushed into the worklet at every Start. Reset clears both.
      </p>
    </div>
  );
}

function ParamSlider({
  spec,
  value,
  onChange,
}: {
  spec: ParamSpec;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] font-mono text-text-dim w-24 shrink-0"
        title={`${spec.min} – ${spec.max}`}
      >
        {spec.label}
      </span>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-accent"
      />
      <span className="text-[10px] font-mono text-text tabular-nums w-16 text-right">
        {spec.fmt(value)}
      </span>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function peakOf(segment: Float32Array): number {
  let p = 0;
  for (let i = 0; i < segment.length; i++) {
    const v = Math.abs(segment[i]!);
    if (v > p) p = v;
  }
  return p;
}

function waveformPath(segment: Float32Array, w: number, h: number, points = 180): string {
  if (segment.length === 0) return '';
  const stride = Math.max(1, Math.floor(segment.length / points));
  const yMid = h / 2;
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
