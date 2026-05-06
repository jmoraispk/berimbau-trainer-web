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
    version: 'v0.3',
    date: '2026-05-06',
    title: 'Accounts, payments, and a tidier home',
    highlights: [
      'User accounts — sign up with email + password or Google. Profile and practice history sync to the cloud so you can pick up on another device. Local-first stays the default; the app is fully usable signed-out.',
      'Plans page at /subscribe — Free, $5 / month, $48 / year. The annual plan is marked Recommended with a "save 20%" pill, and every paid plan includes a 7-day free trial — no card is charged for the first week. FAQ accordion below the cards covers cancellation, refunds, and what Early Access unlocks.',
      'Cancel any time from Settings → Manage (Stripe Customer Portal). Once canceled, Settings reads "Early Access — canceling, ends [date]" so you can see exactly when access ends — no more silent stale state.',
      'Leaderboard plumbing — opt-in via the new Anonymous toggle in Settings. Streak glyphs visible on Home: 🔥 5 days · 💎 30 days · 👑 100 days.',
      'Settings reorganized into collapsible menus: Account, Audio & microphone, Leaderboard, Data, Install. The "Display / Real rhythm" toggle is gone — the visual shift is now always on.',
      'Calibration — cycle length is now configurable (1–10 s) with a − / + stepper that auto-pauses while you dial it in. A live countdown sits beside the pause button. The post-strike "rewind" animation is gone — the ring snaps to empty and the next prep ramp starts immediately. Off-beat strikes flash red on the ring instead of being dropped silently.',
      'Sign-in screen polish — Google "G" branding on the OAuth button; "Register" / "Criar conta" replaces "Sign up". Magic-link mode dropped.',
      'Mobile — extra top-room on Home so the language / sign-in / settings cluster stops crowding the logo on narrow phones.',
      'Errors and performance — Sentry hooked up (lazy-loaded, zero bytes without the DSN). Vercel Speed Insights reports Core Web Vitals.',
      'Bug fixes — favicon precache list corrected so installed PWAs no longer fall back to the default icon. Edge-function CORS allowlist now permits Supabase JS\'s apikey + x-client-info headers, fixing the "Failed to send a request to the Edge Function" error on Subscribe.',
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
      'Take a class — the first guided class is live: chant a-e-i-o-u over São Bento Grande de Angola in three parts (forward, reverse, combined) with a repeat toggle and auto-advance.',
      'Play-along mode in the practice toolbar plays the toque sounds on the beat so you have something to follow instead of practicing in silence.',
      'Practice now auto-starts on tap. Single Start button, mic-to-keyboard fallback when permission is denied, no more "Ready?" intermediate screen.',
      'Calibration scatter plot redone properly — numbered axes, the same TCH × / DONG ○ / DING ● glyphs as the rest of the app, hover tooltip with f0 and centroid, click anywhere to play the strike back, cross-highlight with the waveform thumbnails above.',
      'New top-level destinations from the footer: Take a class · Leaderboard · Roadmap (vertical timeline with status pills) · Changelog · About.',
      'Mic input picker in Settings — choose which microphone the app listens through.',
      'Live mic level meter during calibration, with a "meter not moving?" troubleshooting popover.',
      'Streak emojis on Home and Stats: 🔥 5 days · 💎 30 days · 👑 100 days.',
      'Renamed to Berimbau Pro (was Berimbau Trainer), including the PWA install metadata. Fixed an iOS PWA bug where the homepage title rendered as a solid white block.',
      'Calibrate-first warning: tapping Start Practicing without a saved profile pops a modal that routes you straight to the calibration flow.',
      'Real-rhythm toggle in Settings (experimental) — shifts the visual pattern one slot so the silence between cycles falls at 3 o\'clock.',
      'PWA install button in Settings, fixes a phantom-notes bug where strikes from previous sessions could appear in the practice circle.',
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
      'Five playable toques: São Bento Pequeno, Angola, São Bento Grande de Angola, Benguela, São Bento Grande (Regional).',
      'Practice mode with linear and circular visualisations, rolling 20-beat accuracy, and a last-30-beats outcome breakdown.',
      'Three-stage guided calibration with waveform thumbnails, click-to-play, single-strike refractory.',
      'Strikes only count when they land in the cycle\'s PLAY phase, so stray sounds during the prep ramp are ignored.',
      'Pause / resume the calibration cycle to listen back without new captures racing in.',
      '185-song lyrics catalog from lalaue.com with style filter and optional YouTube embed.',
      'Stats: lifetime counters, 26-week activity heatmap, per-toque aggregates, full session log.',
      'Bilingual EN ⇄ PT, JSON backup / import, PWA install, offline-capable.',
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
