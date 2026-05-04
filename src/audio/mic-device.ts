/**
 * Persisted mic-device preference. Read by AudioInput.start() so the
 * worklet listens through the user's chosen input instead of whatever
 * the OS picked as default. Lives in localStorage to keep it adjacent
 * to the rest of the audio config (no Context needed since AudioInput
 * is non-React).
 */

const KEY = 'berimbau:mic-device';

export function getMicDeviceId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(KEY) || null;
}

export function setMicDeviceId(id: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (id) localStorage.setItem(KEY, id);
  else localStorage.removeItem(KEY);
}
