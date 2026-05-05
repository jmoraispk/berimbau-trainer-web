// stripe-webhook — receive subscription lifecycle events from Stripe
// and reflect them into the user's profile row.
//
// Wire this up:
//   1. Deploy the function:           supabase functions deploy stripe-webhook --no-verify-jwt
//   2. Get its public URL from the dashboard.
//   3. In Stripe → Developers → Webhooks → Add endpoint, paste the URL.
//      Subscribe to:
//        checkout.session.completed
//        customer.subscription.updated
//        customer.subscription.deleted
//   4. Copy the signing secret (whsec_...) and set as the function's
//      STRIPE_WEBHOOK_SECRET env var in Supabase.
//
// --no-verify-jwt is critical — Stripe doesn't send a Supabase JWT;
// auth is via the signed payload check below.
//
// Required env:
//   STRIPE_SECRET_KEY        sk_test_... or sk_live_...
//   STRIPE_WEBHOOK_SECRET    whsec_...
// Auto-injected:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore-file
// @ts-nocheck

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
  // Stripe-Deno needs a fetch-based HTTP client.
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function setTierByCustomer(
  customerId: string,
  patch: {
    tier?: 'free' | 'early_access';
    subscription_id?: string | null;
    status?: string | null;
    period_end?: string | null;
  },
) {
  const update: Record<string, unknown> = {};
  if (patch.tier !== undefined) update.tier = patch.tier;
  if (patch.subscription_id !== undefined) update.stripe_subscription_id = patch.subscription_id;
  if (patch.status !== undefined) update.subscription_status = patch.status;
  if (patch.period_end !== undefined) update.current_period_end = patch.period_end;
  if (Object.keys(update).length === 0) return;
  await admin.from('profiles').update(update).eq('stripe_customer_id', customerId);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const sig = req.headers.get('stripe-signature');
  if (!sig) return json({ error: 'missing signature' }, 401);
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    return json({ error: `signature check failed: ${(err as Error).message}` }, 400);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // Subscription mode: a Stripe Subscription was created. The
      // customer.subscription.updated event lands shortly with the
      // detailed status; flip tier here so the user sees their new
      // status immediately.
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      if (!customerId) break;
      await setTierByCustomer(customerId, {
        tier: 'early_access',
        subscription_id: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null,
        status: 'active',
      });
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.created': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const active = sub.status === 'active' || sub.status === 'trialing';
      await setTierByCustomer(customerId, {
        tier: active ? 'early_access' : 'free',
        subscription_id: sub.id,
        status: sub.status,
        period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      });
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      await setTierByCustomer(customerId, {
        tier: 'free',
        subscription_id: null,
        status: 'canceled',
        period_end: null,
      });
      break;
    }
    default:
      // Other events ignored (invoice.* etc.).
      break;
  }

  return json({ received: true });
});
