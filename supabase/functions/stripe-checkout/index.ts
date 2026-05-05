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
//   STRIPE_SUCCESS_URL       e.g. https://berimbau.pro/settings?subscribed=1
//   STRIPE_CANCEL_URL        e.g. https://berimbau.pro/subscribe
// Auto-injected by Supabase:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore-file
// @ts-nocheck — runs in Deno, not the Vite TypeScript project.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type' } });
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

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: body.price_id, quantity: 1 }],
    success_url: Deno.env.get('STRIPE_SUCCESS_URL') ?? 'https://berimbau.pro/settings?subscribed=1',
    cancel_url: Deno.env.get('STRIPE_CANCEL_URL') ?? 'https://berimbau.pro/subscribe',
    allow_promotion_codes: true,
    client_reference_id: u.user.id,
  });

  return json({ url: session.url });
});
