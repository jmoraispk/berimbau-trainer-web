/**
 * Export / import the user's local state (calibration + session history)
 * as a single JSON document. No PII — profiles are (f0, centroid)
 * Gaussian parameters and sessions are accuracy summaries. Still, the
 * format is human-inspectable so users can see what's going where.
 */

import type { SavedCalibration } from '@/engine/calibration';
import type { SessionRecord } from '@/engine/session';
import { clearProfile, loadProfile, saveProfile } from './profiles-store';
import { clearSessions, listAllSessions, saveSession } from './sessions-store';

export const BACKUP_VERSION = 1;

export interface BackupDocument {
  app: 'berimbau-trainer';
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  calibration: SavedCalibration | null;
  sessions: SessionRecord[];
}

export async function buildBackup(): Promise<BackupDocument> {
  const [calibration, sessions] = await Promise.all([
    loadProfile(),
    listAllSessions(),
  ]);
  return {
    app: 'berimbau-trainer',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    calibration,
    sessions,
  };
}

export interface BackupParseResult {
  ok: boolean;
  error?: string;
  doc?: BackupDocument;
}

/**
 * Validate a string payload and return the parsed BackupDocument. Strict
 * enough that random JSON files are rejected, loose enough to survive
 * future version bumps (future versions are accepted as long as the
 * shape matches the fields we care about).
 */
export function parseBackup(raw: string): BackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Empty or non-object payload.' };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.app !== 'berimbau-trainer') {
    return { ok: false, error: "Not a Berimbau Pro backup (missing app='berimbau-trainer' marker)." };
  }
  if (!Array.isArray(obj.sessions)) {
    return { ok: false, error: 'Missing sessions array.' };
  }
  if (obj.calibration !== null && typeof obj.calibration !== 'object') {
    return { ok: false, error: 'Invalid calibration field.' };
  }
  return { ok: true, doc: obj as unknown as BackupDocument };
}

export interface ApplyBackupOptions {
  /** When true, existing data is cleared before writing the backup. */
  replaceExisting?: boolean;
}

export interface ApplyBackupResult {
  sessionsWritten: number;
  calibrationWritten: boolean;
}

/**
 * Write the contents of a BackupDocument into IDB. Default mode is
 * merge-and-replace: the calibration record gets overwritten with the
 * backup's (if any) and every session in the backup is inserted as a
 * new record — IDs are stripped so autoIncrement assigns fresh ones,
 * avoiding collisions with existing local history.
 */
export async function applyBackup(
  doc: BackupDocument,
  options: ApplyBackupOptions = {},
): Promise<ApplyBackupResult> {
  if (options.replaceExisting) {
    await Promise.all([clearProfile(), clearSessions()]);
  }
  let calibrationWritten = false;
  if (doc.calibration) {
    calibrationWritten = await saveProfile(doc.calibration);
  }
  let sessionsWritten = 0;
  for (const s of doc.sessions) {
    // Strip backup's id so IDB assigns a fresh one on insert.
    const { id: _id, ...rest } = s;
    void _id;
    const id = await saveSession(rest);
    if (id != null) sessionsWritten += 1;
  }
  return { sessionsWritten, calibrationWritten };
}
