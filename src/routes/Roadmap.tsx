import { Link } from 'wouter';
import { useI18n } from '@/i18n';

/**
 * Roadmap — what's planned and roughly when. Authored as a static
 * structure right here so it's easy to edit between releases. Status
 * tags use a small palette: in-progress, planning, shipped, idea.
 */

type Status = 'in_progress' | 'planning' | 'shipped' | 'idea';

interface Item {
  title: string;
  status: Status;
  body?: string;
}

interface Section {
  heading: string;
  /** Hex color for the timeline marker — fades from accent (now) to dim (far). */
  accent: string;
  items: Item[];
}

const SECTIONS: Section[] = [
  {
    heading: 'Q2 2026 — in flight',
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
    heading: 'Q3 2026 — next up',
    accent: '#f2b640',
    items: [
      {
        title: 'Classes: berimbau timeline',
        status: 'planning',
        body: 'Guided progressions toward each toque — short drills that ramp from a clean basic pulse up to the full pattern. Skippable so people who already know a toque can jump ahead.',
      },
      {
        title: 'Mic input picker',
        status: 'planning',
        body: 'Pick which microphone the app listens through from inside Settings, instead of relying on whichever input the OS picked as default.',
      },
    ],
  },
  {
    heading: 'Q4 2026 — bigger lifts',
    accent: '#64b4f0',
    items: [
      {
        title: 'Classes: singing timeline',
        status: 'planning',
        body: 'Once the rhythms are solid, layer corridos and ladainhas on top — singing while keeping the toque steady.',
      },
      {
        title: 'Per-toque viradas',
        status: 'planning',
        body: 'Drills for the variations and breaks layered on top of each base toque.',
      },
      {
        title: 'User accounts + cloud sync',
        status: 'planning',
        body: 'Optional sign-in so calibration, sessions and settings follow you between phone and laptop. The app stays usable without an account — local-first remains the default.',
      },
    ],
  },
  {
    heading: '2027 and beyond',
    accent: '#5a6480',
    items: [
      {
        title: 'Roadmap voting',
        status: 'idea',
        body: 'Once accounts ship, upvote roadmap items right here so we know which ones to prioritise next. Until then, GitHub Issues reactions stand in.',
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
       * The track is a 1px line absolutely positioned on the left of the
       * <ol>. Each <li> (one per section) draws its own colored dot on
       * the track and stacks the section's item cards to the right.
       * Section accents fade from bright orange (now) to dim slate
       * (far future) so the eye reads the chronology at a glance.
       */}
      <ol className="relative flex flex-col gap-8 pl-7">
        <span
          aria-hidden
          className="absolute left-[10px] top-2 bottom-2 w-px bg-gradient-to-b from-border-strong via-border to-border/30"
        />
        {SECTIONS.map((section, si) => (
          <li key={si} className="relative flex flex-col gap-3">
            <span
              aria-hidden
              className="absolute -left-[20px] top-[2px] w-3.5 h-3.5 rounded-full ring-4 ring-bg"
              style={{ background: section.accent }}
            />
            <h2
              className="text-[11px] font-semibold tracking-[0.18em] uppercase"
              style={{ color: section.accent }}
            >
              {section.heading}
            </h2>
            <ul className="flex flex-col gap-2">
              {section.items.map((item, i) => (
                <li
                  key={i}
                  className="card flex flex-col gap-1.5 px-4 py-3 hover:border-border-strong transition"
                >
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
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {/* Feature requests outsourced to GitHub Issues until accounts +
       *  in-app voting land. Reactions on issues act as upvotes. */}
      <section className="flex flex-col items-center gap-2 pt-2 text-center">
        <p className="text-sm text-text-dim max-w-md">{t('roadmap.request_intro')}</p>
        <a
          href="https://github.com/jmoraispk/berimbau-trainer-web/issues/new"
          target="_blank"
          rel="noreferrer"
          className="btn-ghost"
        >
          {t('roadmap.request_button')} ↗
        </a>
      </section>
    </main>
  );
}
