/**
 * Personal calibration — learn the user's berimbau's DONG/TCH/DING signature.
 *
 * Given a set of labeled (f0, centroid) samples per sound class, compute
 * a Gaussian profile (mean + std) that feeds the classifier. Minimums on
 * std prevent a single sample from producing a degenerate profile with
 * zero variance that would starve the likelihood scoring.
 *
 * Ported from AudioEngine.finish_calibration in engine/audio_engine.py.
 */

import type { CalibrationProfile, ClassifiableSound, Profiles } from './profiles';
import { DEFAULT_PROFILES } from './profiles';

export interface CalibrationSample {
  sound: ClassifiableSound;
  f0: number;
  centroid: number;
  /** Wall-clock timestamp when the sample was captured — useful for UI ordering. */
  at: number;
  /** RMS at the strike — surfaced in tooltips, not used in the profile. */
  rms?: number;
  /**
   * Raw mono PCM around the onset (50 ms pre + 450 ms post). Stored only
   * during the calibration session for thumbnail rendering and playback;
   * never serialised to IDB (the Saved profile is just the Gaussians).
   */
  segment?: Float32Array;
  sampleRate?: number;
  /** Seconds of pre-onset audio at the start of `segment`. */
  preSec?: number;
}

const F0_STD_MIN = 15;
const CENTROID_STD_MIN = 150;
const DEFAULT_F0_STD_ON_SINGLE = 20;
const DEFAULT_CENTROID_STD_FRAC = 0.2;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function std(values: number[], avg: number): number {
  if (values.length <= 1) return 0;
  let s = 0;
  for (const v of values) s += (v - avg) ** 2;
  return Math.sqrt(s / values.length);
}

/**
 * Compute a profile for a single sound class. Ignores samples with f0 <= 0
 * when computing f0 stats — TCH typically has noisy/zero f0, and including
 * those would pull the mean to zero. The profile's centroid stats use every
 * sample because centroid is always meaningful.
 */
export function profileFromSamples(
  samples: CalibrationSample[],
  fallback: CalibrationProfile,
): CalibrationProfile {
  if (samples.length === 0) return { ...fallback };

  const f0s = samples.map((s) => s.f0).filter((v) => v > 0);
  const centroids = samples.map((s) => s.centroid);

  const centroidMean = mean(centroids);
  const centroidStd =
    centroids.length > 1
      ? Math.max(std(centroids, centroidMean), CENTROID_STD_MIN)
      : Math.max(centroidMean * DEFAULT_CENTROID_STD_FRAC, CENTROID_STD_MIN);

  if (f0s.length === 0) {
    // All samples had noisy pitch (typical of TCH): keep the fallback f0
    // parameters so the classifier still has something to score against.
    return {
      f0Mean: fallback.f0Mean,
      f0Std: fallback.f0Std,
      centroidMean,
      centroidStd,
    };
  }

  const f0Mean = mean(f0s);
  const f0Std =
    f0s.length > 1
      ? Math.max(std(f0s, f0Mean), F0_STD_MIN)
      : Math.max(DEFAULT_F0_STD_ON_SINGLE, F0_STD_MIN);

  return { f0Mean, f0Std, centroidMean, centroidStd };
}

/**
 * Compute calibrated profiles for all three classes. Classes with zero
 * samples keep their default profile so the classifier still works.
 */
export function computeProfiles(samples: CalibrationSample[]): Profiles {
  const byClass: Record<ClassifiableSound, CalibrationSample[]> = {
    dong: [],
    ch: [],
    ding: [],
  };
  for (const s of samples) byClass[s.sound].push(s);
  return {
    dong: profileFromSamples(byClass.dong, DEFAULT_PROFILES.dong),
    ch: profileFromSamples(byClass.ch, DEFAULT_PROFILES.ch),
    ding: profileFromSamples(byClass.ding, DEFAULT_PROFILES.ding),
  };
}

export interface SavedCalibration {
  version: 1;
  savedAt: number;
  profiles: Profiles;
  sampleCount: Record<ClassifiableSound, number>;
}
