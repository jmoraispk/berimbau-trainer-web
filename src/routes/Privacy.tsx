import { Link } from 'wouter';
import { useI18n } from '@/i18n';

export function Privacy() {
  const { t } = useI18n();
  return (
    <main className="min-h-full px-6 py-10 max-w-2xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t('privacy.title')}</h1>
          <p className="text-text-dim text-sm">{t('privacy.updated', { date: '2026-05-05' })}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>
      <section className="card flex flex-col gap-4 px-6 py-5 text-sm leading-relaxed text-text-dim">
        <p>{t('privacy.intro')}</p>
        <p>{t('privacy.local')}</p>
        <p>{t('privacy.cloud')}</p>
        <p>{t('privacy.rights')}</p>
        <p>
          {t('privacy.contact')}{' '}
          <a href="mailto:hi@berimbau.pro" className="underline underline-offset-4">
            hi@berimbau.pro
          </a>
          .
        </p>
      </section>
    </main>
  );
}
