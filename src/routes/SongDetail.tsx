import { useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import type { Song } from '@/engine/songs';
import { STYLE_INFO } from '@/engine/songs';
import { TOQUES, type ToqueName } from '@/engine/rhythms';
import songsData from '@/data/songs.json';

/**
 * Song detail — lyrics side-by-side (pt / en when translated), an
 * embedded YouTube player when we have a video id, and a shortcut that
 * sends the user straight to /practice with one of the song's typical
 * toques pre-selected.
 */

const SONGS = songsData as Song[];

export function SongDetail({ params }: { params: { slug: string } }) {
  const [, navigate] = useLocation();
  const song = useMemo(() => SONGS.find((s) => s.slug === params.slug), [params.slug]);

  if (!song) {
    return (
      <main className="px-6 py-10 max-w-2xl mx-auto flex flex-col gap-4">
        <p className="text-text-dim">
          No song with slug <span className="font-mono">{params.slug}</span>.
        </p>
        <Link href="/songs" className="text-accent underline underline-offset-4 text-sm">
          ← Back to songs
        </Link>
      </main>
    );
  }

  const hasTranslation = song.lyrics.some((l) => l.en);
  const primaryToque = song.typicalToques[0];

  const startPractice = () => {
    if (!primaryToque) return;
    const bpm = TOQUES[primaryToque].defaultBpm;
    const params = new URLSearchParams({ toque: primaryToque, bpm: String(bpm) });
    navigate(`/practice?${params.toString()}`);
  };

  return (
    <main className="min-h-full px-6 py-8 max-w-3xl mx-auto flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <Link
            href="/songs"
            className="text-xs text-text-dim hover:text-text w-fit"
          >
            ← Songs
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">{song.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
            <span className="uppercase tracking-wider font-mono">
              {song.style.replace('_', ' ')}
            </span>
            {song.author && <span>· {song.author}</span>}
            {song.hasLyrics && <span>· {song.lyrics.length} lines</span>}
          </div>
          <p className="text-xs text-text-dim mt-1 max-w-md">
            {STYLE_INFO[song.style]}
          </p>
        </div>
      </header>

      {(song.typicalToques.length > 0 || song.sourceUrl) && (
        <section className="flex flex-wrap items-center gap-3">
          {song.typicalToques.map((t) => (
            <ToquePill key={t} name={t} />
          ))}
          {song.sourceUrl && (
            <a
              href={song.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-xs text-text-dim hover:text-text underline underline-offset-4"
            >
              lalaue.com ↗
            </a>
          )}
        </section>
      )}

      {song.youtubeId && <YoutubeEmbed id={song.youtubeId} title={song.title} />}

      {song.lyrics.length > 0 ? (
        <Lyrics song={song} hasTranslation={hasTranslation} />
      ) : (
        <p className="text-text-dim text-sm">
          No lyrics stored for this one yet.{' '}
          {song.sourceUrl && (
            <>
              Try{' '}
              <a
                className="underline underline-offset-4"
                href={song.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                lalaue.com
              </a>
              .
            </>
          )}
        </p>
      )}

      {primaryToque && (
        <div className="flex flex-col items-center gap-2 py-4">
          <button type="button" onClick={startPractice} className="btn-primary">
            Practice with {primaryToque}
          </button>
          {song.typicalToques.length > 1 && (
            <span className="text-xs text-text-dim">
              Or pick another toque from the home screen.
            </span>
          )}
        </div>
      )}
    </main>
  );
}

function ToquePill({ name }: { name: ToqueName }) {
  return (
    <span className="px-3 py-1 rounded-full bg-bg-elev border border-border text-xs">
      {name}
    </span>
  );
}

function YoutubeEmbed({ id, title }: { id: string; title: string }) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-black aspect-video">
      <iframe
        className="absolute inset-0 w-full h-full"
        src={`https://www.youtube-nocookie.com/embed/${id}?modestbranding=1&rel=0`}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}

function Lyrics({ song, hasTranslation }: { song: Song; hasTranslation: boolean }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-text-dim tracking-wider uppercase">
        Lyrics {hasTranslation && <span className="normal-case text-[10px] font-normal">(pt · en)</span>}
      </h2>
      <ol className="flex flex-col gap-2">
        {song.lyrics.map((line, i) => (
          <li
            key={i}
            className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0 px-3 py-2 rounded-lg bg-bg-elev border border-border"
          >
            <span className="text-text">{line.pt}</span>
            {line.en && <span className="text-text-dim text-sm md:text-base">{line.en}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
