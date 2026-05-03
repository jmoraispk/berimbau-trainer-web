import { type IntervalToken, type Sound, type ToquePattern } from '@/engine/rhythms';
import { SoundSymbol } from './SoundSymbol';
import { useRealRhythm } from '@/settings/real-rhythm';

/**
 * Variable-length pattern preview. One card cell per beat (interval).
 * tch_tch beats render two small × side-by-side; everything else is a
 * single centered glyph; rests render as dim placeholders.
 *
 * Layout: capped at 4 columns so 8-beat patterns (e.g. São Bento Grande
 * Regional) wrap into a balanced 4×2 grid instead of cramming into a
 * single very-narrow row. ≤4 beats stay on one row.
 */
export function PatternPreview({
  toque,
  cellSize = 'normal',
}: {
  toque: ToquePattern;
  cellSize?: 'normal' | 'compact';
}) {
  const { realRhythm } = useRealRhythm();
  if (toque.intervals.length === 0) {
    return (
      <div className="card p-4 text-center text-sm text-text-dim">
        Pattern coming soon.
      </div>
    );
  }
  // When the user has flipped the "real rhythm" preference, shift the
  // displayed sequence by one slot so the trailing rest (or trailing
  // beat for toques without a rest) becomes the first cell — matches
  // how a capoeirista counts the toque. Audio order is unchanged.
  const intervals = realRhythm
    ? [
        toque.intervals[toque.intervals.length - 1]!,
        ...toque.intervals.slice(0, -1),
      ]
    : toque.intervals;
  const cycleBeats = intervals.length;
  const padClass = cellSize === 'compact' ? 'p-2' : 'p-3';
  const symbolSize = cellSize === 'compact' ? 22 : 28;
  const tchSymbolSize = cellSize === 'compact' ? 14 : 18;

  // Balanced split: at most 4 columns, rows derived from beat count so
  // 6 beats become 3×2 (not 4+2), 8 become 4×2, 12 become 4×3.
  const rows = Math.ceil(cycleBeats / 4);
  const cols = Math.ceil(cycleBeats / rows);

  return (
    <div className={`card ${padClass} flex flex-col gap-2 w-full`}>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {intervals.map((token, i) => (
          <div key={i} className="flex flex-col gap-1">
            <PatternCell
              token={token}
              symbolSize={symbolSize}
              tchSymbolSize={tchSymbolSize}
            />
            <span className="text-[9px] font-mono text-text-dim tracking-wider leading-none text-center">
              {i + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PatternCell({
  token,
  symbolSize,
  tchSymbolSize,
}: {
  token: IntervalToken;
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

  if (token === 'tch_tch') {
    return (
      <div className="aspect-square rounded-md bg-bg flex items-center justify-center gap-1 border border-border">
        <SoundSymbol sound="ch" size={tchSymbolSize} glow={false} />
        <SoundSymbol sound="ch" size={tchSymbolSize} glow={false} />
      </div>
    );
  }

  // Single-glyph cell. Map authoring token to internal Sound.
  const sound: Sound = token === 'tch' ? 'ch' : token;
  return (
    <div className="aspect-square rounded-md bg-bg flex items-center justify-center border border-border">
      <SoundSymbol sound={sound} size={symbolSize} />
    </div>
  );
}
