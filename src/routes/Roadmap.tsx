import { Link } from 'wouter';
import { useI18n, type TFn } from '@/i18n';

/**
 * Roadmap — what's planned, plus the ideas pile.
 *
 * Authored as a static structure right here so it's easy to edit
 * between releases. Three sections, color-coded by certainty:
 *
 *   Now (in flight) — the one or two things actively being built
 *   Q3 2026 (planned) — concrete commitments for the next ~quarter
 *   Ideas — everything else; visible so people can vote on them
 *
 * Status palette: in_progress · planning · shipped · idea.
 */

type Status = 'in_progress' | 'planning' | 'shipped' | 'idea';

interface Item {
  title: string;
  status: Status;
  body?: string;
}

interface Section {
  heading: string;
  /** Hex color for the timeline marker. */
  accent: string;
  items: Item[];
  /** When true, the cards in this section show up/down vote buttons.
   *  Wired through to a real voting backend once accounts ship — for
   *  now they're disabled with a tooltip. */
  votable?: boolean;
}

const SECTIONS: Section[] = [
  {
    heading: 'Now — in flight',
    accent: '#ff8a3d',
    items: [
      {
        title: 'Play-along mode',
        status: 'in_progress',
        body: 'The app plays the toque sounds in sync, so you can hear the rhythm and join in instead of practicing against silence.',
      },
    ],
  },
  {
    heading: 'Q3 2026 — planned',
    accent: '#f2b640',
    items: [
      {
        title: 'Per-toque viradas',
        status: 'planning',
        body: 'Drills for the variations and breaks layered on top of each base toque.',
      },
      {
        title: 'User accounts + cloud sync',
        status: 'planning',
        body: 'Optional sign-in so calibration, sessions and settings follow you between phone and laptop. The app stays usable without an account — local-first remains the default. May land earlier in Q2 if the backend stack lands fast.',
      },
      {
        title: 'Singing curriculum',
        status: 'planning',
        body: 'Once the rhythms are solid, layer corridos and ladainhas on top — singing while keeping the toque steady. Builds on the berimbau-only progression in the ideas pile.',
      },
    ],
  },
  {
    heading: 'Ideas — vote them up',
    accent: '#5a6480',
    votable: true,
    items: [
      {
        title: 'Classes: berimbau-only progression',
        status: 'idea',
        body: 'Step-by-step exercises ramping from a clean basic pulse up to the full toque. Prerequisite for the singing curriculum, but useful on its own.',
      },
      {
        title: 'Share recordings',
        status: 'idea',
        body: 'Record yourself playing a song or toque and share the audio with another player or your teacher. Builds on user accounts.',
      },
      {
        title: 'Performance ranking',
        status: 'idea',
        body: 'An objective score for how well you played a song or toque — something more concrete than your teacher\'s nod to measure progress against.',
      },
      {
        title: 'Other capoeira instruments',
        status: 'idea',
        body: 'Pandeiro, atabaque, agogô, reco-reco. Berimbaus are rare; the bateria as a whole isn\'t. Eventual goal: train any role.',
      },
    ],
  },
];

const STATUS_COLOR: Record<Status, string> = {
  in_progress: '#f2b640',
  planning: '#64b4f0',
  shipped: '#64f08c',
  idea: '#8a93b0',
};

const STATUS_LABEL: Record<Status, string> = {
  in_progress: 'in progress',
  planning: 'planning',
  shipped: 'shipped',
  idea: 'idea',
};

export function Roadmap() {
  const { t } = useI18n();
  return (
    <main className="min-h-full px-6 py-8 max-w-2xl mx-auto flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t('roadmap.title')}</h1>
          <p className="text-text-dim text-sm">{t('roadmap.subtitle')}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>

      {/* Vertical timeline.
       *
       * The track is a 1px gradient line absolutely positioned on the
       * left of the <ol>. Each <li> (one per section) draws its own
       * colored dot on the track and stacks the section's item cards
       * to the right. Accents fade Now → Q3 → Ideas (orange → amber →
       * slate) so the eye reads the chronology at a glance.
       */}
      <ol className="relative flex flex-col gap-8 pl-7">
        <span
          aria-hidden
          className="absolute left-[10px] top-2 bottom-2 w-px bg-gradient-to-b from-border-strong via-border to-border/30"
        />
        {SECTIONS.map((section, si) => (
          <li key={si} className="flex flex-col gap-3">
            {/* Heading row owns the dot so flex-items-center handles
             *  vertical alignment automatically. -left positions the
             *  dot's center onto the track at x≈10 (track lives at
             *  left-[10px] of the <ol>; this row starts at the ol's
             *  pl-7 = 28 px content edge). */}
            <div className="relative flex items-center">
              <span
                aria-hidden
                className="absolute -left-[24px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ring-4 ring-bg"
                style={{ background: section.accent }}
              />
              <h2
                className="text-[11px] font-semibold tracking-[0.18em] uppercase leading-none"
                style={{ color: section.accent }}
              >
                {section.heading}
              </h2>
            </div>
            <ul className="flex flex-col gap-2">
              {section.items.map((item, i) => (
                <li
                  key={i}
                  className="card flex items-start gap-3 px-4 py-3 hover:border-border-strong transition"
                >
                  {section.votable && <VoteButtons t={t} />}
                  <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{item.title}</span>
                      <span
                        className="text-[10px] font-mono uppercase tracking-wider shrink-0"
                        style={{ color: STATUS_COLOR[item.status] }}
                      >
                        {STATUS_LABEL[item.status]}
                      </span>
                    </div>
                    {item.body && (
                      <p className="text-xs text-text-dim leading-relaxed">{item.body}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {/* Feature requests go to email until in-app voting + accounts
       *  ship. mailto opens the user's mail client with subject + body
       *  pre-filled — easier than asking them to copy a URL. */}
      <section className="flex flex-col items-center gap-2 pt-2 text-center">
        <p className="text-sm text-text-dim max-w-md">{t('roadmap.request_intro')}</p>
        <a
          href={`mailto:hi@berimbau.pro?subject=${encodeURIComponent('Feature request — Berimbau Pro')}`}
          className="btn-ghost"
        >
          {t('roadmap.request_button')} ↗
        </a>
      </section>
    </main>
  );
}

/**
 * Up/down vote pills, currently disabled with a tooltip explaining
 * the dependency on user accounts. Layout-stable: same width whether
 * the buttons are interactive or not, so the rest of the card doesn't
 * shift when this becomes wired up.
 */
function VoteButtons({ t }: { t: TFn }) {
  const tip = t('roadmap.vote_disabled_tooltip');
  return (
    <div className="shrink-0 flex flex-col items-center gap-1 select-none">
      <button
        type="button"
        disabled
        title={tip}
        aria-label={t('roadmap.vote_up_aria')}
        className="w-7 h-6 rounded-md bg-bg/60 border border-border/60 text-text-dim/50 hover:border-border-strong hover:text-text disabled:cursor-not-allowed flex items-center justify-center text-xs"
      >
        ▲
      </button>
      <span className="text-[10px] font-mono text-text-dim/60 tabular-nums">0</span>
      <button
        type="button"
        disabled
        title={tip}
        aria-label={t('roadmap.vote_down_aria')}
        className="w-7 h-6 rounded-md bg-bg/60 border border-border/60 text-text-dim/50 hover:border-border-strong hover:text-text disabled:cursor-not-allowed flex items-center justify-center text-xs"
      >
        ▼
      </button>
    </div>
  );
}
