/**
 * Song catalog types.
 *
 *   - **Style** is the song form: corrido (call/response), ladainha (solo
 *     narrative), quadra (short verse), maculele, samba_de_roda.
 *   - **Toque** is the berimbau rhythm. A song can be played over any toque,
 *     though some are traditional for certain styles.
 *
 * The full 185-song catalog is imported from v1's `songs/` directory by a
 * separate script (see future `scripts/import-songs.ts`). This module only
 * defines the shape; the data lives in `src/data/songs.json`.
 *
 * Ported from engine/songs.py.
 */

import type { ToqueName } from './rhythms';

export const STYLES = [
  'corrido',
  'ladainha',
  'quadra',
  'maculele',
  'samba_de_roda',
] as const;

export type Style = (typeof STYLES)[number];

export const STYLE_INFO: Record<Style, string> = {
  corrido: 'Call-and-response songs sung during the roda game',
  ladainha: 'Solo narrative sung before the game begins (Angola tradition)',
  quadra: 'Short 4-line verses, often between ladainha and corrido',
  maculele: 'Songs for the maculele stick-dance tradition',
  samba_de_roda: 'Samba circle songs often played after the roda',
};

export type AudioType = 'berimbau_only' | 'mixed' | 'full_band';

export interface LyricLine {
  pt: string;
  en?: string;
  /** Beat index where this line begins; -1 if unset. */
  beatStart?: number;
}

export interface Song {
  title: string;
  slug: string;
  style: Style;
  typicalToques: ToqueName[];
  author?: string;
  source: string;
  sourceUrl?: string;
  youtubeId?: string;
  youtubeViews?: number;
  hasLyrics: boolean;
  hasTranslation: boolean;
  audioType: AudioType;
  lyrics: LyricLine[];
  bpmRange: [number, number];
}

export function loadSongs(): Promise<Song[]> {
  return import('@/data/songs.json').then((m) => m.default as Song[]);
}
