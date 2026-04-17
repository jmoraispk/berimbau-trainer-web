/**
 * Smoke test the IDB persistence round-trip using fake-indexeddb, which
 * implements the IDB spec in-memory. We don't need a browser here.
 */

import { beforeEach, describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { computeProfiles } from '@/engine/calibration';
import { loadProfile, saveProfile, clearProfile } from './profiles-store';

describe('profiles-store', () => {
  beforeEach(async () => {
    await clearProfile();
  });

  it('returns null when nothing has been saved', async () => {
    expect(await loadProfile()).toBeNull();
  });

  it('round-trips a saved calibration', async () => {
    const profiles = computeProfiles([
      { sound: 'dong', f0: 160, centroid: 700, at: 0 },
      { sound: 'dong', f0: 170, centroid: 720, at: 0 },
    ]);
    const saved = {
      version: 1 as const,
      savedAt: Date.now(),
      profiles,
      sampleCount: { dong: 2, ch: 0, ding: 0 },
    };
    const ok = await saveProfile(saved);
    expect(ok).toBe(true);

    const loaded = await loadProfile();
    expect(loaded).not.toBeNull();
    expect(loaded?.profiles.dong.f0Mean).toBeCloseTo(165, 5);
    expect(loaded?.sampleCount.dong).toBe(2);
  });

  it('overwrites when saved twice', async () => {
    const baseProfiles = computeProfiles([
      { sound: 'dong', f0: 150, centroid: 700, at: 0 },
    ]);
    await saveProfile({
      version: 1,
      savedAt: 1,
      profiles: baseProfiles,
      sampleCount: { dong: 1, ch: 0, ding: 0 },
    });

    const nextProfiles = computeProfiles([
      { sound: 'ding', f0: 220, centroid: 900, at: 0 },
    ]);
    await saveProfile({
      version: 1,
      savedAt: 2,
      profiles: nextProfiles,
      sampleCount: { dong: 0, ch: 0, ding: 1 },
    });

    const loaded = await loadProfile();
    expect(loaded?.sampleCount.ding).toBe(1);
    expect(loaded?.sampleCount.dong).toBe(0);
  });
});
