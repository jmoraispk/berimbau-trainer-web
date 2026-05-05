import type { IntervalToken, ToqueName } from './rhythms';
import type { MessageKey } from '@/i18n/messages.en';

/**
 * Class definitions — guided practice progressions.
 *
 * Each class has one or more PARTS. A part owns:
 *   - a rhythmic pattern (intervals[], same shape as a toque)
 *   - one or more chant lines (chantsByCycle[]) cycled by cycle index
 *   - a cycle threshold for auto-advance to the next part
 *
 * The player ticks a metronome through the part's pattern and surfaces
 * the appropriate chant for the currently-playing interval. Mic/scoring
 * is not in the MVP; the user plays along while the click runs.
 */

export interface ClassPart {
  titleKey: MessageKey;
  intervals: IntervalToken[];
  /**
   * One chant string per interval index. Multiple entries cycle by
   * `cycleIndex % chantsByCycle.length` — used by part 3 to alternate
   * forward / hold / reverse / hold without changing the underlying
   * rhythm.
   */
  chantsByCycle: string[][];
  /** Cycle count at which the part auto-advances unless repeat is on. */
  cyclesToAdvance: number;
}

export interface ClassDef {
  id: string;
  titleKey: MessageKey;
  subtitleKey: MessageKey;
  /** Anchor toque — used for context display only; the part owns its
   *  own intervals so it can introduce rests for chant pacing. */
  toqueName: ToqueName;
  defaultBpm: number;
  parts: ClassPart[];
}

const SBGDA_5: IntervalToken[] = ['dong', 'tch_tch', 'ding', 'rest', 'dong'];

export const CLASSES: ClassDef[] = [
  {
    id: 'vowels-sbgda',
    titleKey: 'classes.vowels.title',
    subtitleKey: 'classes.vowels.subtitle',
    toqueName: 'São Bento Grande de Angola',
    defaultBpm: 80,
    parts: [
      {
        titleKey: 'classes.vowels.part1',
        intervals: SBGDA_5,
        chantsByCycle: [['a', 'e', 'i', 'o', 'u']],
        cyclesToAdvance: 5,
      },
      {
        titleKey: 'classes.vowels.part2',
        intervals: SBGDA_5,
        chantsByCycle: [['u', 'o', 'i', 'e', 'a']],
        cyclesToAdvance: 5,
      },
      {
        titleKey: 'classes.vowels.part3',
        intervals: SBGDA_5,
        chantsByCycle: [
          ['a', 'e', 'i', 'o', 'u'],          // forward
          ['', '', '', '', ''],                // hold u (silent prompts)
          ['u', 'o', 'i', 'e', 'a'],          // reverse
          ['', '', '', '', ''],                // hold a
        ],
        cyclesToAdvance: 4,
      },
    ],
  },
];

export function getClass(id: string): ClassDef | undefined {
  return CLASSES.find((c) => c.id === id);
}
