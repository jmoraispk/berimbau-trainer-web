import { Link } from 'wouter';
import { useI18n } from '@/i18n';

/**
 * Classes — guided progressions toward each toque and virada. Stub for
 * now; the curriculum content lands in a follow-up.
 */
export function Classes() {
  const { t } = useI18n();

  return (
    <main className="min-h-full px-6 py-8 max-w-2xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t('classes.title')}</h1>
          <p className="text-text-dim text-sm">{t('classes.subtitle')}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>

      <section className="card flex flex-col gap-3 p-5">
        <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          {t('classes.coming_label')}
        </span>
        <p className="text-sm text-text-dim leading-relaxed">{t('classes.coming_body')}</p>
      </section>
    </main>
  );
}
