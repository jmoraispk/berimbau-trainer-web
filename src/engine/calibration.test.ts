import { describe, it, expect } from 'vitest';
import { computeProfiles, profileFromSamples, type CalibrationSample } from './calibration';
import { DEFAULT_PROFILES } from './profiles';

const s = (
  sound: CalibrationSample['sound'],
  f0: number,
  centroid: number,
): CalibrationSample => ({ sound, f0, centroid, at: 0 });

describe('profileFromSamples', () => {
  it('returns the fallback when given no samples', () => {
    const p = profileFromSamples([], DEFAULT_PROFILES.dong);
    expect(p).toEqual(DEFAULT_PROFILES.dong);
  });

  it('computes mean and std from multiple samples', () => {
    const p = profileFromSamples(
      [s('dong', 150, 700), s('dong', 160, 750), s('dong', 170, 800)],
      DEFAULT_PROFILES.dong,
    );
    expect(p.f0Mean).toBeCloseTo(160, 5);
    expect(p.centroidMean).toBeCloseTo(750, 5);
    // std is bounded below by the min, so not the literal population std
    expect(p.f0Std).toBeGreaterThanOrEqual(15);
    expect(p.centroidStd).toBeGreaterThanOrEqual(150);
  });

  it('uses fallback f0 when all samples have f0=0 (TCH case)', () => {
    const p = profileFromSamples(
      [s('ch', 0, 2500), s('ch', 0, 2600), s('ch', 0, 2700)],
      DEFAULT_PROFILES.ch,
    );
    expect(p.f0Mean).toBe(DEFAULT_PROFILES.ch.f0Mean);
    expect(p.f0Std).toBe(DEFAULT_PROFILES.ch.f0Std);
    expect(p.centroidMean).toBeCloseTo(2600, 5);
  });

  it('floors std from a single sample so the profile is never degenerate', () => {
    const p = profileFromSamples([s('ding', 220, 900)], DEFAULT_PROFILES.ding);
    expect(p.f0Std).toBeGreaterThanOrEqual(15);
    expect(p.centroidStd).toBeGreaterThanOrEqual(150);
  });
});

describe('computeProfiles', () => {
  it('computes profiles per class and falls back per-class when absent', () => {
    const profiles = computeProfiles([
      s('dong', 150, 700),
      s('dong', 170, 800),
    ]);
    expect(profiles.dong.f0Mean).toBeCloseTo(160, 5);
    // No samples for ch or ding → both keep defaults
    expect(profiles.ch).toEqual(DEFAULT_PROFILES.ch);
    expect(profiles.ding).toEqual(DEFAULT_PROFILES.ding);
  });
});
