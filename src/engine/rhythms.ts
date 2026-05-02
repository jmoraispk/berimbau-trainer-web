/**
 * Berimbau rhythm patterns (toques).
 *
 * A toque is a cycle of *intervals*. One interval = one beat (quarter
 * note) at the toque's BPM. An interval token can be:
 *
 *   - 'rest'      — silence
 *   - 'dong'      — open string struck on the downbeat
 *   - 'ding'      — closed string struck on the downbeat
 *   - 'tch'       — chiado (the coin-on-string mute) on the downbeat
 *   - 'tch_tch'   — two TCH eighths within one beat (offsets 0 and 0.5)
 *
 * São Bento Pequeno / Angola / São Bento Grande de Angola / Benguela
 * are 4-beat cycles; São Bento Grande (Regional) is 8 beats. Iuna and
 * Cavalaria are listed but flagged comingSoon — patterns aren't locked
 * in yet.
 *
 * The 'tch_tch' encoding (rather than spreading two tch onto two
 * separate eighth-note intervals) keeps the data legible: a 4-beat
 * toque is 4 entries, regardless of how dense any one beat is.
 */

/**
 * Internal sound class. We keep 'ch' rather than renaming to 'tch' so
 * existing IDB calibration profiles (keyed by sound class) don't lose
 * their TCH cluster on upgrade. The user-facing label is "TCH" and the
 * data-authoring alphabet (IntervalToken) accepts the more legible
 * 'tch' — see soundFromToken() for the mapping.
 */
export type Sound = 'dong' | 'ch' | 'ding';

/** Tokens used in the intervals[] array of each toque. */
export type IntervalToken = 'rest' | 'dong' | 'ding' | 'tch' | 'tch_tch';

export type Difficulty = 'easy' | 'intermediate' | 'advanced' | 'very_advanced';

export type ToqueName =
  | 'São Bento Pequeno'
  | 'Angola'
  | 'São Bento Grande de Angola'
  | 'Benguela'
  | 'São Bento Grande (Regional)'
  | 'Iuna'
  | 'Cavalaria';

export interface ToquePattern {
  name: ToqueName;
  difficulty: Difficulty;
  description: string;
  defaultBpm: number;
  /** One token per beat. Empty when comingSoon = true. */
  intervals: IntervalToken[];
  /** Reserved/ceremonial toques whose patterns aren't locked in yet. */
  comingSoon?: boolean;
}

export const TOQUES: Record<ToqueName, ToquePattern> = {
  // ── Easy ────────────────────────────────────────────────────────────────
  'São Bento Pequeno': {
    name: 'São Bento Pequeno',
    difficulty: 'easy',
    description:
      'Slower, deliberate. Inverted Angola — swaps the low and high tones.',
    defaultBpm: 80,
    intervals: ['tch_tch', 'ding', 'dong', 'rest'],
  },

  Angola: {
    name: 'Angola',
    difficulty: 'easy',
    description:
      'The ancient rhythm. Slow, low, deceptive. The ground of Capoeira Angola.',
    defaultBpm: 60,
    intervals: ['tch_tch', 'dong', 'ding', 'rest'],
  },

  // ── Intermediate ────────────────────────────────────────────────────────
  'São Bento Grande de Angola': {
    name: 'São Bento Grande de Angola',
    difficulty: 'intermediate',
    description:
      'Faster than Angola but tonal — no rest interval, four steady beats.',
    defaultBpm: 90,
    intervals: ['tch_tch', 'ding', 'dong', 'dong'],
  },

  Benguela: {
    name: 'Benguela',
    difficulty: 'intermediate',
    description: 'Steady, propulsive. Two ding beats give it its drive.',
    defaultBpm: 90,
    intervals: ['tch_tch', 'dong', 'ding', 'ding'],
  },

  // ── Advanced ────────────────────────────────────────────────────────────
  'São Bento Grande (Regional)': {
    name: 'São Bento Grande (Regional)',
    difficulty: 'advanced',
    description:
      'Fast, energetic rhythm of Capoeira Regional. The driving heartbeat of jogo rápido.',
    defaultBpm: 130,
    intervals: [
      'tch_tch', 'dong', 'tch_tch', 'ding',
      'tch_tch', 'dong', 'dong',     'ding',
    ],
  },

  // ── Very advanced (placeholders — pattern TBD) ──────────────────────────
  Iuna: {
    name: 'Iuna',
    difficulty: 'very_advanced',
    description:
      "Reserved for mestres and formados. Ceremonial, dignified, like the iúna bird's call.",
    defaultBpm: 70,
    intervals: [],
    comingSoon: true,
  },

  Cavalaria: {
    name: 'Cavalaria',
    difficulty: 'very_advanced',
    description: 'Warning rhythm — cavalry approaching! Galloping, urgent, unmistakable.',
    defaultBpm: 130,
    intervals: [],
    comingSoon: true,
  },
};

/**
 * Single BPM range the UI exposes for every toque. defaultBpm per toque
 * is just the seed value the slider lands on when picked.
 */
export const GLOBAL_BPM_RANGE: [number, number] = [10, 200];

/**
 * Map a data-authoring IntervalToken sound (tch / dong / ding) into the
 * internal Sound used by ScoringEngine, classifier and stored profiles.
 * Only call for tokens that produce a sound (i.e. not 'rest' / 'tch_tch';
 * 'tch_tch' expands into two 'tch' beats at the scheduler layer).
 */
export function soundFromToken(token: 'tch' | 'dong' | 'ding'): Sound {
  return token === 'tch' ? 'ch' : token;
}

export const SOUND_COLORS: Record<Sound, string> = {
  dong: '#e67832', // open string — warm amber
  ch:   '#64b4f0', // chiado — cool blue
  ding: '#64f08c', // closed string — bright green
};

/** Short label used in HUD and chips. */
export const SOUND_LABELS: Record<Sound, string> = {
  dong: 'DONG',
  ch:   'TCH',
  ding: 'DING',
};

/** Symbolic glyph used in the practice timeline and pattern preview. */
export const SOUND_GLYPHS: Record<Sound, string> = {
  dong: '○', // open
  ch:   '×', // chiado
  ding: '●', // closed
};

export const DIFFICULTY_ORDER: Difficulty[] = [
  'easy',
  'intermediate',
  'advanced',
  'very_advanced',
];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  very_advanced: 'Very advanced',
};

/** Group toques by difficulty in DIFFICULTY_ORDER. */
export function toquesByDifficulty(): Array<{ difficulty: Difficulty; toques: ToquePattern[] }> {
  const groups = new Map<Difficulty, ToquePattern[]>();
  for (const t of Object.values(TOQUES)) {
    const list = groups.get(t.difficulty) ?? [];
    list.push(t);
    groups.set(t.difficulty, list);
  }
  return DIFFICULTY_ORDER.filter((d) => groups.has(d)).map((d) => ({
    difficulty: d,
    toques: groups.get(d)!,
  }));
}
