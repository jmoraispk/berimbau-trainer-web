// stripe-checkout — mint a Stripe Checkout Session for the signed-in
// user, create / re-use their Stripe customer, return the Checkout URL
// for the client to redirect to.
//
// POST body: { price_id: string }
//   price_id: a Stripe Price id (e.g. price_123abc), monthly or annual
//
// Response: { url: string }
//
// Required env (set as Edge Function secrets via the Supabase dashboard):
//   STRIPE_SECRET_KEY        sk_test_... or sk_live_...
//   STRIPE_SUCCESS_URL       Fallback (when Origin header is missing /
//                            not in allowlist). e.g. https://berimbau.pro/settings?subscribed=1
//   STRIPE_CANCEL_URL        Fallback. e.g. https://berimbau.pro/subscribe
// Auto-injected by Supabase:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Origin handling: we want a single deployment to work both for
// berimbau.pro and for `pnpm dev` on localhost. The browser sets the
// `Origin` header for cross-origin POSTs and it's not spoofable from
// page JS, so we use it (allowlisted) to pick the success / cancel
// base URL. Falls back to the env value otherwise.

// deno-lint-ignore-file
// @ts-nocheck — runs in Deno, not the Vite TypeScript project.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
});

const ALLOWED_ORIGINS = new Set([
  'https://berimbau.pro',
  'https://www.berimbau.pro',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
]);

function pickBaseUrl(req: Request, fallbackUrl: string): string {
  const origin = req.headers.get('origin') ?? '';
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  // Strip path off the env fallback so callers can append their own.
  try { return new URL(fallbackUrl).origin; } catch { return 'https://berimbau.pro'; }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'missing auth' }, 401);

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: u, error: uerr } = await sb.auth.getUser();
  if (uerr || !u.user) return json({ error: 'not signed in' }, 401);

  let body: { price_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  if (!body.price_id) return json({ error: 'price_id required' }, 400);

  // Look up or create the Stripe customer for this user.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: prof } = await admin
    .from('profiles')
    .select('stripe_customer_id, display_name')
    .eq('id', u.user.id)
    .single();

  let customerId = prof?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: u.user.email,
      name: prof?.display_name ?? undefined,
      metadata: { supabase_user_id: u.user.id },
    });
    customerId = customer.id;
    await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', u.user.id);
  }

  const baseUrl = pickBaseUrl(
    req,
    Deno.env.get('STRIPE_SUCCESS_URL') ?? 'https://berimbau.pro/settings?subscribed=1',
  );
  // 7-day free trial: no charge collected at signup. If the user
  // cancels via the Customer Portal within the 7 days, the
  // subscription ends silently and the card is never charged. After
  // day 7, regular billing kicks in. Strictly better than a manual
  // refund flow (no email round-trip, no human in the loop) for the
  // "I changed my mind" case the guarantee was meant to cover.
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: body.price_id, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      // If the trial ends but Stripe can't collect payment (expired
      // card, bank decline), cancel rather than retry forever.
      trial_settings: {
        end_behavior: { missing_payment_method: 'cancel' },
      },
    },
    success_url: `${baseUrl}/settings?subscribed=1`,
    cancel_url: `${baseUrl}/subscribe`,
    allow_promotion_codes: true,
    client_reference_id: u.user.id,
  });

  return json({ url: session.url });
});
