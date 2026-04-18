/**
 * Persist completed practice sessions via IndexedDB.
 *
 *   Store: sessions (autoIncrement id, index by_endedAt)
 *
 * History is append-only — we never update or delete individual records.
 * Clear is exposed for testing and for a future "reset history" button.
 */

import type { SessionRecord } from '@/engine/session';
import { SESSIONS_STORE, getDB } from './db';

export async function saveSession(
  record: Omit<SessionRecord, 'id'>,
): Promise<number | null> {
  try {
    const db = await getDB();
    const id = (await db.add(SESSIONS_STORE, record)) as number;
    return id;
  } catch (err) {
    console.warn('[sessions-store] save failed', err);
    return null;
  }
}

/**
 * Most recent N sessions, newest first. Uses the endedAt index so
 * pagination is cheap even after the store grows.
 */
export async function listRecentSessions(limit = 10): Promise<SessionRecord[]> {
  try {
    const db = await getDB();
    const tx = db.transaction(SESSIONS_STORE, 'readonly');
    const index = tx.store.index('by_endedAt');
    const out: SessionRecord[] = [];
    let cursor = await index.openCursor(null, 'prev');
    while (cursor && out.length < limit) {
      out.push(cursor.value as SessionRecord);
      cursor = await cursor.continue();
    }
    await tx.done;
    return out;
  } catch (err) {
    console.warn('[sessions-store] list failed', err);
    return [];
  }
}

export async function listAllSessions(): Promise<SessionRecord[]> {
  try {
    const db = await getDB();
    return (await db.getAll(SESSIONS_STORE)) as SessionRecord[];
  } catch (err) {
    console.warn('[sessions-store] listAll failed', err);
    return [];
  }
}

export async function clearSessions(): Promise<boolean> {
  try {
    const db = await getDB();
    await db.clear(SESSIONS_STORE);
    return true;
  } catch (err) {
    console.warn('[sessions-store] clear failed', err);
    return false;
  }
}
