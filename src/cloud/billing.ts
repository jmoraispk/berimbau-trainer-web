import { supabase } from './supabase';

/**
 * Billing — client-side helpers for kicking off Stripe Checkout and
 * the Customer Portal. Both call Supabase Edge Functions, which
 * handle the Stripe API calls server-side (the secret key never
 * reaches the browser).
 *
 * Price IDs come from import.meta.env so we can swap test↔live
 * without redeploying. Read them from VITE_STRIPE_PRICE_MONTHLY and
 * VITE_STRIPE_PRICE_ANNUAL.
 */

export type Tier = 'free' | 'early_access';

export interface PricingPlan {
  id: 'monthly' | 'annual';
  priceEnv: string | undefined;
  amountUsd: number;
  intervalKey: 'leaderboard.window.month' | 'subscribe.year';
  badgeKey?: string;
}

export const PLANS: PricingPlan[] = [
  {
    id: 'monthly',
    priceEnv: import.meta.env.VITE_STRIPE_PRICE_MONTHLY as string | undefined,
    amountUsd: 5,
    intervalKey: 'leaderboard.window.month',
  },
  {
    id: 'annual',
    priceEnv: import.meta.env.VITE_STRIPE_PRICE_ANNUAL as string | undefined,
    amountUsd: 49,
    intervalKey: 'subscribe.year',
    badgeKey: 'subscribe.save_badge',
  },
];

/**
 * Hit the stripe-checkout edge function and redirect the browser to
 * the returned Checkout URL. Returns an error message if the round-
 * trip fails; never throws.
 */
export async function startCheckout(priceId: string): Promise<string | null> {
  if (!supabase) return 'Cloud is not configured.';
  const { data, error } = await supabase.functions.invoke<{ url: string }>(
    'stripe-checkout',
    { body: { price_id: priceId } },
  );
  if (error) return error.message;
  if (!data?.url) return 'No checkout URL returned.';
  window.location.assign(data.url);
  return null;
}

/**
 * Open the Stripe Customer Portal in the current tab. Lets the user
 * update payment method, cancel, view invoices.
 */
export async function openCustomerPortal(): Promise<string | null> {
  if (!supabase) return 'Cloud is not configured.';
  const { data, error } = await supabase.functions.invoke<{ url: string }>(
    'stripe-portal',
    { body: {} },
  );
  if (error) return error.message;
  if (!data?.url) return 'No portal URL returned.';
  window.location.assign(data.url);
  return null;
}
