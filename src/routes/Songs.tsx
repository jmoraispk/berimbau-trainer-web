import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { STYLES, STYLE_INFO, type Song, type Style } from '@/engine/songs';
import songsData from '@/data/songs.json';
import type { ToqueName } from '@/engine/rhythms';

/**
 * Songs browser — list, search, style filter, YouTube link.
 *
 * Runs entirely client-side off the bundled songs.json. Song detail
 * (lyrics, embedded player) is deferred — the card links out to YouTube
 * for now.
 */

const SONGS = songsData as Song[];

type StyleFilter = Style | 'all';

const STYLE_ORDER: StyleFilter[] = ['all', ...STYLES];

export function Songs() {
  const [query, setQuery] = useState('');
  const [styleFilter, setStyleFilter] = useState<StyleFilter>('all');

  const counts = useMemo(() => {
    const out: Record<StyleFilter, number> = {
      all: SONGS.length,
      corrido: 0,
      ladainha: 0,
      quadra: 0,
      maculele: 0,
      samba_de_roda: 0,
    };
    for (const song of SONGS) out[song.style] += 1;
    return out;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SONGS.filter((song) => {
      if (styleFilter !== 'all' && song.style !== styleFilter) return false;
      if (!q) return true;
      if (song.title.toLowerCase().includes(q)) return true;
      if (song.author && song.author.toLowerCase().includes(q)) return true;
      if (song.lyrics.some((l) => l.pt.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [query, styleFilter]);

  return (
    <main className="min-h-full px-6 py-8 max-w-3xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">Songs</h1>
          <p className="text-text-dim text-sm">
            {SONGS.length} traditional capoeira songs from lalaue.com.
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 px-3 py-1.5 rounded-full bg-bg-elev border border-border text-sm text-text-dim"
        >
          ← Back
        </Link>
      </header>

      <div className="flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, author, lyrics…"
          className="w-full px-4 py-2.5 rounded-xl bg-bg-elev border border-border text-text placeholder:text-text-dim focus:outline-none focus:border-accent"
        />

        <div className="flex flex-wrap gap-2">
          {STYLE_ORDER.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => setStyleFilter(style)}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                styleFilter === style
                  ? 'bg-accent text-bg border-accent'
                  : 'bg-bg-elev text-text border-border hover:border-text-dim'
              }`}
            >
              {style === 'all' ? 'All' : style.replace('_', ' ')} · {counts[style]}
            </button>
          ))}
        </div>

        {styleFilter !== 'all' && (
          <p className="text-xs text-text-dim">{STYLE_INFO[styleFilter]}</p>
        )}
      </div>

      <div className="text-xs text-text-dim">
        {filtered.length === SONGS.length
          ? `All ${SONGS.length} songs`
          : `${filtered.length} of ${SONGS.length} songs`}
      </div>

      {filtered.length === 0 ? (
        <p className="text-text-dim text-sm">No songs match.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((song) => (
            <SongRow key={song.slug} song={song} />
          ))}
        </ul>
      )}
    </main>
  );
}

function SongRow({ song }: { song: Song }) {
  const hasYoutube = Boolean(song.youtubeId);
  return (
    <li className="flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-elev border border-border hover:border-text-dim transition">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-medium truncate">{song.title}</span>
          <span className="text-[10px] font-mono uppercase text-text-dim tracking-wider shrink-0">
            {song.style.replace('_', ' ')}
          </span>
        </div>
        <div className="text-xs text-text-dim truncate flex gap-2">
          {song.author && <span>{song.author}</span>}
          {song.typicalToques.length > 0 && (
            <span className="truncate">
              · {song.typicalToques.map(shortToque).join(', ')}
            </span>
          )}
          {song.hasLyrics && <span>· {song.lyrics.length} lines</span>}
        </div>
      </div>
      {hasYoutube ? (
        <a
          href={`https://www.youtube.com/watch?v=${song.youtubeId!}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 px-3 py-1 rounded-full border border-border text-xs text-text-dim hover:border-accent hover:text-accent"
        >
          YouTube ↗
        </a>
      ) : song.sourceUrl ? (
        <a
          href={song.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 px-3 py-1 rounded-full border border-border text-xs text-text-dim hover:border-text"
        >
          lyrics ↗
        </a>
      ) : null}
    </li>
  );
}

function shortToque(name: ToqueName): string {
  if (name === 'São Bento Grande (Regional)') return 'SBG';
  if (name === 'São Bento Pequeno') return 'SBP';
  return name;
}
