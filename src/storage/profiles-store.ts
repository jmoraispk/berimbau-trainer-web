/**
 * Persist calibration profiles across sessions via IndexedDB.
 *
 * Single record (keyed 'default'). Plenty of room to grow to named
 * profiles later (multiple berimbaus, multiple users).
 *
 * We swallow IDB errors and return null/false — an in-memory default
 * profile is always acceptable, and surfacing IDB hiccups in the UI
 * would be noise.
 */

import type { SavedCalibration } from '@/engine/calibration';
import { CALIBRATION_STORE, getDB } from './db';

const DEFAULT_ID = 'default';

interface StoredRecord {
  id: string;
  calibration: SavedCalibration;
}

export async function loadProfile(): Promise<SavedCalibration | null> {
  try {
    const db = await getDB();
    const record = (await db.get(CALIBRATION_STORE, DEFAULT_ID)) as StoredRecord | undefined;
    return record?.calibration ?? null;
  } catch (err) {
    console.warn('[profiles-store] load failed', err);
    return null;
  }
}

export async function saveProfile(calibration: SavedCalibration): Promise<boolean> {
  try {
    const db = await getDB();
    await db.put(CALIBRATION_STORE, { id: DEFAULT_ID, calibration } satisfies StoredRecord);
    return true;
  } catch (err) {
    console.warn('[profiles-store] save failed', err);
    return false;
  }
}

export async function clearProfile(): Promise<boolean> {
  try {
    const db = await getDB();
    await db.delete(CALIBRATION_STORE, DEFAULT_ID);
    return true;
  } catch (err) {
    console.warn('[profiles-store] clear failed', err);
    return false;
  }
}
