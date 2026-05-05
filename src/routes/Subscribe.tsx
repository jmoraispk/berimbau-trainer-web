import { useState } from 'react';
import { Link } from 'wouter';
import { useI18n } from '@/i18n';
import type { MessageKey } from '@/i18n/messages.en';
import { useAuth } from '@/cloud/auth';
import { isCloudConfigured } from '@/cloud/supabase';
import { PLANS, startCheckout, type PricingPlan } from '@/cloud/billing';

/**
 * Subscribe — pricing page with two tiers.
 *
 *   Free          signed-in default; everything works while we're in
 *                 early development. No card needed.
 *   Early Access  $5/month or $49/year. Currently unlocks nothing
 *                 extra (we haven't paywalled features yet) — supports
 *                 development and locks in the price before any future
 *                 paywall lands.
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
    const e = await startCheckout(plan.priceEnv);
    if (e) {
      setBusy(null);
      setErr(e);
    }
    // On success the call already redirected to Stripe.
  };

  return (
    <main className="min-h-full px-6 py-10 max-w-3xl mx-auto flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t('subscribe.title')}</h1>
          <p className="text-text-dim text-sm">{t('subscribe.subtitle')}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>

      {!isCloudConfigured && (
        <p className="text-sm text-text-dim">{t('auth.cloud_unavailable')}</p>
      )}

      <section className="grid gap-4 md:grid-cols-3">
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
                <span className="btn-ghost w-full text-center cursor-default">
                  {t('subscribe.your_plan')}
                </span>
              ) : (
                <span className="btn-ghost w-full text-center cursor-default opacity-60">
                  {t('subscribe.included')}
                </span>
              )
            ) : (
              <Link href="/auth" className="btn-ghost w-full text-center">
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
              badge={plan.badgeKey ? t(plan.badgeKey as MessageKey) : undefined}
              tagline={t('subscribe.tier_paid_tagline')}
              perks={[
                t('subscribe.perk_everything_free'),
                t('subscribe.perk_supports_dev'),
                t('subscribe.perk_lock_price'),
                t('subscribe.perk_priority'),
              ]}
              cta={
                profile?.tier === 'early_access' ? (
                  <span className="btn-ghost w-full text-center cursor-default opacity-60">
                    {t('subscribe.already_subscribed')}
                  </span>
                ) : !user ? (
                  <Link href="/auth" className="btn-primary w-full text-center">
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

      <p className="text-xs text-text-dim text-center">
        {t('subscribe.fine_print')}
      </p>
    </main>
  );
}

function PricingCard({
  title,
  priceLabel,
  priceSuffix,
  priceSub,
  badge,
  tagline,
  perks,
  cta,
}: {
  title: string;
  priceLabel: string;
  priceSuffix?: string;
  priceSub?: string | null;
  badge?: string;
  tagline: string;
  perks: string[];
  cta: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col gap-4 p-5 relative">
      {badge && (
        <span className="absolute -top-2 right-4 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent text-bg">
          {badge}
        </span>
      )}
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-3xl font-semibold">{priceLabel}</span>
          {priceSuffix && <span className="text-xs text-text-dim">{priceSuffix}</span>}
        </div>
        {priceSub && <span className="text-[10px] text-text-dim font-mono">{priceSub}</span>}
        <p className="text-xs text-text-dim mt-1">{tagline}</p>
      </div>
      <ul className="flex flex-col gap-1.5 text-xs text-text-dim flex-1">
        {perks.map((p, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-accent">·</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <div>{cta}</div>
    </div>
  );
}
