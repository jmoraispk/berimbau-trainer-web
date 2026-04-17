import { describe, it, expect } from 'vitest';
import { classify } from './classifier';

describe('classify', () => {
  it('routes a low tonal note with low centroid to dong', () => {
    const r = classify(160, 700);
    expect(r.sound).toBe('dong');
    expect(r.confidence).toBeGreaterThan(0.4);
  });

  it('routes a higher tonal note with low centroid to ding', () => {
    const r = classify(200, 900);
    expect(r.sound).toBe('ding');
    expect(r.confidence).toBeGreaterThan(0.4);
  });

  it('routes a high-centroid signal (even with some f0) to ch', () => {
    const r = classify(180, 2600);
    expect(r.sound).toBe('ch');
  });

  it('routes noisy-f0 + high-centroid to ch', () => {
    const r = classify(0, 2800);
    expect(r.sound).toBe('ch');
  });

  it('returns unknown or low-confidence for absurd feature pairs', () => {
    const r = classify(50, 10000);
    expect(r.sound === 'unknown' || r.confidence < 0.2).toBe(true);
  });

  it('rejects speech-like inputs (f0≈1160Hz, centroid≈4000Hz)', () => {
    // Regression: the classifier used to return conf=1.0 for this pair.
    const r = classify(1160, 4000);
    expect(r.sound === 'unknown' || r.confidence < 0.4).toBe(true);
  });

  it('returns unknown for centroid below the plausibility floor', () => {
    expect(classify(160, 100).sound).toBe('unknown');
  });

  it('returns unknown for centroid above the plausibility ceiling', () => {
    expect(classify(160, 8000).sound).toBe('unknown');
  });
});
