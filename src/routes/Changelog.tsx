import { Link } from 'wouter';
import { useI18n } from '@/i18n';

/**
 * Changelog — what shipped, plus a pointer back to v1 (Python+Kivy)
 * for context. Authored as a static structure so each release just
 * adds an entry at the top.
 *
 * Each highlight is an emoji-tagged headline with an optional list of
 * sub-bullets for the supporting detail. Emojis are chosen so they
 * don't repeat across the page — that way a quick scan reads as a
 * different shape per release, not a wall of identical glyphs.
 */

interface Highlight {
  emoji?: string;
  title: string;
  details?: string[];
}

interface Entry {
  version: string;
  date: string;
  title: string;
  body?: string;
  highlights?: Highlight[];
  link?: { href: string; label: string };
}

const ENTRIES: Entry[] = [
  {
    version: 'v0.3',
    date: '2026-05-06',
    title: 'Accounts, payments, and a tidier home',
    highlights: [
      {
        emoji: '👤',
        title: 'User accounts',
        details: [
          'Sign up with email + password or Google.',
          'Profile and practice history sync across devices.',
          'Local-first stays the default — the app is fully usable signed-out.',
        ],
      },
      {
        emoji: '💳',
        title: 'Plans page at /subscribe — Free, $5 / month, $48 / year',
        details: [
          'Annual is marked Recommended with a "save 20%" pill.',
          '7-day free trial on every paid plan — no card charged for the first week.',
          'FAQ accordion covers cancellation, refunds, and what Early Access unlocks.',
        ],
      },
      {
        emoji: '🚪',
        title: 'Cancel any time from Settings → Manage',
        details: [
          'Stripe Customer Portal handles the cancel + invoice flow.',
          'Once canceled, Settings reads "Early Access — canceling, ends [date]" so the state is visible.',
        ],
      },
      {
        emoji: '🏆',
        title: 'Leaderboard plumbing',
        details: [
          'Opt-in via the new "Anonymous on leaderboard" toggle in Settings.',
          'Scores still count when anonymous; only the display name is hidden.',
        ],
      },
      {
        emoji: '⚙️',
        title: 'Settings reorganized into collapsible menus',
        details: [
          'Sections: Account · Audio & microphone · Leaderboard · Data · Install.',
          'Microphone picker, calibration profile and history/backup are grouped instead of scattered.',
          'The "Display / Real rhythm" toggle is gone — the visual shift is now always on.',
        ],
      },
      {
        emoji: '🎚️',
        title: 'Calibration cycle controls',
        details: [
          'Cycle length configurable 1–10 s via a − / + stepper, auto-pauses while you dial it in.',
          'Live countdown beside the pause button.',
          'Post-strike "rewind" animation is gone — the ring snaps to empty and the next prep starts immediately.',
          'Off-beat strikes flash red on the ring instead of being dropped silently.',
        ],
      },
      {
        emoji: '✨',
        title: 'Sign-in screen polish',
        details: [
          'Google "G" branding on the OAuth button.',
          '"Register" / "Criar conta" replaces "Sign up".',
          'Magic-link mode dropped — Sign in / Register / Google only.',
        ],
      },
      {
        emoji: '📱',
        title: 'Mobile — more breathing room on Home',
        details: [
          'Extra top padding so the language / sign-in / settings cluster stops crowding the logo on phones.',
        ],
      },
      {
        emoji: '📡',
        title: 'Errors and performance',
        details: [
          'Sentry hooked up — lazy-loaded, 0 KB without the DSN.',
          'Vercel Speed Insights reports Core Web Vitals.',
        ],
      },
      {
        emoji: '🩹',
        title: 'Bug fixes',
        details: [
          'Favicon precache list corrected — installed PWAs no longer fall back to the default icon.',
          'Edge-function CORS allowlist now permits apikey + x-client-info headers, fixing "Failed to send a request to the Edge Function" on Subscribe.',
        ],
      },
    ],
    link: {
      href: 'https://github.com/jmoraispk/berimbau-trainer-web/releases/tag/v0.3',
      label: 'v0.3 release notes on GitHub',
    },
  },
  {
    version: 'v0.2',
    date: '2026-05-04',
    title: 'A bigger app',
    highlights: [
      {
        emoji: '🎓',
        title: 'Take a class — the first guided class is live',
        details: [
          'Chant a-e-i-o-u over São Bento Grande de Angola.',
          'Three parts: forward, reverse, combined.',
          'Repeat toggle and auto-advance between parts.',
        ],
      },
      {
        emoji: '🥁',
        title: 'Play-along mode in the practice toolbar',
        details: [
          'Plays the toque sounds on the beat so you have something to follow instead of practicing in silence.',
        ],
      },
      {
        emoji: '▶️',
        title: 'Practice auto-starts on tap',
        details: [
          'Single Start button, no more "Ready?" intermediate screen.',
          'Mic-to-keyboard fallback when permission is denied.',
        ],
      },
      {
        emoji: '🌊',
        title: 'Calibration scatter plot redone properly',
        details: [
          'Numbered axes.',
          'Same TCH × / DONG ○ / DING ● glyphs as the rest of the app.',
          'Hover tooltip with f0 and centroid.',
          'Click anywhere to play the strike back.',
          'Cross-highlight with the waveform thumbnails above.',
        ],
      },
      {
        emoji: '🧭',
        title: 'New top-level destinations from the footer',
        details: [
          'Take a class · Leaderboard · Roadmap (vertical timeline with status pills) · Changelog · About.',
        ],
      },
      {
        emoji: '🎤',
        title: 'Mic input picker in Settings',
        details: [
          'Choose which microphone the app listens through.',
        ],
      },
      {
        emoji: '📈',
        title: 'Live mic level meter during calibration',
        details: [
          '"Meter not moving?" troubleshooting popover for the wrong-mic case.',
        ],
      },
      {
        emoji: '🔥',
        title: 'Streak emojis on Home and Stats',
        details: [
          '🔥 5 days · 💎 30 days · 👑 100 days.',
        ],
      },
      {
        emoji: '🏷️',
        title: 'Renamed to Berimbau Pro (was Berimbau Trainer)',
        details: [
          'PWA install metadata updated.',
          'Fixed an iOS PWA bug where the homepage title rendered as a solid white block.',
        ],
      },
      {
        emoji: '⚠️',
        title: 'Calibrate-first warning',
        details: [
          'Tapping Start Practicing without a saved profile pops a modal that routes you straight to the calibration flow.',
        ],
      },
      {
        emoji: '🔁',
        title: 'Real-rhythm toggle in Settings (experimental)',
        details: [
          'Shifts the visual pattern one slot so the silence between cycles falls at 3 o\'clock.',
        ],
      },
      {
        emoji: '📲',
        title: 'PWA install button in Settings',
        details: [
          'Fixed a phantom-notes bug where strikes from previous sessions could appear in the practice circle.',
        ],
      },
    ],
    link: {
      href: 'https://github.com/jmoraispk/berimbau-trainer-web/releases/tag/v0.2',
      label: 'v0.2 release notes on GitHub',
    },
  },
  {
    version: 'v0.1',
    date: '2026-04-30',
    title: 'Initial public release',
    highlights: [
      {
        emoji: '🪘',
        title: 'Five playable toques',
        details: [
          'São Bento Pequeno · Angola · São Bento Grande de Angola · Benguela · São Bento Grande (Regional).',
        ],
      },
      {
        emoji: '🎯',
        title: 'Practice mode',
        details: [
          'Linear and circular visualisations.',
          'Rolling 20-beat accuracy.',
          'Last-30-beats outcome breakdown.',
        ],
      },
      {
        emoji: '📐',
        title: 'Three-stage guided calibration',
        details: [
          'Waveform thumbnails.',
          'Click-to-play.',
          'Single-strike refractory.',
        ],
      },
      {
        emoji: '⏱️',
        title: 'Cycle-window strike acceptance',
        details: [
          'Strikes only count when they land in the cycle\'s PLAY phase, so stray sounds during the prep ramp are ignored.',
          'Pause / resume the cycle to listen back without new captures racing in.',
        ],
      },
      {
        emoji: '📚',
        title: '185-song lyrics catalog from lalaue.com',
        details: [
          'Style filter.',
          'Optional YouTube embed.',
        ],
      },
      {
        emoji: '📊',
        title: 'Stats dashboard',
        details: [
          'Lifetime counters.',
          '26-week activity heatmap.',
          'Per-toque aggregates and a full session log.',
        ],
      },
      {
        emoji: '🌐',
        title: 'Bilingual EN ⇄ PT',
      },
      {
        emoji: '💾',
        title: 'JSON backup / import, PWA install, offline-capable',
      },
    ],
    link: {
      href: 'https://github.com/jmoraispk/berimbau-trainer-web/releases/tag/v0.1',
      label: 'v0.1 release notes on GitHub',
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
          <li key={entry.version} className="card flex flex-col gap-3 px-5 py-4">
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
              <ul className="flex flex-col gap-2.5">
                {entry.highlights.map((h, i) => (
                  <li key={i} className="flex flex-col gap-1">
                    <div className="flex gap-2 items-baseline">
                      {h.emoji && (
                        <span className="shrink-0 text-base leading-none">{h.emoji}</span>
                      )}
                      <span className="text-sm text-text leading-snug">{h.title}</span>
                    </div>
                    {h.details && h.details.length > 0 && (
                      <ul className="ml-7 flex flex-col gap-0.5 list-disc list-outside pl-4 marker:text-text-dim/50">
                        {h.details.map((d, j) => (
                          <li
                            key={j}
                            className="text-xs text-text-dim leading-relaxed"
                          >
                            {d}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
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
