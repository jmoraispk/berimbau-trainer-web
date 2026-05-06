// stripe-portal — return a Stripe Customer Portal session URL for the
// signed-in user. Lets them update their card, cancel, or download
// invoices without exposing any of that to our app.
//
// POST body: {} (no params; the caller is identified by JWT)
// Response: { url: string }
//
// Required env:
//   STRIPE_SECRET_KEY  sk_test_... or sk_live_...
//   STRIPE_PORTAL_RETURN_URL  e.g. https://berimbau.pro/settings

// deno-lint-ignore-file
// @ts-nocheck

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

  const { data: prof } = await sb
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', u.user.id)
    .single();
  if (!prof?.stripe_customer_id) return json({ error: 'no stripe customer for this user' }, 400);

  const baseUrl = pickBaseUrl(
    req,
    Deno.env.get('STRIPE_PORTAL_RETURN_URL') ?? 'https://berimbau.pro/settings',
  );
  const session = await stripe.billingPortal.sessions.create({
    customer: prof.stripe_customer_id,
    return_url: `${baseUrl}/settings`,
  });

  return json({ url: session.url });
});
