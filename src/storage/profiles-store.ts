/**
 * Persist calibration profiles across sessions via IndexedDB.
 *
 * Single object store, single record (key 'default'). Plenty of room to
 * grow to named profiles later (multiple berimbaus, multiple users).
 *
 *   DB:     berimbau-trainer
 *   Store:  calibration   (keyed by id, records = SavedCalibration)
 *
 * We swallow IDB errors and return null/false — an in-memory default
 * profile is always acceptable, and surfacing IDB hiccups in the UI
 * would be noise.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { SavedCalibration } from '@/engine/calibration';

const DB_NAME = 'berimbau-trainer';
const DB_VERSION = 1;
const STORE = 'calibration';
const DEFAULT_ID = 'default';

interface StoredRecord {
  id: string;
  calibration: SavedCalibration;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function loadProfile(): Promise<SavedCalibration | null> {
  try {
    const db = await getDB();
    const record = (await db.get(STORE, DEFAULT_ID)) as StoredRecord | undefined;
    return record?.calibration ?? null;
  } catch (err) {
    console.warn('[profiles-store] load failed', err);
    return null;
  }
}

export async function saveProfile(calibration: SavedCalibration): Promise<boolean> {
  try {
    const db = await getDB();
    await db.put(STORE, { id: DEFAULT_ID, calibration } satisfies StoredRecord);
    return true;
  } catch (err) {
    console.warn('[profiles-store] save failed', err);
    return false;
  }
}

export async function clearProfile(): Promise<boolean> {
  try {
    const db = await getDB();
    await db.delete(STORE, DEFAULT_ID);
    return true;
  } catch (err) {
    console.warn('[profiles-store] clear failed', err);
    return false;
  }
}
