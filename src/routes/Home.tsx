import { Link } from 'wouter';
import { TOQUES, SOUND_COLORS, SOUND_LABELS, type Sound } from '@/engine/rhythms';

const SOUNDS: Sound[] = ['dong', 'ch', 'ding'];

export function Home() {
  return (
    <main className="min-h-full flex flex-col items-center justify-center px-6 py-12 gap-10">
      <header className="flex flex-col items-center gap-3">
        <img src="/icon.svg" alt="" className="w-20 h-20" />
        <h1 className="text-4xl font-semibold tracking-tight">Berimbau Trainer</h1>
        <p className="text-text-dim text-center max-w-md">
          Practice your toques. Get real-time feedback on timing and sound classification.
        </p>
      </header>

      <section className="flex gap-4">
        {SOUNDS.map((s) => (
          <div
            key={s}
            className="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl bg-bg-elev border border-border"
          >
            <div
              className="w-10 h-10 rounded-full"
              style={{ background: SOUND_COLORS[s] }}
            />
            <div className="text-sm font-medium tracking-wider">{SOUND_LABELS[s]}</div>
          </div>
        ))}
      </section>

      <Link
        href="/practice"
        className="px-8 py-3 rounded-full bg-accent text-bg font-semibold tracking-wide shadow-lg hover:brightness-110 active:scale-95 transition"
      >
        Start practicing
      </Link>

      <footer className="text-text-dim text-xs">
        {Object.keys(TOQUES).length} toques · v2 · web
      </footer>
    </main>
  );
}
