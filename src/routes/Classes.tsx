import { Link } from 'wouter';
import { CLASSES } from '@/engine/classes';
import { useI18n } from '@/i18n';

/**
 * Classes index — list of available guided progressions. Each entry
 * links into /classes/:id which mounts the class player.
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

      {CLASSES.length === 0 ? (
        <section className="card flex flex-col gap-3 p-5">
          <span className="text-[10px] font-semibold text-text-dim tracking-[0.18em] uppercase">
            {t('classes.coming_label')}
          </span>
          <p className="text-sm text-text-dim leading-relaxed">{t('classes.coming_body')}</p>
        </section>
      ) : (
        <ul className="flex flex-col gap-2">
          {CLASSES.map((cls) => (
            <li key={cls.id}>
              <Link
                href={`/classes/${cls.id}`}
                className="card flex items-center gap-3 px-4 py-3 hover:border-border-strong transition"
              >
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="text-sm font-medium">{t(cls.titleKey)}</span>
                  <span className="text-xs text-text-dim">{t(cls.subtitleKey)}</span>
                </div>
                <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-text-dim">
                  {t('classes.parts_count', { n: cls.parts.length })}
                </span>
                <span className="shrink-0 text-text-dim" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
