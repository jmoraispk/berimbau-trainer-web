import { Link } from 'wouter';
import { useI18n } from '@/i18n';

/**
 * Subscribe — Stripe Checkout entry point. Shipping today: a static
 * placeholder card explaining what's coming. The actual handoff to
 * Stripe Checkout (and the webhook that flips a paid flag in the
 * profiles row) lands in a follow-up commit, gated on
 * VITE_STRIPE_PUBLISHABLE_KEY.
 */
export function Subscribe() {
  const { t } = useI18n();
  return (
    <main className="min-h-full px-6 py-10 max-w-md mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t('subscribe.title')}</h1>
          <p className="text-text-dim text-sm">{t('subscribe.subtitle')}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>
      <section className="card flex flex-col gap-4 px-6 py-5">
        <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          {t('classes.coming_label')}
        </span>
        <p className="text-sm text-text-dim leading-relaxed">{t('subscribe.body')}</p>
        <ul className="text-sm text-text-dim flex flex-col gap-1 list-disc pl-5">
          <li>{t('subscribe.perk_sync')}</li>
          <li>{t('subscribe.perk_share')}</li>
          <li>{t('subscribe.perk_classes')}</li>
        </ul>
        <button type="button" disabled className="btn-primary disabled:opacity-50 self-start">
          {t('subscribe.cta_disabled')}
        </button>
      </section>
    </main>
  );
}
