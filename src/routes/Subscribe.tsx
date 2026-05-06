import { useState } from 'react';
import { Link } from 'wouter';
import { useI18n, type TFn } from '@/i18n';
import type { MessageKey } from '@/i18n/messages.en';
import { useAuth } from '@/cloud/auth';
import { isCloudConfigured } from '@/cloud/supabase';
import { PLANS, startCheckout, type PricingPlan } from '@/cloud/billing';

/**
 * Subscribe — pricing page with three tiers laid out side by side.
 *
 *   Free          signed-in default; everything works while we're in
 *                 early development. No card needed.
 *   Early Access  $5/month or $48/year. Currently unlocks nothing
 *                 extra (we haven't paywalled features yet) — supports
 *                 development and locks in the price before any future
 *                 paywall lands.
 *
 * Layout pattern is the standard SaaS three-up: Free | Monthly |
 * Annual, with Annual marked Recommended via a floating pill above
 * the card and an accent border. CTAs are filled-accent for the
 * recommended plan, secondary (filled grey) for the others, so the
 * eye lands on Annual without making Monthly look broken.
 *
 * Below the cards: a short FAQ accordion. Folds in the previous
 * standalone "money-back guarantee" copy as the refund question.
 *
 * Clicking a paid plan kicks the user into Stripe Checkout via the
 * stripe-checkout edge function; success_url brings them back to
 * /settings?subscribed=1, where the webhook-updated profile.tier shows
 * the new state.
 */
export function Subscribe() {
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onPick = async (plan: PricingPlan) => {
    if (!plan.priceEnv) {
      setErr(t('subscribe.no_price_env'));
      return;
    }
    setBusy(plan.id);
    setErr(null);
    try {
      const e = await startCheckout(plan.priceEnv);
      if (e) {
        setBusy(null);
        setErr(e);
      }
      // On success the call already redirected to Stripe.
    } catch (ex) {
      setBusy(null);
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  };

  return (
    <main className="min-h-full px-5 py-8 sm:py-12 max-w-5xl mx-auto flex flex-col gap-10">
      {/* Back link as an unobtrusive top-left affordance, so the hero
       *  below can sit centered without the link nudging the title. */}
      <div className="flex">
        <Link href="/" className="btn-ghost">
          {t('common.back')}
        </Link>
      </div>

      <header className="flex flex-col items-center gap-3 text-center px-2">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          {t('subscribe.title')}
        </h1>
        <p className="text-text-dim text-sm sm:text-base max-w-lg leading-relaxed">
          {t('subscribe.subtitle')}
        </p>
      </header>

      {!isCloudConfigured && (
        <p className="text-sm text-text-dim text-center">{t('auth.cloud_unavailable')}</p>
      )}

      {/* `items-stretch` ensures all three cards hit the same height
       *  even when the recommended one is slightly taller from the
       *  floating badge + accent border treatment. The mt-2 buys
       *  vertical room for the absolute-positioned recommended pill. */}
      <section className="grid gap-5 md:grid-cols-3 md:gap-4 lg:gap-5 items-stretch mt-2">
        {/* Free tier */}
        <PricingCard
          title={t('subscribe.tier_free')}
          priceLabel={t('subscribe.tier_free_price')}
          tagline={t('subscribe.tier_free_tagline')}
          perks={[
            t('subscribe.perk_practice'),
            t('subscribe.perk_classes_basic'),
            t('subscribe.perk_leaderboard'),
            t('subscribe.perk_sync'),
          ]}
          cta={
            user ? (
              profile?.tier === 'free' ? (
                <span className="btn-secondary w-full cursor-default opacity-90">
                  {t('subscribe.your_plan')}
                </span>
              ) : (
                <span className="btn-secondary w-full cursor-default opacity-60">
                  {t('subscribe.included')}
                </span>
              )
            ) : (
              <Link href="/auth" className="btn-secondary w-full">
                {t('subscribe.sign_up_free')}
              </Link>
            )
          }
        />

        {/* Paid plans */}
        {PLANS.map((plan) => {
          const intervalLabel =
            plan.id === 'monthly' ? t('subscribe.per_month') : t('subscribe.per_year');
          const subPrice =
            plan.id === 'annual' ? t('subscribe.annual_equivalent') : null;
          return (
            <PricingCard
              key={plan.id}
              title={t(plan.id === 'monthly' ? 'subscribe.tier_monthly' : 'subscribe.tier_annual')}
              priceLabel={`$${plan.amountUsd}`}
              priceSuffix={intervalLabel}
              priceSub={subPrice}
              saveBadge={plan.badgeKey ? t(plan.badgeKey as MessageKey) : undefined}
              trialNote={t('subscribe.trial_note')}
              recommended={plan.recommended}
              recommendedLabel={plan.recommended ? t('subscribe.recommended') : undefined}
              tagline={t('subscribe.tier_paid_tagline')}
              perks={[
                t('subscribe.perk_everything_free'),
                t('subscribe.perk_supports_dev'),
                t('subscribe.perk_lock_price'),
                t('subscribe.perk_priority'),
              ]}
              cta={
                profile?.tier === 'early_access' ? (
                  <span className="btn-secondary w-full cursor-default opacity-60">
                    {t('subscribe.already_subscribed')}
                  </span>
                ) : !user ? (
                  <Link href="/auth" className="btn-primary w-full">
                    {t('subscribe.sign_in_to_subscribe')}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onPick(plan)}
                    disabled={busy !== null}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {busy === plan.id ? '…' : t('subscribe.choose_plan')}
                  </button>
                )
              }
            />
          );
        })}
      </section>

      {err && <p className="text-sm text-red-400 text-center">{err}</p>}

      <Faq t={t} />

      <p className="text-xs text-text-dim text-center max-w-md mx-auto leading-relaxed">
        {t('subscribe.fine_print')}
      </p>
    </main>
  );
}

/* ────────────────────────────────────────────────────────────────── */

interface PricingCardProps {
  title: string;
  priceLabel: string;
  priceSuffix?: string;
  priceSub?: string | null;
  /** Small "save 20%" pill rendered below the price. */
  saveBadge?: string;
  /** Small "first 7 days free" line shown above the perks. */
  trialNote?: string;
  recommended?: boolean;
  recommendedLabel?: string;
  tagline: string;
  perks: string[];
  cta: React.ReactNode;
}

function PricingCard({
  title,
  priceLabel,
  priceSuffix,
  priceSub,
  saveBadge,
  trialNote,
  recommended,
  recommendedLabel,
  tagline,
  perks,
  cta,
}: PricingCardProps) {
  return (
    <div
      className={`card relative flex flex-col gap-5 p-6 ${
        recommended
          ? 'border-accent shadow-[0_8px_32px_-12px_rgba(255,138,61,0.45)]'
          : ''
      }`}
    >
      {recommended && recommendedLabel && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-bg text-[10px] font-semibold uppercase tracking-[0.18em] px-3 py-1 rounded-full whitespace-nowrap shadow-[0_2px_8px_rgba(255,138,61,0.4)]">
          {recommendedLabel}
        </span>
      )}

      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-text-dim leading-relaxed mt-0.5">{tagline}</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-4xl font-semibold tracking-tight">{priceLabel}</span>
            {priceSuffix && (
              <span className="text-sm text-text-dim">{priceSuffix}</span>
            )}
          </div>
          {saveBadge && (
            <span className="shrink-0 inline-flex items-center text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 whitespace-nowrap">
              {saveBadge}
            </span>
          )}
        </div>
        {priceSub && (
          <span className="text-[11px] text-text-dim font-mono">{priceSub}</span>
        )}
      </div>

      <ul className="flex flex-col gap-2.5 text-sm text-text-dim flex-1">
        {perks.map((p, i) => (
          <li key={i} className="flex gap-2.5 items-start leading-relaxed">
            <CheckIcon
              className={recommended ? 'text-accent' : 'text-accent/75'}
            />
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-2">
        {trialNote && (
          <span className="text-[11px] text-text-dim text-center">
            {trialNote}
          </span>
        )}
        {cta}
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      className={`shrink-0 mt-[3px] ${className ?? ''}`}
      aria-hidden
    >
      <circle cx="8" cy="8" r="7.5" fill="currentColor" opacity="0.18" />
      <path
        d="M5 8.3l2.2 2.2L11 6.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * FAQ accordion. Native <details>/<summary> so it's keyboard- and SR-
 * accessible without state. Two-column on desktop, stacked on mobile,
 * matching the screenshot's reference layout.
 */
function Faq({ t }: { t: TFn }) {
  const items: Array<{ q: MessageKey; a: MessageKey }> = [
    { q: 'subscribe.faq_q_cancel', a: 'subscribe.faq_a_cancel' },
    { q: 'subscribe.faq_q_refund', a: 'subscribe.faq_a_refund' },
    { q: 'subscribe.faq_q_unlock', a: 'subscribe.faq_a_unlock' },
    { q: 'subscribe.faq_q_price_change', a: 'subscribe.faq_a_price_change' },
    { q: 'subscribe.faq_q_payment', a: 'subscribe.faq_a_payment' },
  ];
  return (
    <section className="flex flex-col gap-4 mt-2">
      <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-center">
        {t('subscribe.faq_title')}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-3">
        {items.map((it) => (
          <details
            key={it.q}
            className="group rounded-lg border border-border/50 bg-bg-elev/40 px-4 py-3 transition hover:border-border [&[open]_.chev]:rotate-90"
          >
            <summary className="list-none cursor-pointer select-none flex items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-medium leading-snug">
                {t(it.q)}
              </span>
              <span className="chev text-text-dim text-xs transition-transform shrink-0 mt-0.5">
                ›
              </span>
            </summary>
            <p className="text-xs sm:text-sm text-text-dim leading-relaxed mt-2 pr-6">
              {t(it.a)}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
