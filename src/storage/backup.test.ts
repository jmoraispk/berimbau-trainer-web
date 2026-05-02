import { beforeEach, describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import type { SessionRecord } from '@/engine/session';
import {
  applyBackup,
  buildBackup,
  parseBackup,
} from './backup';
import { clearSessions, listAllSessions, saveSession } from './sessions-store';
import { clearProfile, loadProfile, saveProfile } from './profiles-store';

function makeSession(overrides: Partial<SessionRecord> = {}): Omit<SessionRecord, 'id'> {
  return {
    startedAt: 1_000,
    endedAt: 2_000,
    toqueName: 'Angola',
    bpm: 60,
    elapsedSec: 60,
    accuracy: 0.8,
    totalScoredBeats: 10,
    bestStreak: 3,
    outcomeCounts: { perfect: 4, good: 3, wrong_sound: 1, late_correct: 0, late_wrong: 1, miss: 1, mistake: 0 },
    perSound: { dong: 0.9, ch: 0.7, ding: 0.8 },
    ...overrides,
  };
}

describe('parseBackup', () => {
  it('rejects malformed JSON', () => {
    expect(parseBackup('{').ok).toBe(false);
  });

  it('rejects JSON without the app marker', () => {
    expect(parseBackup('{"sessions":[]}').ok).toBe(false);
  });

  it('accepts a minimal well-formed backup', () => {
    const r = parseBackup(
      JSON.stringify({ app: 'berimbau-trainer', version: 1, sessions: [], calibration: null }),
    );
    expect(r.ok).toBe(true);
    expect(r.doc?.sessions).toEqual([]);
  });

  it('rejects when sessions is not an array', () => {
    expect(
      parseBackup(JSON.stringify({ app: 'berimbau-trainer', sessions: 'oops' })).ok,
    ).toBe(false);
  });
});

describe('buildBackup + applyBackup', () => {
  beforeEach(async () => {
    await Promise.all([clearSessions(), clearProfile()]);
  });

  it('round-trips calibration + sessions without drift', async () => {
    await saveProfile({
      version: 1,
      savedAt: 1_000_000,
      profiles: {
        dong: { f0Mean: 160, f0Std: 20, centroidMean: 700, centroidStd: 200 },
        ch: { f0Mean: 200, f0Std: 120, centroidMean: 2600, centroidStd: 500 },
        ding: { f0Mean: 220, f0Std: 30, centroidMean: 900, centroidStd: 300 },
      },
      sampleCount: { dong: 5, ch: 5, ding: 5 },
    });
    await saveSession(makeSession({ bpm: 60 }));
    await saveSession(makeSession({ bpm: 80 }));

    const doc = await buildBackup();
    expect(doc.app).toBe('berimbau-trainer');
    expect(doc.sessions).toHaveLength(2);
    expect(doc.calibration?.sampleCount.dong).toBe(5);

    await Promise.all([clearSessions(), clearProfile()]);
    const result = await applyBackup(doc, { replaceExisting: true });
    expect(result.sessionsWritten).toBe(2);
    expect(result.calibrationWritten).toBe(true);

    const [loaded, sessions] = await Promise.all([loadProfile(), listAllSessions()]);
    expect(loaded?.sampleCount.dong).toBe(5);
    expect(sessions).toHaveLength(2);
    // New ids were assigned; backup content otherwise intact.
    expect(new Set(sessions.map((s) => s.bpm))).toEqual(new Set([60, 80]));
  });

  it('merges sessions into existing history when replaceExisting is false', async () => {
    await saveSession(makeSession({ bpm: 60 }));
    const doc: ReturnType<typeof buildBackup> extends Promise<infer T> ? T : never = {
      app: 'berimbau-trainer',
      version: 1,
      exportedAt: new Date().toISOString(),
      calibration: null,
      sessions: [makeSession({ bpm: 100 }) as SessionRecord],
    };
    await applyBackup(doc);
    const all = await listAllSessions();
    expect(all).toHaveLength(2);
  });
});
