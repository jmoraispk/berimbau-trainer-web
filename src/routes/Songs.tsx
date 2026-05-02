import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { STYLES, type Song, type Style } from '@/engine/songs';
import songsData from '@/data/songs.json';
import type { ToqueName } from '@/engine/rhythms';
import { useI18n, type TFn } from '@/i18n';
import type { MessageKey } from '@/i18n/messages.en';

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

const STYLE_LABEL_KEY: Record<StyleFilter, MessageKey> = {
  all: 'songs.style.all',
  corrido: 'songs.style.corrido',
  ladainha: 'songs.style.ladainha',
  quadra: 'songs.style.quadra',
  maculele: 'songs.style.maculele',
  samba_de_roda: 'songs.style.samba_de_roda',
};

const STYLE_INFO_KEY: Record<Style, MessageKey> = {
  corrido: 'songs.style_info.corrido',
  ladainha: 'songs.style_info.ladainha',
  quadra: 'songs.style_info.quadra',
  maculele: 'songs.style_info.maculele',
  samba_de_roda: 'songs.style_info.samba_de_roda',
};

export function Songs() {
  const { t } = useI18n();
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
          <h1 className="text-2xl font-semibold tracking-tight">{t('songs.title')}</h1>
          <p className="text-text-dim text-sm">
            {t('songs.subtitle', { n: SONGS.length })}
          </p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
            aria-hidden
          >
            <circle cx="9" cy="9" r="5" />
            <path d="M13 13l4 4" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('songs.search_placeholder')}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-bg-elev border border-border text-text placeholder:text-text-dim focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {STYLE_ORDER.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => setStyleFilter(style)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition ${
                styleFilter === style
                  ? 'bg-accent text-bg border-accent'
                  : 'bg-bg-elev text-text border-border hover:border-border-strong'
              }`}
            >
              <span className="capitalize">{t(STYLE_LABEL_KEY[style])}</span>
              <span
                className={`text-[10px] font-mono ${
                  styleFilter === style ? 'text-bg/70' : 'text-text-dim'
                }`}
              >
                {counts[style]}
              </span>
            </button>
          ))}
        </div>

        {styleFilter !== 'all' && (
          <p className="text-xs text-text-dim">{t(STYLE_INFO_KEY[styleFilter])}</p>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-text-dim">
        <span>
          {filtered.length === SONGS.length
            ? t('songs.all_count', { n: SONGS.length })
            : t('songs.filtered_count', { filtered: filtered.length, total: SONGS.length })}
        </span>
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="hover:text-text transition"
          >
            {t('songs.clear_search')}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-8 text-center">
          <span className="text-sm text-text-dim">{t('songs.no_match')}</span>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setStyleFilter('all');
            }}
            className="btn-ghost"
          >
            {t('songs.reset_filters')}
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((song) => (
            <SongRow key={song.slug} song={song} t={t} />
          ))}
        </ul>
      )}
    </main>
  );
}

function SongRow({ song, t }: { song: Song; t: TFn }) {
  return (
    <li>
      <Link
        href={`/songs/${song.slug}`}
        className="card flex items-center gap-3 px-4 py-3 hover:border-border-strong transition"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-medium truncate">{song.title}</span>
            <span className="text-[10px] font-mono uppercase text-text-dim tracking-wider shrink-0">
              {t(STYLE_LABEL_KEY[song.style])}
            </span>
          </div>
          <div className="text-xs text-text-dim truncate flex gap-2">
            {song.author && <span>{song.author}</span>}
            {song.typicalToques.length > 0 && (
              <span className="truncate">
                · {song.typicalToques.map(shortToque).join(', ')}
              </span>
            )}
            {song.hasLyrics && <span>· {t('songs.lines', { n: song.lyrics.length })}</span>}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2 text-xs text-text-dim">
          {song.youtubeId && <span>▶</span>}
          <span aria-hidden>→</span>
        </div>
      </Link>
    </li>
  );
}

function shortToque(name: ToqueName): string {
  if (name === 'São Bento Grande (Regional)') return 'SBG';
  if (name === 'São Bento Pequeno') return 'SBP';
  return name;
}
