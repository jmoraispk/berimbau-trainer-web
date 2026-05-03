import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';

/**
 * "Real rhythm" — when ON, the visual pattern is shifted by one slot
 * so the trailing rest (or trailing beat for toques without one) falls
 * on the canonical capoeira downbeat at 3 o'clock instead of the
 * tch-tch. Audio scheduling is identical either way; only the angular
 * frame of the practice circle and the cell ordering of PatternPreview
 * shift.
 *
 * Persisted in localStorage so the choice survives reloads. Provider is
 * wired up in main.tsx alongside the i18n provider.
 */

const KEY = 'berimbau:real-rhythm';

interface Ctx {
  realRhythm: boolean;
  setRealRhythm: (v: boolean) => void;
}

const Context = createContext<Ctx | null>(null);

function readInitial(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(KEY) === 'true';
}

export function RealRhythmProvider({ children }: { children: ReactNode }) {
  const [realRhythm, setState] = useState<boolean>(readInitial);

  const setRealRhythm = (v: boolean) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, String(v));
    }
    setState(v);
  };

  return (
    <Context.Provider value={{ realRhythm, setRealRhythm }}>
      {children}
    </Context.Provider>
  );
}

export function useRealRhythm(): Ctx {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useRealRhythm must be used within RealRhythmProvider');
  return ctx;
}
