/**
 * Persist Lab dev-mode raw recordings to IndexedDB.
 *
 * Four slots, keyed by slotId ('ch' | 'dong' | 'ding' | 'song'). Each
 * record holds the raw Float32Array straight from the worklet — IDB's
 * structured-clone supports TypedArrays natively, so no encoding is
 * needed at the storage boundary.
 *
 * Errors are swallowed and surface as null/false; clips are dev-tool
 * artifacts, not the user's primary data, and the in-memory fallback
 * is always acceptable.
 */

import { LAB_CLIPS_STORE, getDB } from './db';

export type LabClipSlotId = 'ch' | 'dong' | 'ding' | 'song';

export interface StoredLabClip {
  slotId: LabClipSlotId;
  samples: Float32Array;
  sampleRate: number;
  durationSec: number;
  recordedAt: number;
}

export async function listLabClips(): Promise<StoredLabClip[]> {
  try {
    const db = await getDB();
    return ((await db.getAll(LAB_CLIPS_STORE)) ?? []) as StoredLabClip[];
  } catch (err) {
    console.warn('[clips-store] list failed', err);
    return [];
  }
}

export async function saveLabClip(clip: StoredLabClip): Promise<boolean> {
  try {
    const db = await getDB();
    await db.put(LAB_CLIPS_STORE, clip);
    return true;
  } catch (err) {
    console.warn('[clips-store] save failed', err);
    return false;
  }
}

export async function deleteLabClip(slotId: LabClipSlotId): Promise<boolean> {
  try {
    const db = await getDB();
    await db.delete(LAB_CLIPS_STORE, slotId);
    return true;
  } catch (err) {
    console.warn('[clips-store] delete failed', err);
    return false;
  }
}
