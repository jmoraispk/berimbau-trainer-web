/**
 * Calibration profiles — per-sound Gaussian parameters for classification.
 *
 * Physical notes on a real berimbau:
 *   - DONG: open string, low tonal pitch, low spectral centroid.
 *   - DING: coin pressed against the string, f0 ~ a whole tone above DONG,
 *           centroid similar to DONG.
 *   - TCH  ('ch'): coin muting the string — percussive, almost no stable f0
 *           but a very high spectral centroid from attack noise.
 *
 * The discriminator for tch is centroid, not f0; for dong/ding it is f0.
 *
 * Ported from DEFAULT_PROFILES in engine/audio_engine.py.
 */

import type { Sound } from './rhythms';

export interface CalibrationProfile {
  f0Mean: number;
  f0Std: number;
  centroidMean: number;
  centroidStd: number;
}

export type ClassifiableSound = Exclude<Sound, 'rest'>;

export type Profiles = Record<ClassifiableSound, CalibrationProfile>;

export const DEFAULT_PROFILES: Profiles = {
  dong: { f0Mean: 160, f0Std: 35, centroidMean: 700, centroidStd: 300 },
  ch: { f0Mean: 200, f0Std: 120, centroidMean: 2600, centroidStd: 600 },
  ding: { f0Mean: 200, f0Std: 40, centroidMean: 900, centroidStd: 350 },
};
