import { beforeEach, describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import type { SessionRecord } from '@/engine/session';
import {
  clearSessions,
  listAllSessions,
  listRecentSessions,
  saveSession,
} from './sessions-store';

function make(endedAt: number, overrides: Partial<SessionRecord> = {}): Omit<SessionRecord, 'id'> {
  return {
    startedAt: endedAt - 60_000,
    endedAt,
    toqueName: 'Angola',
    bpm: 60,
    elapsedSec: 60,
    accuracy: 0.8,
    totalScoredBeats: 10,
    bestStreak: 3,
    outcomeCounts: { perfect: 5, good: 3, wrong_sound: 0, late: 1, miss: 1, mistake: 0 },
    perSound: { dong: 0.9, ch: 0.7, ding: 0.8 },
    ...overrides,
  };
}

describe('sessions-store', () => {
  beforeEach(async () => {
    await clearSessions();
  });

  it('returns an empty list when nothing has been saved', async () => {
    expect(await listRecentSessions()).toEqual([]);
    expect(await listAllSessions()).toEqual([]);
  });

  it('saves a session and returns it with an assigned id', async () => {
    const id = await saveSession(make(1_000_000));
    expect(typeof id).toBe('number');
    const all = await listAllSessions();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(id);
  });

  it('listRecentSessions returns newest-first and honors the limit', async () => {
    await saveSession(make(1000, { bpm: 60 }));
    await saveSession(make(3000, { bpm: 80 }));
    await saveSession(make(2000, { bpm: 70 }));
    const recent = await listRecentSessions(2);
    expect(recent.map((s) => s.bpm)).toEqual([80, 70]);
  });
});
