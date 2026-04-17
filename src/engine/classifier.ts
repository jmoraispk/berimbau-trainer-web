/**
 * Classifier — map (f0, centroid) pairs to a sound class with a confidence.
 *
 *   - TCH (ch) is a mute — high spectral centroid, noisy f0. Weight centroid
 *     heavily (0.8) and treat f0 as a weak signal (0.2).
 *   - DONG / DING are tonal — f0 discriminates, centroid loosely separates
 *     them from TCH. Weight f0 slightly higher (0.55 / 0.45).
 *
 * Hard plausibility floors reject speech / coughs / knocks so they don't
 * pick a class with misleadingly high confidence.
 *
 * Ported from AudioEngine._classify in engine/audio_engine.py.
 */

import type { ClassifiableSound, Profiles } from './profiles';
import { DEFAULT_PROFILES } from './profiles';

export type Classification =
  | { sound: ClassifiableSound; confidence: number }
  | { sound: 'unknown'; confidence: number };

const MIN_CENTROID = 200;
const MAX_CENTROID = 6500;
const MAX_F0 = 900;
const MIN_RAW_SCORE = 0.2;

export function classify(
  f0: number,
  centroid: number,
  profiles: Profiles = DEFAULT_PROFILES,
): Classification {
  if (centroid < MIN_CENTROID || centroid > MAX_CENTROID) {
    return { sound: 'unknown', confidence: 0 };
  }
  if (f0 > MAX_F0) {
    return { sound: 'unknown', confidence: 0 };
  }

  const sounds: ClassifiableSound[] = ['dong', 'ch', 'ding'];
  const scores: Record<ClassifiableSound, number> = { dong: 0, ch: 0, ding: 0 };

  for (const sound of sounds) {
    const prof = profiles[sound];

    let f0Score: number;
    if (f0 > 0) {
      const sigma = Math.max(prof.f0Std, 10);
      f0Score = Math.exp(-0.5 * ((f0 - prof.f0Mean) / sigma) ** 2);
    } else {
      // Noisy pitch is expected for tch — don't punish the class for it.
      f0Score = 0.3;
    }

    const cSigma = Math.max(prof.centroidStd, 150);
    const cScore = Math.exp(-0.5 * ((centroid - prof.centroidMean) / cSigma) ** 2);

    scores[sound] = sound === 'ch' ? f0Score * 0.2 + cScore * 0.8 : f0Score * 0.55 + cScore * 0.45;
  }

  let best: ClassifiableSound = 'dong';
  for (const s of sounds) if (scores[s] > scores[best]) best = s;
  const bestScore = scores[best];

  if (bestScore < MIN_RAW_SCORE) {
    return { sound: 'unknown', confidence: bestScore };
  }

  // Posterior alone can approach 1 when one score is only slightly less tiny
  // than the others — that's how v1 shipped conf=1.00 for speech. Scaling by
  // best_score knocks it back down when nothing matches well.
  const total = scores.dong + scores.ch + scores.ding + 1e-9;
  const posterior = bestScore / total;
  const confidence = Math.min(1, posterior * (0.5 + bestScore));
  return { sound: best, confidence };
}
