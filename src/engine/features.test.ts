import { describe, it, expect } from 'vitest';
import { autocorrF0, spectralCentroid, rms, extractFeatures } from './features';

const SR = 22050;

function sine(freqHz: number, durationSec: number, sampleRate: number): Float32Array {
  const n = Math.round(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  return out;
}

function whiteNoise(n: number, seed = 1): Float32Array {
  // Simple LCG — deterministic noise.
  let s = seed;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = (s / 0xffffffff) * 2 - 1;
  }
  return out;
}

describe('autocorrF0', () => {
  it('recovers a 220 Hz sine close to the ground truth', () => {
    const f0 = autocorrF0(sine(220, 0.1, SR), SR);
    expect(Math.abs(f0 - 220)).toBeLessThan(3);
  });

  it('recovers a 440 Hz sine close to the ground truth', () => {
    const f0 = autocorrF0(sine(440, 0.1, SR), SR);
    expect(Math.abs(f0 - 440)).toBeLessThan(5);
  });

  it('returns 0 for a too-short segment', () => {
    expect(autocorrF0(new Float32Array(32), SR)).toBe(0);
  });

  it('returns a value even for noise (no guarantees on which lag wins)', () => {
    // This is mostly a smoke test — autocorr on white noise is unstable,
    // but it should not crash and should return a finite number.
    const f = autocorrF0(whiteNoise(2048), SR);
    expect(Number.isFinite(f)).toBe(true);
  });
});

describe('spectralCentroid', () => {
  it('is low for a pure 220 Hz sine', () => {
    const c = spectralCentroid(sine(220, 0.05, SR), SR);
    // A clean sine should peak at the fundamental; the centroid is slightly
    // above due to windowing leakage but stays well below 1 kHz.
    expect(c).toBeLessThan(600);
    expect(c).toBeGreaterThan(100);
  });

  it('is higher for white noise than for a low sine', () => {
    const cSine = spectralCentroid(sine(200, 0.05, SR), SR);
    const cNoise = spectralCentroid(whiteNoise(1024), SR);
    expect(cNoise).toBeGreaterThan(cSine);
  });
});

describe('rms', () => {
  it('returns ~0.707 for a unit-amplitude sine', () => {
    expect(rms(sine(300, 0.05, SR))).toBeCloseTo(Math.SQRT1_2, 1);
  });

  it('returns 0 for an empty array', () => {
    expect(rms(new Float32Array(0))).toBe(0);
  });
});

describe('extractFeatures', () => {
  it('returns plausible values for a tonal segment', () => {
    const f = extractFeatures(sine(180, 0.1, SR), SR);
    expect(Math.abs(f.f0 - 180)).toBeLessThan(5);
    expect(f.centroid).toBeGreaterThan(0);
    expect(f.rms).toBeGreaterThan(0);
  });
});
