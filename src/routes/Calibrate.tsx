import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { AudioInput } from '@/audio/AudioInput';
import { audioBus } from '@/audio/AudioBus';
import { SOUND_COLORS, SOUND_LABELS } from '@/engine/rhythms';
import {
  computeProfiles,
  type CalibrationSample,
  type SavedCalibration,
} from '@/engine/calibration';
import type { ClassifiableSound } from '@/engine/profiles';
import { saveProfile } from '@/storage/profiles-store';
import { setActiveProfiles } from '@/audio/active-profiles';

/**
 * Three-stage guided calibration. For each stage we ask the user to hit
 * the berimbau with the labelled sound five times, collect the onset's
 * raw (f0, centroid) features, and compute a per-class Gaussian profile
 * from the resulting point clouds. Profiles persist in IndexedDB.
 *
 * The calibrator subscribes to audioBus like Practice does — it ignores
 * the classifier's verdict and just tags each detection with whatever
 * class is currently being calibrated.
 */

const STAGES: ClassifiableSound[] = ['dong', 'ch', 'ding'];
const MIN_SAMPLES_PER_CLASS = 3;
const TARGET_SAMPLES_PER_CLASS = 5;

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

  // Subscribe to new detections while a stage is active. Each detection is
  // recorded as a sample for the active sound — the classifier's guess
  // doesn't matter here.
  useEffect(() => {
    if (!activeSound) return;
    const unsub = audioBus.subscribe((event) => {
      if (event.type !== 'note') return;
      const note = event.note;
      if (note.timestamp <= lastSeenTsRef.current) return;
      lastSeenTsRef.current = note.timestamp;
      if (note.isMistake) return;
      // Reject dead-silent onsets — they slip through the threshold on
      // some hardware and pollute the cluster.
      if (note.amplitude < 0.02) return;
      setSamples((prev) => [
        ...prev,
        { sound: activeSound, f0: note.f0, centroid: note.centroid, at: note.timestamp },
      ]);
    });
    return unsub;
  }, [activeSound]);

  // Teardown mic when leaving the route.
  useEffect(() => {
    return () => {
      void inputRef.current?.stop();
      inputRef.current = null;
    };
  }, []);

  // Auto-advance once the active stage has enough samples.
  useEffect(() => {
    if (phase.kind !== 'recording') return;
    const current = STAGES[phase.stage];
    if (!current) return;
    if (byClass[current] >= TARGET_SAMPLES_PER_CLASS) {
      if (phase.stage < STAGES.length - 1) {
        setPhase({ kind: 'recording', stage: phase.stage + 1 });
      } else {
        setPhase({ kind: 'review' });
      }
    }
  }, [byClass, phase]);

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

  const handleSkipStage = () => {
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
    } else setPhase({ kind: 'error', message: 'Failed to save calibration.' });
  };

  return (
    <main className="min-h-full flex flex-col items-center px-6 py-10 gap-6 max-w-2xl mx-auto">
      <header className="flex flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Calibrate your berimbau</h1>
        <p className="text-text-dim text-sm text-center">
          Play each sound a few times so the classifier learns your instrument.
        </p>
      </header>

      <StageStrip byClass={byClass} activeSound={activeSound} />

      {phase.kind === 'idle' && <Idle onStart={handleStartMic} />}
      {phase.kind === 'starting' && <Starting />}
      {phase.kind === 'recording' && (
        <Recording
          stage={phase.stage}
          byClass={byClass}
          onSkip={handleSkipStage}
        />
      )}
      {phase.kind === 'review' && (
        <Review
          samples={samples}
          onRestart={handleRestart}
          onSave={handleSave}
        />
      )}
      {phase.kind === 'saving' && <p className="text-text-dim">Saving…</p>}
      {phase.kind === 'saved' && (
        <Saved onHome={() => navigate('/')} onRestart={handleRestart} />
      )}
      {phase.kind === 'error' && (
        <div className="flex flex-col items-center gap-3 px-6 py-4 rounded-xl bg-bg-elev border border-border">
          <p className="text-red-400 text-sm">{phase.message}</p>
          <button type="button" onClick={handleStartMic} className="btn-primary">
            Try again
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/')}
        className="mt-2 text-xs text-text-dim underline"
      >
        Cancel and return home
      </button>
    </main>
  );
}

function StageStrip({
  byClass,
  activeSound,
}: {
  byClass: Record<ClassifiableSound, number>;
  activeSound: ClassifiableSound | null;
}) {
  return (
    <div className="w-full flex gap-3">
      {STAGES.map((sound) => {
        const isActive = sound === activeSound;
        const count = byClass[sound];
        const done = count >= TARGET_SAMPLES_PER_CLASS;
        return (
          <div
            key={sound}
            className={`flex-1 flex flex-col items-center gap-1 px-3 py-3 rounded-xl border transition ${
              isActive
                ? 'bg-bg-elev border-accent'
                : done
                ? 'bg-bg-elev border-border opacity-70'
                : 'bg-bg-elev border-border'
            }`}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-mono text-[10px] font-bold text-bg"
              style={{ background: SOUND_COLORS[sound] }}
            >
              {done ? '✓' : count}
            </div>
            <div className="text-xs font-medium tracking-wider">
              {SOUND_LABELS[sound]}
            </div>
            <div className="text-[10px] text-text-dim font-mono">
              {count} / {TARGET_SAMPLES_PER_CLASS}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Idle({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-5 rounded-2xl bg-bg-elev border border-border max-w-md text-center">
      <p className="text-text-dim text-sm">
        You'll play 5 of each sound. No need to be fast — leave a small pause
        between hits.
      </p>
      <button type="button" onClick={onStart} className="btn-primary">
        Open microphone
      </button>
    </div>
  );
}

function Starting() {
  return <p className="text-text-dim">Starting microphone…</p>;
}

function Recording({
  stage,
  byClass,
  onSkip,
}: {
  stage: number;
  byClass: Record<ClassifiableSound, number>;
  onSkip: () => void;
}) {
  const sound = STAGES[stage]!;
  const count = byClass[sound];
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-5 rounded-2xl bg-bg-elev border border-border max-w-md w-full">
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center text-2xl font-bold text-bg"
        style={{ background: SOUND_COLORS[sound] }}
      >
        {SOUND_LABELS[sound]}
      </div>
      <p className="text-center text-text-dim text-sm">
        Play <span className="text-text font-semibold">{SOUND_LABELS[sound]}</span>{' '}
        {count >= MIN_SAMPLES_PER_CLASS
          ? `— you can skip ahead or keep going (${count} / ${TARGET_SAMPLES_PER_CLASS}).`
          : `${TARGET_SAMPLES_PER_CLASS - count} more to go.`}
      </p>
      <button
        type="button"
        onClick={onSkip}
        disabled={count < MIN_SAMPLES_PER_CLASS}
        className="px-4 py-1.5 rounded-full bg-border text-text text-sm disabled:opacity-40"
      >
        Skip to next
      </button>
    </div>
  );
}

function Review({
  samples,
  onRestart,
  onSave,
}: {
  samples: CalibrationSample[];
  onRestart: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <p className="text-text-dim text-sm text-center">
        Collected {samples.length} samples. Review the scatter, then save.
      </p>
      <Scatter samples={samples} />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRestart}
          className="px-5 py-2 rounded-full bg-bg-elev border border-border text-text text-sm"
        >
          Restart
        </button>
        <button type="button" onClick={onSave} className="btn-primary">
          Save calibration
        </button>
      </div>
    </div>
  );
}

function Saved({ onHome, onRestart }: { onHome: () => void; onRestart: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-5 rounded-2xl bg-bg-elev border border-border max-w-md text-center">
      <p className="text-text">Calibration saved.</p>
      <p className="text-text-dim text-sm">
        Your profile is now loaded and will be used automatically the next time
        you practice.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRestart}
          className="px-4 py-1.5 rounded-full bg-bg border border-border text-sm"
        >
          Recalibrate
        </button>
        <button type="button" onClick={onHome} className="btn-primary">
          Back to home
        </button>
      </div>
    </div>
  );
}

/**
 * Tiny feature-space scatter. X = centroid (Hz), Y = f0 (Hz) — the two
 * axes the classifier cares about. Helpful as a sanity check that the
 * three clusters look distinct before saving.
 */
function Scatter({ samples }: { samples: CalibrationSample[] }) {
  const W = 360;
  const H = 180;
  const padding = 24;

  const xMin = 0;
  const xMax = 4000;
  const yMin = 0;
  const yMax = 500;

  const fx = (v: number) =>
    padding + ((v - xMin) / (xMax - xMin)) * (W - padding * 2);
  const fy = (v: number) =>
    H - padding - ((v - yMin) / (yMax - yMin)) * (H - padding * 2);

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="bg-bg-elev border border-border rounded-xl"
    >
      {/* Axes */}
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
