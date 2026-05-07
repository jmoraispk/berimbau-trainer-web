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
import { CalibrationScatter } from '@/components/CalibrationScatter';
import type { ClassifiableSound } from '@/engine/profiles';
import { SOUND_COLORS, SOUND_LABELS } from '@/engine/rhythms';
import { SoundSymbol } from '@/components/SoundSymbol';

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
  minSustainSec: 0,
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
  help: string;
}
const PARAM_SPECS: ParamSpec[] = [
  {
    key: 'absFloor',
    label: 'ABS_FLOOR',
    min: 0.001, max: 0.1, step: 0.001,
    fmt: (v) => v.toFixed(3),
    help:
      'Absolute volume floor. The block\'s raw RMS must be ≥ this number, full stop, no matter how quiet the room is. Whisper ≈ 0.001, speech ≈ 0.02, real strike ≥ 0.1. Catches breath / clicks even in a silent room, where RATIO alone would let them through.',
  },
  {
    key: 'ratio',
    label: 'RATIO',
    min: 1.2, max: 5, step: 0.1,
    fmt: (v) => v.toFixed(2),
    help:
      'Relative gate. The block\'s RMS must be ≥ RATIO × the rolling baseline (BASELINE_τ\'s estimate of the room\'s recent noise level). 2.2 means "at least 2.2× louder than what\'s been happening". Catches sustained noise — a TV at constant volume raises the baseline so it stops firing onsets, while a sharp strike still spikes 5–10× above. Both ABS_FLOOR and RATIO must clear.',
  },
  {
    key: 'minGapSec',
    label: 'MIN_GAP',
    min: 0.03, max: 0.5, step: 0.01,
    fmt: (v) => `${(v * 1000).toFixed(0)} ms`,
    help:
      'Refractory between accepted onsets — *not* averaging (that\'s BASELINE_τ). After one strike fires, the worklet ignores further onsets for this long. Lower = fast tch-tch passes through. Higher = a single strike\'s gourd ring stops firing a phantom second hit. Default 80 ms.',
  },
  {
    key: 'baselineTauSec',
    label: 'BASELINE_τ',
    min: 0.1, max: 2, step: 0.05,
    fmt: (v) => `${v.toFixed(2)} s`,
    help:
      'Time constant of the rolling baseline (EMA over recent block RMS). The baseline is the "noise floor estimate" RATIO compares against. Smaller τ = adapts fast (handy when noise level keeps changing), but may track a sustained strike and miss its end. Larger τ = stabler floor, slower to recover from loud sustained noise. 0.5 s is a reasonable balance.',
  },
  {
    key: 'minSustainSec',
    label: 'MIN_SUSTAIN',
    min: 0, max: 0.1, step: 0.005,
    fmt: (v) => (v === 0 ? 'off' : `${(v * 1000).toFixed(0)} ms`),
    help:
      'Time the sound must stay above ABS_FLOOR after the threshold cross before the onset is confirmed. 0 = off (current behaviour). >0 rejects single-block clicks (mouse taps, knocks on the wood) without rejecting real strikes. 20–30 ms is a reasonable starting point.',
  },
];

const FFT_HELP =
  'AnalyserNode FFT window for the live spectrum panel above. Visualization only — onset detection runs block-by-block in the worklet and does not look at this. Larger = finer frequency resolution but a slower update. 2048 ≈ 47 Hz/bin at 48 kHz.';

// ─── Recordings (clips) ──────────────────────────────────────────────

type LabTab = 'live' | 'record';
const SLOT_IDS = ['ch', 'dong', 'ding', 'song'] as const;
type SlotId = typeof SLOT_IDS[number];
const SLOT_LABEL: Record<SlotId, string> = {
  ch: 'TCH',
  dong: 'DONG',
  ding: 'DING',
  song: 'Song',
};
const CLIP_LENGTH_OPTIONS = [5, 8, 10, 15] as const;
const DEFAULT_CLIP_LENGTH_SEC = 8;

interface Clip {
  samples: Float32Array;
  sampleRate: number;
  durationSec: number;
  recordedAt: number;
}

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
  // Separate AudioContext for clicking through captures — survives a
  // Stop click on the mic. Lazy-created on first play.
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const [tab, setTab] = useState<LabTab>('live');
  const [clips, setClips] = useState<Partial<Record<SlotId, Clip>>>({});
  const [recordingSlot, setRecordingSlot] = useState<SlotId | null>(null);
  const [recordingStartedAt, setRecordingStartedAt] = useState(0);
  const [playingSlot, setPlayingSlot] = useState<SlotId | null>(null);
  const [clipLengthSec, setClipLengthSec] = useState<number>(DEFAULT_CLIP_LENGTH_SEC);
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

  // Brief inline confirmation after an Export click.
  const [exportFlash, setExportFlash] = useState<string | null>(null);
  const exportTuning = async () => {
    const payload = {
      ...params,
      fftSize,
    };
    const text = JSON.stringify(payload, null, 2);
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // Clipboard API can be blocked (insecure context, missing permission).
      // Fall through to the textarea fallback below.
    }
    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        copied = true;
      } catch {
        // Give up gracefully — log so the user can grab from console.
        console.info('[lab] export tuning (clipboard unavailable):\n' + text);
      }
    }
    setExportFlash(copied ? 'Copied ✓' : 'See console');
    window.setTimeout(() => setExportFlash(null), 2000);
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
      void playbackCtxRef.current?.close();
      playbackCtxRef.current = null;
    };
  }, []);

  /**
   * Idempotent mic starter — used by both the Live "Start" button and
   * the Recordings tab, where clicking Record on an empty slot should
   * just kick off the mic if it isn't already running. Returns the
   * live AudioInput on success, null on failure or while another
   * start is in flight.
   */
  const ensureMicRunning = async (): Promise<AudioInput | null> => {
    if (inputRef.current?.isRunning) return inputRef.current;
    if (phase.kind === 'starting') return null;
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
      return input;
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      return null;
    }
  };

  const onStart = () => void ensureMicRunning();

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
    if (s.segment.length === 0) return;
    // Prefer the mic's context if it's still alive (no extra resource
    // cost); fall back to a dedicated playback context that we keep
    // open for the route's lifetime so playback works after Stop.
    let ctx = inputRef.current?.audioContext ?? playbackCtxRef.current;
    if (!ctx) {
      try {
        ctx = new AudioContext();
        playbackCtxRef.current = ctx;
      } catch (err) {
        console.warn('[lab] could not create playback context', err);
        return;
      }
    }
    if (ctx.state === 'suspended') void ctx.resume();
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

  const onDelete = (timestamp: number) =>
    setStrikes((prev) => prev.filter((s) => s.timestamp !== timestamp));

  const onRecordClip = async (slot: SlotId) => {
    const input = await ensureMicRunning();
    if (!input) return;
    setRecordingSlot(slot);
    setRecordingStartedAt(performance.now());
    try {
      const { samples, sampleRate } = await input.recordClip(clipLengthSec);
      setClips((prev) => ({
        ...prev,
        [slot]: {
          samples,
          sampleRate,
          durationSec: clipLengthSec,
          recordedAt: Date.now(),
        },
      }));
    } catch (err) {
      console.warn('[lab] recordClip failed', err);
    } finally {
      setRecordingSlot(null);
    }
  };

  const onPlayClip = async (slot: SlotId) => {
    const clip = clips[slot];
    if (!clip) return;
    const input = await ensureMicRunning();
    if (!input) return;
    setPlayingSlot(slot);
    try {
      await input.playClip(clip.samples, clip.sampleRate);
    } catch (err) {
      console.warn('[lab] playClip failed', err);
    } finally {
      setPlayingSlot(null);
    }
  };

  const onClearClip = (slot: SlotId) => {
    setClips((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  };

  // Mapping for the (centroid, f0) scatter at the bottom of the page.
  // Tag wins over classification — when the user has labelled a strike
  // we treat that as ground truth for colour. Strikes the classifier
  // marks 'unknown' AND that aren't tagged are dropped from the plot.
  const scatterSamples = useMemo<CalibrationSample[]>(
    () =>
      strikes
        .filter((s): s is LabStrike & { classified: ClassifiableSound } => {
          if (s.tagged) return true;
          return s.classified !== 'unknown';
        })
        .map((s) => ({
          sound: (s.tagged ?? s.classified) as ClassifiableSound,
          f0: s.f0,
          centroid: s.centroid,
          rms: s.rms,
          at: s.timestamp,
          segment: s.segment,
          sampleRate: s.sampleRate,
          preSec: s.preSec,
        })),
    [strikes],
  );
  const [hoveredAt, setHoveredAt] = useState<number | null>(null);

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

      <div className="flex justify-end">
        <TabBar value={tab} onChange={setTab} />
      </div>

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
          {tab === 'live' ? (
            <>
              <LevelStrip
                getLevel={() => inputRef.current?.getLevel() ?? 0}
                running={phase.kind === 'running'}
                params={params}
              />
              <SpectrumPanel
                getSpectrum={() => inputRef.current?.getSpectrum() ?? null}
                getSampleRate={() => inputRef.current?.getSampleRate() ?? 0}
                getFftSize={() => inputRef.current?.getFftSize() ?? 0}
                getLevel={() => inputRef.current?.getLevel() ?? 0}
                running={phase.kind === 'running'}
              />
            </>
          ) : (
            <RecordingsPanel
              clips={clips}
              clipLengthSec={clipLengthSec}
              onClipLengthChange={setClipLengthSec}
              recordingSlot={recordingSlot}
              recordingStartedAt={recordingStartedAt}
              playingSlot={playingSlot}
              onRecord={(slot) => void onRecordClip(slot)}
              onPlay={(slot) => void onPlayClip(slot)}
              onClear={onClearClip}
            />
          )}
          <SelectedStrikePanel
            strike={strikes[0] ?? null}
            onPlay={onPlay}
          />
          <DetectionPanel
            params={params}
            onParam={setParam}
            onReset={resetParams}
            onExport={() => void exportTuning()}
            exportFlash={exportFlash}
          />
          <VisualizationPanel
            fftSize={fftSize}
            onFftSize={setFftSize}
          />
        </div>
        <StrikeTable
          strikes={strikes}
          onPlay={onPlay}
          onTag={onTag}
          onDelete={onDelete}
          sessionStart={sessionStart}
        />
      </div>

      <ScatterPanel
        samples={scatterSamples}
        hoveredAt={hoveredAt}
        onHoverChange={setHoveredAt}
        onPlay={(sample) => {
          // Bridge from a CalibrationSample-shaped click back to the
          // LabStrike playback path. Match by timestamp (== at).
          const strike = strikes.find((s) => s.timestamp === sample.at);
          if (strike) onPlay(strike);
        }}
      />
    </main>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────

function TabBar({ value, onChange }: { value: LabTab; onChange: (t: LabTab) => void }) {
  const opts: Array<{ id: LabTab; label: string }> = [
    { id: 'live', label: 'Live' },
    { id: 'record', label: 'Recordings' },
  ];
  return (
    <div className="inline-flex gap-1 p-1 rounded-full bg-bg-elev/60 border border-border">
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider transition ${
              active
                ? 'bg-accent text-bg'
                : 'text-text-dim hover:text-text'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Recordings panel ────────────────────────────────────────────────

function RecordingsPanel({
  clips,
  clipLengthSec,
  onClipLengthChange,
  recordingSlot,
  recordingStartedAt,
  playingSlot,
  onRecord,
  onPlay,
  onClear,
}: {
  clips: Partial<Record<SlotId, Clip>>;
  clipLengthSec: number;
  onClipLengthChange: (s: number) => void;
  recordingSlot: SlotId | null;
  recordingStartedAt: number;
  playingSlot: SlotId | null;
  onRecord: (slot: SlotId) => void;
  onPlay: (slot: SlotId) => void;
  onClear: (slot: SlotId) => void;
}) {
  return (
    <div className="card flex flex-col gap-3 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          Recordings — replay through the pipeline
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-text-dim">clip length</span>
          <div className="flex gap-1">
            {CLIP_LENGTH_OPTIONS.map((opt) => {
              const active = clipLengthSec === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onClipLengthChange(opt)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-md transition ${
                    active
                      ? 'bg-accent text-bg'
                      : 'text-text-dim hover:text-text border border-border hover:border-border-strong'
                  }`}
                >
                  {opt}s
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {SLOT_IDS.map((id) => (
          <ClipSlot
            key={id}
            id={id}
            label={SLOT_LABEL[id]}
            sound={id === 'song' ? null : id}
            clip={clips[id] ?? null}
            isRecording={recordingSlot === id}
            recordingStartedAt={recordingStartedAt}
            isPlaying={playingSlot === id}
            recordDisabled={recordingSlot !== null && recordingSlot !== id}
            playDisabled={playingSlot !== null && playingSlot !== id}
            clipLengthSec={clipLengthSec}
            onRecord={() => onRecord(id)}
            onPlay={() => onPlay(id)}
            onClear={() => onClear(id)}
          />
        ))}
      </div>

      <p className="text-[10px] text-text-dim leading-relaxed pt-1">
        Record once, then replay through the worklet — every parameter change runs against the same input. Clips live in memory; a refresh wipes them.
      </p>
    </div>
  );
}

function ClipSlot({
  label,
  sound,
  clip,
  isRecording,
  recordingStartedAt,
  isPlaying,
  recordDisabled,
  playDisabled,
  clipLengthSec,
  onRecord,
  onPlay,
  onClear,
}: {
  id: SlotId;
  label: string;
  sound: ClassifiableSound | null;
  clip: Clip | null;
  isRecording: boolean;
  recordingStartedAt: number;
  isPlaying: boolean;
  recordDisabled: boolean;
  playDisabled: boolean;
  clipLengthSec: number;
  onRecord: () => void;
  onPlay: () => void;
  onClear: () => void;
}) {
  // Tick the elapsed counter while recording so the user sees a live
  // countdown. ~10 Hz is plenty for one decimal place.
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [isRecording]);

  const elapsed = isRecording ? (performance.now() - recordingStartedAt) / 1000 : 0;
  const remaining = Math.max(0, clipLengthSec - elapsed);

  const borderClass = isRecording
    ? 'border-red-400/70'
    : isPlaying
      ? 'border-accent'
      : 'border-border';

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-elev/40 border ${borderClass} transition`}>
      <div className="shrink-0 w-7 h-7 flex items-center justify-center">
        {sound ? <SoundSymbol sound={sound} size={20} glow={false} /> : <span className="text-[10px] font-mono text-text-dim">♪</span>}
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-medium leading-none">{label}</span>
        <span className="text-[10px] font-mono text-text-dim mt-0.5">
          {isRecording
            ? `recording · ${remaining.toFixed(1)}s left`
            : clip
              ? `${clip.durationSec.toFixed(1)}s · ${(clip.samples.length / 1024).toFixed(0)} KS`
              : 'no clip'}
        </span>
      </div>
      <button
        type="button"
        onClick={onRecord}
        disabled={isRecording || recordDisabled || isPlaying}
        className={`shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider border transition disabled:opacity-40 disabled:cursor-not-allowed ${
          isRecording
            ? 'border-red-400 text-red-400 bg-red-400/10'
            : 'border-border text-text-dim hover:text-text hover:border-border-strong'
        }`}
      >
        ● {clip ? 'Re-record' : 'Record'}
      </button>
      <button
        type="button"
        onClick={onPlay}
        disabled={!clip || isRecording || isPlaying || playDisabled}
        className={`shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider border transition disabled:opacity-40 disabled:cursor-not-allowed ${
          isPlaying
            ? 'border-accent text-accent bg-accent/10'
            : 'border-border text-text-dim hover:text-text hover:border-border-strong'
        }`}
      >
        {isPlaying ? '▷ Playing' : '▷ Play'}
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={!clip || isRecording || isPlaying}
        title="Clear clip"
        aria-label="Clear clip"
        className="shrink-0 w-6 h-6 rounded text-text-dim/60 hover:text-red-400 hover:bg-bg-elev disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center text-[12px] leading-none"
      >
        ×
      </button>
    </div>
  );
}

function ScatterPanel({
  samples,
  hoveredAt,
  onHoverChange,
  onPlay,
}: {
  samples: CalibrationSample[];
  hoveredAt: number | null;
  onHoverChange: (at: number | null) => void;
  onPlay: (s: CalibrationSample) => void;
}) {
  return (
    <div className="card flex flex-col gap-2 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          Scatter — centroid × f₀
        </span>
        <span className="text-[10px] font-mono text-text-dim">
          {samples.length} plotted · tag wins over classification · click to play
        </span>
      </div>
      {samples.length === 0 ? (
        <p className="text-xs text-text-dim text-center py-8">
          Capture some strikes (or tag them) and they'll plot here, color-coded by sound.
        </p>
      ) : (
        <CalibrationScatter
          samples={samples}
          onPlay={onPlay}
          hoveredAt={hoveredAt}
          onHoverChange={onHoverChange}
        />
      )}
    </div>
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

// ─── Rolling level strip ─────────────────────────────────────────────

const STRIP_WINDOW_SEC = 8;
const STRIP_HZ = 30;
const STRIP_MAX_RMS = 0.3; // y-axis ceiling — strikes typically peak 0.1–0.25.

/**
 * Last 8 seconds of block RMS as a thin scrolling line, with the
 * matching BASELINE_τ EMA overlaid so the user can see what the
 * RATIO test is comparing against, and horizontal threshold lines
 * for ABS_FLOOR and RATIO × baseline so it's visible whether each
 * strike would fire.
 *
 * Sampling is done from the existing AnalyserNode at STRIP_HZ to
 * keep the visualization independent of the worklet — we don't have
 * to round-trip every block to main.
 */
function LevelStrip({
  getLevel,
  running,
  params,
}: {
  getLevel: () => number;
  running: boolean;
  params: LabParams;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Two parallel ring buffers — a single React re-render would be
  // wasteful for 30 Hz; the rAF tick reads getLevel and writes here.
  const rmsRef = useRef<number[]>([]);
  const baselineRef = useRef<number[]>([]);
  const baselineEmaRef = useRef(0);

  // Reset the ring on stop so the next session doesn't paste fresh
  // samples onto stale ones from before.
  useEffect(() => {
    if (!running) {
      rmsRef.current = [];
      baselineRef.current = [];
      baselineEmaRef.current = 0;
    }
  }, [running]);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let lastSample = 0;
    const periodMs = 1000 / STRIP_HZ;
    const cap = STRIP_WINDOW_SEC * STRIP_HZ;
    const tick = (now: number) => {
      if (now - lastSample >= periodMs) {
        const rms = getLevel();
        const dt = (now - lastSample) / 1000;
        const alpha = 1 - Math.exp(-dt / params.baselineTauSec);
        baselineEmaRef.current = baselineEmaRef.current * (1 - alpha) + rms * alpha;
        rmsRef.current.push(rms);
        baselineRef.current.push(baselineEmaRef.current);
        if (rmsRef.current.length > cap) {
          rmsRef.current.shift();
          baselineRef.current.shift();
        }
        lastSample = now;
      }
      const canvas = canvasRef.current;
      if (canvas) drawStrip(canvas, rmsRef.current, baselineRef.current, params);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, getLevel, params]);

  return (
    <div className="card flex flex-col gap-2 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          Level — last {STRIP_WINDOW_SEC}s
        </span>
        <span className="text-[10px] font-mono text-text-dim">
          <span className="text-accent">━ rms</span>&nbsp;·&nbsp;
          <span className="text-text-dim">━ baseline</span>&nbsp;·&nbsp;
          <span className="text-emerald-400">┄ abs_floor</span>&nbsp;·&nbsp;
          <span className="text-yellow-400">┄ ratio×base</span>
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={640}
        height={120}
        className="w-full h-28 rounded-md bg-bg border border-border"
      />
      {!running && (
        <p className="text-xs text-text-dim text-center">
          Start the mic to see the level strip — strike spikes, baseline drift, and whether each gate would fire.
        </p>
      )}
    </div>
  );
}

function drawStrip(
  canvas: HTMLCanvasElement,
  rms: readonly number[],
  baseline: readonly number[],
  params: LabParams,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#0b0f1a';
  ctx.fillRect(0, 0, w, h);

  const cap = STRIP_WINDOW_SEC * STRIP_HZ;
  const yFor = (v: number) => {
    const norm = Math.max(0, Math.min(1, v / STRIP_MAX_RMS));
    return h - 4 - norm * (h - 8);
  };
  const xFor = (i: number) => (i / Math.max(1, cap - 1)) * w;

  // Time grid every second.
  ctx.strokeStyle = '#1a2135';
  ctx.lineWidth = 1;
  for (let s = 1; s < STRIP_WINDOW_SEC; s++) {
    const x = (s / STRIP_WINDOW_SEC) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  if (rms.length === 0) return;

  // Right-align the data so 'now' is at the right edge — older samples
  // scroll left as new ones arrive.
  const offset = cap - rms.length;

  // Threshold: ABS_FLOOR (constant horizontal line).
  ctx.strokeStyle = '#10b981'; // emerald-500
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  const yFloor = yFor(params.absFloor);
  ctx.beginPath();
  ctx.moveTo(0, yFloor);
  ctx.lineTo(w, yFloor);
  ctx.stroke();

  // Threshold: RATIO × baseline (varies with baseline → curve).
  ctx.strokeStyle = '#facc15'; // yellow-400
  ctx.beginPath();
  for (let i = 0; i < baseline.length; i++) {
    const x = xFor(offset + i);
    const y = yFor(baseline[i]! * params.ratio);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Baseline line.
  ctx.strokeStyle = '#5a6480';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < baseline.length; i++) {
    const x = xFor(offset + i);
    const y = yFor(baseline[i]!);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // RMS line — drawn on top so spikes pop.
  ctx.strokeStyle = '#ff8a3d';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < rms.length; i++) {
    const x = xFor(offset + i);
    const y = yFor(rms[i]!);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
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
  onDelete,
  sessionStart,
}: {
  strikes: LabStrike[];
  onPlay: (s: LabStrike) => void;
  onTag: (timestamp: number, tag: ClassifiableSound | null) => void;
  onDelete: (timestamp: number) => void;
  sessionStart: number;
}) {
  return (
    <div className="card flex flex-col px-3 py-3 max-h-[640px] overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 px-2 pb-2 border-b border-border/60">
        <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          Strikes (newest first)
        </span>
        <span className="text-[10px] font-mono text-text-dim">
          click row to play · tag · × to delete
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
            onDelete={onDelete}
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
  onDelete,
  sessionStart,
}: {
  strike: LabStrike;
  onPlay: (s: LabStrike) => void;
  onTag: (timestamp: number, tag: ClassifiableSound | null) => void;
  onDelete: (timestamp: number) => void;
  sessionStart: number;
}) {
  const lengthMs = (strike.segLen / strike.sampleRate) * 1000;
  const tSec = (strike.arrivedAt - sessionStart) / 1000;
  const classified = strike.classified;
  const classColor = classified !== 'unknown' ? SOUND_COLORS[classified] : '#5a6480';
  // The whole row is the play target — clicks on tag pills or the
  // delete button stopPropagation so they don't double-fire.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPlay(strike)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPlay(strike);
        }
      }}
      className="grid grid-cols-[3rem_minmax(0,1fr)_5rem_1.25rem] gap-2 items-center px-2 py-1.5 border-b border-border/30 hover:bg-bg-elev/50 cursor-pointer text-xs font-mono tabular-nums focus:outline-none focus-visible:bg-bg-elev/70"
      title="Click to play"
    >
      <span className="text-text-dim">{tSec.toFixed(1)}s</span>
      <div className="grid grid-cols-6 gap-2 items-baseline">
        <span style={{ color: classColor }} className="flex items-center gap-1 text-[11px]">
          {classified !== 'unknown' ? (
            <SoundSymbol sound={classified} size={14} glow={false} />
          ) : (
            <span className="w-3.5 h-3.5 inline-flex items-center justify-center">·</span>
          )}
          <span className="text-text-dim/70">{(strike.confidence * 100).toFixed(0)}%</span>
        </span>
        <span title="RMS at onset"><span className="text-text-dim">rms </span>{strike.rms.toFixed(3)}</span>
        <span title="peak amplitude"><span className="text-text-dim">pk </span>{strike.peak.toFixed(2)}</span>
        <span title="fundamental"><span className="text-text-dim">f₀ </span>{strike.f0.toFixed(0)}</span>
        <span title="spectral centroid"><span className="text-text-dim">cent </span>{strike.centroid.toFixed(0)}</span>
        <span title="segment length"><span className="text-text-dim">len </span>{lengthMs.toFixed(0)}ms</span>
      </div>
      <TagPills
        value={strike.tagged}
        onChange={(t) => onTag(strike.timestamp, t)}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(strike.timestamp);
        }}
        title="Delete strike"
        aria-label="Delete strike"
        className="w-5 h-5 rounded text-[11px] text-text-dim/60 hover:text-red-400 hover:bg-bg-elev transition flex items-center justify-center leading-none"
      >
        ×
      </button>
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
    <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
      {opts.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(active ? null : o);
            }}
            title={`Tag as ${SOUND_LABELS[o]}`}
            className={`w-6 h-6 rounded border-2 bg-bg-elev transition flex items-center justify-center ${
              active ? '' : 'border-border opacity-60 hover:opacity-100 hover:border-border-strong'
            }`}
            style={active ? { borderColor: SOUND_COLORS[o] } : undefined}
          >
            <SoundSymbol sound={o} size={14} glow={false} />
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

function DetectionPanel({
  params,
  onParam,
  onReset,
  onExport,
  exportFlash,
}: {
  params: LabParams;
  onParam: (key: OnsetParamKey, value: number) => void;
  onReset: () => void;
  onExport: () => void;
  exportFlash: string | null;
}) {
  const [openHelp, setOpenHelp] = useState<string | null>(null);
  const toggleHelp = (id: string) => setOpenHelp((prev) => (prev === id ? null : id));
  return (
    <div className="card flex flex-col gap-3 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          Detection
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExport}
            className="btn-ghost px-2 py-0.5 text-[10px]"
            title="Copy current tuning as JSON — paste into the worklet to make these the new defaults"
          >
            {exportFlash ?? 'Export tuning'}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="btn-ghost px-2 py-0.5 text-[10px]"
            title="Restore worklet defaults and clear the saved tuning"
          >
            Reset
          </button>
        </div>
      </div>

      {PARAM_SPECS.map((spec) => (
        <ParamSlider
          key={spec.key}
          spec={spec}
          value={params[spec.key]}
          onChange={(v) => onParam(spec.key, v)}
          helpOpen={openHelp === spec.key}
          onToggleHelp={() => toggleHelp(spec.key)}
        />
      ))}

      <p className="text-[10px] text-text-dim leading-relaxed pt-1">
        Tuning persists to localStorage, pushed into the worklet at every Start. Reset clears both.
      </p>
    </div>
  );
}

function VisualizationPanel({
  fftSize,
  onFftSize,
}: {
  fftSize: number;
  onFftSize: (size: number) => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <div className="card flex flex-col gap-2 px-4 py-3">
      <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
        Visualization
      </span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-text-dim w-24 shrink-0">
          FFT_SIZE
        </span>
        <InfoButton
          open={helpOpen}
          onClick={() => setHelpOpen((v) => !v)}
          label="What FFT_SIZE does"
        />
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
      {helpOpen && <HelpRow text={FFT_HELP} />}
    </div>
  );
}

function ParamSlider({
  spec,
  value,
  onChange,
  helpOpen,
  onToggleHelp,
}: {
  spec: ParamSpec;
  value: number;
  onChange: (v: number) => void;
  helpOpen: boolean;
  onToggleHelp: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-mono text-text-dim w-24 shrink-0"
          title={`${spec.min} – ${spec.max}`}
        >
          {spec.label}
        </span>
        <InfoButton open={helpOpen} onClick={onToggleHelp} label={`What ${spec.label} does`} />
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
      {helpOpen && <HelpRow text={spec.help} />}
    </div>
  );
}

function InfoButton({
  open,
  onClick,
  label,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={open}
      title={label}
      className={`shrink-0 w-4 h-4 rounded-full border text-[9px] font-mono leading-none flex items-center justify-center transition ${
        open
          ? 'border-accent text-accent bg-accent/10'
          : 'border-border text-text-dim hover:text-text hover:border-border-strong'
      }`}
    >
      i
    </button>
  );
}

function HelpRow({ text }: { text: string }) {
  return (
    <p className="ml-26 pl-0 text-[10px] text-text-dim leading-relaxed bg-bg-elev/50 border border-border/40 rounded-md px-2 py-1.5">
      {text}
    </p>
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
