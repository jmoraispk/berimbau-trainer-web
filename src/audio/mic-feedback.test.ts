import { describe, it, expect } from 'vitest';
import {
  classifyMicLevel,
  STRIKE_RMS,
  SILENCE_FLOOR_RMS,
  SILENCE_GRACE_SEC,
} from './mic-feedback';

describe('classifyMicLevel', () => {
  it('reports "hearing" whenever the current level clears the strike threshold', () => {
    expect(
      classifyMicLevel({ level: STRIKE_RMS, peakLevel: STRIKE_RMS, elapsedSec: 0 }),
    ).toBe('hearing');
    expect(
      classifyMicLevel({ level: 0.25, peakLevel: 0.25, elapsedSec: 0.1 }),
    ).toBe('hearing');
  });

  it('reports "hearing" even after the grace window — a live strike always wins', () => {
    expect(
      classifyMicLevel({
        level: 0.2,
        peakLevel: 0.2,
        elapsedSec: SILENCE_GRACE_SEC + 5,
      }),
    ).toBe('hearing');
  });

  it('stays "listening" before the grace window even with no signal', () => {
    expect(
      classifyMicLevel({ level: 0, peakLevel: 0, elapsedSec: SILENCE_GRACE_SEC - 0.5 }),
    ).toBe('listening');
  });

  it('warns "silent" only once the grace window has elapsed with no signal', () => {
    expect(
      classifyMicLevel({ level: 0, peakLevel: 0, elapsedSec: SILENCE_GRACE_SEC + 0.1 }),
    ).toBe('silent');
  });

  it('does not warn when the mic is clearly alive (peak above the floor), even between strikes', () => {
    // Quiet room tone above the silence floor but below a strike: the mic
    // works, the user just isn't striking this instant.
    expect(
      classifyMicLevel({
        level: 0.0005,
        peakLevel: SILENCE_FLOOR_RMS * 3,
        elapsedSec: SILENCE_GRACE_SEC + 10,
      }),
    ).toBe('listening');
  });

  it('honours custom thresholds', () => {
    expect(
      classifyMicLevel({
        level: 0.05,
        peakLevel: 0.05,
        elapsedSec: 0,
        strikeThreshold: 0.1,
      }),
    ).toBe('listening');
    expect(
      classifyMicLevel({
        level: 0,
        peakLevel: 0,
        elapsedSec: 2,
        graceSec: 1,
      }),
    ).toBe('silent');
  });
});
