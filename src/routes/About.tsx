import { Link } from 'wouter';
import { useI18n } from '@/i18n';

/**
 * About — the why. What problem this app exists to solve, what it
 * does today, and where it's heading. Plain prose; localised.
 */
export function About() {
  const { t } = useI18n();
  return (
    <main className="min-h-full px-6 py-8 max-w-2xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t('about.title')}</h1>
          <p className="text-text-dim text-sm">{t('about.subtitle')}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>

      <section className="card flex flex-col gap-4 px-6 py-5 text-sm leading-relaxed text-text-dim">
        <p>{t('about.problem')}</p>
        <p>{t('about.what_it_does')}</p>
        <p>{t('about.where_its_going')}</p>
        <p>{t('about.pricing')}</p>
      </section>
    </main>
  );
}
