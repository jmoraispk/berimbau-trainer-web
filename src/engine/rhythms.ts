/**
 * Berimbau rhythm patterns (toques).
 *
 * Each toque is a cycle of beat events over 16 subdivisions
 * (eighth notes across 2 bars of 4/4).
 *
 *   Step:  0  1  2  3  4  5  6  7 | 8  9 10 11 12 13 14 15
 *   Beat:  1  +  2  +  3  +  4  + | 1  +  2  +  3  +  4  +
 *
 * Rests are explicit so the full 16-step grid is always defined.
 *
 * Ported from engine/rhythms.py in the v1 Python trainer.
 */

export type Sound = 'dong' | 'ch' | 'ding' | 'rest';

export type Accent = 0 | 1 | 2;

export interface BeatEvent {
  step: number;
  sound: Sound;
  accent: Accent;
}

export interface ToquePattern {
  name: string;
  description: string;
  bpmRange: [number, number];
  defaultBpm: number;
  subdivisions: number;
  cycleBeats: number;
  pattern: BeatEvent[];
}

export type ToqueName =
  | 'São Bento Grande (Regional)'
  | 'São Bento Pequeno'
  | 'Angola'
  | 'Iuna'
  | 'Cavalaria';

const rest = (step: number): BeatEvent => ({ step, sound: 'rest', accent: 0 });

export const TOQUES: Record<ToqueName, ToquePattern> = {
  'São Bento Grande (Regional)': {
    name: 'São Bento Grande (Regional)',
    description:
      'Fast, energetic rhythm of Capoeira Regional. The driving heartbeat of jogo rápido.',
    bpmRange: [100, 180],
    defaultBpm: 130,
    subdivisions: 16,
    cycleBeats: 4,
    pattern: [
      { step: 0, sound: 'ch', accent: 1 },
      { step: 1, sound: 'ch', accent: 1 },
      { step: 2, sound: 'dong', accent: 2 },
      rest(3),
      { step: 4, sound: 'ch', accent: 1 },
      { step: 5, sound: 'ch', accent: 1 },
      { step: 6, sound: 'ding', accent: 2 },
      rest(7),
      { step: 8, sound: 'ch', accent: 1 },
      { step: 9, sound: 'ch', accent: 1 },
      { step: 10, sound: 'dong', accent: 2 },
      rest(11),
      { step: 12, sound: 'dong', accent: 1 },
      rest(13),
      { step: 14, sound: 'ding', accent: 2 },
      rest(15),
    ],
  },

  'São Bento Pequeno': {
    name: 'São Bento Pequeno',
    description:
      'Slower, deliberate. Inverted Angola — swaps the low and high tones.',
    bpmRange: [60, 110],
    defaultBpm: 80,
    subdivisions: 16,
    cycleBeats: 4,
    pattern: [
      { step: 0, sound: 'ch', accent: 1 },
      { step: 1, sound: 'ch', accent: 1 },
      { step: 2, sound: 'ding', accent: 2 },
      { step: 3, sound: 'dong', accent: 2 },
      rest(4),
      rest(5),
      rest(6),
      rest(7),
      { step: 8, sound: 'ch', accent: 1 },
      { step: 9, sound: 'ch', accent: 1 },
      { step: 10, sound: 'ding', accent: 2 },
      { step: 11, sound: 'dong', accent: 2 },
      rest(12),
      rest(13),
      rest(14),
      rest(15),
    ],
  },

  Angola: {
    name: 'Angola',
    description:
      'The ancient rhythm. Slow, low, deceptive. The ground of Capoeira Angola.',
    bpmRange: [40, 80],
    defaultBpm: 60,
    subdivisions: 16,
    cycleBeats: 4,
    pattern: [
      { step: 0, sound: 'ch', accent: 1 },
      { step: 1, sound: 'ch', accent: 1 },
      { step: 2, sound: 'dong', accent: 2 },
      rest(3),
      { step: 4, sound: 'ding', accent: 2 },
      rest(5),
      rest(6),
      rest(7),
      { step: 8, sound: 'ch', accent: 1 },
      { step: 9, sound: 'ch', accent: 1 },
      { step: 10, sound: 'dong', accent: 2 },
      rest(11),
      { step: 12, sound: 'ding', accent: 2 },
      rest(13),
      rest(14),
      rest(15),
    ],
  },

  Iuna: {
    name: 'Iuna',
    description:
      "Reserved for mestres and formados. Ceremonial, dignified, like the iúna bird's call.",
    bpmRange: [50, 90],
    defaultBpm: 70,
    subdivisions: 16,
    cycleBeats: 4,
    pattern: [
      { step: 0, sound: 'ch', accent: 1 },
      { step: 1, sound: 'ch', accent: 1 },
      { step: 2, sound: 'dong', accent: 2 },
      { step: 3, sound: 'dong', accent: 1 },
      { step: 4, sound: 'ding', accent: 2 },
      rest(5),
      { step: 6, sound: 'dong', accent: 1 },
      { step: 7, sound: 'dong', accent: 1 },
      { step: 8, sound: 'ch', accent: 1 },
      { step: 9, sound: 'ding', accent: 2 },
      rest(10),
      rest(11),
      rest(12),
      rest(13),
      rest(14),
      rest(15),
    ],
  },

  Cavalaria: {
    name: 'Cavalaria',
    description:
      'Warning rhythm — cavalry approaching! Galloping, urgent, unmistakable.',
    bpmRange: [100, 160],
    defaultBpm: 130,
    subdivisions: 16,
    cycleBeats: 4,
    pattern: [
      { step: 0, sound: 'dong', accent: 2 },
      rest(1),
      { step: 2, sound: 'ch', accent: 1 },
      { step: 3, sound: 'ch', accent: 1 },
      { step: 4, sound: 'dong', accent: 2 },
      rest(5),
      { step: 6, sound: 'ch', accent: 1 },
      { step: 7, sound: 'ch', accent: 1 },
      { step: 8, sound: 'dong', accent: 2 },
      rest(9),
      { step: 10, sound: 'ch', accent: 1 },
      { step: 11, sound: 'ch', accent: 1 },
      { step: 12, sound: 'dong', accent: 1 },
      rest(13),
      { step: 14, sound: 'ding', accent: 2 },
      rest(15),
    ],
  },
};

/**
 * Single BPM range the UI exposes for every toque.
 *
 * Each toque still carries its own traditional `bpmRange` as domain
 * metadata (useful for a future "recommended speed" hint), but the
 * practice slider and clampBpm use this global range so any toque can
 * be rehearsed at any tempo.
 */
export const GLOBAL_BPM_RANGE: [number, number] = [10, 200];

export const SOUND_COLORS: Record<Sound, string> = {
  dong: '#e67832',
  ch: '#64b4f0',
  ding: '#64f08c',
  rest: '#232837',
};

export const SOUND_LABELS: Record<Sound, string> = {
  dong: 'DONG',
  ch: 'TCH',
  ding: 'DING',
  rest: '.',
};
