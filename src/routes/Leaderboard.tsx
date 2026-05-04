import { Link } from 'wouter';
import { useI18n } from '@/i18n';

/**
 * Leaderboard — public ranking of players, tied to user accounts.
 * Stub today; goes live alongside the accounts feature.
 */
export function Leaderboard() {
  const { t } = useI18n();
  return (
    <main className="min-h-full px-6 py-8 max-w-2xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t('leaderboard.title')}</h1>
          <p className="text-text-dim text-sm">{t('leaderboard.subtitle')}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>

      <section className="card flex flex-col gap-3 p-5">
        <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
          {t('classes.coming_label')}
        </span>
        <p className="text-sm text-text-dim leading-relaxed">{t('leaderboard.body')}</p>
        <div className="flex flex-wrap gap-3 text-xs text-text-dim font-mono pt-1">
          <span>🔥 {t('leaderboard.streak_5')}</span>
          <span>💎 {t('leaderboard.streak_30')}</span>
          <span>👑 {t('leaderboard.streak_100')}</span>
        </div>
      </section>
    </main>
  );
}
