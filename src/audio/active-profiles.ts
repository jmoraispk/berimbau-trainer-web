/**
 * Module-level cache of the currently active calibration profile.
 *
 * Loaded lazily on first read (usually during app init). AudioInput asks
 * for it if the caller didn't pass profiles explicitly, so the mic pipeline
 * automatically picks up a saved calibration without prop-drilling.
 *
 * Writers (the Calibrate route) push fresh profiles via setActiveProfiles
 * so a recalibration takes effect without a reload.
 */

import type { SavedCalibration } from '@/engine/calibration';
import { loadProfile } from '@/storage/profiles-store';

let cached: SavedCalibration | null = null;
let loadPromise: Promise<SavedCalibration | null> | null = null;

/** Kick off the IDB read. Call on app start so the cache is warm. */
export function preloadActiveProfiles(): Promise<SavedCalibration | null> {
  if (loadPromise) return loadPromise;
  loadPromise = loadProfile().then((saved) => {
    cached = saved;
    return saved;
  });
  return loadPromise;
}

/** Synchronous snapshot — returns null until preload resolves. */
export function getActiveProfiles(): SavedCalibration | null {
  return cached;
}

/** Called by the calibration flow after a successful save. */
export function setActiveProfiles(saved: SavedCalibration): void {
  cached = saved;
  loadPromise = Promise.resolve(saved);
}

export function clearActiveProfiles(): void {
  cached = null;
  loadPromise = Promise.resolve(null);
}
