/**
 * Shared IndexedDB handle for the app.
 *
 * All object stores live in one database so version upgrades apply
 * atomically (you can't half-upgrade a user's data). Each store is
 * owned by a thin module under src/storage/.
 *
 *   DB: berimbau-trainer
 *     calibration  (v1): keyPath 'id'      — calibration profiles
 *     sessions     (v2): autoIncrement     — completed practice sessions
 *     lab_clips    (v3): keyPath 'slotId'  — Lab dev-mode raw recordings
 */

import { openDB, type IDBPDatabase } from 'idb';

export const DB_NAME = 'berimbau-trainer';
export const DB_VERSION = 3;
export const CALIBRATION_STORE = 'calibration';
export const SESSIONS_STORE = 'sessions';
export const LAB_CLIPS_STORE = 'lab_clips';

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore(CALIBRATION_STORE, { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          const sessions = db.createObjectStore(SESSIONS_STORE, {
            keyPath: 'id',
            autoIncrement: true,
          });
          sessions.createIndex('by_endedAt', 'endedAt');
        }
        if (oldVersion < 3) {
          db.createObjectStore(LAB_CLIPS_STORE, { keyPath: 'slotId' });
        }
      },
    });
  }
  return dbPromise;
}

/** Test-only: reset the cached handle so fake-indexeddb can be swapped in. */
export function resetDBCache(): void {
  dbPromise = null;
}
