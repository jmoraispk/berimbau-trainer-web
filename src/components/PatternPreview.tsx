import { type IntervalToken, type Sound, type ToquePattern } from '@/engine/rhythms';
import { SoundSymbol } from './SoundSymbol';

/**
 * Variable-length pattern preview. One card cell per beat (interval).
 * tch_tch beats render two small × side-by-side; everything else is a
 * single centered glyph; rests render as dim placeholders.
 */
export function PatternPreview({
  toque,
  cellSize = 'normal',
}: {
  toque: ToquePattern;
  cellSize?: 'normal' | 'compact';
}) {
  if (toque.intervals.length === 0) {
    return (
      <div className="card p-4 text-center text-sm text-text-dim">
        Pattern coming soon.
      </div>
    );
  }
  const cycleBeats = toque.intervals.length;
  const padClass = cellSize === 'compact' ? 'p-2' : 'p-3';
  const symbolSize = cellSize === 'compact' ? 22 : 28;
  const tchSymbolSize = cellSize === 'compact' ? 14 : 18;

  return (
    <div className={`card ${padClass} flex flex-col gap-2 w-full`}>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cycleBeats}, minmax(0, 1fr))` }}
      >
        {toque.intervals.map((token, i) => (
          <PatternCell
            key={i}
            token={token}
            accent={i === 0}
            symbolSize={symbolSize}
            tchSymbolSize={tchSymbolSize}
          />
        ))}
      </div>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cycleBeats}, minmax(0, 1fr))` }}
      >
        {toque.intervals.map((_, i) => (
          <div
            key={i}
            className="text-[9px] text-center font-mono text-text-dim tracking-wider"
          >
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

function PatternCell({
  token,
  accent,
  symbolSize,
  tchSymbolSize,
}: {
  token: IntervalToken;
  accent: boolean;
  symbolSize: number;
  tchSymbolSize: number;
}) {
  if (token === 'rest') {
    return (
      <div className="aspect-square rounded-md bg-bg/60 border border-border/60 flex items-center justify-center text-text-dim/60 text-xs font-mono">
        ·
      </div>
    );
  }

  const ringClass = accent
    ? 'ring-2 ring-accent/30 ring-offset-1 ring-offset-bg-elev'
    : '';

  if (token === 'tch_tch') {
    return (
      <div
        className={`aspect-square rounded-md bg-bg flex items-center justify-center gap-1 border border-border ${ringClass}`}
      >
        <SoundSymbol sound="ch" size={tchSymbolSize} glow={false} />
        <SoundSymbol sound="ch" size={tchSymbolSize} glow={false} />
      </div>
    );
  }

  // Single-glyph cell. Map authoring token to internal Sound.
  const sound: Sound = token === 'tch' ? 'ch' : token;
  return (
    <div
      className={`aspect-square rounded-md bg-bg flex items-center justify-center border border-border ${ringClass}`}
    >
      <SoundSymbol sound={sound} size={symbolSize} />
    </div>
  );
}
