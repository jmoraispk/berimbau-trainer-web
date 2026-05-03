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
  items: Item[];
}

const SECTIONS: Section[] = [
  {
    heading: 'Q2 2026 — in flight',
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
    heading: 'Later in 2026',
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
    ],
  },
  {
    heading: '2027 and beyond',
    items: [
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
    <main className="min-h-full px-6 py-8 max-w-2xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t('roadmap.title')}</h1>
          <p className="text-text-dim text-sm">{t('roadmap.subtitle')}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>

      {SECTIONS.map((section, si) => (
        <section key={si} className="flex flex-col gap-2">
          <h2 className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
            {section.heading}
          </h2>
          <ul className="flex flex-col gap-2">
            {section.items.map((item, i) => (
              <li key={i} className="card flex flex-col gap-1.5 px-4 py-3">
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
        </section>
      ))}
    </main>
  );
}
