import { useEffect, useState } from 'react';

/**
 * Developer-mode flag, persisted to localStorage. When on, the Home
 * top-bar surfaces a Lab chip next to the profile link, and other
 * dev-only affordances can gate on the same flag.
 *
 * No React Context — a tiny module-level subscriber set lets the
 * Settings toggle and the Home top-bar re-render in lock-step from
 * the same in-memory state.
 */

const KEY = 'berimbau:dev-mode';
type Listener = () => void;
const listeners = new Set<Listener>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function useDevMode(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(read);
  useEffect(() => {
    const sync = () => setEnabled(read());
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  const set = (v: boolean) => {
    try {
      localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      // localStorage can be disabled in some embedded browsers; toggle
      // still works in-memory for the current page lifetime.
    }
    listeners.forEach((l) => l());
  };
  return [enabled, set];
}
