import { Link } from 'wouter';
import { useI18n } from '@/i18n';

/**
 * Changelog — what shipped, plus a pointer back to v1 (Python+Kivy)
 * for context. Authored as a static structure so each release just
 * adds an entry at the top.
 */

interface Entry {
  version: string;
  date: string;
  title: string;
  body?: string;
  highlights?: string[];
  link?: { href: string; label: string };
}

const ENTRIES: Entry[] = [
  {
    version: 'v0.0.1',
    date: '2026-04',
    title: 'Initial public release',
    highlights: [
      'Five playable toques: São Bento Pequeno, Angola, São Bento Grande de Angola, Benguela, São Bento Grande (Regional).',
      'Practice mode with linear and circular visualisations, rolling 20-beat accuracy, and a last-30-beats outcome breakdown.',
      'Three-stage guided calibration with live mic level meter, waveform thumbnails, click-to-play, single-strike refractory.',
      'Strikes only count when they land in the cycle\'s PLAY phase, so stray sounds during the prep ramp are ignored.',
      'Pause / resume the calibration cycle to listen back without new captures racing in.',
      '185-song lyrics catalog from lalaue.com with style filter and optional YouTube embed.',
      'Stats: lifetime counters, 26-week activity heatmap, per-toque aggregates, full session log.',
      'Bilingual EN ⇄ PT, JSON backup / import, PWA install, offline-capable.',
    ],
    link: {
      href: 'https://github.com/jmoraispk/berimbau-trainer-web/releases/tag/v0.0.1',
      label: 'v0.0.1 release notes on GitHub',
    },
  },
  {
    version: 'v-1',
    date: 'archived',
    title: 'Python + Kivy desktop app',
    body: 'Predecessor to the current app — a desktop trainer written in Python with Kivy. Single-rhythm scoring, no calibration, no PWA, no web. The current versioning starts at v0.0.1, so the old app gets v-1 to mark it as "before zero" rather than implying a successor relationship.',
    link: {
      href: 'https://github.com/jmoraispk/berimbau-trainer',
      label: 'jmoraispk/berimbau-trainer',
    },
  },
];

export function Changelog() {
  const { t } = useI18n();
  return (
    <main className="min-h-full px-6 py-8 max-w-2xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t('changelog.title')}</h1>
          <p className="text-text-dim text-sm">{t('changelog.subtitle')}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>

      <ol className="flex flex-col gap-3">
        {ENTRIES.map((entry) => (
          <li key={entry.version} className="card flex flex-col gap-2 px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold">
                {entry.version}{' '}
                <span className="text-text-dim font-normal">— {entry.title}</span>
              </h2>
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim shrink-0">
                {entry.date}
              </span>
            </div>
            {entry.body && (
              <p className="text-sm text-text-dim leading-relaxed">{entry.body}</p>
            )}
            {entry.highlights && (
              <ul className="text-sm text-text-dim leading-relaxed flex flex-col gap-1 list-disc list-outside pl-5">
                {entry.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            )}
            {entry.link && (
              <a
                href={entry.link.href}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-text-dim hover:text-text underline underline-offset-4 self-start"
              >
                {entry.link.label} ↗
              </a>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
